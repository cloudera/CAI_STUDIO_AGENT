'use client';

import { Alert, Layout, Tabs, Spin } from 'antd';
import { ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ApiOutlined } from '@ant-design/icons';
import WorkflowTemplateDiagram from './WorkflowTemplateDiagram';
import { useListAgentTemplatesQuery } from '../../agents/agentApi';
import { useListTaskTemplatesQuery } from '../../tasks/tasksApi';
import { useListToolTemplatesQuery } from '../../tools/toolTemplatesApi';
import { useListMcpTemplatesQuery } from '../../mcp/mcpTemplatesApi';
import { WorkflowTemplateMetadata } from '@/studio/proto/agent_studio';

interface WorkflowTemplateDiagramViewProps {
  template: WorkflowTemplateMetadata;
}

const WorkflowTemplateDiagramView = ({ template }: WorkflowTemplateDiagramViewProps) => {
  const { data: agentTemplates, isLoading: agentsLoading } = useListAgentTemplatesQuery({
    workflow_template_id: template.id,
  });
  const { data: taskTemplates, isLoading: tasksLoading } = useListTaskTemplatesQuery({
    workflow_template_id: template.id,
  });
  const { data: toolTemplates, isLoading: toolsLoading } = useListToolTemplatesQuery({
    workflow_template_id: template.id,
  });
  const { data: mcpTemplates, isLoading: mcpLoading } = useListMcpTemplatesQuery({
    workflow_template_id: template.id,
  });

  const isLoading = agentsLoading || tasksLoading || toolsLoading || mcpLoading;

  if (isLoading) {
    return (
      <Layout className="flex justify-center items-center h-full">
        <Spin size="large" />
      </Layout>
    );
  }

  if (!agentTemplates || !taskTemplates || !toolTemplates || !mcpTemplates) {
    return (
      <Alert message="Error" description="Failed to load template data" type="error" showIcon />
    );
  }

  // Get manager agent template if exists
  // removed unused managerAgentTemplate

  // Get agent templates
  // removed unused agentTemplateDetails

  return (
    <Layout className="bg-transparent flex flex-col h-full w-full">
      <Tabs
        defaultActiveKey="1"
        className="w-full p-1 h-full"
        items={[
          {
            key: '1',
            label: (
              <span className="flex items-center gap-2">
                <ApiOutlined className="text-white bg-blue-500 rounded-full w-6 h-6 flex items-center justify-center p-1" />
                Flow Diagram
              </span>
            ),
            children: (
              <div className="h-full w-full">
                <ReactFlowProvider>
                  <WorkflowTemplateDiagram
                    template={template}
                    toolTemplates={toolTemplates}
                    agentTemplates={agentTemplates}
                    taskTemplates={taskTemplates}
                    mcpTemplates={mcpTemplates}
                  />
                </ReactFlowProvider>
              </div>
            ),
          },
        ]}
      />
    </Layout>
  );
};

export default WorkflowTemplateDiagramView;
