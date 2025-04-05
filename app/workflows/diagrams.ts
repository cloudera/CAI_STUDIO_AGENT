import type { Edge, Node } from '@xyflow/react';

import {
  ToolTemplate,
  ToolInstance,
  CrewAITaskMetadata,
  AgentMetadata,
} from '@/studio/proto/agent_studio';
import { WorkflowState } from './editorSlice';

export interface DiagramState {
  nodes: Node[];
  edges: Edge[];
}

export interface DiagramStateInput {
  workflowState: WorkflowState;
  iconsData: { [key: string]: string };
  tasks?: CrewAITaskMetadata[];
  toolInstances?: ToolInstance[];
  toolTemplates?: ToolTemplate[];
  agents?: AgentMetadata[];
}

export const createDiagramStateFromWorkflow = (workflowData: DiagramStateInput) => {
  const managerAgentId = workflowData.workflowState.workflowMetadata.managerAgentId;
  const process = workflowData.workflowState.workflowMetadata.process;
  const hasManagerAgent: boolean = process === 'hierarchical';
  const useDefaultManager: boolean =
    hasManagerAgent && !Boolean(managerAgentId && managerAgentId.trim());

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
      initialNodes.push({
        type: 'task',
        id: `${task.task_id}`,
        position: { x: index * 300, y: yIndex },
        data: {
          label: `${taskLabel}`,
          name: `${taskLabel}`,
        },
      });

      if (!hasManagerAgent) {
        initialEdges.push({
          id: `e-${task.task_id}-${task.assigned_agent_id}`,
          source: `${task.task_id}`,
          target: `${task.assigned_agent_id}`,
        });
      } else {
        const mId = useDefaultManager ? 'manager-agent' : managerAgentId;
        initialEdges.push({
          id: `e-${task.task_id}-${mId}`,
          source: `${task.task_id}`,
          target: `${mId}`,
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
      },
    });
    yIndex += 150;
  }

  // TODO. Need a better way to organize
  // the diagram dynamically.
  let totalXWidth = 0;
  workflowData.workflowState.workflowMetadata.agentIds?.forEach((agent_id, index) => {
    const agent = workflowData.agents?.find((agent) => agent.id === agent_id);
    agent && (totalXWidth += 220 * Math.max(0, agent?.tools_id.length - 1));
    agent && (totalXWidth += 220);
  });

  // Add agent nodes
  let xIndexOffset = -0.5 * totalXWidth + 0.5 * 220;
  workflowData.workflowState.workflowMetadata.agentIds?.forEach((agent_id, index) => {
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
        });
      }

      // Add nodes and edges of all the tools
      agent.tools_id?.forEach((tool_ins_id, index2) => {
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
            },
          });

          // Add the edge from the agent to the tool
          initialEdges.push({
            id: `e-${agent.id}-${toolInstance?.id}`,
            source: `${agent.id}`,
            target: `${toolInstance?.id}`,
          });

          xIndexOffset += 220;
        }
      });
      if (agent.tools_id.length == 0) {
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
