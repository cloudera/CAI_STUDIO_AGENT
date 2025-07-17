import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  updatedEditorStep,
  updatedEditorTaskEditingId,
  clearEditorTaskEditingState,
  updatedEditorAgentViewOpen,
  updatedEditorAgentViewStep,
  updatedEditorAgentViewAgent,
} from '@/app/workflows/editorSlice';
import { ReloadOutlined } from '@ant-design/icons';
import SelectOrAddAgentModal from '../workflowEditor/SelectOrAddAgentModal';
import SelectOrAddManagerAgentModal from '../workflowEditor/SelectOrAddManagerAgentModal';
import { useRouter } from 'next/navigation';

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

// Utility: create a signature string from relevant data for agents, tasks, tools, mcpInstances
function getDiagramDataSignature({
  agents,
  tasks,
  toolInstances,
  mcpInstances,
  workflowState,
}: {
  agents?: AgentMetadata[];
  tasks?: CrewAITaskMetadata[];
  toolInstances?: ToolInstance[];
  mcpInstances?: McpInstance[];
  workflowState: WorkflowState;
}) {
  // Only include fields that affect diagram rendering
  return JSON.stringify({
    agents: (agents || []).map((a: AgentMetadata) => ({
      id: a.id,
      name: a.name,
      image: a.agent_image_uri,
      tools_id: a.tools_id || [], // Include tools_id to detect when tools are added/removed from agents
    })),
    tasks: (tasks || []).map((t: CrewAITaskMetadata) => ({
      id: t.task_id,
      description: t.description,
      expected_output: t.expected_output,
    })),
    toolInstances: (toolInstances || []).map((t: ToolInstance) => ({
      id: t.id,
      name: t.name,
      image: t.tool_image_uri,
    })),
    mcpInstances: (mcpInstances || []).map((m: McpInstance) => ({
      id: m.id,
      name: m.name,
      image: m.image_uri,
    })),
    managerAgentId: workflowState?.workflowMetadata?.managerAgentId,
    process: workflowState?.workflowMetadata?.process,
  });
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
  const [isManagerModalOpen, setIsManagerModalOpen] = useState(false);
  const router = useRouter();
  const prevDiagramSignature = useRef('');

  // Get image data for icons
  const { imageData: iconsData, refetch: refetchIconsData } = useImageAssetsData([
    ...(toolInstances?.map((t_) => t_.tool_image_uri) ?? []),
    ...(agents?.map((a_) => a_.agent_image_uri) ?? []),
    ...(mcpInstances?.map((m_) => m_.image_uri) ?? []),
  ]);

  // Callback for editing manager agent
  const handleEditManager = useCallback((agent: AgentMetadata) => {
    // Clear any existing task editing state to prevent conflicts
    dispatch(clearEditorTaskEditingState());
    // Clear any existing agent view state to prevent conflicts
    dispatch(updatedEditorAgentViewOpen(false));
    setIsManagerModalOpen(true);
  }, [dispatch]);

  // Callback for editing task
  const handleEditTask = useCallback((task: CrewAITaskMetadata) => {
    // Clear any existing manager modal state to prevent conflicts
    setIsManagerModalOpen(false);
    // Set the editor step to Tasks
    dispatch(updatedEditorStep('Tasks'));
    // Set the editing task ID in Redux state
    dispatch(updatedEditorTaskEditingId(task.task_id));
    // Navigate to the workflow creation page
    router.push(`/workflows/create?workflowId=${workflowState.workflowId}`);
  }, [workflowState.workflowId, router, dispatch]);

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
    
    // Add the onEditManager callback to manager agent nodes
    const nodesWithCallbacks = freshDiagramState.nodes.map(node => {
      if (node.type === 'agent' && node.data.manager) {
        return {
          ...node,
          data: {
            ...node.data,
            onEditManager: handleEditManager,
          },
        };
      }
      if (node.type === 'task') {
        return {
          ...node,
          data: {
            ...node.data,
            onEditTask: handleEditTask,
          },
        };
      }
      return node;
    });
    
    dispatch(updatedDiagramState({
      nodes: nodesWithCallbacks,
      edges: freshDiagramState.edges,
      hasCustomPositions: false,
    }));
    setTimeout(() => {
      fitView({ padding: 0.1 });
    }, 100);
  }, [workflowState, iconsData, toolInstances, mcpInstances, agents, tasks, dispatch, fitView, handleEditManager, handleEditTask]);

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
      
      // Add the onEditManager callback to manager agent nodes
      const nodesWithCallbacks = freshDiagramState.nodes.map(node => {
        if (node.type === 'agent' && node.data.manager) {
          return {
            ...node,
            data: {
              ...node.data,
              onEditManager: handleEditManager,
            },
          };
        }
        if (node.type === 'task') {
          return {
            ...node,
            data: {
              ...node.data,
              onEditTask: handleEditTask,
            },
          };
        }
        return node;
      });
      
      dispatch(updatedDiagramState({
        nodes: nodesWithCallbacks,
        edges: freshDiagramState.edges,
        hasCustomPositions: false,
      }));
    }
  }, [workflowState, iconsData, toolInstances, mcpInstances, agents, tasks, nodes.length, dispatch, handleEditManager, handleEditTask]);

  // Update diagram if any relevant agent/task/tool/mcp info changes
  useEffect(() => {
    if (!workflowState.workflowId) return;
    const newSignature = getDiagramDataSignature({ agents, tasks, toolInstances, mcpInstances, workflowState });
    if (prevDiagramSignature.current !== newSignature) {
      prevDiagramSignature.current = newSignature;
      const freshDiagramState = createDiagramStateFromWorkflow({
        workflowState,
        iconsData,
        toolInstances,
        mcpInstances,
        agents,
        tasks,
      });
      // Add the onEditManager callback to manager agent nodes
      const nodesWithCallbacks = freshDiagramState.nodes.map(node => {
        if (node.type === 'agent' && node.data.manager) {
          return {
            ...node,
            data: {
              ...node.data,
              onEditManager: handleEditManager,
            },
          };
        }
        if (node.type === 'task') {
          return {
            ...node,
            data: {
              ...node.data,
              onEditTask: handleEditTask,
            },
          };
        }
        return node;
      });
      dispatch(updatedDiagramState({
        nodes: nodesWithCallbacks,
        edges: freshDiagramState.edges,
        hasCustomPositions: false,
      }));
    }
  }, [workflowState, iconsData, toolInstances, mcpInstances, agents, tasks, dispatch, handleEditManager, handleEditTask]);

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
          // Always use fresh callbacks to prevent stale references
          onEditManager: node.type === 'agent' && node.data.manager ? handleEditManager : undefined,
          onEditTask: node.type === 'task' ? handleEditTask : undefined,
        },
      };
    });
  }, [nodes, processedState.activeNodes, handleEditManager, handleEditTask]);

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
      {workflowState.workflowId && (
        <SelectOrAddAgentModal 
          workflowId={workflowState.workflowId} 
          onClose={() => {
            // Clear task editing state when agent modal is closed
            dispatch(clearEditorTaskEditingState());
          }}
        />
      )}
      {workflowState.workflowId && (
        <SelectOrAddManagerAgentModal
          workflowId={workflowState.workflowId}
          isOpen={isManagerModalOpen}
          onClose={() => {
            setIsManagerModalOpen(false);
            // Clear task editing state when manager modal is closed
            dispatch(clearEditorTaskEditingState());
          }}
        />
      )}
    </Layout>
  );
};

export default WorkflowDiagram;
