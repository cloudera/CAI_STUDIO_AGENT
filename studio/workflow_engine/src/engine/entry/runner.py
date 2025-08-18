from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import asyncio
import os
import sys
import traceback
import requests
from datetime import datetime
from opentelemetry.context import get_current
import subprocess
from typing import Dict, Any, Optional

# Disable CrewAI telemetry.
os.environ["CREWAI_DISABLE_TELEMETRY"] = "true"

# Ensure UV is available within the runner's env
try:
    subprocess.run(["pip", "install", "uv"], text=True, check=True)
except Exception as e:
    print(f"Skipping UV install into workflow runner venv: {str(e)}")

__import__("pysqlite3")
sys.modules["sqlite3"] = sys.modules.pop("pysqlite3")

current_dir = os.path.dirname(os.path.abspath(__file__))
workflow_engine_src_dir = os.path.abspath(os.path.join(current_dir, "..", ".."))
sys.path.append(workflow_engine_src_dir)

# Import CrewAI modules.
import engine.types as input_types
from engine.crewai.run import run_workflow
from engine.crewai.tracing import instrument_crewai_workflow, reset_crewai_instrumentation
from engine.ops import get_ops_endpoint
from engine.crewai.events import register_global_handlers
from engine.tool.run import run_tool_test

app = FastAPI()

# Global asynchronous lock to allow only one workflow at a time.
global_lock = asyncio.Lock()

# Global reference to the running workflow
running_workflow = None


# Pydantic model for the incoming JSON payload.
class KickoffPayload(BaseModel):
    workflow_directory: str
    workflow_root_directory: Optional[str] = None
    workflow_project_file_directory: Optional[str] = None
    workflow_name: str
    collated_input: dict
    tool_config: dict
    mcp_config: dict
    llm_config: dict
    inputs: dict
    events_trace_id: str
    session_id: Optional[str] = None
    mode: Optional[str] = None


class ToolTestPayload(BaseModel):
    tool_instance_id: str
    tool_directory: str
    user_params: Dict[str, Any]
    tool_params: Dict[str, Any]
    trace_id: str


# Register our handlers. This can occur globally
# because regardless of the actual workflow definition
# we run, the event handlers can remain the same (since
# trace ID is written as a contextvar on each async task)
register_global_handlers()


def run_workflow_task(payload: KickoffPayload) -> None:
    global running_workflow

    """
    Task definiton to be ran asynchronously.
    Any exceptions are caught and posted to the ops endpoint.
    """
    try:
        reset_crewai_instrumentation()
        tracer_provider = instrument_crewai_workflow(payload.workflow_name)
        tracer = tracer_provider.get_tracer("opentelemetry.agentstudio.workflow.model")
        current_time = datetime.now()
        formatted_time = current_time.strftime("%b %d, %H:%M:%S.%f")[:-3]
        span_name = f"Workflow Run: {formatted_time}"

        # Start a span for the workflow run.
        with tracer.start_as_current_span(span_name) as parent_span:
            decimal_trace_id = parent_span.get_span_context().trace_id
            # Converting the trace id from an integer to a 32-digit hex string.
            trace_id = f"{decimal_trace_id:032x}"
            parent_span.add_event("Parent span ending early for visibility")
            parent_span.end()
            parent_context = get_current()

        # Validate and convert the collated input into its object.
        collated_input_obj = input_types.CollatedInput.model_validate(payload.collated_input)
        run_workflow(
            payload.workflow_directory,
            collated_input_obj,
            payload.tool_config,
            payload.mcp_config,
            payload.llm_config,
            payload.inputs,
            parent_context,
            payload.events_trace_id,
            payload.session_id,
            payload.workflow_root_directory,
            payload.workflow_project_file_directory,
            payload.mode,
        )

        print("Workflow finished successfully")
    except Exception as e:
        running_workflow = None
        print("Workflow failed:", e)
        traceback.print_exc()
        try:
            requests.post(
                url=f"{get_ops_endpoint()}/events",
                headers={"Authorization": f"Bearer {os.getenv('CDSW_APIV2_KEY')}"},
                json={
                    "trace_id": payload.events_trace_id,
                    "event": {"type": "crew_kickoff_failed", "error": str(e), "trace": traceback.format_exc()},
                },
            )
        except Exception as post_ex:
            print("Failed to send error event:", post_ex)


async def run_workflow_background(payload: KickoffPayload) -> None:
    global running_workflow

    """
    This asynchronous wrapper schedules the synchronous workflow to run
    in an executor. When done, it ensures the global lock is released.
    """
    try:
        loop = asyncio.get_running_loop()
        # Running the blocking workflow code in a separate thread.
        await loop.run_in_executor(None, run_workflow_task, payload)
    finally:
        global_lock.release()
        running_workflow = None


@app.post("/kickoff")
async def kickoff(payload: KickoffPayload):
    global running_workflow

    """
    POST endpoint to start a Crew workflow.

    It will:
      - Check if another workflow is already running.
      - If not, acquire the lock, schedule the workflow to run asynchronously, and respond immediately.
      - If the lock is already held, return HTTP 409 "Runner is busy".
    """
    if global_lock.locked():
        raise HTTPException(status_code=409, detail="Runner is busy")

    # Acquire the lock so that no other workflow starts.
    await global_lock.acquire()
    running_workflow = {"name": payload.workflow_name, "id": payload.collated_input["workflow"]["id"]}
    # Launch the background workflow process.
    asyncio.create_task(run_workflow_background(payload))
    return {"status": "Workflow kickoff started"}


@app.get("/status")
async def status():
    global running_workflow

    """
    GET endpoint to report the runner's busy status.

    It returns a JSON indicating whether a workflow is currently running.
    """
    if global_lock.locked():
        return {"busy": True, "workflow": running_workflow}
    else:
        return {"busy": False}


@app.post("/test_tool_instance")
async def test_tool_instance(payload: ToolTestPayload):
    if global_lock.locked():
        raise HTTPException(status_code=409, detail="Runner is busy")
    await global_lock.acquire()

    async def run_tool_test_background():
        try:
            loop = asyncio.get_running_loop()
            # Run the blocking tool test in a separate thread
            await loop.run_in_executor(
                None,
                run_tool_test,
                payload.tool_instance_id,
                payload.tool_directory,
                payload.user_params,
                payload.tool_params,
                payload.trace_id,
            )
        finally:
            global_lock.release()

    asyncio.create_task(run_tool_test_background())
    return {"status": "Tool test started", "trace_id": payload.trace_id}
