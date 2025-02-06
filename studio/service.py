from studio.workflow.workflow_templates import (
    list_workflow_templates,
    get_workflow_template,
    add_workflow_template,
    remove_workflow_template,
)
from studio.task.task_templates import list_task_templates, get_task_template, add_task_template, remove_task_template
from studio.agents.agent_templates import (
    list_agent_templates,
    get_agent_template,
    add_agent_template,
    remove_agent_template,
    update_agent_template,
)
from studio.workflow.test_and_deploy_workflow import (
    test_workflow,
    deploy_workflow,
    undeploy_workflow,
    list_deployed_workflows,
)
from studio.workflow.workflow import (
    list_workflows,
    add_workflow,
    get_workflow,
    update_workflow,
    remove_workflow,
)
from studio.task.task import list_tasks, add_task, get_task, update_task, remove_task
from studio.cross_cutting.methods import (
    temporary_file_upload,
    non_streaming_temporary_file_upload,
    download_temporary_file,
    get_asset_data,
    get_parent_project_details,
)
from studio.cross_cutting.global_thread_pool import initialize_thread_pool, cleanup_thread_pool
from studio.agents.test_agents import (
    agent_test,
)
from studio.agents.agent import list_agents, get_agent, add_agent, update_agent, remove_agent
from studio.tools.tool_instance import (
    list_tool_instances,
    get_tool_instance,
    create_tool_instance,
    remove_tool_instance,
    update_tool_instance,
)
from studio.tools.tool_template import (
    list_tool_templates,
    get_tool_template,
    add_tool_template,
    update_tool_template,
    remove_tool_template,
)
from studio.models.litellm_proxy_utils import stop_litellm_server
from studio.models.models import (
    list_models,
    get_model,
    add_model,
    remove_model,
    update_model,
    refresh_litellm_models,
    model_test,
    get_studio_default_model,
    set_studio_default_model,
)
from studio.cross_cutting.upgrades import check_studio_upgrade_status, upgrade_studio, restart_studio_application

import os
import sys
import cmlapi
import atexit

from studio.proto.agent_studio_pb2_grpc import AgentStudioServicer

from studio.db.dao import AgentStudioDao

# Manual patch required for CrewAI compatability
__import__("pysqlite3")
sys.modules["sqlite3"] = sys.modules.pop("pysqlite3")


class AgentStudioApp(AgentStudioServicer):
    """
    Top-Level gRPC Servicer for the Agent Studio app. This acts
    as an API surface to all gRPC interactions to the service. These
    methods primarily act as routers to application logic methods stored
    in other packages. When adding new API interactions, a new router
    is needed here that implements the gRPC Servicer base class. For development
    and testing simplicity, please try and keep application logic outside of
    this function, and assume that the state object passed to the method is
    non-mutable (in other words, application logic is responsible for writing
    state updates with write_state(...)).
    """

    def __init__(self):
        """
        Initialize the grpc server, and attach global connections
        (which include a CML client and a database DAO).
        """
        try:
            self.cml = cmlapi.default_client()
            self.dao = AgentStudioDao(
                engine_args={
                    "pool_size": 5,
                    "max_overflow": 10,
                    "pool_timeout": 30,
                    "pool_recycle": 1800,
                }
            )

            initialize_thread_pool()
            # load up LiteLLM server
            refresh_litellm_models(self.dao)

            atexit.register(stop_litellm_server)

            # Load in environment variables
            self.project_id = os.getenv("CDSW_PROJECT_ID")
            self.engine_id = os.getenv("CDSW_ENGINE_ID")
            self.master_id = os.getenv("CDSW_MASTER_ID")
            self.master_ip = os.getenv("CDSW_MASTER_IP")
            self.domain = os.getenv("CDSW_DOMAIN")
        except:
            print("Received exception, stopping LiteLLM proxy server.")
            stop_litellm_server()
            cleanup_thread_pool()

    # Model-related gRPC methods
    def ListModels(self, request, context):
        """
        List all models.
        """
        return list_models(request, self.cml, dao=self.dao)

    def GetModel(self, request, context):
        """
        Get details of a specific model.
        """
        return get_model(request, self.cml, dao=self.dao)

    def AddModel(self, request, context):
        """
        Add a new model.
        """
        return add_model(request, self.cml, dao=self.dao)

    def RemoveModel(self, request, context):
        """
        Remove an existing model.
        """
        return remove_model(request, self.cml, dao=self.dao)

    def UpdateModel(self, request, context):
        """
        Update a model's configuration.
        """
        return update_model(request, self.cml, dao=self.dao)

    def TestModel(self, request, context):
        """
        Test the LLM Model.
        """
        return model_test(request, self.cml, dao=self.dao)

    def GetStudioDefaultModel(self, request, context):
        """
        Get the default model for the studio.
        """
        return get_studio_default_model(request, self.cml, dao=self.dao)

    def SetStudioDefaultModel(self, request, context):
        """
        Set the default model for the studio.
        """
        return set_studio_default_model(request, self.cml, dao=self.dao)

    # Tool Template-related gRPC methods
    def ListToolTemplates(self, request, context):
        """
        List all tool templates.
        """
        return list_tool_templates(request, self.cml, dao=self.dao)

    def GetToolTemplate(self, request, context):
        """
        Get details of a specific tool template.
        """
        return get_tool_template(request, self.cml, dao=self.dao)

    def AddToolTemplate(self, request, context):
        """
        Add a new tool template.
        """
        return add_tool_template(request, self.cml, dao=self.dao)

    def UpdateToolTemplate(self, request, context):
        """
        Update an exisiting tool template.
        """
        return update_tool_template(request, self.cml, dao=self.dao)

    def RemoveToolTemplate(self, request, context):
        """
        Remove an existing tool template.
        """
        return remove_tool_template(request, self.cml, dao=self.dao)

    # Tool Instance-related gRPC methods
    def ListToolInstances(self, request, context):
        """
        List all tool instances.
        """
        return list_tool_instances(request, self.cml, dao=self.dao)

    def GetToolInstance(self, request, context):
        """
        Get a tool instance by id
        """
        return get_tool_instance(request, self.cml, dao=self.dao)

    def CreateToolInstance(self, request, context):
        """
        Create a tool instance
        """
        return create_tool_instance(request, self.cml, dao=self.dao)

    def RemoveToolInstance(self, request, context):
        """
        Remove a tool instance by id
        """
        return remove_tool_instance(request, self.cml, dao=self.dao)

    def UpdateToolInstance(self, request, context):
        """
        Update a tool instance by id
        """
        return update_tool_instance(request, self.cml, dao=self.dao)

    def ListAgents(self, request, context):
        """
        List all agents with metadata.
        """
        return list_agents(request, self.cml, dao=self.dao)

    def GetAgent(self, request, context):
        """
        Get details of a specific agent by its ID.
        """
        return get_agent(request, self.cml, dao=self.dao)

    def AddAgent(self, request, context):
        """
        Add a new agent based on the request parameters.
        """
        return add_agent(request, self.cml, dao=self.dao)

    def UpdateAgent(self, request, context):
        """
        Update the configuration of an existing agent.
        """
        return update_agent(request, self.cml, dao=self.dao)

    def RemoveAgent(self, request, context):
        """
        Remove an existing agent by its ID.
        """
        return remove_agent(request, self.cml, dao=self.dao)

    def TestAgent(self, request, context):
        """
        Test an existing agent by its ID.
        """
        return agent_test(request, self.cml, dao=self.dao)

    def TemporaryFileUpload(self, request_iterator, context):
        """
        Upload a temporary file to the server.
        """
        return temporary_file_upload(request_iterator, dao=self.dao)

    def NonStreamingTemporaryFileUpload(self, request, context):
        """
        Upload a temporary file to the server.
        """
        return non_streaming_temporary_file_upload(request, self.cml, dao=self.dao)

    def DownloadTemporaryFile(self, request, context):
        """
        Download a temporary file from the server.
        """
        return download_temporary_file(request, self.cml, dao=self.dao)

    def GetAssetData(self, request, context):
        """
        Get asset data for Asset URIs.
        """
        return get_asset_data(request, self.cml, dao=self.dao)

    def GetParentProjectDetails(self, request, context):
        """
        Get the project details where the studio is deployed.
        """
        return get_parent_project_details(request, self.cml, dao=self.dao)

    def CheckStudioUpgradeStatus(self, request, context):
        """
        Check the current update status of the studio.
        """
        return check_studio_upgrade_status(request, self.cml, dao=self.dao)

    def UpgradeStudio(self, request, context):
        """
        Run upgrade functionality on Studio.
        """
        return upgrade_studio(request, self.cml, dao=self.dao)

    def RestartStudioApplication(self, request, context):
        """
        Restart Agent Studio application.
        """
        return restart_studio_application(request, self.cml, dao=self.dao)

    def ListTasks(self, request, context):
        """
        List all tasks.
        """
        return list_tasks(request, self.cml, dao=self.dao)

    def AddTask(self, request, context):
        """
        Add a new task.
        """
        return add_task(request, self.cml, dao=self.dao)

    def GetTask(self, request, context):
        """
        Retrieve details of a specific task by its ID.
        """
        return get_task(request, self.cml, dao=self.dao)

    def UpdateTask(self, request, context):
        """
        Update an existing task by its ID.
        """
        return update_task(request, self.cml, dao=self.dao)

    def RemoveTask(self, request, context):
        """
        Remove an existing task by its ID.
        """
        return remove_task(request, self.cml, dao=self.dao)

    def ListWorkflows(self, request, context):
        """
        List all workflows.
        """
        return list_workflows(request, self.cml, dao=self.dao)

    def AddWorkflow(self, request, context):
        """
        Add a new workflow.
        """
        return add_workflow(request, self.cml, dao=self.dao)

    def GetWorkflow(self, request, context):
        """
        Retrieve details of a specific workflow by its ID.
        """
        return get_workflow(request, self.cml, dao=self.dao)

    def UpdateWorkflow(self, request, context):
        """
        Update an existing workflow by its ID.
        """
        return update_workflow(request, self.cml, dao=self.dao)

    def RemoveWorkflow(self, request, context):
        """
        Remove an existing workflow by its ID.
        """
        return remove_workflow(request, self.cml, dao=self.dao)

    def TestWorkflow(self, request, context):
        """
        Test an existing workflow by its ID.
        """
        return test_workflow(request, self.cml, dao=self.dao)

    def DeployWorkflow(self, request, context):
        """
        Deploy an existing workflow by its ID.
        """
        return deploy_workflow(request, self.cml, dao=self.dao)

    def UndeployWorkflow(self, request, context):
        """
        Undeploy an existing workflow by its ID.
        """
        return undeploy_workflow(request, self.cml, dao=self.dao)

    def ListDeployedWorkflows(self, request, context):
        """
        List all deployed workflows.
        """
        return list_deployed_workflows(request, self.cml, dao=self.dao)

    def ListAgentTemplates(self, request, context):
        return list_agent_templates(request, self.cml, dao=self.dao)

    def GetAgentTemplate(self, request, context):
        return get_agent_template(request, self.cml, dao=self.dao)

    def AddAgentTemplate(self, request, context):
        return add_agent_template(request, self.cml, dao=self.dao)

    def UpdateAgentTemplate(self, request, context):
        return update_agent_template(request, self.cml, dao=self.dao)

    def RemoveAgentTemplate(self, request, context):
        return remove_agent_template(request, self.cml, dao=self.dao)

    def ListTaskTemplates(self, request, context):
        return list_task_templates(request, self.cml, dao=self.dao)

    def GetTaskTemplate(self, request, context):
        return get_task_template(request, self.cml, dao=self.dao)

    def AddTaskTemplate(self, request, context):
        return add_task_template(request, self.cml, dao=self.dao)

    def RemoveTaskTemplate(self, request, context):
        return remove_task_template(request, self.cml, dao=self.dao)

    def ListWorkflowTemplates(self, request, context):
        return list_workflow_templates(request, self.cml, dao=self.dao)

    def GetWorkflowTemplate(self, request, context):
        return get_workflow_template(request, self.cml, dao=self.dao)

    def AddWorkflowTemplate(self, request, context):
        return add_workflow_template(request, self.cml, dao=self.dao)

    def RemoveWorkflowTemplate(self, request, context):
        return remove_workflow_template(request, self.cml, dao=self.dao)
