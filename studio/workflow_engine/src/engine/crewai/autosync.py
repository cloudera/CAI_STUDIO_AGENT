import os
import threading
import time
import sqlite3
import traceback
from pathlib import Path
from typing import Dict, Tuple, Optional

import cmlapi
from cmlapi.rest import ApiException
from engine.utils import get_url_scheme
from uuid import uuid4
import logging
import concurrent.futures


def _configure_logging():
    # Logging disabled for autosync. Keeping code commented for potential future re-enable.
    # log_path = os.getenv("AUTOSYNC_LOG_FILE", "/home/cdsw/test.log")
    # try:
    #     os.makedirs(os.path.dirname(log_path), exist_ok=True)
    # except Exception:
    #     pass
    # root = logging.getLogger()
    # root.setLevel(logging.DEBUG)
    # formatter = logging.Formatter('%(asctime)s %(levelname)s [%(name)s] %(message)s')
    # # Avoid duplicate handlers
    # exists = False
    # for h in root.handlers:
    #     if isinstance(h, logging.FileHandler) and getattr(h, 'baseFilename', None) == log_path:
    #         exists = True
    #         break
    # if not exists:
    #     fh = logging.FileHandler(log_path, mode='a', encoding='utf-8')
    #     fh.setLevel(logging.DEBUG)
    #     fh.setFormatter(formatter)
    #     root.addHandler(fh)
    # logging.getLogger('cmlapi').setLevel(logging.DEBUG)
    # logging.getLogger('urllib3').setLevel(logging.DEBUG)
    # logging.getLogger('engine').setLevel(logging.DEBUG)

    # def _excepthook(exc_type, exc_value, exc_traceback):
    #     if issubclass(exc_type, KeyboardInterrupt):
    #         sys.__excepthook__(exc_type, exc_value, exc_traceback)
    #         return
    #     logging.critical("Uncaught exception", exc_info=(exc_type, exc_value, exc_traceback))
    # sys.excepthook = _excepthook
    pass


# _configure_logging()

# Performance and behavior tunables
MAX_WORKERS = int(os.getenv("AUTOSYNC_MAX_WORKERS", "8"))
DOWNLOAD_CHUNK = int(os.getenv("AUTOSYNC_DOWNLOAD_CHUNK", str(1024 * 1024)))  # 1 MB

# Always ignore these directories from both local and remote sync
ALWAYS_IGNORE_DIRS = {".venv"}

# Comma-separated names (not globs) to ignore in local scan (in addition to ALWAYS_IGNORE_DIRS)
IGNORE_DIRS = set(
    x
    for x in os.getenv(
        "AUTOSYNC_IGNORE_DIRS",
        ".git,.venv,node_modules,__pycache__,.mypy_cache,.pytest_cache,.ipynb_checkpoints",
    ).split(",")
    if x
)

# Comma-separated file names to ignore in local scan
IGNORE_FILES = set(x for x in os.getenv("AUTOSYNC_IGNORE_FILES", "").split(",") if x)


def _path_has_ignored_segment(path_value: str) -> bool:
    # Normalize to forward slashes and test each segment
    normalized = normalize_rel_path(path_value)
    parts = [p for p in normalized.split("/") if p]
    for part in parts:
        if part in ALWAYS_IGNORE_DIRS:
            return True
    return False


def normalize_rel_path(path_value: str) -> str:
    return path_value.strip("/").replace("\\", "/")


def compute_local_signature(path: Path) -> str:
    try:
        st = path.stat()
    except FileNotFoundError:
        return ""
    return f"{st.st_size}:{int(st.st_mtime)}"


def scan_local(base_dir: Path) -> Dict[str, Tuple[int, str, str]]:
    index: Dict[str, Tuple[int, str, str]] = {}
    base_dir = base_dir.resolve()
    effective_ignored_dirs = set(IGNORE_DIRS) | ALWAYS_IGNORE_DIRS
    for root, dirs, files in os.walk(base_dir, topdown=True):
        # prune directories in-place
        dirs[:] = [d for d in dirs if d not in effective_ignored_dirs]
        for name in files:
            if name in IGNORE_FILES:
                continue
            p = Path(root) / name
            try:
                st = p.stat()
            except FileNotFoundError:
                continue
            rel = normalize_rel_path(str(p.relative_to(base_dir)))
            # Skip any path that contains an always-ignored segment (defensive)
            if _path_has_ignored_segment(rel):
                continue
            sig = f"{st.st_size}:{int(st.st_mtime)}"
            index[rel] = (st.st_size, sig, str(p))
    logging.debug(f"[AutoSync] scan_local base={base_dir} files={len(index)}")
    return index


def list_remote_recursive(client, project_id: str, base_prefix: str) -> Dict[str, int]:
    from collections import deque

    base_prefix = normalize_rel_path(base_prefix)
    out: Dict[str, int] = {}
    dq = deque([base_prefix])
    while dq:
        current = dq.popleft()
        try:
            logging.debug(f"[AutoSync] list_remote_files project_id={project_id} path={current}")
            resp = client.list_project_files(project_id, current)
        except ApiException as e:
            if e.status == 404 and current == base_prefix:
                logging.debug(f"[AutoSync] list_remote_files base path missing: {current}")
                break
            raise
        files = getattr(resp, "files", None) or []
        for f in files:
            child_rel = normalize_rel_path(f"{current}/{f.path}") if current else normalize_rel_path(f.path)
            if getattr(f, "is_dir", False):
                # Avoid traversing into ignored directories (e.g., .venv)
                if not _path_has_ignored_segment(child_rel):
                    dq.append(child_rel)
            else:
                rel = child_rel[len(base_prefix) :].strip("/") if base_prefix else child_rel
                if _path_has_ignored_segment(rel):
                    continue
                try:
                    size = int(getattr(f, "file_size", 0) or 0)
                except Exception:
                    size = 0
                out[rel] = size
    logging.debug(f"[AutoSync] list_remote_recursive base={base_prefix} files={len(out)}")
    return out


def download_to_local(client, project_id: str, remote_rel_path: str, local_abs_path: str):
    logging.debug(f"[AutoSync] download_to_local project_id={project_id} remote={remote_rel_path} dst={local_abs_path}")
    resp = client.download_project_file(project_id, remote_rel_path, _preload_content=False)
    os.makedirs(os.path.dirname(local_abs_path), exist_ok=True)
    with open(local_abs_path, "wb") as f:
        for chunk in resp.stream(DOWNLOAD_CHUNK):
            f.write(chunk)


def upload_direct_to_target(client, project_id: str, target_rel_path: str, local_abs_path: str):
    import time as _time

    target_rel_path = normalize_rel_path(target_rel_path)
    header_params = {"Content-Type": "multipart/form-data"}
    files_payload = {target_rel_path: local_abs_path}
    try:
        logging.debug(f"[AutoSync] delete_project_file before upload path={target_rel_path}")
        client.delete_project_file(project_id=project_id, path=target_rel_path)
    except Exception:
        logging.debug("[AutoSync] delete_project_file ignored (not existing or not deletable)")
    last_exc = None
    for attempt in range(3):
        try:
            logging.debug(f"[AutoSync] upload attempt={attempt + 1} target={target_rel_path} src={local_abs_path}")
            client.api_client.call_api(
                f"/api/v2/projects/{{project_id}}/files",
                "POST",
                path_params={"project_id": project_id},
                header_params=header_params,
                files=files_payload,
                response_type=None,
            )
            return
        except Exception as e:
            last_exc = e
            _time.sleep(1 + attempt)
    if last_exc:
        logging.exception(f"[AutoSync] upload failed target={target_rel_path}")
        raise last_exc


def init_state_db(db_path: Path):
    db_path.parent.mkdir(parents=True, exist_ok=True)
    # Let the caller decide about thread ownership; default check_same_thread=True
    conn = sqlite3.connect(str(db_path))
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS sync_state (
            rel_path TEXT PRIMARY KEY,
            local_sig TEXT,
            remote_size INTEGER,
            last_action TEXT,
            last_sync_ts REAL
        )
        """
    )
    conn.commit()
    return conn


def _open_writable_db_strict(db_path: Path) -> sqlite3.Connection:
    """Open a writable SQLite DB at the given path, ensuring permissions.

    No fallback location is used. If we cannot create a writable DB under
    workflow root, an explicit error is raised.
    """
    parent = db_path.parent
    parent.mkdir(parents=True, exist_ok=True)
    try:
        os.chmod(parent, 0o700)
    except Exception:
        pass

    if db_path.exists():
        try:
            os.chmod(db_path, 0o600)
        except Exception:
            pass

    def open_and_probe(path: Path) -> sqlite3.Connection:
        logging.debug(f"[AutoSync] opening DB path={path}")
        conn = init_state_db(path)
        try:
            conn.execute("CREATE TABLE IF NOT EXISTS __autosync_probe (x INTEGER)")
            conn.execute("INSERT OR REPLACE INTO __autosync_probe (x) VALUES (1)")
            conn.execute("DELETE FROM __autosync_probe WHERE x=1")
            conn.commit()
        except sqlite3.OperationalError as e:
            conn.close()
            raise e
        return conn

    try:
        return open_and_probe(db_path)
    except sqlite3.OperationalError:
        # Try recreating the file if it exists and may be read-only
        try:
            if db_path.exists():
                logging.warning(f"[AutoSync] removing possibly read-only DB file {db_path}")
                os.unlink(db_path)
        except Exception:
            logging.exception("[AutoSync] failed removing DB file")
        # Second attempt
        return open_and_probe(db_path)


def get_state(conn, rel_path: str) -> Optional[Tuple[str, int, str, float]]:
    cur = conn.execute(
        "SELECT local_sig, remote_size, last_action, last_sync_ts FROM sync_state WHERE rel_path=?",
        (rel_path,),
    )
    row = cur.fetchone()
    return row if row else None


def upsert_state(conn, rel_path: str, local_sig: str, remote_size: int, last_action: str):
    conn.execute(
        "REPLACE INTO sync_state(rel_path, local_sig, remote_size, last_action, last_sync_ts) VALUES(?,?,?,?,?)",
        (rel_path, local_sig, remote_size, last_action, time.time()),
    )


def delete_state(conn, rel_path: str):
    conn.execute("DELETE FROM sync_state WHERE rel_path=?", (rel_path,))


def sync_once(local_base: Path, remote_prefix: str, client, project_id: str, conn):
    remote_prefix = normalize_rel_path(remote_prefix)

    local_map = scan_local(local_base)
    remote_map = list_remote_recursive(client, project_id, remote_prefix)

    local_keys = set(local_map.keys())
    remote_keys = set(remote_map.keys())
    all_keys = sorted(local_keys | remote_keys)

    conflict_policy = os.getenv("SYNC_CONFLICT_POLICY", "local").lower()

    def do_push(rel_path: str, abs_path: str, sig: str, size: int, action: str):
        upload_direct_to_target(client, project_id, f"{remote_prefix}/{rel_path}", abs_path)
        return ("upsert", rel_path, sig, size, action)

    def do_pull(rel_path: str, expected_remote_size: int, action: str):
        dest = str(local_base.joinpath(rel_path))
        download_to_local(client, project_id, f"{remote_prefix}/{rel_path}", dest)
        new_sig = compute_local_signature(Path(dest))
        return ("upsert", rel_path, new_sig, expected_remote_size or 0, action)

    def do_delete_local(rel_path: str):
        lp = local_base.joinpath(rel_path)
        try:
            os.remove(lp)
        except IsADirectoryError:
            try:
                os.rmdir(lp)
            except Exception:
                pass
        except FileNotFoundError:
            pass
        return ("delete", rel_path)

    def do_delete_remote(rel_path: str):
        try:
            client.delete_project_file(project_id, f"{remote_prefix}/{rel_path}")
        except Exception:
            pass
        return ("delete", rel_path)

    tasks = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        for rel_path in all_keys:
            # Skip any path that contains an always-ignored segment
            if _path_has_ignored_segment(rel_path):
                continue

            state = get_state(conn, rel_path)
            local_entry = local_map.get(rel_path)
            remote_size = remote_map.get(rel_path)

            local_exists = local_entry is not None
            remote_exists = remote_size is not None

            if local_exists and not remote_exists:
                if state is None:
                    size, sig, abs_path = local_entry  # type: ignore
                    tasks.append(ex.submit(do_push, rel_path, abs_path, sig, size, "push"))
                else:
                    tasks.append(ex.submit(do_delete_local, rel_path))
                continue

            if remote_exists and not local_exists:
                if state is None:
                    tasks.append(ex.submit(do_pull, rel_path, remote_size or 0, "pull"))
                else:
                    tasks.append(ex.submit(do_delete_remote, rel_path))
                continue

            if not local_exists and not remote_exists:
                if state:
                    tasks.append(ex.submit(lambda rp=rel_path: ("delete", rp)))
                continue

            # both exist
            size, sig, abs_path = local_entry  # type: ignore
            prev_local_sig = state[0] if state else None
            prev_remote_size = state[1] if state else None

            local_changed = sig != prev_local_sig
            remote_changed = remote_size != prev_remote_size

            if local_changed and not remote_changed:
                tasks.append(ex.submit(do_push, rel_path, abs_path, sig, size, "push"))
            elif remote_changed and not local_changed:
                tasks.append(ex.submit(do_pull, rel_path, remote_size or 0, "pull"))
            elif local_changed and remote_changed:
                if conflict_policy == "remote":
                    tasks.append(ex.submit(do_pull, rel_path, remote_size or 0, "pull_conflict"))
                else:
                    tasks.append(ex.submit(do_push, rel_path, abs_path, sig, size, "push_conflict"))

        # Collect results and update DB in main thread
        for fut in concurrent.futures.as_completed(tasks):
            try:
                result = fut.result()
                if not result:
                    continue
                kind, rel_path, *rest = result
                if kind == "upsert":
                    sig, rsize, action = rest  # type: ignore
                    upsert_state(conn, rel_path, sig, rsize, action)
                elif kind == "delete":
                    delete_state(conn, rel_path)
            except Exception:
                traceback.print_exc()


class AutoSyncService:
    def __init__(
        self, workflow_root_directory: str, interval_sec: int = 10, project_file_directory: Optional[str] = None
    ):
        self.workflow_root_directory = str(Path(workflow_root_directory).resolve())
        self.interval_sec = interval_sec
        self._stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None
        # Build CML client using CDSW_DOMAIN and CDSW_APIV2_KEY like engine.ops
        api_url = os.getenv("CDSW_API_URL")
        api_key = os.getenv("CDSW_APIV2_KEY")
        domain = os.getenv("CDSW_DOMAIN")
        if api_url:
            # Use SDK's default resolver which sets headers for us
            self.client = cmlapi.default_client()
        else:
            if not domain:
                raise ValueError("CDSW_DOMAIN (or set CDSW_API_URL) environment variable not found")
            if not api_key:
                raise ValueError("CDSW_APIV2_KEY environment variable not found")
            scheme = get_url_scheme()
            base_url = f"{scheme}://{domain}"
            self.client = cmlapi.default_client(url=base_url, cml_api_key=api_key)

        # Harden: ensure Authorization header present if key available
        try:
            hdrs = getattr(self.client, "api_client", None).default_headers
            has_auth = any(k.lower() == "authorization" for k in hdrs.keys()) if hdrs else False
            if not has_auth and api_key:
                self.client.api_client.set_default_header("authorization", f"Bearer {api_key}")
        except Exception:
            pass

        self.project_id = os.getenv("CDSW_PROJECT_ID") or os.getenv("PROJECT_ID")
        if not self.project_id:
            raise ValueError("PROJECT_ID or CDSW_PROJECT_ID must be set for AutoSyncService")

        base_root = "/home/cdsw"
        wf_path = Path(self.workflow_root_directory)
        try:
            self.remote_prefix = normalize_rel_path(str(wf_path.relative_to(base_root)))
        except Exception:
            self.remote_prefix = normalize_rel_path(wf_path.name)

        # If a separate project files directory is provided, compute remote_prefix from it instead
        if project_file_directory:
            pf_path = Path(project_file_directory)
            try:
                self.remote_prefix = normalize_rel_path(str(pf_path.relative_to(base_root)))
            except Exception:
                self.remote_prefix = normalize_rel_path(pf_path.name)
        # Ensure local root matches exactly base_root + remote_prefix to avoid accidental duplication
        expected_root = str(Path(base_root) / self.remote_prefix)
        # Only correct the local root to align with remote_prefix when no explicit project_file_directory was provided
        if project_file_directory is None and self.workflow_root_directory != expected_root:
            logging.warning(
                f"[AutoSync] Correcting workflow_root_directory from {self.workflow_root_directory} to {expected_root}"
            )
            self.workflow_root_directory = expected_root

        # State DB: prefer explicit override; else, use a stable UUID per workflow root stored in a marker
        override_db = os.getenv("AUTOSYNC_STATE_DB")
        if override_db:
            self.state_db_path = Path(override_db)
        else:
            marker_path = Path(self.workflow_root_directory) / ".autosync_state_id"
            state_id: str
            try:
                if marker_path.exists():
                    state_id = marker_path.read_text(encoding="utf-8").strip()
                    if not state_id:
                        raise ValueError("empty state id")
                else:
                    state_id = uuid4().hex
                    marker_path.write_text(state_id, encoding="utf-8")
            except Exception:
                # If writing marker in workflow root fails, still generate one for this process
                state_id = uuid4().hex
            tmp_dir = Path("/tmp")
            self.state_db_path = tmp_dir / f"autosync_{state_id}.db"
            print(f"[AutoSync] Using state DB at {self.state_db_path}")

    def start(self):
        if self._thread and self._thread.is_alive():
            return
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run_loop, name="AutoSyncService", daemon=True)
        self._thread.start()

    def _run_loop(self):
        local_base = Path(self.workflow_root_directory)
        # Ensure schema exists and open a per-thread connection
        conn = _open_writable_db_strict(self.state_db_path)
        try:
            while not self._stop_event.is_set():
                try:
                    sync_once(local_base, self.remote_prefix, self.client, self.project_id, conn)
                    conn.commit()
                except Exception:
                    traceback.print_exc()
                for _ in range(self.interval_sec):
                    if self._stop_event.is_set():
                        break
                    time.sleep(1)
        finally:
            try:
                conn.commit()
                conn.close()
            except Exception:
                logging.exception("[AutoSync] error closing DB on loop exit")

    def drain_and_stop(self, timeout_sec: int = 30) -> None:
        """Stop the background thread, then perform final sync passes using a fresh connection."""
        self._stop_event.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=timeout_sec)

        local_base = Path(self.workflow_root_directory)
        conn = _open_writable_db_strict(self.state_db_path)
        try:
            for _ in range(3):
                try:
                    before_local = scan_local(local_base)
                    before_remote = list_remote_recursive(self.client, self.project_id, self.remote_prefix)
                    sync_once(local_base, self.remote_prefix, self.client, self.project_id, conn)
                    conn.commit()
                    after_local = scan_local(local_base)
                    after_remote = list_remote_recursive(self.client, self.project_id, self.remote_prefix)
                    if set(before_local.keys()) == set(after_local.keys()) and before_remote == after_remote:
                        break
                except Exception:
                    logging.exception("[AutoSync] drain pass error")
                time.sleep(1)
        finally:
            try:
                conn.commit()
                conn.close()
                logging.info("[AutoSync] closed DB after drain")
            except Exception:
                logging.exception("[AutoSync] error closing DB after drain")
