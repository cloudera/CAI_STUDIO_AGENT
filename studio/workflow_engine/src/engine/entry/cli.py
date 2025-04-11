print("Starting workflow in CLI/venv mode...")


import os
import sys
import traceback

# Manual patch required for CrewAI compatability
__import__("pysqlite3")
sys.modules["sqlite3"] = sys.modules.pop("pysqlite3")

from opentelemetry.context import get_current
from datetime import datetime
from typing import Dict, Any
import json
import argparse
import requests

# Import engine code manually. This is because we call this
# cli.py from an environment/location that is at agent-studio/
# root.
import sys

sys.path.append(os.path.join(os.getcwd(), "studio/workflow_engine/src"))

import engine.types as input_types
from engine.crewai.run import run_workflow
from engine.crewai.tracing import instrument_crewai_workflow, reset_crewai_instrumentation
from engine.ops import get_ops_endpoint


# # Currently the only artifact type supported for import is directory.
# # the collated input requirements are all relative to the workflow import path.
# # NOTE: if we are running in "test mode" from within Studio, then these venvs
# # will already be ready and prepared, so this is a very fast function call.
# def _install_python_requirements(collated_input: input_types.CollatedInput):
#     for tool_instance in collated_input.tool_instances:
#         print(f"PREPARING VIRTUAL ENV FOR {tool_instance.name}")
#         prepare_virtual_env_for_tool(tool_instance.source_folder_path, tool_instance.python_requirements_file_name)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--workflow-name", required=True, help="Workflow name")
    parser.add_argument("--collated-input", required=True, help="Collated input type")
    parser.add_argument("--tool-user-params", required=True, help="Tool configuration parameters")
    parser.add_argument("--inputs", required=True, help="Crew inputs")
    parser.add_argument("--events-trace-id", required=True, help="Trace ID to write events to")
    args = parser.parse_args()

    try:
        # Parse JSON into dictionaries
        workflow_name = args.workflow_name
        collated_input_dict = json.loads(args.collated_input)
        collated_input = input_types.CollatedInput.model_validate(collated_input_dict)
        tool_user_params: Dict[str, Dict[str, str]] = json.loads(args.tool_user_params)
        inputs: Dict[str, Any] = json.loads(args.inputs)
        events_trace_id = args.events_trace_id

        # Instrument our workflow given a specific workflow name and
        # set up the instrumentation.
        print("Setting instrumentation...")
        reset_crewai_instrumentation()
        tracer_provider = instrument_crewai_workflow(f"{workflow_name}")
        tracer = tracer_provider.get_tracer("opentelemetry.agentstudio.workflow.model")

        # # configure venvs if necessary.
        # print("Configuring tool venvs...")
        # _install_python_requirements(collated_input)

        print("Running workflow...")
        current_time = datetime.now()
        formatted_time = current_time.strftime("%b %d, %H:%M:%S.%f")[:-3]
        span_name = f"Workflow Run: {formatted_time}"
        with tracer.start_as_current_span(span_name) as parent_span:
            decimal_trace_id = parent_span.get_span_context().trace_id
            trace_id = f"{decimal_trace_id:032x}"

            # End the parent span early
            parent_span.add_event("Parent span ending early for visibility")
            parent_span.end()

            # Capture the current OpenTelemetry context
            parent_context = get_current()

            run_workflow(collated_input, tool_user_params, inputs, parent_context, events_trace_id)

            sys.exit(0)

    except Exception as e:
        print("Workflow failed:", e)
        traceback.print_exc()

        requests.post(
            url=f"{get_ops_endpoint()}/events",
            headers={"Authorization": f"Bearer {os.getenv('CDSW_APIV2_KEY')}"},
            json={
                "trace_id": args.events_trace_id,
                "event": {"type": "crew_kickoff_failed", "error": str(e), "trace": traceback.format_exc()},
            },
        )
