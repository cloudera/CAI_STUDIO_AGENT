'use client';

import { Alert, Layout, Tabs, Spin } from 'antd';
import { ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ApiOutlined } from '@ant-design/icons';
import WorkflowTemplateDiagram from './WorkflowTemplateDiagram';
import { useListAgentTemplatesQuery } from '../../agents/agentApi';
import { useListTaskTemplatesQuery } from '../../tasks/tasksApi';
import { useListToolTemplatesQuery } from '../../tools/toolTemplatesApi';
import { WorkflowTemplateMetadata } from '@/studio/proto/agent_studio';

interface WorkflowTemplateDiagramViewProps {
  template: WorkflowTemplateMetadata;
}

const WorkflowTemplateDiagramView: React.FC<WorkflowTemplateDiagramViewProps> = ({ template }) => {
  const { data: agentTemplates, isLoading: agentsLoading } = useListAgentTemplatesQuery({workflow_template_id: template.id});
  const { data: taskTemplates, isLoading: tasksLoading } = useListTaskTemplatesQuery({workflow_template_id: template.id});
  const { data: toolTemplates, isLoading: toolsLoading } = useListToolTemplatesQuery({workflow_template_id: template.id});

  const isLoading = agentsLoading || tasksLoading || toolsLoading;

  if (isLoading) {
    return (
      <Layout style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <Spin size="large" />
      </Layout>
    );
  }

  if (!agentTemplates || !taskTemplates || !toolTemplates) {
    return (
      <Alert
        message="Error"
        description="Failed to load template data"
        type="error"
        showIcon
      />
    );
  }

  // Get manager agent template if exists
  const managerAgentTemplate = template.manager_agent_template_id
    ? agentTemplates?.find((a) => a.id === template.manager_agent_template_id)
    : null;

  // Get agent templates
  const agentTemplateDetails = template.agent_template_ids
    ?.map((id) => agentTemplates?.find((a) => a.id === id))
    .filter(Boolean) || [];

  return (
    <Layout
      style={{
        background: 'transparent',
        flexDirection: 'column',
        display: 'flex',
        height: '100%',
        width: '100%',
      }}
    >
      <Tabs
        defaultActiveKey="1"
        style={{
          width: '100%',
          padding: '4px',
          height: '100%',
        }}
        items={[
          {
            key: '1',
            label: (
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ApiOutlined
                  style={{
                    color: 'white',
                    background: '#1890ff',
                    borderRadius: '50%',
                    width: '24px',
                    height: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '4px',
                  }}
                />
                Flow Diagram
              </span>
            ),
            children: (
              <div style={{ height: '100%', width: '100%' }}>
                <ReactFlowProvider>
                  <WorkflowTemplateDiagram
                    template={template}
                    toolTemplates={toolTemplates}
                    agentTemplates={agentTemplates}
                    taskTemplates={taskTemplates}
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
