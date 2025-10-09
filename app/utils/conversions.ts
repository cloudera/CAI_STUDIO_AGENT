import {
  AgentMetadata,
  AgentTemplateMetadata,
  CrewAITaskMetadata,
  McpInstance,
  MCPTemplate,
  ToolInstance,
  ToolTemplate,
  Workflow,
  WorkflowTemplateMetadata,
} from '@/studio/proto/agent_studio';

export interface WorkflowInfo {
  workflow: Workflow;
  toolInstances?: ToolInstance[];
  mcpInstances?: McpInstance[];
  agents?: AgentMetadata[];
  tasks?: CrewAITaskMetadata[];
}

export interface WorkflowTemplateInfo {
  workflowTemplate: WorkflowTemplateMetadata;
  agentTemplates?: AgentTemplateMetadata[];
  taskTemplates?: CrewAITaskMetadata[];
  toolTemplates?: ToolTemplate[];
  mcpTemplates?: MCPTemplate[];
}

const deployedWorkflowResponseConversion = (configuration: any): WorkflowInfo => {
  // Convert tool instances
  const toolInstances: ToolInstance[] = configuration.tool_instances
    ? configuration.tool_instances.map((tool: any) => {
        const t: ToolInstance = {
          id: tool.id,
          name: tool.name,
          workflow_id: configuration.workflow.id,
          python_code: '', // These fields aren't in the config response
          python_requirements: '',
          source_folder_path: '',
          tool_metadata: tool.tool_metadata,
          is_valid: true,
          tool_image_uri: tool.tool_image_uri,
          tool_description: '',
          is_venv_tool: tool.is_venv_tool || false,
          status: '',
        };
        return t;
      })
    : [];

  // Convert MCP instances
  const mcpInstances: McpInstance[] = configuration.mcp_instances
    ? configuration.mcp_instances.map((mcp: any) => {
        const m: McpInstance = {
          id: mcp.id,
          name: mcp.name,
          type: '',
          args: [],
          env_names: [],
          tools: '[]', // Default to empty array string, can be updated with actual tool definitions
          image_uri: mcp.image_uri,
          status: '',
          activated_tools: mcp.tools,
          workflow_id: configuration.workflow.id,
        };
        return m;
      })
    : [];

  // Convert agents
  const agents: AgentMetadata[] = configuration.agents
    ? configuration.agents.map((agent: any) => {
        const a: AgentMetadata = {
          id: agent.id,
          name: agent.name,
          llm_provider_model_id: agent.llm_provider_model_id || '',
          tools_id: agent.tool_instance_ids,
          mcp_instance_ids: agent.mcp_instance_ids,
          crew_ai_agent_metadata: {
            role: agent.crew_ai_role,
            backstory: agent.crew_ai_backstory,
            goal: agent.crew_ai_goal,
            allow_delegation: agent.crew_ai_allow_delegation,
            verbose: agent.crew_ai_verbose,
            cache: agent.crew_ai_cache,
            temperature: agent.crew_ai_temperature,
            max_iter: agent.crew_ai_max_iter,
          },
          is_valid: true,
          workflow_id: configuration.workflow.id,
          agent_image_uri: agent.agent_image_uri || '',
        };
        return a;
      })
    : [];

  // Helper function to extract placeholders from task descriptions
  const extractPlaceholders = (description: string): string[] => {
    const matches = description.match(/{(.*?)}/g) || [];
    return [...new Set(matches.map((match) => match.slice(1, -1)))];
  };

  // Convert tasks
  const tasks: CrewAITaskMetadata[] = configuration.tasks
    ? configuration.tasks.map((task: any) => ({
        task_id: task.id,
        description: task.description,
        expected_output: task.expected_output,
        assigned_agent_id: task.assigned_agent_id,
        is_valid: true,
        inputs: extractPlaceholders(task.description),
        workflow_id: configuration.workflow.id,
      }))
    : [];

  // Convert workflow
  const workflow: Workflow = {
    workflow_id: configuration?.workflow?.id,
    name: configuration?.workflow?.name,
    description: configuration?.workflow?.description,
    crew_ai_workflow_metadata: {
      agent_id: configuration?.workflow?.agent_ids,
      task_id: configuration?.workflow?.task_ids,
      manager_agent_id: configuration?.workflow?.manager_agent_id || '',
      process: configuration?.workflow?.crew_ai_process,
    },
    is_valid: true,
    is_ready: true,
    is_conversational: configuration?.workflow?.is_conversational,
  };

  return {
    workflow: workflow,
    toolInstances: toolInstances,
    mcpInstances: mcpInstances,
    agents: agents,
    tasks: tasks,
  };
};

const convertTemplateToWorkflowInfo = (template: WorkflowTemplateInfo): WorkflowInfo => {
  const workflowId = template.workflowTemplate.id;
  const toolInstances: ToolInstance[] = template.toolTemplates
    ? template.toolTemplates.map((tool: ToolTemplate) => {
        const t: ToolInstance = {
          id: tool.id,
          name: tool.name,
          workflow_id: workflowId,
          python_code: tool.python_code,
          python_requirements: tool.python_requirements,
          source_folder_path: tool.source_folder_path,
          tool_metadata: tool.tool_metadata,
          is_valid: true,
          tool_image_uri: tool.tool_image_uri,
          tool_description: tool.tool_description,
          is_venv_tool: tool.is_venv_tool || false,
          status: '',
        };
        return t;
      })
    : [];

  const mcpInstances: McpInstance[] = template.mcpTemplates
    ? template.mcpTemplates.map((mcp: MCPTemplate) => {
        const m: McpInstance = {
          id: mcp.id,
          name: mcp.name,
          type: mcp.type,
          args: mcp.args,
          env_names: mcp.env_names,
          tools: mcp.tools,
          image_uri: mcp.image_uri,
          status: mcp.status,
          activated_tools: [],
          workflow_id: workflowId,
        };
        return m;
      })
    : [];

  const agents: AgentMetadata[] = template.agentTemplates
    ? template.agentTemplates.map((agent: AgentTemplateMetadata) => {
        const a: AgentMetadata = {
          id: agent.id,
          name: agent.name,
          llm_provider_model_id: '',
          tools_id: agent.tool_template_ids,
          mcp_instance_ids: agent.mcp_template_ids,
          crew_ai_agent_metadata: {
            role: agent.role,
            backstory: agent.backstory,
            goal: agent.goal,
            allow_delegation: agent.allow_delegation,
            verbose: agent.verbose,
            cache: agent.cache,
            temperature: agent.temperature,
            max_iter: agent.max_iter,
          },
          is_valid: true,
          workflow_id: workflowId,
          agent_image_uri: agent.agent_image_uri,
        };
        return a;
      })
    : [];

  const tasks: CrewAITaskMetadata[] = template.taskTemplates
    ? template.taskTemplates.map((task: CrewAITaskMetadata) => {
        const t: CrewAITaskMetadata = {
          task_id: task.task_id,
          description: task.description,
          expected_output: task.expected_output,
          assigned_agent_id: task.assigned_agent_id,
          is_valid: true,
          inputs: task.inputs,
          workflow_id: workflowId,
        };
        return t;
      })
    : [];

  const workflow: Workflow = {
    workflow_id: workflowId,
    name: template.workflowTemplate.name,
    crew_ai_workflow_metadata: {
      agent_id: template.workflowTemplate.agent_template_ids,
      task_id: template.workflowTemplate.task_template_ids,
      manager_agent_id: template.workflowTemplate.manager_agent_template_id,
      process: template.workflowTemplate.process,
    },
    is_valid: true,
    is_ready: true,
    is_conversational: template.workflowTemplate.is_conversational,
    description: '',
    directory: '',
  };

  return {
    workflow: workflow,
    toolInstances: toolInstances,
    mcpInstances: mcpInstances,
    agents: agents,
    tasks: tasks,
  };
};

export { deployedWorkflowResponseConversion, convertTemplateToWorkflowInfo };
