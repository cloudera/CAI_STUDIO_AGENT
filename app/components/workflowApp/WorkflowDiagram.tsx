import { Layout } from 'antd';
import {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Controls,
  Node,
  Edge,
  ReactFlow,
  useReactFlow,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { createDiagramStateFromWorkflow, DiagramState } from '../../workflows/diagrams';
import { useCallback, useEffect, useState } from 'react';
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
  // React flow
  const { fitView } = useReactFlow();

  // Nodes and edges
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const onNodesChange = useCallback(
    (changes: any) => setNodes((prevState) => applyNodeChanges(changes, prevState)),
    [setNodes],
  );
  const onEdgesChange = useCallback(
    (changes: any) => setEdges((prevState) => applyEdgeChanges(changes, prevState)),
    [setEdges],
  );

  // Get image data for icons
  const { imageData: iconsData, refetch: refetchIconsData } = useImageAssetsData([
    ...(toolInstances?.map((t_) => t_.tool_image_uri) ?? []),
    ...(agents?.map((a_) => a_.agent_image_uri) ?? []),
    ...(mcpInstances?.map((m_) => m_.image_uri) ?? []),
  ]);

  // Add effect to refetch icons after 2 seconds if they are not loaded
  useEffect(() => {
    const timer = setTimeout(() => {
      refetchIconsData();
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const diagramState: DiagramState = createDiagramStateFromWorkflow({
      workflowState,
      iconsData,
      toolInstances,
      mcpInstances,
      agents,
      tasks,
    });
    setNodes((prevState) => diagramState.nodes);
    setEdges((prevState) => diagramState.edges);
  }, [workflowState, toolInstances, mcpInstances, agents, tasks, iconsData]);

  useEffect(() => {
    setTimeout(() => {
      fitView({ padding: 0.1 });
    }, 0); // Ensure it's called after the state update
  }, [nodes, edges]);

  useEffect(() => {
    // Process events into active nodes
    const { activeNodes } = events
      ? processEvents(
          events,
          agents || [],
          tasks || [],
          toolInstances || [],
          mcpInstances || [],
          workflowState.workflowMetadata.managerAgentId,
          workflowState.workflowMetadata.process,
        )
      : { activeNodes: [] };

    // Update nodes with pulsating border for active nodes
    setNodes((prevNodes) => {
      return prevNodes.map((node) => {
        const activeNode = activeNodes.find((n) => n.id === node.id);
        if (activeNode) {
          return {
            ...node,
            data: {
              ...node.data,
              active: true,
              info: activeNode.info,
              infoType: activeNode.infoType,
              isMostRecent: activeNode.isMostRecent,
              activeTool: activeNode.activeTool, // Only for McpNode
            },
          };
        } else {
          return {
            ...node,
            data: {
              ...node.data,
              active: false,
              info: undefined,
              infoType: undefined,
              isMostRecent: false,
            },
          };
        }
      });
    });
  }, [events]);

  return (
    <>
      <Layout
        style={{
          flexShrink: 0,
          flexGrow: 1,
          height: '100%',
          flexDirection: 'column',
          padding: 0,
          background: 'transparent',
        }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
        >
          <Controls />
          <Background />
        </ReactFlow>
      </Layout>
    </>
  );
};

export default WorkflowDiagram;
