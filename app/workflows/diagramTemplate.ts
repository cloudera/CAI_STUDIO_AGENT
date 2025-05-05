import type { Edge, Node } from '@xyflow/react';
import { MarkerType } from '@xyflow/react';
import {
  ToolTemplate,
  AgentTemplateMetadata,
  TaskTemplateMetadata,
  WorkflowTemplateMetadata,
} from '@/studio/proto/agent_studio';

export interface TemplateDiagramState {
  nodes: Node[];
  edges: Edge[];
}

export interface TemplateDiagramInput {
  template: WorkflowTemplateMetadata;
  iconsData: { [key: string]: string };
  taskTemplates?: TaskTemplateMetadata[];
  toolTemplates?: ToolTemplate[];
  agentTemplates?: AgentTemplateMetadata[];
}

export const createDiagramStateFromTemplate = (templateData: TemplateDiagramInput) => {
  const managerAgentId = templateData.template.manager_agent_template_id;
  const process = templateData.template.process;
  const hasManagerAgent: boolean = process === 'hierarchical';
  const useDefaultManager: boolean =
    hasManagerAgent && !Boolean(managerAgentId && managerAgentId.trim());

  const initialNodes: Node[] = [];
  const initialEdges: Edge[] = [];
  let yIndex = 0;

  // Add task nodes
  templateData.template.task_template_ids?.forEach((taskId, index) => {
    const task = templateData.taskTemplates?.find((t) => t.id === taskId);
    const taskLabel = task && (templateData.template.is_conversational
      ? 'Conversation'
      : `${task.description.substring(0, 50)}...`);

    if (task) {
      initialNodes.push({
        type: 'task',
        id: `${task.id}`,
        position: { x: index * 300, y: yIndex },
        data: {
          label: `${taskLabel}`,
          name: `${taskLabel}`,
        },
      });

      // Add edge to previous task (if not the first task)
      if (index > 0) {
        const previousTaskId = templateData.template.task_template_ids![index - 1];
        initialEdges.push({
          id: `e-task-${previousTaskId}-${task.id}`,
          source: `${previousTaskId}`,
          target: `${task.id}`,
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
        initialEdges.push({
          id: `e-${task.id}-${task.assigned_agent_template_id}`,
          source: `${task.id}`,
          target: `${task.assigned_agent_template_id}`,
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
          id: `e-${task.id}-${mId}`,
          source: `${task.id}`,
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
    const agent = templateData.agentTemplates?.find((a) => a.id === managerAgentId);
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

  // Calculate total width for layout
  let totalXWidth = 0;
  templateData.template.agent_template_ids?.forEach((agentId) => {
    const agent = templateData.agentTemplates?.find((a) => a.id === agentId);
    agent && (totalXWidth += 220 * Math.max(0, agent?.tool_template_ids?.length || 0));
    agent && (totalXWidth += 220);
  });

  // Add agent nodes
  let xIndexOffset = -0.5 * totalXWidth + 0.5 * 220;
  templateData.template.agent_template_ids?.forEach((agentId) => {
    const agent = templateData.agentTemplates?.find((a) => a.id === agentId);
    if (agent) {
      initialNodes.push({
        type: 'agent',
        id: `${agent.id}`,
        position: { x: xIndexOffset, y: yIndex },
        draggable: true,
        data: {
          label: `${agent.name}`,
          name: `${agent.name}`,
          iconData: templateData.iconsData[agent.agent_image_uri ?? ''] ?? '',
        },
      });

      // Add edge to manager agent
      if (hasManagerAgent) {
        const mId = useDefaultManager ? 'manager-agent' : managerAgentId;
        initialEdges.push({
          id: `e-${mId}-${agent.id}`,
          source: `${mId}`,
          target: `${agent.id}`,
        });
      }

      // Add nodes and edges for tools
      agent.tool_template_ids?.forEach((toolId) => {
        const tool = templateData.toolTemplates?.find((t) => t.id === toolId);
        if (tool) {
          initialNodes.push({
            type: 'tool',
            id: `${tool.id}`,
            position: { x: xIndexOffset, y: yIndex + 150 },
            data: {
              label: `Tool: ${tool.name}`,
              name: tool.name,
              iconData: templateData.iconsData[tool.tool_image_uri ?? ''] ?? '',
            },
          });

          initialEdges.push({
            id: `e-${agent.id}-${tool.id}`,
            source: `${agent.id}`,
            target: `${tool.id}`,
          });

          xIndexOffset += 220;
        }
      });

      if (!agent.tool_template_ids?.length) {
        xIndexOffset += 220;
      }
    }
  });

  return {
    nodes: initialNodes,
    edges: initialEdges,
  };
}; 