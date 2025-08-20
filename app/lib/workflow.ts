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

// This function is not currently used but kept for future implementation
const _extractThought = (completion: string) => {
  return completion;
};

// Event type constants to avoid string literals
export enum EventType {
  TASK_STARTED = 'task_started',
  TASK_COMPLETED = 'task_completed',
  AGENT_EXECUTION_STARTED = 'agent_execution_started',
  AGENT_EXECUTION_COMPLETED = 'agent_execution_completed',
  AGENT_EXECUTION_ERROR = 'agent_execution_error',
  TOOL_USAGE_STARTED = 'tool_usage_started',
  TOOL_USAGE_FINISHED = 'tool_usage_finished',
  TOOL_USAGE_ERROR = 'tool_usage_error',
  LLM_CALL_STARTED = 'llm_call_started',
  LLM_CALL_COMPLETED = 'llm_call_completed',
  LLM_CALL_FAILED = 'llm_call_failed',
}

// Info type constants
export enum InfoType {
  TASK_START = 'TaskStart',
  DELEGATE = 'Delegate',
  ASK_COWORKER = 'AskCoworker',
  TOOL_INPUT = 'ToolInput',
  END_DELEGATE = 'EndDelegate',
  END_ASK_COWORKER = 'EndAskCoworker',
  TOOL_OUTPUT = 'ToolOutput',
  LLM_CALL = 'LLMCall',
  COMPLETION = 'Completion',
  FAILED_COMPLETION = 'FailedCompletion',
}

// Common tool names
export const DELEGATE_TOOL = 'Delegate work to coworker';
export const ASK_COWORKER_TOOL = 'Ask question to coworker';

export const processEvents = (
  events: any[],
  _agents: AgentMetadata[],
  _tasks: CrewAITaskMetadata[],
  _toolInstances: ToolInstance[],
  _mcpInstances: McpInstance[], // Prefixed with underscore as it's unused
  _manager_agent_id: string | undefined, // Prefixed with underscore as it's unused
  _process: string | undefined, // Prefixed with underscore as it's unused
): ProcessedState => {
  const activeNodes: Map<string, ActiveNodeState> = new Map();
  const agentStack: string[] = [];
  events.forEach((event) => {
    switch (event.type as string) {
      case EventType.TASK_STARTED: {
        if (event?.agent_studio_id) {
          activeNodes.set(event.agent_studio_id, { id: event.agent_studio_id });
        }
        break;
      }

      case EventType.TASK_COMPLETED: {
        if (event?.agent_studio_id) {
          activeNodes.delete(event.agent_studio_id);
        }
        break;
      }

      case EventType.AGENT_EXECUTION_STARTED: {
        // There are some cases where a tool usage error will lead to re-triggering
        // an agent execution start without a corresponding agent execution error. to
        // compensate for this, we need to make sure we don't duplicate agent nodes
        // on top of the active node stack.
        const nodeId = event.agent_studio_id || 'manager-agent';
        agentStack.push(nodeId);
        activeNodes.set(nodeId, {
          id: nodeId,
          info: `I am starting an agent: "${event.agent_studio_name}"`,
          infoType: InfoType.TASK_START,
        });
        break;
      }

      case EventType.TOOL_USAGE_STARTED: {
        // For manager agent, this is a delegation.
        if (event?.tool_name == DELEGATE_TOOL || event?.tool_name == ASK_COWORKER_TOOL) {
          const agentNodeId = agentStack.at(-1);
          agentNodeId &&
            activeNodes.set(agentNodeId, {
              id: agentNodeId,
              activeTool: event.tool_name,
              info: `${event.tool_args}`,
              infoType:
                event?.tool_name === DELEGATE_TOOL ? InfoType.DELEGATE : InfoType.ASK_COWORKER,
            });
        } else if (event?.agent_studio_id) {
          const toolOrMcpId = event?.agent_studio_id;
          activeNodes.set(toolOrMcpId, {
            id: toolOrMcpId,
            activeTool: event.tool_name,
            info: `${event.tool_args}`,
            infoType: InfoType.TOOL_INPUT,
          });
        }
        break;
      }

      case EventType.TOOL_USAGE_FINISHED:
      case EventType.TOOL_USAGE_ERROR: {
        // For manager agent, this is a delegation.
        const agentNodeId = agentStack.at(-1);
        if (event?.tool_name == DELEGATE_TOOL || event?.tool_name == ASK_COWORKER_TOOL) {
          agentNodeId &&
            activeNodes.set(agentNodeId, {
              id: agentNodeId,
              activeTool: event.tool_name,
              info: `${JSON.stringify(event)}`,
              infoType:
                event?.tool_name === DELEGATE_TOOL
                  ? InfoType.END_DELEGATE
                  : InfoType.END_ASK_COWORKER,
            });
        } else if (event?.agent_studio_id) {
          activeNodes.delete(event?.agent_studio_id);
          agentNodeId &&
            activeNodes.set(agentNodeId, {
              id: agentNodeId,
              activeTool: event.tool_name,
              info: `${JSON.stringify(event)}`,
              infoType: InfoType.TOOL_OUTPUT,
            });
        }
        break;
      }

      case EventType.LLM_CALL_STARTED: {
        // find the most recent node in the stack which will be the node of
        // the calling agent
        const agentNodeId = agentStack.at(-1) || '';
        if (activeNodes.has(agentNodeId)) {
          activeNodes.set(agentNodeId, {
            id: agentNodeId,
            info: `${JSON.stringify(event)}`,
            infoType: InfoType.LLM_CALL,
          });
        }
        break;
      }

      case EventType.LLM_CALL_COMPLETED:
      case EventType.LLM_CALL_FAILED: {
        // find the most recent node in the stack which will be the node of
        // the calling agent
        const agentNodeId = agentStack.at(-1) || '';
        if (activeNodes.has(agentNodeId)) {
          activeNodes.set(agentNodeId, {
            id: agentNodeId,
            info: `${event.response || event.error}`,
            infoType:
              event.type === EventType.LLM_CALL_COMPLETED
                ? InfoType.COMPLETION
                : InfoType.FAILED_COMPLETION,
          });
        }
        break;
      }

      case EventType.AGENT_EXECUTION_COMPLETED:
      case EventType.AGENT_EXECUTION_ERROR: {
        const nodeId = event.agent_studio_id || 'manager-agent';
        activeNodes.delete(nodeId);
        agentStack.pop();
        break;
      }
    }
  });
  return { activeNodes: Array.from(activeNodes.values()) };
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
    planning: !!workflowState.smartWorkflow && !!workflowState.planning,
    smart_workflow: !!workflowState.smartWorkflow,
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

  const addRequest: AddWorkflowRequest = {
    name: workflowState.name!,
    is_conversational: workflowState.isConversational!,
    description: workflowState.description!,
    planning: !!workflowState.smartWorkflow && !!workflowState.planning,
    smart_workflow: !!workflowState.smartWorkflow,
    crew_ai_workflow_metadata: {
      agent_id: workflowState.workflowMetadata.agentIds || [],
      task_id: workflowState.workflowMetadata.taskIds || [],
      manager_agent_id: managerAgentId || '',
      process: process,
    },
  };
  return addRequest;
};
