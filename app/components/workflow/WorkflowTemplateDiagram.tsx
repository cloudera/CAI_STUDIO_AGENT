'use client';

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
import { 
  AgentTemplateMetadata, 
  TaskTemplateMetadata, 
  ToolTemplate,
  WorkflowTemplateMetadata 
} from '@/studio/proto/agent_studio';
import { useImageAssetsData } from '../../lib/hooks/useAssetData';
import { createDiagramStateFromTemplate } from '../../workflows/diagramTemplate';

const nodeTypes: NodeTypes = {
  agent: AgentNode,
  task: TaskNode,
  tool: ToolNode,
};

export interface WorkflowTemplateDiagramProps {
  template: WorkflowTemplateMetadata;
  toolTemplates?: ToolTemplate[];
  agentTemplates?: AgentTemplateMetadata[];
  taskTemplates?: TaskTemplateMetadata[];
}

const WorkflowTemplateDiagram: React.FC<WorkflowTemplateDiagramProps> = ({
  template,
  toolTemplates = [],
  agentTemplates = [],
  taskTemplates = [],
}) => {
  const { fitView } = useReactFlow();
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
    ...(toolTemplates?.map((t_) => t_.tool_image_uri) ?? []),
    ...(agentTemplates?.map((a_) => a_.agent_image_uri) ?? []),
  ]);

  // Add effect to refetch icons after 2 seconds if they are not loaded
  useEffect(() => {
    const timer = setTimeout(() => {
      refetchIconsData();
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    // Only create diagram when we have all required data
    if (!template || !toolTemplates || !agentTemplates || !taskTemplates) {
      return;
    }

    const diagramState = createDiagramStateFromTemplate({
      template,
      iconsData,
      toolTemplates,
      agentTemplates,
      taskTemplates,
    });

    setNodes(diagramState.nodes || []);
    setEdges(diagramState.edges || []);
  }, [template, toolTemplates, agentTemplates, taskTemplates, iconsData]);

  useEffect(() => {
    setTimeout(() => {
      fitView({ padding: 0.1 });
    }, 0);
  }, [nodes, edges]);

  return (
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
  );
};

export default WorkflowTemplateDiagram;
