import sys

__import__("pysqlite3")
sys.modules["sqlite3"] = sys.modules.pop("pysqlite3")

from engine.utils import get_application_by_name
from engine.consts import AGENT_STUDIO_OPS_APPLICATION_NAME
from phoenix.otel import register
import cmlapi
import os


def get_ops_provider() -> str:
    return os.getenv("AGENT_STUDIO_OPS_PROVIDER", "phoenix")


def get_ops_endpoint() -> str:
    """
    Get the current operational endpoint of the
    Agent observability server. This can be overridden
    by an endpoint specified in an environment variable. If this
    env variable does not exist, extract the endpoint information
    from the running ops application directly. This env var override
    option is to make sure CML models can also reach the ops endpoint.
    """
    # Check for required environment variables
    domain = os.getenv("CDSW_DOMAIN")
    api_key = os.getenv("CDSW_APIV2_KEY")

    print(f"CDSW_DOMAIN: {'found' if domain else 'not found'}")
    print(f"CDSW_APIV2_KEY: {'found' if api_key else 'not found'}")

    if not domain:
        print("ERROR: CDSW_DOMAIN environment variable not found")
        raise ValueError("CDSW_DOMAIN environment variable not found")
    if not api_key:
        print("ERROR: CDSW_APIV2_KEY environment variable not found")
        raise ValueError("CDSW_APIV2_KEY environment variable not found")

    try:
        base_url = f"https://{domain}"
        print(f"Creating CML client with base_url: {base_url}")
        cml = cmlapi.default_client(url=base_url, cml_api_key=api_key)

        print(f"Looking for application: {AGENT_STUDIO_OPS_APPLICATION_NAME}")
        print(f"Project ID from env: {os.getenv('CDSW_PROJECT_ID')}")
        application = get_application_by_name(cml, AGENT_STUDIO_OPS_APPLICATION_NAME)
        print(f"Found application with subdomain: {application.subdomain if application else 'None'}")

        if not application:
            print(f"ERROR: Application {AGENT_STUDIO_OPS_APPLICATION_NAME} not found")
            raise ValueError(f"Application {AGENT_STUDIO_OPS_APPLICATION_NAME} not found")

        ops_endpoint = f"https://{application.subdomain}.{domain}"
        print(f"Found ops endpoint: {ops_endpoint}")
        return ops_endpoint
    except Exception as e:
        print(f"ERROR: Failed to get ops endpoint: {str(e)}")
        raise RuntimeError(f"Failed to get ops endpoint: {str(e)}")


def get_phoenix_ops_tracer_provider(workflow_name: str):
    """
    Register a tracing provider to route to the phoenix
    observability endpoint. This will ensure the crew and the
    corresponding agents/tasks will report to phoenix.

    https://docs.arize.com/phoenix/tracing/integrations-tracing/crewai
    """

    ops_addr = get_ops_endpoint()

    tracer_provider = register(
        project_name=workflow_name,
        endpoint=f"{ops_addr}/v1/traces",
        headers={"Authorization": f"Bearer {os.getenv('CDSW_APIV2_KEY')}"},
    )
    return tracer_provider
