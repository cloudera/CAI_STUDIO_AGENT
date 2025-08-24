# No top level studio.db imports allowed to support wokrflow model deployment
import asyncio
from contextvars import Context
import os
import cmlapi
from uuid import uuid4

from typing import Dict, Any
from datetime import datetime
from opentelemetry.context import attach, detach

from engine.crewai.trace_context import set_trace_id
from engine.crewai.crew import create_crewai_objects
from engine.crewai.autosync import AutoSyncService


def ensure_session_directory(workflow_project_file_directory: str, session_id: str, inputs: dict) -> bool:
    """
    Ensure session directory exists and upload inputs.txt using CML API.
    Creates directory structure: workflow_root_directory/session/session_id/inputs.txt

    Args:
        workflow_root_directory: Base workflow root directory
        session_id: Session ID for the workflow run
        inputs: Input dictionary to save as inputs.txt

    Returns:
        bool: True if upload successful, False otherwise
    """
    if not session_id:
        return True  # No session_id provided, skip directory creation

    # DEBUG: Print the workflow_root_directory value to find root cause
    print(f"🔍 DEBUG: workflow_project_file_directory parameter = '{workflow_project_file_directory}'")
    print(f"🔍 DEBUG: session_id parameter = '{session_id}'")

    try:
        # Initialize CML client
        client = cmlapi.default_client()
        project_id = os.getenv("CDSW_PROJECT_ID")

        if not project_id:
            print(f"Warning: CDSW_PROJECT_ID not set, cannot upload inputs file")
            return False

        # Target path for inputs.txt
        target_inputs_path = f"{workflow_project_file_directory}/session/{session_id}/inputs.txt"
        print(f"🔍 DEBUG: Constructed target_inputs_path = '{target_inputs_path}'")

        # Step 1: Try to delete existing file at target path (ignore failures)
        try:
            client.delete_project_file(project_id=project_id, path=target_inputs_path)
            print(f"🗑️  Deleted existing file: {target_inputs_path}")
        except:
            print(f"ℹ️  No existing file to delete or deletion failed (continuing anyway): {target_inputs_path}")

        # Step 2: Create local inputs.txt file
        import json

        inputs_content = json.dumps(inputs, indent=2, ensure_ascii=False)
        local_inputs_file = f"/tmp/inputs_{session_id}_{str(uuid4())[:8]}.txt"

        with open(local_inputs_file, "w", encoding="utf-8") as f:
            f.write(inputs_content)

        print(f"📝 Created local inputs file with {len(inputs)} entries")

        # Step 3: Upload directly to target location using call_api
        print(f"⬆️  Uploading inputs directly to {target_inputs_path}...")

        header_params = {"Content-Type": "multipart/form-data"}
        files_payload = {target_inputs_path: local_inputs_file}

        client.api_client.call_api(
            f"/api/v2/projects/{project_id}/files",
            "POST",
            path_params={"project_id": project_id},
            header_params=header_params,
            files=files_payload,
            response_type=None,
        )

        # Step 4: Clean up local file
        os.remove(local_inputs_file)

        print(f"✅ Successfully uploaded inputs.txt to {target_inputs_path}")
        return True

    except Exception as e:
        print(f"❌ Error uploading inputs file: {e}")
        return False


def run_workflow(
    workflow_directory: str,
    collated_input: Any,
    tool_config: Dict[str, Dict[str, str]],
    mcp_config: Dict[str, Dict[str, str]],
    llm_config: Dict[str, Dict[str, str]],
    inputs: Dict[str, Any],
    parent_context: Context,
    events_trace_id: str,
    session_id: str = None,
    workflow_root_directory: str = None,
    workflow_project_file_directory: str = None,
    mode: str = None,
) -> None:
    """
    Runs a CrewAI workflow inside the given context.
    Intended to be launched either directly or via an executor thread.
    """
    token = attach(parent_context)
    try:
        # Handle session_id: create directory and upload inputs file
        if session_id:
            # Ensure session directory exists and upload inputs.txt using CML API
            # Use workflow_project_file_directory if provided, otherwise fall back to workflow_root_directory/workflow_directory
            directory_for_project_files = (
                workflow_project_file_directory
                if workflow_project_file_directory
                else (workflow_root_directory if workflow_root_directory else workflow_directory)
            )
            if not ensure_session_directory(directory_for_project_files, session_id, inputs):
                print(f"Failed to upload inputs file for session_id: {session_id}")

        # Determine deployment mode and compute session directory path (local and remote target)
        base_dir = workflow_root_directory if workflow_root_directory else workflow_directory
        # Determine autosync based on explicit mode
        mode_upper = (mode or "").upper()
        is_deployment_mode = mode_upper == "DEPLOYMENT"

        autosync_service = None
        # Start autosync only in TESTING mode
        if is_deployment_mode:

            def to_abs(path_str: str) -> str:
                return (
                    path_str
                    if path_str.startswith("/home/cdsw/") or path_str == "/home/cdsw"
                    else f"/home/cdsw/{path_str.lstrip('/')}"
                )

            # Compute local and project files directories, appending session if provided
            local_root = base_dir
            project_files_root = workflow_project_file_directory if workflow_project_file_directory else base_dir

            if session_id:
                local_root = f"{local_root}/session/{session_id}"
                project_files_root = f"{project_files_root}/session/{session_id}"

            local_root_abs = to_abs(local_root)
            project_files_root_abs = to_abs(project_files_root)

            try:
                autosync_service = AutoSyncService(
                    local_root_abs,
                    interval_sec=int(os.environ.get("INTERVAL_SEC", "10")),
                    project_file_directory=project_files_root_abs,
                )
                autosync_service.start()
                print(f"[AutoSync] Started for local={local_root_abs} -> remote_base={project_files_root_abs}")
            except Exception as e:
                print(f"[AutoSync] Failed to start: {e}")

        set_trace_id(events_trace_id)

        # Create session directory path if session_id is provided
        session_directory = None
        if session_id:
            directory_to_use = workflow_root_directory if workflow_root_directory else workflow_directory
            session_directory = f"{directory_to_use}/session/{session_id}"
            # For tool execution, ensure SESSION_DIRECTORY is an absolute filesystem path so it
            # does not get resolved relative to the workflow cwd (e.g., /home/cdsw/workflow)
            if not session_directory.startswith("/home/cdsw/"):
                session_directory = f"/home/cdsw/{session_directory.lstrip('/')}"
            print(f"Using session directory: {session_directory}")

        print(
            f"[Engine] Creating CrewAI objects | smart={bool(getattr(collated_input.workflow, 'smart_workflow', False))} "
            f"process={getattr(collated_input.workflow, 'crew_ai_process', None)} "
            f"agents={len(collated_input.agents)} tasks={len(collated_input.tasks)} "
            f"manager_agent_id={getattr(collated_input.workflow, 'manager_agent_id', None)}\n"
            f"models={len(collated_input.language_models)} tools={len(collated_input.tool_instances)} mcps={len(collated_input.mcp_instances)}"
        )
        crewai_objects = create_crewai_objects(
            workflow_directory,
            collated_input,
            tool_config,
            mcp_config,
            llm_config,
            session_directory,
        )
        print(
            f"[Engine] Crew objects created | agents={len(crewai_objects.agents)} tasks={len(crewai_objects.tasks)} "
            f"crews={len(crewai_objects.crews)}"
        )
        crew = crewai_objects.crews[collated_input.workflow.id]
        try:
            mgr_id = getattr(collated_input.workflow, 'manager_agent_id', None)
            if mgr_id:
                mgr = crewai_objects.agents.get(mgr_id)
                print(
                    f"[Engine] Manager present | id={mgr_id} has_tools={bool(getattr(mgr, 'tools', None))} "
                    f"llm_set={bool(getattr(mgr, 'llm', None))}"
                )
        except Exception:
            pass
        # Initialize or update state.json/plan.json only for smart workflows
        try:
            is_smart_workflow = bool(getattr(collated_input.workflow, 'smart_workflow', False))
            if is_smart_workflow and session_directory:
                os.makedirs(session_directory, exist_ok=True)
                state_json_path = f"{session_directory}/state.json"
                plan_json_path = f"{session_directory}/plan.json"

                def _find_context_slot(obj):
                    # Returns a tuple (container, key, value) where 'key' is 'context' (case-insensitive)
                    if isinstance(obj, dict):
                        for k, v in obj.items():
                            if str(k).lower() == "context":
                                return (obj, k, v)
                            found = _find_context_slot(v)
                            if found is not None:
                                return found
                    elif isinstance(obj, list):
                        for item in obj:
                            found = _find_context_slot(item)
                            if found is not None:
                                return found
                    return None

                # Detect if existing plan.json includes HUMAN_INPUT_REQUIRED
                human_input_required_present = False
                existing_plan_obj = None
                try:
                    if os.path.exists(plan_json_path) and os.path.getsize(plan_json_path) > 0:
                        import json as _json
                        with open(plan_json_path, "r", encoding="utf-8") as pf:
                            maybe_plan = _json.load(pf)
                        if isinstance(maybe_plan, dict):
                            existing_plan_obj = maybe_plan
                            steps = maybe_plan.get("steps")
                            if isinstance(steps, list):
                                for s in steps:
                                    if isinstance(s, dict) and str(s.get("status", "")).strip().upper() == "HUMAN_INPUT_REQUIRED":
                                        human_input_required_present = True
                                        break
                except Exception:
                    human_input_required_present = False
                    existing_plan_obj = None

                found_slot = _find_context_slot(inputs)
                if human_input_required_present:
                    # Do NOT reset state.json; append context (if present) to the bottom
                    try:
                        import json as _json
                        entries = []
                        if os.path.exists(state_json_path) and os.path.getsize(state_json_path) > 0:
                            try:
                                with open(state_json_path, "r", encoding="utf-8") as sf:
                                    entries = _json.load(sf) or []
                                    if not isinstance(entries, list):
                                        entries = []
                            except Exception:
                                entries = []
                        if found_slot is not None and found_slot[2] is not None and str(found_slot[2]).strip() != "":
                            # Add Agent Studio event first
                            entries.append({
                                "timestamp": datetime.utcnow().isoformat() + "Z",
                                "response": "new execution started",
                                "role": "Agent Studio",
                            })
                            # Then append the conversation as a conversation role
                            entries.append({
                                "timestamp": datetime.utcnow().isoformat() + "Z",
                                "response": str(found_slot[2]).strip(),
                                "role": "conversation",
                            })
                        with open(state_json_path, "w", encoding="utf-8") as f:
                            _json.dump(entries, f, ensure_ascii=False, indent=2)
                        # Clear the context value in inputs now that it has been persisted to state.json
                        try:
                            if found_slot is not None:
                                container, key, _ = found_slot
                                container[key] = ""
                        except Exception:
                            pass
                    except Exception:
                        pass
                else:
                    # Initialize fresh state.json and clear inputs context
                    try:
                        import json as _json
                        entries = []
                        if found_slot is not None and found_slot[2] is not None and str(found_slot[2]) != "":
                            # Add Agent Studio event first
                            entries.append({
                                "timestamp": datetime.utcnow().isoformat() + "Z",
                                "response": "new execution started",
                                "role": "Agent Studio",
                            })
                            # Then add the conversation entry
                            entries.append({
                                "timestamp": datetime.utcnow().isoformat() + "Z",
                                "response": str(found_slot[2]),
                                "role": "conversation",
                            })
                            container, key, _ = found_slot
                            container[key] = ""
                        with open(state_json_path, "w", encoding="utf-8") as f:
                            _json.dump(entries, f, ensure_ascii=False, indent=2)
                    except Exception:
                        with open(state_json_path, "w", encoding="utf-8") as f:
                            f.write("[]")

                # Write plan.json: if HUMAN_INPUT_REQUIRED existed, set those step(s) to IN PROGRESS; else init empty
                try:
                    import json as _json
                    if human_input_required_present and isinstance(existing_plan_obj, dict):
                        steps = existing_plan_obj.get("steps")
                        if isinstance(steps, list):
                            for s in steps:
                                try:
                                    if isinstance(s, dict) and str(s.get("status", "")).strip().upper() == "HUMAN_INPUT_REQUIRED":
                                        s["status"] = "NOT STARTED"
                                except Exception:
                                    continue
                        with open(plan_json_path, "w", encoding="utf-8") as plan_file:
                            _json.dump(existing_plan_obj, plan_file, ensure_ascii=False, indent=2)
                    else:
                        with open(plan_json_path, "w", encoding="utf-8") as plan_file:
                            plan_file.write("")
                except Exception:
                    pass
        except Exception as e:
            print(f"Warning: unable to initialize state.json/plan.json: {e}")
        print(f"[Engine] Kickoff | inputs_keys={list(inputs.keys())}")
        crew.kickoff(inputs=dict(inputs))

        # After kickoff completes, stop autosync after ensuring a final drain
        if autosync_service:
            try:
                print("[AutoSync] Draining and stopping...")
                autosync_service.drain_and_stop()
            except Exception as e:
                print(f"[AutoSync] Error during drain/stop: {e}")
    finally:
        detach(token)
        # Guard against create failure before crewai_objects is assigned
        try:
            objects = crewai_objects
        except UnboundLocalError:
            objects = None
        if objects is None:
            return
        for mcp_object in objects.mcps.values():
            try:
                mcp_object.local_session.__exit__(None, None, None)
            except Exception as e:
                print(f"Error stopping MCP: {e}")


async def run_workflow_async(
    workflow_directory: str,
    collated_input: Any,
    tool_config: Dict[str, Dict[str, str]],
    mcp_config: Dict[str, Dict[str, str]],
    llm_config: Dict[str, Dict[str, str]],
    inputs: Dict[str, Any],
    parent_context: Any,  # Use the parent context
    events_trace_id,
    session_id: str = None,
    workflow_root_directory: str = None,
    workflow_project_file_directory: str = None,
    mode: str = None,
) -> None:
    """
    Run the workflow task in the background using the parent context.

    TODO: determine why this is required and asyncio.to_thread()
    cannot be used here
    """
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(
        None,
        run_workflow,
        workflow_directory,
        collated_input,
        tool_config,
        mcp_config,
        llm_config,
        inputs,
        parent_context,
        events_trace_id,
        session_id,
        workflow_root_directory,
        workflow_project_file_directory,
        mode,
    )
