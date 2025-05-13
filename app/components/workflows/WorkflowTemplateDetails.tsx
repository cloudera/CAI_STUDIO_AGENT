'use client';

import React from 'react';
import { Layout, Typography, List, Space, Avatar, Tag, Image, Tooltip } from 'antd';
import {
  UserOutlined,
  UsergroupAddOutlined,
  FileDoneOutlined,
} from '@ant-design/icons';
import { useListAgentTemplatesQuery } from '../../agents/agentApi';
import { useListTaskTemplatesQuery } from '../../tasks/tasksApi';
import { useListToolTemplatesQuery } from '../../tools/toolTemplatesApi';
import { useImageAssetsData } from '@/app/lib/hooks/useAssetData';
import { WorkflowTemplateMetadata } from '@/studio/proto/agent_studio';

const { Title, Text } = Typography;

interface WorkflowTemplateDetailsProps {
  template: WorkflowTemplateMetadata;
}

const WorkflowTemplateDetails: React.FC<WorkflowTemplateDetailsProps> = ({ template }) => {
  const { data: agentTemplates } = useListAgentTemplatesQuery({workflow_template_id: template.id})
  const { data: taskTemplates } = useListTaskTemplatesQuery({workflow_template_id: template.id});
  const { data: toolTemplates = [] } = useListToolTemplatesQuery({workflow_template_id: template.id});

  // Get manager agent template if exists
  const managerAgentTemplate = template.manager_agent_template_id
    ? agentTemplates?.find((a) => a.id === template.manager_agent_template_id)
    : null;

  // Get agent templates
  const agentTemplateDetails = template.agent_template_ids
    ?.map((id) => agentTemplates?.find((a) => a.id === id))
    .filter(Boolean) || [];

  // Get image data for tools
  const { imageData } = useImageAssetsData(
    toolTemplates
      ?.filter((template) => template?.tool_image_uri)
      .map((template) => template.tool_image_uri) || []
  );

  const renderAgentCard = (agent: any, isManager: boolean = false) => (
    <Layout
      key={agent.id}
      style={{
        borderRadius: '4px',
        border: 'solid 1px #f0f0f0',
        backgroundColor: '#fff',
        width: '100%',
        height: '150px',
        padding: '0',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
      }}
    >
      <Layout
        style={{
          flex: 1,
          background: 'transparent',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'auto',
        }}
      >
        <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Avatar
            style={{
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
              backgroundColor: isManager ? 'lightgrey' : '#4b85d1',
              minWidth: '24px',
              minHeight: '24px',
              width: '24px',
              height: '24px',
              flex: '0 0 24px',
            }}
            size={24}
            icon={isManager ? <UsergroupAddOutlined /> : <UserOutlined />}
          />
          <Text
            style={{
              fontSize: '14px',
              fontWeight: 400,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            title={agent.name}
          >
            {agent.name}
          </Text>
        </div>
        <Text
          style={{
            padding: '0 24px',
            fontSize: '11px',
            opacity: 0.45,
            fontWeight: 400,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          Goal: <span style={{ color: 'black', fontWeight: 400 }}>{agent.goal || 'N/A'}</span>
        </Text>
        <Text
          style={{
            padding: '0 24px',
            fontSize: '11px',
            opacity: 0.45,
            fontWeight: 400,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            marginTop: '8px',
          }}
        >
          Backstory:{' '}
          <span style={{ color: 'black', fontWeight: 400 }}>{agent.backstory || 'N/A'}</span>
        </Text>
        {agent.tool_template_ids?.length > 0 && (
          <Space
            style={{
              marginTop: '12px',
              paddingLeft: '24px',
              paddingRight: '24px',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '10px',
            }}
          >
            {agent.tool_template_ids.map((toolTemplateId: string) => {
              const toolTemplate = toolTemplates.find((t) => t.id === toolTemplateId);
              const imageUri = toolTemplate?.tool_image_uri;
              const imageSrc = imageUri && imageData[imageUri] ? imageData[imageUri] : '/fallback-image.png';

              return (
                <Tooltip title={toolTemplate?.name || toolTemplateId} key={toolTemplateId} placement="top">
                  <div
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      background: '#f1f1f1',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    <Image
                      src={imageSrc}
                      alt={toolTemplate?.name || toolTemplateId}
                      width={16}
                      height={16}
                      preview={false}
                      style={{ borderRadius: '2px', objectFit: 'cover' }}
                    />
                  </div>
                </Tooltip>
              );
            })}
          </Space>
        )}
      </Layout>
    </Layout>
  );

  const renderTaskCard = (taskId: string, index: number) => {
    const taskTemplate = taskTemplates?.find((t) => t.id === taskId);
    const assignedAgent = taskTemplate?.assigned_agent_template_id
      ? agentTemplates?.find((a) => a.id === taskTemplate.assigned_agent_template_id)
      : null;

    return (
      <Layout
        style={{
          position: 'relative',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 44,
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
          borderWidth: 0,
          gap: 6,
          paddingLeft: 48,
          paddingRight: 12,
          background: 'white',
          width: '80%',
        }}
      >
        <Avatar
          style={{
            position: 'absolute',
            left: 24,
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
            backgroundColor: '#26bd67',
            minWidth: '24px',
            minHeight: '24px',
            width: '24px',
            height: '24px',
            flex: '0 0 24px',
          }}
          size={24}
          icon={<FileDoneOutlined />}
        />
        <Text ellipsis style={{ flexBasis: '60%', fontSize: 13, fontWeight: 400, marginLeft: '12px' }}>
          <span style={{ fontWeight: 600 }}>{`Task ${index + 1}: `}</span>
          {taskTemplate?.description || 'No description'}
        </Text>
        {assignedAgent && (
          <div style={{ width: '30%', display: 'flex', justifyContent: 'flex-start' }}>
            <Tooltip title={assignedAgent.name || 'Unassigned'}>
              <Tag
                icon={<UserOutlined />}
                style={{
                  maxWidth: '100%',
                  fontSize: 11,
                  fontWeight: 400,
                  backgroundColor: '#add8e6',
                  border: 'none',
                  textOverflow: 'ellipsis',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                  display: 'flex',
                  alignItems: 'center',
                  paddingLeft: 8,
                  paddingRight: 8,
                  gap: 4,
                }}
              >
                <span style={{ maxWidth: '80%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                  {assignedAgent.name || 'Unassigned'}
                </span>
              </Tag>
            </Tooltip>
          </div>
        )}
      </Layout>
    );
  };

  return (
    <Layout style={{ padding: '16px', background: '#fff' }}>
      {managerAgentTemplate && (
        <>
          <Title level={5}>Manager Agent</Title>
          <List
            grid={{ gutter: 16, column: 2 }}
            dataSource={[managerAgentTemplate]}
            renderItem={(agent) => <List.Item>{renderAgentCard(agent, true)}</List.Item>}
          />
        </>
      )}

      {template.use_default_manager && !managerAgentTemplate && (
        <>
          <Title level={5}>Manager Agent</Title>
          <List
            grid={{ gutter: 16, column: 2 }}
            dataSource={[{
              id: 'default-manager',
              name: 'Default Manager',
              goal: 'Uses default LLM model to manage workflow tasks',
              backstory: null,
            }]}
            renderItem={(agent) => <List.Item>{renderAgentCard(agent, true)}</List.Item>}
          />
        </>
      )}

      <Title level={5} style={{ marginTop: '20px' }}>Agents</Title>
      <List
        grid={{ gutter: 16, column: 2 }}
        dataSource={agentTemplateDetails}
        renderItem={(agent) => <List.Item>{renderAgentCard(agent)}</List.Item>}
      />

      <Title level={5} style={{ marginTop: '20px' }}>Tasks</Title>
      <List
        dataSource={template.task_template_ids || []}
        renderItem={(taskId, index) => <List.Item>{renderTaskCard(taskId, index)}</List.Item>}
      />
    </Layout>
  );
};

export default WorkflowTemplateDetails;
