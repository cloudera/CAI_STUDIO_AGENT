import os
from pathlib import Path
from studio.workflow_engine.src.engine.crewai import autosync as a


def test_normalize_and_ignore_helpers(tmp_path: Path):
    # normalize_rel_path
    assert a.normalize_rel_path("/a/b\\c/") == "a/b/c"

    # _path_has_ignored_segment: ALWAYS_IGNORE_DIRS contains .venv
    assert a._path_has_ignored_segment("x/.venv/y") is True
    assert a._path_has_ignored_segment("x/y/z") is False

    # compute_local_signature should return stable format
    p = tmp_path / "f.txt"
    p.write_text("hello")
    sig = a.compute_local_signature(p)
    assert ":" in sig


def test_scan_local_respects_ignored(tmp_path: Path, monkeypatch):
    # create structure
    (tmp_path / ".venv").mkdir()
    (tmp_path / ".venv" / "a.txt").write_text("x")
    (tmp_path / "ok.txt").write_text("y")

    # ensure default IGNORES in effect
    index = a.scan_local(tmp_path)
    assert "ok.txt" in index
    assert not any(".venv" in k for k in index.keys())
