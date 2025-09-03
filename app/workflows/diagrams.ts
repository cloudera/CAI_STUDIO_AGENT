import type { Edge, Node } from '@xyflow/react';
import { MarkerType } from '@xyflow/react';

import {
  ToolTemplate,
  ToolInstance,
  CrewAITaskMetadata,
  AgentMetadata,
  McpInstance,
} from '@/studio/proto/agent_studio';
import { WorkflowState } from './editorSlice';

export interface DiagramState {
  nodes: Node[];
  edges: Edge[];
  hasCustomPositions?: boolean; // Track if user has made position changes
}

export interface DiagramStateInput {
  workflowState: WorkflowState;
  iconsData: { [key: string]: string };
  tasks?: CrewAITaskMetadata[];
  toolInstances?: ToolInstance[];
  mcpInstances?: McpInstance[];
  toolTemplates?: ToolTemplate[];
  agents?: AgentMetadata[];
}

/**
 * Creates diagram state from workflow data.
 *
 * This function generates the initial diagram layout. Position persistence
 * is handled by the React component using Redux state.
 *
 * @param workflowData - Contains workflow state, tool instances, agents, tasks
 * @returns DiagramState with nodes and edges using default positions
 */
export const createDiagramStateFromWorkflow = (workflowData: DiagramStateInput) => {
  const managerAgentId = workflowData.workflowState.workflowMetadata.managerAgentId;
  const process = workflowData.workflowState.workflowMetadata.process;
  const hasManagerAgent: boolean = process === 'hierarchical';
  const useDefaultManager: boolean = hasManagerAgent && !(managerAgentId && managerAgentId.trim());

  const initialNodes: Node[] = [];
  const initialEdges: Edge[] = [];
  let yIndex = 0;

  // Add task nodes
  workflowData.workflowState.workflowMetadata.taskIds?.forEach((task_id, index) => {
    const task = workflowData.tasks?.find((task) => task.task_id === task_id);
    const taskLabel =
      task &&
      (workflowData.workflowState.isConversational
        ? 'Conversation'
        : `${task.description.substring(0, 50)}...`);
    if (task) {
      const defaultPosition = { x: index * 300, y: yIndex };

      initialNodes.push({
        type: 'task',
        id: `${task.task_id}`,
        position: defaultPosition,
        data: {
          label: `${taskLabel}`,
          name: `${taskLabel}`,
          taskId: task.task_id, // Add task ID
          taskData: task, // Add full task data for edit functionality
          isConversational: workflowData.workflowState.isConversational, // Add conversational flag
        },
      });

      // Add edge to previous task (if not the first task)
      if (index > 0) {
        const previousTaskId = workflowData.workflowState.workflowMetadata.taskIds![index - 1];
        initialEdges.push({
          id: `e-task-${previousTaskId}-${task.task_id}`,
          source: `${previousTaskId}`,
          target: `${task.task_id}`,
          sourceHandle: 'right',
          targetHandle: 'left',
          markerEnd: {
            type: MarkerType.Arrow,
            width: 20,
            height: 20,
          },
        });
      }

      if (!hasManagerAgent) {
        // Connect task to its assigned agent
        initialEdges.push({
          id: `e-${task.task_id}-${task.assigned_agent_id}`,
          source: `${task.task_id}`,
          target: `${task.assigned_agent_id}`,
          sourceHandle: 'bottom',
          targetHandle: 'top',
          markerEnd: {
            type: MarkerType.Arrow,
            width: 20,
            height: 20,
          },
        });
      } else {
        const mId = useDefaultManager ? 'manager-agent' : managerAgentId;
        initialEdges.push({
          id: `e-${task.task_id}-${mId}`,
          source: `${task.task_id}`,
          target: `${mId}`,
          sourceHandle: 'bottom',
          markerEnd: {
            type: MarkerType.Arrow,
            width: 20,
            height: 20,
          },
        });
      }
    }
  });

  yIndex += 150;

  // Add manager agent
  if (hasManagerAgent) {
    const agent = workflowData.agents?.find((agent) => agent.id === managerAgentId);
    const agentName = useDefaultManager ? 'Default Manager' : agent?.name;
    const mId = useDefaultManager ? 'manager-agent' : managerAgentId;
    initialNodes.push({
      type: 'agent',
      id: `${mId}`,
      position: { x: 0, y: yIndex },
      draggable: true,
      data: {
        label: `${agentName}`,
        name: agentName,
        manager: true,
        iconData: '',
        agentId: mId, // Add agent ID for consistency
        agentData: useDefaultManager ? undefined : agent, // Only set agentData for custom managers
        isDefaultManager: useDefaultManager, // Add flag to identify default manager
      },
    });
    yIndex += 150;
  }

  // TODO. Need a better way to organize
  // the diagram dynamically.
  let totalXWidth = 0;
  workflowData.workflowState.workflowMetadata.agentIds?.forEach((agent_id, _index) => {
    const agent = workflowData.agents?.find((agent) => agent.id === agent_id);
    agent && (totalXWidth += 220 * Math.max(0, agent?.tools_id.length - 1));
    agent && (totalXWidth += 220 * Math.max(0, (agent?.mcp_instance_ids?.length || 0) - 1));
    agent && (totalXWidth += 220);
  });

  // Add agent nodes
  let xIndexOffset = -0.5 * totalXWidth + 0.5 * 220;
  workflowData.workflowState.workflowMetadata.agentIds?.forEach((agent_id, _index) => {
    const agent = workflowData.agents?.find((agent) => agent.id === agent_id);
    agent &&
      initialNodes.push({
        type: 'agent',
        id: `${agent.id}`,
        position: { x: xIndexOffset, y: yIndex },
        draggable: true,
        data: {
          label: `${agent.name}`,
          name: `${agent.name}`,
          iconData: workflowData.iconsData[agent.agent_image_uri ?? ''] ?? '',
          agentId: agent.id, // Add agent ID
          agentData: agent, // Add full agent data for edit functionality
        },
      });

    if (agent) {
      // Add edge to manager agent
      if (hasManagerAgent) {
        const mId = useDefaultManager ? 'manager-agent' : managerAgentId;
        initialEdges.push({
          id: `e-${mId}-${agent.id}`,
          source: `${mId}`,
          target: `${agent.id}`,
          markerEnd: {
            type: MarkerType.Arrow,
            width: 20,
            height: 20,
          },
        });
      }

      // Add nodes and edges of all the tools
      agent.tools_id?.forEach((tool_ins_id) => {
        // Find the appropriate tool from the tool instances
        const toolInstance = workflowData.toolInstances?.find(
          (toolInstance: ToolInstance) => toolInstance.id === tool_ins_id,
        );

        if (toolInstance) {
          // Now add the node
          initialNodes.push({
            type: 'tool',
            id: `${toolInstance?.id}`,
            position: { x: xIndexOffset, y: yIndex + 150 },
            data: {
              label: `Tool: ${toolInstance?.name}`,
              name: toolInstance?.name,
              iconData: workflowData.iconsData[toolInstance?.tool_image_uri ?? ''] ?? '',
              workflowId: workflowData.workflowState.workflowId,
              toolInstanceId: toolInstance.id,
              agentId: agent.id,
              agentTools: agent.tools_id,
            },
          });

          // Add the edge from the agent to the tool
          initialEdges.push({
            id: `e-${agent.id}-${toolInstance?.id}`,
            source: `${agent.id}`,
            target: `${toolInstance?.id}`,
            markerEnd: {
              type: MarkerType.Arrow,
              width: 20,
              height: 20,
            },
          });

          xIndexOffset += 220;
        }
      });

      // Add nodes and edges of all the MCP instances
      agent.mcp_instance_ids?.forEach((mcp_instance_id) => {
        // Find the appropriate MCP instance from the MCP instances
        const mcpInstance = workflowData.mcpInstances?.find(
          (mcpInstance: McpInstance) => mcpInstance.id === mcp_instance_id,
        );

        if (mcpInstance) {
          // Parse tools from MCP instance
          let mcpTools: string[] = [];
          try {
            const toolsData = JSON.parse(mcpInstance.tools || '[]');
            mcpTools = Array.isArray(toolsData)
              ? toolsData.map((tool: any) => tool.name || tool)
              : [];
          } catch (error) {
            console.error('Failed to parse MCP tools:', error);
          }

          if (mcpInstance.activated_tools && mcpInstance.activated_tools.length > 0) {
            mcpTools = mcpTools.filter((toolName) =>
              mcpInstance.activated_tools.includes(toolName),
            );
          }

          // Now add the MCP node
          initialNodes.push({
            type: 'mcp',
            id: `${mcpInstance?.id}`,
            position: { x: xIndexOffset, y: yIndex + 150 },
            data: {
              name: mcpInstance?.name,
              iconData: workflowData.iconsData[mcpInstance?.image_uri ?? ''] ?? '',
              active: false,
              toolList: mcpTools,
              activeTool: '',
            },
          });

          // Add the edge from the agent to the MCP
          initialEdges.push({
            id: `e-${agent.id}-${mcpInstance?.id}`,
            source: `${agent.id}`,
            target: `${mcpInstance?.id}`,
            markerEnd: {
              type: MarkerType.Arrow,
              width: 20,
              height: 20,
            },
          });

          xIndexOffset += 220;
        }
      });

      if (agent.tools_id.length === 0 && (agent.mcp_instance_ids?.length || 0) === 0) {
        xIndexOffset += 220;
      }
    }
  });
  yIndex += 150;

  return {
    nodes: initialNodes,
    edges: initialEdges,
  };
};
