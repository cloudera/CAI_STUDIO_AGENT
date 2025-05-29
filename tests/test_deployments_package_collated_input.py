import pytest
from unittest.mock import patch, MagicMock
import os
import json 

__import__('pysqlite3')
import sys
sys.modules['sqlite3'] = sys.modules.pop('pysqlite3')


import studio.consts as consts
from studio.db.model import (
    Workflow
)
from studio.db import model as db_model
from sqlalchemy.orm.session import Session
import engine.types as input_types



from studio.deployments.package.collated_input import (
    create_collated_input,
    create_input_workflow,
    get_default_llm,
    get_tasks_for_workflow,
    get_agents_for_workflow,
    get_language_models,
    get_mcp_instances_for_agents,
    get_tool_instances_for_agents
)

@patch("studio.deployments.package.collated_input.create_input_workflow")
@patch("studio.deployments.package.collated_input.get_language_models")
@patch("studio.deployments.package.collated_input.get_mcp_instances_for_agents")
@patch("studio.deployments.package.collated_input.get_tool_instances_for_agents")
@patch("studio.deployments.package.collated_input.get_agents_for_workflow")
@patch("studio.deployments.package.collated_input.get_tasks_for_workflow")
@patch("studio.deployments.package.collated_input.get_default_llm")
def test_create_collated_input_success(
    mock_get_default_llm,
    mock_get_tasks,
    mock_get_agents,
    mock_get_tools,
    mock_get_mcps,
    mock_get_language_models,
    mock_create_workflow,
):
    mock_session = MagicMock()
    mock_workflow = Workflow(id="wf-1", name="Test Workflow")

    mock_llm = MagicMock()
    mock_llm.model_id = "default-llm"
    mock_get_default_llm.return_value = mock_llm

    # Use real pydantic objects
    mock_task_inputs = [input_types.Input__Task(id="t1")]
    mock_agent_ids = {"agent-1"}
    mock_get_tasks.return_value = (mock_task_inputs, mock_agent_ids)

    mock_agent_inputs = [input_types.Input__Agent(
        id="agent-1",
        name="Agent",
        crew_ai_role="Role",
        crew_ai_backstory="Backstory",
        crew_ai_goal="Goal",
        tool_instance_ids=[],
        mcp_instance_ids=[],
    )]
    mock_tool_ids = {"tool-1"}
    mock_mcp_ids = {"mcp-1"}
    mock_language_model_ids = {"llm-1", "default-llm"}
    mock_get_agents.return_value = (mock_agent_inputs, mock_tool_ids, mock_mcp_ids, mock_language_model_ids)

    mock_tool_inputs = [input_types.Input__ToolInstance(
        id="tool-1",
        name="Tool",
        python_code_file_name="code.py",
        python_requirements_file_name="req.txt",
        source_folder_path="src",
        tool_metadata="{}"
    )]
    mock_get_tools.return_value = mock_tool_inputs

    mock_mcp_inputs = [input_types.Input__MCPInstance(
        id="mcp-1",
        name="MCP",
        type="type",
        args=[],
        env_names=[]
    )]
    mock_get_mcps.return_value = mock_mcp_inputs

    mock_language_inputs = [input_types.Input__LanguageModel(
        model_id="llm-1",
        model_name="LLM",
        generation_config={}
    )]
    mock_get_language_models.return_value = mock_language_inputs

    mock_workflow_input = input_types.Input__Workflow(
        id="wf-1",
        name="Test Workflow",
        crew_ai_process="sequential",
        is_conversational=True,
    )
    mock_create_workflow.return_value = mock_workflow_input

    result = create_collated_input(mock_workflow, mock_session)

    assert isinstance(result, input_types.CollatedInput)
    assert result.default_language_model_id == "default-llm"
    assert result.language_models == mock_language_inputs
    assert result.tool_instances == mock_tool_inputs
    assert result.mcp_instances == mock_mcp_inputs
    assert result.agents == mock_agent_inputs
    assert result.tasks == mock_task_inputs
    assert result.workflow == mock_workflow_input
    
    
def make_workflow(
    id="w1",
    name="Test Workflow",
    description="desc",
    crew_ai_process="sequential",
    crew_ai_agents=["a1", "a2"],
    crew_ai_tasks=["t1", "t2"],
    crew_ai_manager_agent=None,
    crew_ai_llm_provider_model_id="llm-123",
    is_conversational=False,
):
    return Workflow(
        id=id,
        name=name,
        description=description,
        crew_ai_process=crew_ai_process,
        crew_ai_agents=crew_ai_agents,
        crew_ai_tasks=crew_ai_tasks,
        crew_ai_manager_agent=crew_ai_manager_agent,
        crew_ai_llm_provider_model_id=crew_ai_llm_provider_model_id,
        is_conversational=is_conversational,
    )


def test_create_input_workflow_regular_case():
    session = MagicMock()
    workflow = make_workflow()

    result = create_input_workflow(workflow, session)

    assert isinstance(result, input_types.Input__Workflow)
    assert result.id == "w1"
    assert result.llm_provider_model_id == "llm-123"
    assert result.agent_ids == ["a1", "a2"]
    assert result.task_ids == ["t1", "t2"]
    assert result.manager_agent_id is None


@patch("studio.deployments.package.collated_input.get_studio_default_model_id")
def test_create_input_workflow_hierarchical_without_manager_agent(mock_get_default_model_id):
    session = MagicMock()
    workflow = make_workflow(
        crew_ai_process="hierarchical",
        crew_ai_manager_agent=None,
        crew_ai_llm_provider_model_id=None,
    )
    mock_get_default_model_id.return_value = ("provider-x", "fallback-llm")

    result = create_input_workflow(workflow, session)

    assert result.llm_provider_model_id == "fallback-llm"
    mock_get_default_model_id.assert_called_once_with(dao=None, preexisting_db_session=session)


def test_create_input_workflow_empty_fields():
    session = MagicMock()
    workflow = make_workflow(
        crew_ai_agents=None,
        crew_ai_tasks=None,
    )

    result = create_input_workflow(workflow, session)

    assert result.agent_ids == []
    assert result.task_ids == []
    
    
def test_get_language_models_success():
    session = MagicMock(spec=Session)

    # Mocked models in DB
    mock_models = [
        db_model.Model(model_id="llm-1", model_name="GPT"),
        db_model.Model(model_id="llm-2", model_name="Claude"),
    ]
    session.query().filter().all.return_value = mock_models

    model_ids = {"llm-1", "llm-2"}
    results = get_language_models(model_ids, session)

    # Ensure structure
    assert isinstance(results, list)
    assert all(isinstance(i, input_types.Input__LanguageModel) for i in results)
    model_ids_returned = {i.model_id for i in results}
    assert model_ids_returned == model_ids

    for model in results:
        assert model.generation_config == consts.DEFAULT_GENERATION_CONFIG


def test_get_language_models_missing_model_raises():
    session = MagicMock(spec=Session)

    # Only one model found, other is missing
    session.query().filter().all.return_value = [
        db_model.Model(model_id="llm-1", model_name="GPT")
    ]

    with pytest.raises(ValueError, match="Language Model with ID 'llm-2' not found."):
        get_language_models({"llm-1", "llm-2"}, session)
        

def test_get_mcp_instances_success():
    session = MagicMock(spec=Session)

    # Mocked MCPs in DB
    mock_mcps = [
        db_model.MCPInstance(
            id="mcp-1", name="A", type="X", args=["--foo"], env_names=["ENV"], activated_tools=["tool-1"]
        ),
        db_model.MCPInstance(
            id="mcp-2", name="B", type="Y", args=[], env_names=[], activated_tools=[]
        )
    ]
    session.query().filter().all.return_value = mock_mcps

    mcp_ids = {"mcp-1", "mcp-2"}
    results = get_mcp_instances_for_agents(mcp_ids, session)

    assert isinstance(results, list)
    assert all(isinstance(i, input_types.Input__MCPInstance) for i in results)

    ids = {i.id for i in results}
    assert ids == mcp_ids
    for i in results:
        assert i.mcp_image_uri == ""


def test_get_mcp_instances_missing_id_raises():
    session = MagicMock(spec=Session)

    session.query().filter().all.return_value = [
        db_model.MCPInstance(id="mcp-1", name="A", type="X")
    ]

    with pytest.raises(ValueError, match="MCP Instance with ID 'mcp-2' not found."):
        get_mcp_instances_for_agents({"mcp-1", "mcp-2"}, session)


def test_get_mcp_instances_handles_none_fields():
    session = MagicMock(spec=Session)

    mock_mcp = db_model.MCPInstance(
        id="mcp-3",
        name="NullMCP",
        type="TypeZ",
        args=None,
        env_names=None,
        activated_tools=None,
    )
    session.query().filter().all.return_value = [mock_mcp]

    results = get_mcp_instances_for_agents({"mcp-3"}, session)

    mcp_input = results[0]
    assert mcp_input.args == []
    assert mcp_input.env_names == []
    assert mcp_input.tools == []
    assert mcp_input.id == "mcp-3"
    
    
    
@patch("studio.deployments.package.collated_input.extract_user_params_from_code")
@patch("studio.deployments.package.collated_input.read_tool_instance_code")
def test_get_tool_instances_success(mock_read_code, mock_extract_params):
    session = MagicMock(spec=Session)

    mock_tool = db_model.ToolInstance(
        id="tool-1",
        name="TestTool",
        python_code_file_name="tool.py",
        python_requirements_file_name="requirements.txt",
        source_folder_path="/tools/testtool",
        tool_image_path="some/image:latest",
        is_venv_tool=True,
    )
    session.query().filter().all.return_value = [mock_tool]

    mock_read_code.return_value = ("def tool_fn(): pass", "")
    mock_extract_params.return_value = {"param1": {"type": "string"}}

    results = get_tool_instances_for_agents({"tool-1"}, session)

    assert len(results) == 1
    tool_input = results[0]
    assert isinstance(tool_input, input_types.Input__ToolInstance)
    metadata = json.loads(tool_input.tool_metadata)
    assert metadata["user_params"] == ["param1"]
    assert "status" in metadata
    assert tool_input.tool_image_uri == "some/image:latest"


@patch("studio.deployments.package.collated_input.extract_user_params_from_code")
@patch("studio.deployments.package.collated_input.read_tool_instance_code")
def test_get_tool_instances_metadata_extraction_failure(mock_read_code, mock_extract_params):
    session = MagicMock(spec=Session)

    mock_tool = db_model.ToolInstance(
        id="tool-2",
        name="FailTool",
        python_code_file_name="fail.py",
        python_requirements_file_name="",  # <- FIXED: empty string instead of None
        source_folder_path="/tools/fail",
        tool_image_path=None,
        is_venv_tool=False,
    )
    session.query().filter().all.return_value = [mock_tool]

    mock_read_code.side_effect = Exception("read error")
    mock_extract_params.return_value = {}

    results = get_tool_instances_for_agents({"tool-2"}, session)

    assert len(results) == 1
    tool_input = results[0]
    metadata = json.loads(tool_input.tool_metadata)
    assert metadata["user_params"] == []
    assert "Could not extract user param metadata from code" in metadata["status"]
    assert tool_input.tool_image_uri == ""



def test_get_tool_instances_missing_tool_raises():
    session = MagicMock(spec=Session)
    session.query().filter().all.return_value = []  # No tools in DB

    with pytest.raises(ValueError, match="Tool Instance with ID 'missing-tool' not found."):
        get_tool_instances_for_agents({"missing-tool"}, session)
        
        
def test_get_agents_for_workflow_success():
    session = MagicMock(spec=Session)

    workflow = db_model.Workflow(
        id="workflow-1",
        crew_ai_agents=["agent-1"],
        crew_ai_manager_agent="agent-2",
        crew_ai_llm_provider_model_id="model-1",
    )
    task_agent_ids = {"agent-3"}

    agent_1 = db_model.Agent(
        id="agent-1",
        name="Agent One",
        llm_provider_model_id="model-1",
        crew_ai_role="role1",
        crew_ai_backstory="backstory1",
        crew_ai_goal="goal1",
        crew_ai_allow_delegation=True,
        crew_ai_verbose=False,
        crew_ai_cache=True,
        crew_ai_max_iter=3,
        tool_ids=["tool-1"],
        mcp_instance_ids=["mcp-1"],
        agent_image_path="img1.png",
    )
    agent_2 = db_model.Agent(
        id="agent-2",
        name="Agent Two",
        llm_provider_model_id=None,
        crew_ai_role="role2",
        crew_ai_backstory="backstory2",
        crew_ai_goal="goal2",
        crew_ai_allow_delegation=False,
        crew_ai_verbose=True,
        crew_ai_cache=False,
        crew_ai_max_iter=5,
        tool_ids=[],
        mcp_instance_ids=[],
        agent_image_path=None,
    )
    agent_3 = db_model.Agent(
        id="agent-3",
        name="Agent Three",
        llm_provider_model_id="model-2",
        crew_ai_role="role3",
        crew_ai_backstory="backstory3",
        crew_ai_goal="goal3",
        crew_ai_allow_delegation=True,
        crew_ai_verbose=True,
        crew_ai_cache=True,
        crew_ai_max_iter=7,
        tool_ids=["tool-2"],
        mcp_instance_ids=["mcp-2"],
        agent_image_path="img3.png",
    )

    session.query().filter().all.return_value = [agent_1, agent_2, agent_3]

    inputs, tool_ids, mcp_ids, model_ids = get_agents_for_workflow(workflow, task_agent_ids, session)

    assert len(inputs) == 3
    assert tool_ids == {"tool-1", "tool-2"}
    assert mcp_ids == {"mcp-1", "mcp-2"}
    assert model_ids == {"model-1", "model-2"}


def test_get_agents_for_workflow_missing_agent():
    session = MagicMock(spec=Session)

    workflow = db_model.Workflow(
        id="workflow-1",
        crew_ai_agents=["agent-1"]
    )

    session.query().filter().all.return_value = []

    try:
        get_agents_for_workflow(workflow, set(), session)
        assert False, "Expected ValueError"
    except ValueError as e:
        assert "Agent with ID 'agent-1' not found." in str(e)
        
        
def test_get_default_llm_success():
    session = MagicMock(spec=Session)
    model = db_model.Model(model_id="model-1", is_studio_default=True)
    session.query().filter_by().one_or_none.return_value = model

    result = get_default_llm(session)

    assert result == model


def test_get_default_llm_not_found():
    session = MagicMock(spec=Session)
    session.query().filter_by().one_or_none.return_value = None

    with pytest.raises(ValueError, match="Default model not found."):
        get_default_llm(session)


def test_get_tasks_for_workflow_success():
    session = MagicMock(spec=Session)

    workflow = db_model.Workflow(id="wf-1", crew_ai_tasks=["task-1", "task-2"])

    task_1 = db_model.Task(
        id="task-1",
        description="Task one",
        expected_output="Output one",
        assigned_agent_id="agent-1",
    )

    task_2 = db_model.Task(
        id="task-2",
        description="Task two",
        expected_output="Output two",
        assigned_agent_id=None,
    )

    session.query().filter().all.return_value = [task_1, task_2]

    tasks, agent_ids = get_tasks_for_workflow(workflow, session)

    assert len(tasks) == 2
    assert any(t.id == "task-1" for t in tasks)
    assert any(t.id == "task-2" for t in tasks)
    assert agent_ids == {"agent-1"}


def test_get_tasks_for_workflow_missing_task():
    session = MagicMock(spec=Session)

    workflow = db_model.Workflow(id="wf-1", crew_ai_tasks=["task-1"])
    session.query().filter().all.return_value = []  # Simulate no tasks found

    with pytest.raises(ValueError, match="Task with ID 'task-1' not found."):
        get_tasks_for_workflow(workflow, session)