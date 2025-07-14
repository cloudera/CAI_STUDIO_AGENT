import React, { useCallback, useEffect, useMemo } from 'react';
import { Layout, Tooltip } from 'antd';
import {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Controls,
  ReactFlow,
  useReactFlow,
  type NodeTypes,
  ControlButton,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { createDiagramStateFromWorkflow } from '../../workflows/diagrams';
import AgentNode from '../diagram/AgentNode';
import TaskNode from '../diagram/TaskNode';
import ToolNode from '../diagram/ToolNode';
import McpNode from '../diagram/McpNode';
import {
  AgentMetadata,
  CrewAITaskMetadata,
  McpInstance,
  ToolInstance,
} from '@/studio/proto/agent_studio';
import { processEvents } from '@/app/lib/workflow';
import { WorkflowState } from '@/app/workflows/editorSlice';
import { useImageAssetsData } from '../../lib/hooks/useAssetData';
import { useAppSelector, useAppDispatch } from '@/app/lib/hooks/hooks';
import {
  selectDiagramState,
  updatedDiagramState,
  updatedDiagramNodes,
  updatedDiagramEdges,
} from '@/app/workflows/editorSlice';
import { ReloadOutlined } from '@ant-design/icons';

const nodeTypes: NodeTypes = {
  agent: AgentNode,
  task: TaskNode,
  tool: ToolNode,
  mcp: McpNode,
};

export interface WorkflowDiagramProps {
  workflowState: WorkflowState;
  toolInstances?: ToolInstance[];
  mcpInstances?: McpInstance[];
  agents?: AgentMetadata[];
  tasks?: CrewAITaskMetadata[];
  events?: any[];
}

const WorkflowDiagram: React.FC<WorkflowDiagramProps> = ({
  workflowState,
  toolInstances,
  mcpInstances,
  agents,
  tasks,
  events,
}) => {
  const { fitView } = useReactFlow();
  const dispatch = useAppDispatch();
  const diagramState = useAppSelector(selectDiagramState);
  const nodes = diagramState.nodes;
  const edges = diagramState.edges;

  // Get image data for icons
  const { imageData: iconsData, refetch: refetchIconsData } = useImageAssetsData([
    ...(toolInstances?.map((t_) => t_.tool_image_uri) ?? []),
    ...(agents?.map((a_) => a_.agent_image_uri) ?? []),
    ...(mcpInstances?.map((m_) => m_.image_uri) ?? []),
  ]);

  // React Flow change handlers (update Redux)
  const onNodesChange = useCallback(
    (changes: any) => {
      const updatedNodes = applyNodeChanges(changes, nodes);
      dispatch(updatedDiagramNodes(updatedNodes));
    },
    [nodes, dispatch],
  );
  const onEdgesChange = useCallback(
    (changes: any) => {
      const updatedEdges = applyEdgeChanges(changes, edges);
      dispatch(updatedDiagramEdges(updatedEdges));
    },
    [edges, dispatch],
  );

  // Reset diagram to default layout
  const handleResetDiagram = useCallback(() => {
    const freshDiagramState = createDiagramStateFromWorkflow({
      workflowState,
      iconsData,
      toolInstances,
      mcpInstances,
      agents,
      tasks,
    });
    dispatch(updatedDiagramState({
      nodes: freshDiagramState.nodes,
      edges: freshDiagramState.edges,
      hasCustomPositions: false,
    }));
    setTimeout(() => {
      fitView({ padding: 0.1 });
    }, 100);
  }, [workflowState, iconsData, toolInstances, mcpInstances, agents, tasks, dispatch, fitView]);

  // Generate initial diagram state if Redux state is empty
  useEffect(() => {
    if (nodes.length === 0 && workflowState.workflowId) {
      const freshDiagramState = createDiagramStateFromWorkflow({
        workflowState,
        iconsData,
        toolInstances,
        mcpInstances,
        agents,
        tasks,
      });
      dispatch(updatedDiagramState({
        nodes: freshDiagramState.nodes,
        edges: freshDiagramState.edges,
        hasCustomPositions: false,
      }));
    }
  }, [workflowState, iconsData, toolInstances, mcpInstances, agents, tasks, nodes.length, dispatch]);

  // Reset diagram when workflow state changes (new nodes added/removed)
  useEffect(() => {
    if (workflowState.workflowId) {
      const freshDiagramState = createDiagramStateFromWorkflow({
        workflowState,
        iconsData,
        toolInstances,
        mcpInstances,
        agents,
        tasks,
      });
      const currentNodeIds = new Set(nodes.map(n => n.id));
      const newNodeIds = new Set(freshDiagramState.nodes.map(n => n.id));
      const hasWorkflowChanged =
        currentNodeIds.size !== newNodeIds.size ||
        ![...currentNodeIds].every(id => newNodeIds.has(id)) ||
        ![...newNodeIds].every(id => currentNodeIds.has(id));
      if (hasWorkflowChanged) {
        dispatch(updatedDiagramState({
          nodes: freshDiagramState.nodes,
          edges: freshDiagramState.edges,
          hasCustomPositions: false,
        }));
      }
    }
  }, [workflowState, iconsData, toolInstances, mcpInstances, agents, tasks, nodes, dispatch]);

  // Process events for active/highlight state
  const processedState = useMemo(() => {
    if (!events || events.length === 0) return { activeNodes: [] };
    return processEvents(
      events,
      agents || [],
      tasks || [],
      toolInstances || [],
      mcpInstances || [],
      workflowState.workflowMetadata.managerAgentId,
      workflowState.workflowMetadata.process,
    );
  }, [events, agents, tasks, toolInstances, mcpInstances, workflowState.workflowMetadata]);

  // Overlay active state/info on nodes
  const nodesWithActiveStates = useMemo(() => {
    return nodes.map(node => {
      const activeNode = processedState.activeNodes.find(active => active.id === node.id);
      return {
        ...node,
        data: {
          ...node.data,
          active: !!activeNode,
          activeTool: activeNode?.activeTool,
          info: activeNode?.info,
          infoType: activeNode?.infoType,
        },
      };
    });
  }, [nodes, processedState.activeNodes]);

  // Always fit view after nodes/edges change
  useEffect(() => {
    setTimeout(() => {
      fitView({ padding: 0.1 });
    }, 0);
  }, [nodesWithActiveStates, edges, fitView]);

  // Refetch icons after 2 seconds if not loaded
  useEffect(() => {
    const timer = setTimeout(() => {
      refetchIconsData();
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Layout style={{ flexShrink: 0, flexGrow: 1, height: '100%', flexDirection: 'column', padding: 0, background: 'transparent' }}>
      <ReactFlow
        nodes={nodesWithActiveStates}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
      >
        <Controls>
          <Tooltip title="Reset Diagram">
            <ControlButton onClick={handleResetDiagram}>
              <ReloadOutlined />
            </ControlButton>
          </Tooltip>
        </Controls>
        <Background />
      </ReactFlow>
    </Layout>
  );
};

export default WorkflowDiagram;
