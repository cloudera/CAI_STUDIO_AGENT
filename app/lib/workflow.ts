import {
  AddWorkflowRequest,
  AgentMetadata,
  CrewAITaskMetadata,
  CrewAIWorkflowMetadata,
  McpInstance,
  ToolInstance,
  UpdateWorkflowRequest,
} from '@/studio/proto/agent_studio';
import { WorkflowState } from '../workflows/editorSlice';

export interface ActiveNodeState {
  id: string;
  activeTool?: string; // Only for McpNode
  info?: string;
  infoType?: string;
  isMostRecent?: boolean;
}

type ProcessedState = {
  activeNodes: ActiveNodeState[]; // IDs of nodes currently "in work"
};

const extractThought = (completion: string) => {
  return completion;
};

export const processEvents = (
  events: any[],
  agents: AgentMetadata[],
  tasks: CrewAITaskMetadata[],
  toolInstances: ToolInstance[],
  mcpInstances: McpInstance[],
  manager_agent_id: string | undefined,
  process: string | undefined,
): ProcessedState => {
  let activeNodes: ActiveNodeState[] = [];
  const nodeStack: string[] = [];

  events.forEach((event) => {
    switch (event.type) {
      case 'task_started': {
        if (event.agent_studio_id) {
          activeNodes.push({
            id: event.agent_studio_id,
          });
          nodeStack.push(event.agent_studio_id);
        }
        break;
      }

      case 'task_completed': {
        if (event.agent_studio_id) {
          activeNodes = activeNodes.filter((node) => node.id !== event.agent_studio_id);
          nodeStack.pop();
        }
        break;
      }

      case 'agent_execution_started': {
        // There are some cases where a tool usage error will lead to re-triggering
        // an agent execution start without a corresponding agent execution error. to
        // compensate for this, we need to make sure we don't duplicate agent nodes
        // on top of the active node stack.
        const nodeId = event.agent_studio_id || 'manager-agent';
        activeNodes = activeNodes.filter((node) => node.id !== nodeId);
        activeNodes.push({
          id: nodeId,
          info: `I am starting a task: "${event.task.description}"`,
          infoType: 'TaskStart',
        });

        if (nodeStack.at(-1) !== nodeId) {
          nodeStack.push(nodeId);
        }

        break;
      }

      case 'tool_usage_started': {
        // For manager agent, this is a delegation.
        if (event.tool_name === 'Delegate work to coworker') {
          const nodeId = nodeStack.at(-1);
          nodeId && (activeNodes = activeNodes.filter((node) => node.id !== nodeId));
          nodeId &&
            activeNodes.push({
              id: nodeId,
              info: `${event.tool_args}`,
              infoType: 'Delegate',
            });
        } else if (event.tool_name === 'Ask question to coworker') {
          const nodeId = nodeStack.at(-1);
          nodeId && (activeNodes = activeNodes.filter((node) => node.id !== nodeId));
          nodeId &&
            activeNodes.push({
              id: nodeId,
              info: `${event.tool_args}`,
              infoType: 'AskCoworker',
            });
        } else {
          const agentId = nodeStack.at(-1);
          const agent = agents.find((a) => a.id === agentId);
          const possibleToolInstances = toolInstances.filter((ti) =>
            agent?.tools_id.includes(ti.id),
          );
          const possibleMcpInstances = mcpInstances.filter((mi) =>
            agent?.mcp_instance_ids.includes(mi.id),
          );
          const toolInstance = possibleToolInstances.find((t) => t.name === event.tool_name);
          const mcpInstance = possibleMcpInstances.find((m) =>
            JSON.parse(m.tools || '[]')
              .map((t: any) => t.name)
              .includes(event.tool_name),
          );
          if (toolInstance || mcpInstance) {
            // Update the agent node
            activeNodes = activeNodes.filter((node) => node.id !== agentId);
            activeNodes.push({
              id: agentId!,
              info: `${event.tool_args}`,
              infoType: 'ToolInput',
            });
          }
          if (toolInstance) {
            // Add the tool node to the stack
            activeNodes.push({
              id: toolInstance.id,
              info: `${event.tool_args}`,
              infoType: 'ToolInput',
            });
            nodeStack.push(toolInstance.id);
          } else if (mcpInstance) {
            // Add the MCP node to the stack
            activeNodes.push({
              id: mcpInstance.id,
              activeTool: event.tool_name,
              info: `${event.tool_args}`,
              infoType: 'ToolInput',
            });
            nodeStack.push(mcpInstance.id);
          }
        }
        break;
      }

      case 'tool_usage_finished':
      case 'tool_usage_error': {
        // For manager agent, this is a delegation.
        if (event.tool_name === 'Delegate work to coworker') {
          // update the corresponding agent node
          activeNodes = activeNodes.filter((node) => node.id !== nodeStack.at(-1));
          activeNodes.push({
            id: nodeStack.at(-1)!,
            info: `${JSON.stringify(event)}`,
            infoType: 'EndDelegate',
          });
        } else if (event.tool_name === 'Ask question to coworker') {
          // update the corresponding agent node
          activeNodes = activeNodes.filter((node) => node.id !== nodeStack.at(-1));
          activeNodes.push({
            id: nodeStack.at(-1)!,
            info: `${JSON.stringify(event)}`,
            infoType: 'EndAskCoworker',
          });
        } else {
          // pop the tool node
          activeNodes = activeNodes.filter((node) => node.id !== nodeStack.at(-1));
          nodeStack.pop();

          // update the corresponding agent node
          activeNodes = activeNodes.filter((node) => node.id !== nodeStack.at(-1));
          activeNodes.push({
            id: nodeStack.at(-1)!,
            info: `${JSON.stringify(event)}`,
            infoType: 'ToolOutput',
          });
        }
        break;
      }

      case 'llm_call_started': {
        // find the most recent node in the stack which will be the node of
        // the calling agent
        const nodeId = nodeStack.at(-1);
        if (nodeId) {
          activeNodes = activeNodes.filter((node) => node.id !== nodeId);
          activeNodes.push({
            id: nodeId,
            info: `${JSON.stringify(event)}`,
            infoType: 'LLMCall',
          });
        }
        break;
      }

      case 'llm_call_completed':
      case 'llm_call_failed': {
        // find the most recent node in the stack which will be the node of
        // the calling agent
        const nodeId = nodeStack.at(-1);
        if (nodeId) {
          activeNodes = activeNodes.filter((node) => node.id !== nodeId);
          activeNodes.push({
            id: nodeId,
            info: `${event.response || event.error}`,
            infoType: event.type === 'llm_call_completed' ? 'Completion' : 'FailedCompletion',
          });
        }
        break;
      }

      case 'agent_execution_completed':
      case 'agent_execution_error': {
        const nodeId = event.agent_studio_id || 'manager-agent';
        activeNodes = activeNodes.filter((node) => node.id !== nodeId);
        nodeStack.pop();
        break;
      }
    }
  });

  return { activeNodes };
};

export const getWorkflowInputs = (
  workflowMetadata?: CrewAIWorkflowMetadata,
  tasks?: CrewAITaskMetadata[],
) => {
  const inputSet = new Set<string>();

  workflowMetadata?.task_id.forEach((task_id) => {
    const task = tasks?.find((task) => task.task_id === task_id);
    if (task) {
      task.inputs.forEach((input) => inputSet.add(input));
    }
  });

  return Array.from(inputSet);
};

export const createUpdateRequestFromEditor = (workflowState: WorkflowState) => {
  // There is a chance that the process is not yet defined. Let's fix that here.
  // In reality there should be validations further upstream.
  const managerAgentId = workflowState.workflowMetadata.managerAgentId;
  const process = workflowState.workflowMetadata.process || 'sequential';

  const updateRequest: UpdateWorkflowRequest = {
    workflow_id: workflowState.workflowId!,
    name: workflowState.name!,
    description: workflowState.description!,
    is_conversational: workflowState.isConversational!,
    crew_ai_workflow_metadata: {
      agent_id: workflowState.workflowMetadata.agentIds || [],
      task_id: workflowState.workflowMetadata.taskIds || [],
      manager_agent_id: managerAgentId || '',
      process: process,
    },
  };
  return updateRequest;
};

export const createAddRequestFromEditor = (workflowState: WorkflowState) => {
  // There is a chance that the process is not yet defined. Let's fix that here.
  // In reality there should be validations further upstream.
  const managerAgentId = workflowState.workflowMetadata.managerAgentId;
  const process = workflowState.workflowMetadata.process || 'sequential';

  console.log(workflowState);
  const addRequest: AddWorkflowRequest = {
    name: workflowState.name!,
    is_conversational: workflowState.isConversational!,
    description: workflowState.description!,
    crew_ai_workflow_metadata: {
      agent_id: workflowState.workflowMetadata.agentIds || [],
      task_id: workflowState.workflowMetadata.taskIds || [],
      manager_agent_id: managerAgentId || '',
      process: process,
    },
  };
  return addRequest;
};
