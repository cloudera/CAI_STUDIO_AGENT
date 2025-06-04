import type { Edge, Node } from '@xyflow/react';
import { MarkerType } from '@xyflow/react';
import {
  ToolTemplate,
  AgentTemplateMetadata,
  TaskTemplateMetadata,
  WorkflowTemplateMetadata,
  MCPTemplate,
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
  mcpTemplates?: MCPTemplate[];
  agentTemplates?: AgentTemplateMetadata[];
}

export const createDiagramStateFromTemplate = (templateData: TemplateDiagramInput) => {
  const initialNodes: Node[] = [];
  const initialEdges: Edge[] = [];

  // Start layout positioning
  let yIndex = 0;

  // Add task nodes first
  const hasManagerAgent =
    templateData.template.manager_agent_template_id !== null &&
    templateData.template.manager_agent_template_id !== undefined &&
    templateData.template.manager_agent_template_id !== '';
  const managerAgentId = templateData.template.manager_agent_template_id;
  const useDefaultManager =
    managerAgentId === undefined || managerAgentId === null || managerAgentId === '';

  templateData.template.task_template_ids?.forEach((taskId, index) => {
    const task = templateData.taskTemplates?.find((t) => t.id === taskId);

    let taskLabel = `Task ${index + 1}`;
    if (task) {
      taskLabel = task.name;
    }

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
    agent && (totalXWidth += 220 * Math.max(0, agent?.mcp_template_ids?.length || 0));
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
          markerEnd: {
            type: MarkerType.Arrow,
            width: 20,
            height: 20,
          },
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
            markerEnd: {
              type: MarkerType.Arrow,
              width: 20,
              height: 20,
            },
          });

          xIndexOffset += 220;
        }
      });

      // Add nodes and edges for MCP templates
      agent.mcp_template_ids?.forEach((mcpId) => {
        const mcp = templateData.mcpTemplates?.find((m) => m.id === mcpId);
        if (mcp) {
          // Parse tools from MCP template
          let mcpTools: string[] = [];
          try {
            const toolsData = JSON.parse(mcp.tools || '[]');
            mcpTools = Array.isArray(toolsData)
              ? toolsData.map((tool: any) => tool.name || tool)
              : [];
          } catch (error) {
            console.error('Failed to parse MCP tools:', error);
          }

          initialNodes.push({
            type: 'mcp',
            id: `${mcp.id}`,
            position: { x: xIndexOffset, y: yIndex + 150 },
            data: {
              name: mcp.name,
              iconData: templateData.iconsData[mcp.image_uri ?? ''] ?? '',
              active: false,
              toolList: mcpTools,
            },
          });

          initialEdges.push({
            id: `e-${agent.id}-${mcp.id}`,
            source: `${agent.id}`,
            target: `${mcp.id}`,
            markerEnd: {
              type: MarkerType.Arrow,
              width: 20,
              height: 20,
            },
          });

          xIndexOffset += 220;
        }
      });

      if (!agent.tool_template_ids?.length && !agent.mcp_template_ids?.length) {
        xIndexOffset += 220;
      }
    }
  });

  return {
    nodes: initialNodes,
    edges: initialEdges,
  };
};
