import json
import os
import shutil
from uuid import uuid4
import cmlapi
from typing import Union, List, Optional
from sqlalchemy.exc import SQLAlchemyError
import requests
from google.protobuf.json_format import MessageToDict
import json
from cmlapi import CMLServiceApi

from studio.db.dao import AgentStudioDao
from studio.api import *
from studio.db import model as db_model
from studio.models.utils import get_studio_default_model_id
import studio.cross_cutting.utils as cc_utils
from studio.proto.utils import is_field_set
from studio.cross_cutting.utils import get_studio_subdirectory
import studio.consts as consts
from studio.workflow.utils import is_custom_model_root_dir_feature_enabled
from studio.workflow.runners import get_workflow_runners

# Import engine code manually. Eventually when this code becomes
# a separate git repo, or a custom runtime image, this path call
# will go away and workflow engine features will be available already.
import sys

sys.path.append("studio/worfklow_engine/src")

from engine.ops import get_ops_endpoint
import engine.types as input_types


def _create_collated_input(
    request: Union[TestWorkflowRequest, DeployWorkflowRequest], cml: CMLServiceApi = None, dao: AgentStudioDao = None
) -> input_types.CollatedInput:
    # For now, we only allow one a singular generation config
    # shared across all LLMs. This can be updated in the future
    # if we need it to be.
    llm_generation_config = consts.DEFAULT_GENERATION_CONFIG
    if is_field_set(request, "generation_config"):
        request_dict = MessageToDict(request, preserving_proto_field_name=True)
        llm_generation_config.update(json.loads(request_dict["generation_config"]))

    with dao.get_session() as session:
        workflow = session.query(db_model.Workflow).filter(db_model.Workflow.id == request.workflow_id).first()
        if not workflow:
            raise ValueError(f"Workflow with ID '{request.workflow_id}' not found.")
        default_llm = session.query(db_model.Model).filter_by(is_studio_default=True).one_or_none()
        if not default_llm:
            raise ValueError(f"Default model not found.")

        task_ids = list(workflow.crew_ai_tasks) or list()
        agent_ids = set(workflow.crew_ai_agents) or set()
        if workflow.crew_ai_manager_agent:
            agent_ids.add(workflow.crew_ai_manager_agent)
        tool_instance_ids = set()
        language_model_ids = set([default_llm.model_id])
        if workflow.crew_ai_llm_provider_model_id:
            language_model_ids.add(workflow.crew_ai_llm_provider_model_id)

        task_db_models = session.query(db_model.Task).filter(db_model.Task.id.in_(task_ids)).all()
        task_inputs: List[input_types.Input__Task] = []
        for task_id in task_ids:
            task_db_model = next((t for t in task_db_models if t.id == task_id), None)
            if not task_db_model:
                raise ValueError(f"Task with ID '{task_id}' not found.")
            task_inputs.append(
                input_types.Input__Task(
                    id=task_db_model.id,
                    description=task_db_model.description,
                    expected_output=task_db_model.expected_output,
                    assigned_agent_id=task_db_model.assigned_agent_id,
                )
            )
            if task_db_model.assigned_agent_id:
                agent_ids.add(task_db_model.assigned_agent_id)

        agent_db_models = session.query(db_model.Agent).filter(db_model.Agent.id.in_(agent_ids)).all()
        agent_inputs: List[input_types.Input__Agent] = []
        for agent_id in agent_ids:
            agent_db_model = next((a for a in agent_db_models if a.id == agent_id), None)
            if not agent_db_model:
                raise ValueError(f"Agent with ID '{agent_id}' not found.")
            agent_inputs.append(
                input_types.Input__Agent(
                    id=agent_db_model.id,
                    name=agent_db_model.name,
                    llm_provider_model_id=agent_db_model.llm_provider_model_id,
                    crew_ai_role=agent_db_model.crew_ai_role,
                    crew_ai_backstory=agent_db_model.crew_ai_backstory,
                    crew_ai_goal=agent_db_model.crew_ai_goal,
                    crew_ai_allow_delegation=agent_db_model.crew_ai_allow_delegation,
                    crew_ai_verbose=agent_db_model.crew_ai_verbose,
                    crew_ai_cache=agent_db_model.crew_ai_cache,
                    # crew_ai_temperature=agent_db_model.crew_ai_temperature,  # NOTE: temperature from schema is unused
                    crew_ai_max_iter=agent_db_model.crew_ai_max_iter,
                    tool_instance_ids=list(agent_db_model.tool_ids) if agent_db_model.tool_ids else [],
                    agent_image_uri=(
                        os.path.relpath(agent_db_model.agent_image_path, consts.DYNAMIC_ASSETS_LOCATION)
                        if agent_db_model.agent_image_path
                        else ""
                    ),
                )
            )
            if agent_db_model.llm_provider_model_id:
                language_model_ids.add(agent_db_model.llm_provider_model_id)
            tool_instance_ids.update(list(agent_db_model.tool_ids))

        tool_instance_db_models = (
            session.query(db_model.ToolInstance).filter(db_model.ToolInstance.id.in_(tool_instance_ids)).all()
        )
        tool_instance_inputs: List[input_types.Input__ToolInstance] = []
        for t_id in tool_instance_ids:
            tool_instance_db_model = next((t for t in tool_instance_db_models if t.id == t_id), None)
            if not tool_instance_db_model:
                raise ValueError(f"Tool Instance with ID '{t_id}' not found.")
            tool_instance_inputs.append(
                input_types.Input__ToolInstance(
                    id=tool_instance_db_model.id,
                    name=tool_instance_db_model.name,
                    python_code_file_name=tool_instance_db_model.python_code_file_name,
                    python_requirements_file_name=tool_instance_db_model.python_requirements_file_name,
                    source_folder_path=tool_instance_db_model.source_folder_path,
                    tool_image_uri=(
                        os.path.relpath(tool_instance_db_model.tool_image_path, consts.DYNAMIC_ASSETS_LOCATION)
                        if tool_instance_db_model.tool_image_path
                        else None
                    ),
                    is_venv_tool=tool_instance_db_model.is_venv_tool,
                )
            )

        language_model_db_models = (
            session.query(db_model.Model).filter(db_model.Model.model_id.in_(language_model_ids)).all()
        )
        language_model_inputs: List[input_types.Input__LanguageModel] = []
        for lm_id in language_model_ids:
            language_model_db_model = next((lm for lm in language_model_db_models if lm.model_id == lm_id), None)
            if not language_model_db_model:
                raise ValueError(f"Language Model with ID '{lm_id}' not found.")
            language_model_inputs.append(
                input_types.Input__LanguageModel(
                    model_id=language_model_db_model.model_id,
                    model_name=language_model_db_model.model_name,
                    config=input_types.Input__LanguageModelConfig(
                        provider_model=language_model_db_model.provider_model,
                        model_type=language_model_db_model.model_type,
                        api_base=language_model_db_model.api_base or None,
                        api_key=language_model_db_model.api_key or None,
                    ),
                    generation_config=llm_generation_config,
                )
            )

        deployed_workflow_instance_id = cc_utils.get_random_compact_string()

        # If we have a default manager, assign to the default model for testing.
        llm_provider_model_id = ""
        if workflow.crew_ai_process == "hierarchical" and not workflow.crew_ai_manager_agent:
            llm_provider_model_id = (
                workflow.crew_ai_llm_provider_model_id
                or get_studio_default_model_id(dao=dao, preexisting_db_session=session)[1]
            )

        workflow_input = input_types.Input__Workflow(
            id=workflow.id,
            name=workflow.name,
            description=workflow.description,
            deployment_id=deployed_workflow_instance_id,
            crew_ai_process=workflow.crew_ai_process,
            agent_ids=list(workflow.crew_ai_agents) if workflow.crew_ai_agents else [],
            task_ids=list(workflow.crew_ai_tasks) if workflow.crew_ai_tasks else [],
            manager_agent_id=workflow.crew_ai_manager_agent or None,
            llm_provider_model_id=llm_provider_model_id or None,
            is_conversational=workflow.is_conversational,
        )

        collated_input = input_types.CollatedInput(
            default_language_model_id=default_llm.model_id,
            language_models=language_model_inputs,
            tool_instances=tool_instance_inputs,
            agents=agent_inputs,
            tasks=task_inputs,
            workflow=workflow_input,
        )
        return collated_input


def test_workflow(
    request: TestWorkflowRequest, cml: CMLServiceApi = None, dao: AgentStudioDao = None
) -> TestWorkflowResponse:
    """
    Test a workflow by creating agent instances, tasks, and a Crew AI execution.
    """
    print("TEST WORKFLOW ENTRY 1")
    try:
        collated_input = _create_collated_input(request, cml, dao)
        tool_user_params_kv = {
            tool_id: {k: v for k, v in user_param_kv.parameters.items()}
            for tool_id, user_param_kv in request.tool_user_parameters.items()
        }
        events_trace_id = str(uuid4())

        workflow_runners = get_workflow_runners()
        available_workflow_runners = list(filter(lambda x: not x["busy"], workflow_runners))
        if not available_workflow_runners:
            raise RuntimeError("No workflow runners currently available to test workflow!")

        # Use the first available runner
        workflow_runner = available_workflow_runners[0]

        resp = requests.post(
            url=f"{workflow_runner['endpoint']}/kickoff",
            json={
                "workflow_name": f"Test Workflow - {collated_input.workflow.name}",
                "collated_input": collated_input.model_dump(),
                "tool_user_params": tool_user_params_kv,
                "inputs": dict(request.inputs),
                "events_trace_id": events_trace_id,
            },
        )

        return TestWorkflowResponse(
            message="",  # Return empty message since execution is async
            trace_id=events_trace_id,
        )

    except ValueError as e:
        raise RuntimeError(f"Validation error: {e}")
    except SQLAlchemyError as e:
        raise RuntimeError(f"Database error while testing workflow: {e}")
    except Exception as e:
        raise RuntimeError(f"Unexpected error while testing workflow: {e}")


def _cleanup_deployments(cml, model_id):
    """
    Helper function to clean up deployments.
    """
    try:
        if model_id:
            cc_utils.stop_all_cml_model_deployments(cml, model_id)
            cc_utils.delete_cml_model(cml, model_id)
    except Exception as e:
        print(f"Failed to clean up deployments for model ID {model_id}: {str(e)}")


def cleanup_deployed_workflow_application(cml: CMLServiceApi, application: cmlapi.Application):
    """
    Helper function to clean up an application. Abstracted out in case
    we need to add more functionality in the future.
    """
    try:
        cml.delete_application(os.getenv("CDSW_PROJECT_ID"), application.id)
    except Exception as e:
        print(f"Failed to clean up workflow application with ID {application.id}: {str(e)}")


def get_application_name_for_deployed_workflow(deployed_workflow: db_model.DeployedWorkflowInstance) -> str:
    """
    Get the name of the workflow application given the name of the workflow. This
    seems like overkill but it's abstracted out in case we need to change it in the future.
    """
    return f"Workflow: {deployed_workflow.name}"


def get_application_for_deployed_workflow(
    deployed_workflow: db_model.DeployedWorkflowInstance, cml: CMLServiceApi
) -> cmlapi.Application:
    """
    Get the CML application tied to a specific workflow.
    """
    resp: cmlapi.ListApplicationsResponse = cml.list_applications(os.getenv("CDSW_PROJECT_ID"), page_size=5000)
    applications: list[cmlapi.Application] = resp.applications
    applications = list(
        filter(lambda x: x.name == get_application_name_for_deployed_workflow(deployed_workflow), applications)
    )
    assert len(applications) == 1
    application: cmlapi.Application = applications[0]
    return application


def create_application_for_deployed_workflow(
    deployed_workflow: db_model.DeployedWorkflowInstance, bypass_authentication: bool, cml: CMLServiceApi
) -> cmlapi.Application:
    """
    Deploy a dedicated CML application for this deployed workflow which can be used to test the workflow.
    The application can make calls to the CML model endpoint and can also track the lifecycle of a request.
    """

    # The workflow app runs in the same Node environment as our react app. Based on
    # a "render mode" environment variable, either the studio app will display, or the
    # workflow app will display. In this fashion, we can centralize dependencies and also
    # carry over the API middleware to access the gRPC service through HTTP.
    env_vars_for_app = {
        "AGENT_STUDIO_RENDER_MODE": "workflow",
        "AGENT_STUDIO_DEPLOYED_WORKFLOW_ID": deployed_workflow.id,
        "AGENT_STUDIO_DEPLOYED_MODEL_ID": deployed_workflow.cml_deployed_model_id,
    }

    # Right now, creating an application through CML APIv2 will manually copy over the project
    # environment variables into the application env vars, which is undesirable. Every time the observability server or the
    # gRPC server changes, we need to reach out to all deployed workflows and deployed applications
    # and update the respective environment variables. We shouldn't have to do this once we
    # fix the env var copying issue.
    application: cmlapi.Application = cml.create_application(
        cmlapi.CreateApplicationRequest(
            name=get_application_name_for_deployed_workflow(deployed_workflow),
            subdomain=f"workflow-{deployed_workflow.id}",
            description=f"Workflow UI for workflow {deployed_workflow.name}",
            script=os.path.join(cc_utils.get_studio_subdirectory(), "startup_scripts", "run-app.py"),
            cpu=2,
            memory=4,
            nvidia_gpu=0,
            environment=env_vars_for_app,
            bypass_authentication=bypass_authentication,
            runtime_identifier=cc_utils.get_deployed_workflow_runtime_identifier(cml),
        ),
        project_id=os.environ.get("CDSW_PROJECT_ID"),
    )

    return application


def get_deployed_workflow_config(deployable_workflow_dir: str) -> dict:
    if is_custom_model_root_dir_feature_enabled():
        return {
            "model_root_dir": os.path.join(get_studio_subdirectory(), deployable_workflow_dir),
            "model_file_path": "src/engine/entry/workbench.py",
            "deployed_workflow_model_config_location": "/home/cdsw/workflow/config.json",
        }
    else:
        return {
            "model_root_dir": None,
            "model_file_path": os.path.join(
                get_studio_subdirectory(), deployable_workflow_dir, "src/engine/entry/workbench.py"
            ),
            "deployed_workflow_model_config_location": os.path.join(
                "/home/cdsw", get_studio_subdirectory(), deployable_workflow_dir, "workflow", "config.json"
            ),
        }


def deploy_workflow(
    request: DeployWorkflowRequest, cml: CMLServiceApi, dao: AgentStudioDao = None
) -> DeployWorkflowResponse:
    """
    Deploy a workflow to the CML model and application.
    """
    cml_model_id, model_build_id = None, None
    workflow_frontend_application: Optional[cmlapi.Application] = None
    try:
        # Create a unique ID for this deployed workflow
        deployed_workflow_id = str(uuid4())

        with dao.get_session() as session:
            workflow = session.query(db_model.Workflow).filter(db_model.Workflow.id == request.workflow_id).first()
            if not workflow:
                raise ValueError(f"Workflow with ID '{request.workflow_id}' not found.")
            # if workflow.is_draft:
            #     raise ValueError(
            #         f"Workflow '{workflow.name}' can't be deployed in draft state. Publish your workflow first."
            #     )
            workflow_id = workflow.id
            workflow_directory = workflow.directory
        collated_input = _create_collated_input(request, cml, dao)

        # k8s service labels are limited to 63 characters in length. the service that serves this
        # model will be labeled with "ds-runtime-workflow-model-<workflow_name>-HHHHHHHH-XXX-XXX". 26 characters are used for "ds-runtime-"
        # and 17 characters are used for "-HHHHHHHH-XXX-XXX", which leaves 63 - 26 - 17 = 20 characters for the name
        # of the workflow, including spaces and special characters. For longer workflow names, this information will get cut off,
        # but the model description (and workflow Application) will still contain the entire name string.
        #
        # components of the name:
        #   "ds-runtime": CDSW-specific, we don't have a say
        #   "workflow_model_": identifier that represents a workflow
        #   "_HHHHHHHH": 8-character hex idintifier that we add to each workflow instance
        #   "-XXX-XXX": CDSW-specfic, we don't have control over this
        #
        # ALSO, there's a fluent bit config volume mount that is in the form of:
        #  "workflow-model-<name>-<8hex>-XXX-XXXX-fluent-bit-config"
        #  which even FURTHER limits our name to 14 characters (!)
        cml_model_name_internal = collated_input.workflow.name[-13:] + "_" + collated_input.workflow.deployment_id
        cml_model_name = f"wf_model_{cml_model_name_internal}"

        deployed_workflow_instance_name = f"{collated_input.workflow.name}_{collated_input.workflow.deployment_id}"

        # Create the deployed workflow directory
        deployable_workflow_dir = os.path.join(consts.DEPLOYABLE_WORKFLOWS_LOCATION, deployed_workflow_id)
        if not os.path.exists(deployable_workflow_dir):
            os.makedirs(deployable_workflow_dir)

        env_variable_overrides = dict(request.env_variable_overrides) if request.env_variable_overrides else dict()
        env_vars_for_cml_model = dict()
        for tool_id, parameters in request.tool_user_parameters.items():
            env_vars_for_cml_model.update(
                {f"TOOL_{tool_id.replace('-', '_')}_USER_PARAMS_{k}": v for k, v in parameters.parameters.items()}
            )
        for lm in collated_input.language_models:
            env_var_key_name = f"MODEL_{lm.model_id.replace('-', '_')}_CONFIG"
            env_vars_for_cml_model.update({env_var_key_name: json.dumps(lm.config.model_dump())})
            lm.config = None  # Remove the model config before serializing to JSON and saving it in a file.

        # Create a workflow config object for the deployed workflow and write it to our new deployed
        # workflow directory
        os.makedirs(os.path.join(deployable_workflow_dir, "workflow"), exist_ok=True)
        workflow_config_config_file_path = os.path.join(deployable_workflow_dir, "workflow", "config.json")
        with open(workflow_config_config_file_path, "w") as config_file:
            json.dump(collated_input.model_dump(), config_file, indent=2)

        # Copy over our workflow engine code into our deployed workflow directory
        # NOTE: this will go away once we move to a dedicated repo for workflow engines
        # NOTE: for workbenches without the model root dir feature enabled, we are technically installing
        # the workflow_engine package directly as part of the cdsw-build.sh script, so this copy may
        # not be necessary.
        def workflow_engine_ignore(src, names):
            return {".venv", ".ruff_cache", "__pycache__"}

        shutil.copytree(
            os.path.join("studio", "workflow_engine"),
            deployable_workflow_dir,
            dirs_exist_ok=True,
            ignore=workflow_engine_ignore,
        )

        # Copy over the workflow directory into the deployed workflow directory.
        # we keep the "studio-data/" upper-level directory for consistency.
        def studio_data_workflow_ignore(src, names):
            if os.path.basename(src) == "studio-data":
                return {"deployable_workflows", "tool_templates", "temp_files"}
            elif os.path.basename(src) == "workflows":
                return {name for name in names if name != os.path.basename(workflow_directory)}
            else:
                return {".venv", ".next", "node_modules", ".nvm", ".requirements_hash.txt"}

        shutil.copytree(
            "studio-data", os.path.join(deployable_workflow_dir, "studio-data"), ignore=studio_data_workflow_ignore
        )

        # Get some deployed workflow configuration parameters based on the version
        # of workbench running, deployment pattern, and entitlements that are currently enabled
        deployed_workflow_config = get_deployed_workflow_config(deployable_workflow_dir)
        print(json.dumps(deployed_workflow_config, indent=2))

        env_vars_for_cml_model.update(
            {
                "AGENT_STUDIO_OPS_ENDPOINT": get_ops_endpoint(),
                "AGENT_STUDIO_WORKFLOW_ARTIFACT_TYPE": "config_file",
                "AGENT_STUDIO_WORKFLOW_ARTIFACT": deployed_workflow_config["deployed_workflow_model_config_location"],
                "AGENT_STUDIO_WORKFLOW_NAME": deployed_workflow_instance_name,
                "CDSW_APIV2_KEY": os.getenv("CDSW_APIV2_KEY"),
            }
        )
        env_vars_for_cml_model.update(env_variable_overrides)

        cml_model_id, model_build_id = cc_utils.deploy_cml_model(
            cml=cml,
            model_name=cml_model_name,
            model_description=f"Model for workflow {deployed_workflow_instance_name}",
            model_build_comment=f"Build for workflow {deployed_workflow_instance_name}",
            model_root_dir=deployed_workflow_config["model_root_dir"],
            model_file_path=deployed_workflow_config["model_file_path"],
            function_name="api_wrapper",
            runtime_identifier=cc_utils.get_deployed_workflow_runtime_identifier(cml),
            deployment_config=cmlapi.ShortCreateModelDeployment(
                cpu=1,
                memory=2,
                nvidia_gpus=0,
                environment=env_vars_for_cml_model,
                replicas=1,
            ),
        )

        # Save deployed workflow details to the database
        deployed_workflow_instance = db_model.DeployedWorkflowInstance(
            id=deployed_workflow_id,
            name=deployed_workflow_instance_name,
            workflow_id=workflow_id,
            cml_deployed_model_id=cml_model_id,
            is_stale=False,
        )
        workflow_frontend_application = create_application_for_deployed_workflow(
            deployed_workflow_instance, request.bypass_authentication, cml
        )

        session.add(deployed_workflow_instance)
        session.commit()

        return DeployWorkflowResponse(
            deployed_workflow_name=deployed_workflow_instance_name,
            deployed_workflow_id=deployed_workflow_id,
            cml_deployed_model_id=cml_model_id,
        )
    except SQLAlchemyError as e:
        if cml_model_id:
            _cleanup_deployments(cml, cml_model_id)
        if workflow_frontend_application:
            cleanup_deployed_workflow_application(cml, workflow_frontend_application)
        raise RuntimeError(f"Database error occured while deploying workflow: {str(e)}")
    except ValueError as e:
        raise RuntimeError(f"Validation error: {str(e)}")
    except Exception as e:
        if cml_model_id:
            _cleanup_deployments(cml, cml_model_id)
        if workflow_frontend_application:
            cleanup_deployed_workflow_application(cml, workflow_frontend_application)
        raise RuntimeError(f"Unexpected error occurred while deploying workflow: {str(e)}")


def undeploy_workflow(
    request: UndeployWorkflowRequest, cml: CMLServiceApi, dao: AgentStudioDao = None
) -> UndeployWorkflowResponse:
    """
    Undeploy a workflow from the CML model and studio application.
    """
    try:
        if not request.deployed_workflow_id:
            raise ValueError("Deployed Workflow ID is required.")
        with dao.get_session() as session:
            deployed_workflow_instance = (
                session.query(db_model.DeployedWorkflowInstance)
                .filter_by(id=request.deployed_workflow_id)
                .one_or_none()
            )
            if not deployed_workflow_instance:
                raise ValueError(f"Deployed Workflow with ID '{request.deployed_workflow_id}' not found.")
            deployed_workflow_instance_name = deployed_workflow_instance.name
            cml_model_id = deployed_workflow_instance.cml_deployed_model_id
            cc_utils.stop_all_cml_model_deployments(cml, cml_model_id)
            cc_utils.delete_cml_model(cml, cml_model_id)

            # There may be cases where the deployed workflow application has already been
            # tampered with. We don't want to fail undeploying the workflow at this point,
            # even if the application went missing.
            try:
                application: Optional[cmlapi.Application] = get_application_for_deployed_workflow(
                    deployed_workflow_instance, cml
                )
                if application:  # Only try to cleanup if application exists
                    cleanup_deployed_workflow_application(cml, application)
            except Exception as e:
                print(f"Could not delete deployed workflow application: {e}")

            session.delete(deployed_workflow_instance)
            session.commit()
            deployable_workflow_dir = os.path.join(consts.DEPLOYABLE_WORKFLOWS_LOCATION, deployed_workflow_instance.id)
            if os.path.exists(deployable_workflow_dir):
                shutil.rmtree(deployable_workflow_dir)
        return UndeployWorkflowResponse()
    except SQLAlchemyError as e:
        raise RuntimeError(f"Database error occured while undeploying workflow: {str(e)}")
    except ValueError as e:
        raise RuntimeError(f"Validation error: {str(e)}")
    except Exception as e:
        raise RuntimeError(f"Unexpected error occurred while undeploying workflow: {str(e)}")


def list_deployed_workflows(
    request: ListDeployedWorkflowsRequest, cml: CMLServiceApi, dao: AgentStudioDao = None
) -> ListDeployedWorkflowsResponse:
    try:
        # Get all models first for deep links
        project_num, project_id = cc_utils.get_cml_project_number_and_id()
        cdsw_ds_api_url = os.environ.get("CDSW_DS_API_URL").replace("/ds", "")
        cdsw_api_key = os.environ.get("CDSW_API_KEY")

        # Get list of all models
        list_url = f"{cdsw_ds_api_url}/models/list-models"
        headers = {"Content-Type": "application/json"}
        list_resp = requests.post(
            list_url,
            headers=headers,
            json={"latestModelBuild": True, "projectId": int(project_num), "latestModelDeployment": True},
            auth=(cdsw_api_key, ""),
        )
        if list_resp.status_code != 200:
            raise RuntimeError(f"Failed to list models: {list_resp.text}")

        model_list = list_resp.json()
        model_urls = {m["crn"].split("/")[-1]: m["htmlUrl"] for m in model_list if "crn" in m and "htmlUrl" in m}

        # Get list of all applications using CDSW_PROJECT_URL
        project_url = os.getenv("CDSW_PROJECT_URL")
        if not project_url:
            raise RuntimeError("CDSW_PROJECT_URL environment variable not found")

        apps_url = f"{project_url}/applications"
        apps_resp = requests.get(
            apps_url,
            headers=headers,
            auth=(cdsw_api_key, ""),
        )
        if apps_resp.status_code != 200:
            raise RuntimeError(f"Failed to list applications: {apps_resp.text}")

        applications = apps_resp.json()

        with dao.get_session() as session:
            deployed_workflows: List[db_model.DeployedWorkflowInstance] = session.query(
                db_model.DeployedWorkflowInstance
            ).all()
            deployed_workflow_instances = []

            for deployed_workflow in deployed_workflows:
                workflow: db_model.Workflow = deployed_workflow.workflow

                # Initialize variables with default values
                application_url = ""
                application_status = "stopped"
                application_deep_link = ""

                # First check CML model status
                model_status = "stopped"
                try:
                    # Fetch model builds
                    model_builds = cml.list_model_builds(
                        project_id=os.getenv("CDSW_PROJECT_ID"), model_id=deployed_workflow.cml_deployed_model_id
                    ).model_builds

                    for build in model_builds:
                        # Fetch model deployments for each build
                        model_deployments = cml.list_model_deployments(
                            project_id=os.getenv("CDSW_PROJECT_ID"),
                            model_id=deployed_workflow.cml_deployed_model_id,
                            build_id=build.id,
                        ).model_deployments

                        # Check each deployment's status
                        for deployment in model_deployments:
                            deployment_status = deployment.status.lower()
                            if deployment_status not in ["stopped", "failed"]:
                                model_status = deployment_status
                                break
                        if model_status != "stopped":
                            break

                except Exception as e:
                    print(f"Failed to get model status for workflow {deployed_workflow.id}: {str(e)}")
                    model_status = "error"

                # Only check application status if model is running
                if model_status == "deployed":
                    try:
                        workflow_app_name = get_application_name_for_deployed_workflow(deployed_workflow)
                        matching_app = next((app for app in applications if app["name"] == workflow_app_name), None)

                        if matching_app:
                            application_url = matching_app.get("url", "")
                            application_status = matching_app.get("status", "stopped")
                    except Exception as e:
                        print(f"Failed to get application details for workflow {deployed_workflow.id}: {str(e)}")
                        application_status = "error"
                else:
                    application_status = model_status

                # Get deep links separately - regardless of status
                # Initialize deep links with empty strings
                application_deep_link = ""
                model_deep_link = ""

                try:
                    # Get application deep link
                    workflow_app_name = get_application_name_for_deployed_workflow(deployed_workflow)
                    matching_app = next((app for app in applications if app["name"] == workflow_app_name), None)
                    if matching_app and "projectHtmlUrl" in matching_app and "id" in matching_app:
                        application_deep_link = f"{matching_app['projectHtmlUrl']}/applications/{matching_app['id']}"
                except Exception as e:
                    print(f"Failed to get application deep link for workflow {deployed_workflow.id}: {str(e)}")
                    application_deep_link = ""

                try:
                    # Get model deep link
                    model_deep_link = model_urls.get(deployed_workflow.cml_deployed_model_id, "")
                except Exception as e:
                    print(f"Failed to get model deep link for workflow {deployed_workflow.id}: {str(e)}")
                    model_deep_link = ""

                try:
                    deployed_workflow_instances.append(
                        DeployedWorkflow(
                            deployed_workflow_id=deployed_workflow.id,
                            workflow_id=workflow.id,
                            deployed_workflow_name=deployed_workflow.name,
                            workflow_name=workflow.name,
                            cml_deployed_model_id=deployed_workflow.cml_deployed_model_id,
                            is_stale=deployed_workflow.is_stale,
                            application_url=application_url,
                            application_status=application_status,
                            application_deep_link=application_deep_link,
                            model_deep_link=model_deep_link,
                        )
                    )
                except Exception as e:
                    print(f"Error creating DeployedWorkflow object for workflow {deployed_workflow.id}: {str(e)}")
                    continue

            return ListDeployedWorkflowsResponse(deployed_workflows=deployed_workflow_instances)
    except SQLAlchemyError as e:
        raise RuntimeError(f"Database error occurred while listing deployed workflows: {str(e)}")
    except Exception as e:
        raise RuntimeError(f"Unexpected error occurred while listing deployed workflows: {str(e)}")
