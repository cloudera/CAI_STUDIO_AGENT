import json
import logging
import os
from cmlapi import CMLServiceApi
from cmlapi.models import CreateModelDeploymentRequest
from studio.db.dao import AgentStudioDao
from studio.db import model as db_model
from studio.proto.agent_studio_pb2 import (
    DeployedWorkflow
)
from studio.cross_cutting.apiv2 import get_api_key_from_env

def get_deployed_workflows(cml: CMLServiceApi, dao: AgentStudioDao, logger: logging.Logger = None) -> list[DeployedWorkflow]:
    """Get list of deployed workflows"""
    if logger is None:
        logger = logging.getLogger(__name__)
    
    try:
        # Get list of deployed workflows from database
        with dao.get_session() as session:
            deployed_workflows = session.query(db_model.DeployedWorkflowInstance).all()
            return [
                DeployedWorkflow(
                    deployed_workflow_id=dw.id,
                    workflow_id=dw.workflow_id,
                    cml_deployed_model_id=dw.cml_deployed_model_id
                ) for dw in deployed_workflows
            ]
    except Exception as e:
        logger.error(f"Error getting deployed workflows: {str(e)}")
        return []

def redeploy_single_workflow(workflow_id: str, cml: CMLServiceApi, dao: AgentStudioDao, logger: logging.Logger = None):
    """Redeploy a single workflow"""
    if logger is None:
        logger = logging.getLogger(__name__)

    try:
        with dao.get_session() as session:
            deployed_workflow = session.query(db_model.DeployedWorkflowInstance).filter_by(id=workflow_id).one_or_none()
            if not deployed_workflow:
                logger.error(f"Deployed workflow with ID '{workflow_id}' not found")
                return

            # Get latest build and its deployment
            builds = cml.list_model_builds(
                project_id=os.getenv("CDSW_PROJECT_ID"),
                model_id=deployed_workflow.cml_deployed_model_id
            ).model_builds

            if not builds:
                logger.error(f"No builds found for model {deployed_workflow.cml_deployed_model_id}")
                return

            latest_build = builds[0]
            deployments = cml.list_model_deployments(
                project_id=os.getenv("CDSW_PROJECT_ID"),
                model_id=deployed_workflow.cml_deployed_model_id,
                build_id=latest_build.id
            ).model_deployments

            if not deployments:
                logger.error(f"No deployments found for model {deployed_workflow.cml_deployed_model_id}")
                return

            current_deployment = deployments[0]

            # Get environment vars - fail if we can't read them
            try:
                env_vars = json.loads(current_deployment.environment) if current_deployment.environment else {}
                if not env_vars:
                    raise ValueError("Current deployment has no environment variables")
            except Exception as e:
                logger.error(f"Failed to read environment variables from current deployment: {str(e)}")
                return

            # Get API key using the method from apiv2
            key_id, key_value = get_api_key_from_env(cml, logger)
            if not key_id or not key_value:
                raise RuntimeError("CML API v2 key not found. You need to configure a CML API v2 key for Agent Studio to deploy workflows.")

            # Update API key while preserving all other env vars
            env_vars["CDSW_APIV2_KEY"] = key_value

            # Create new deployment with same settings
            new_deployment = CreateModelDeploymentRequest(
                cpu=current_deployment.cpu,
                memory=current_deployment.memory,
                nvidia_gpus=0,
                environment=env_vars,
                replicas=current_deployment.replicas
            )

            # Create new deployment with latest build
            cml.create_model_deployment(
                new_deployment,
                os.getenv("CDSW_PROJECT_ID"),
                deployed_workflow.cml_deployed_model_id,
                latest_build.id
            )

            logger.info(f"Successfully redeployed workflow {workflow_id}")

    except Exception as e:
        logger.error(f"Failed to redeploy workflow {workflow_id}: {str(e)}") 