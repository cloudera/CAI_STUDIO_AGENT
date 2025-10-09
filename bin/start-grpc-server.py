# start-grpc-server.py
from concurrent import futures
import grpc
from studio.proto import agent_studio_pb2_grpc
from studio.service import AgentStudioApp
from studio.consts import DEFAULT_AS_GRPC_PORT
import cmlapi
import os
import json
from typing import Dict
from dotenv import load_dotenv

# Load environment variables from .env files
load_dotenv()  # Load .env from current directory
load_dotenv('.env.local')  # Load .env.local if it exists (for local overrides)

# Agent studio operates from the APP_DATA_DIR. This is typically /home/cdsw/agent-studio
# in several installation form factors, but /home/cdsw/ in just AMP form factor.
os.chdir(os.getenv("APP_DATA_DIR"))

def start_server(blocking: bool = False):
    port = DEFAULT_AS_GRPC_PORT
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    agent_studio_pb2_grpc.add_AgentStudioServicer_to_server(AgentStudioApp(), server=server)
    server.add_insecure_port("[::]:" + port)
    server.start()
    print("Server started, listening on " + port)
    
    if blocking:
        server.wait_for_termination()


def update_agent_studio_service_in_project(cml: cmlapi.CMLServiceApi):
    """
    Update the agent studio service IP information in the project
    environment variables.
    """
    print("Updating agent studio service env vars in the project...")

    project_id = os.getenv("CDSW_PROJECT_ID")
    grpc_address = os.getenv("CDSW_IP_ADDRESS")
    grpc_port = DEFAULT_AS_GRPC_PORT
    
    proj: cmlapi.Project = cml.get_project(project_id)
    proj_env: Dict = json.loads(proj.environment)
    proj_env.update({
        "AGENT_STUDIO_SERVICE_IP": grpc_address,
        "AGENT_STUDIO_SERVICE_PORT": grpc_port
    })
    
    updated_project: cmlapi.Project = cmlapi.Project(
        environment= json.dumps(proj_env)
    )
    out: cmlapi.Project = cml.update_project(updated_project, project_id=project_id)


if __name__ == "__main__":
    
    # Make the fine tuning studio IP address and port available as project-level 
    # environment variables, so we can instantiate clients from anywhere 
    # within the project.
    
    cml = cmlapi.default_client()
    
    # If we are in production mode, update the project env vars.
    if os.getenv("AGENT_STUDIO_DEPLOYMENT_CONFIG") == "prod":
        update_agent_studio_service_in_project(cml)
    else:
        print("Running gRPC server in dev mode.")

    # Start the server up. If this command fails (if the port is already
    # in use), the application script bin/start-app-script.sh will continue
    # to run and the error will exit gracefully.
    start_server(blocking=True)