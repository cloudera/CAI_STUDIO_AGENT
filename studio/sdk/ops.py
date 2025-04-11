from studio.ops import get_ops_endpoint
import requests
import os


def get_crew_events(trace_id: str) -> dict:
    """
    Get all "descendants" spanning events for the global trace that corresponds
    to a local trace ID. Returns a dict with keys "projectId" and "events".
    """
    ops_endpoint = f"{get_ops_endpoint()}/events?trace_id={trace_id}"

    response = requests.get(ops_endpoint, headers={"Authorization": f"Bearer {os.getenv('CDSW_APIV2_KEY')}"})
    events = response.json()

    return events
