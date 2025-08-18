'use client';

import React from 'react';
import { Layout, Typography, List, Space, Avatar, Tag, Image, Tooltip } from 'antd';
import { UserOutlined, UsergroupAddOutlined, FileDoneOutlined } from '@ant-design/icons';
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
  const { data: agentTemplates } = useListAgentTemplatesQuery({
    workflow_template_id: template.id,
  });
  const { data: taskTemplates } = useListTaskTemplatesQuery({ workflow_template_id: template.id });
  const { data: toolTemplates = [] } = useListToolTemplatesQuery({
    workflow_template_id: template.id,
  });

  // Get manager agent template if exists
  const managerAgentTemplate = template.manager_agent_template_id
    ? agentTemplates?.find((a) => a.id === template.manager_agent_template_id)
    : null;

  // Get agent templates
  const agentTemplateDetails =
    template.agent_template_ids
      ?.map((id) => agentTemplates?.find((a) => a.id === id))
      .filter(Boolean) || [];

  // Get image data for tools
  const { imageData } = useImageAssetsData(
    toolTemplates
      ?.filter((template) => template?.tool_image_uri)
      .map((template) => template.tool_image_uri) || [],
  );

  const renderAgentCard = (agent: any, isManager: boolean = false) => (
    <Layout
      key={agent.id}
      className="rounded border border-gray-200 bg-white w-full h-[150px] p-0 flex flex-col shadow-md"
    >
      <Layout className="flex-1 bg-transparent flex flex-col overflow-auto">
        <div className="p-4 flex items-center gap-3">
          <Avatar
            className={`shadow ${isManager ? 'bg-gray-300' : 'bg-blue-600'} min-w-[24px] min-h-[24px] w-6 h-6 flex-none`}
            size={24}
            icon={isManager ? <UsergroupAddOutlined /> : <UserOutlined />}
          />
          <Text
            className="text-sm font-normal whitespace-nowrap overflow-hidden text-ellipsis"
            title={agent.name}
          >
            {agent.name}
          </Text>
        </div>
        <Text className="px-6 text-[11px] opacity-45 font-normal whitespace-nowrap overflow-hidden text-ellipsis">
          Goal: <span className="text-black font-normal">{agent.goal || 'N/A'}</span>
        </Text>
        <Text className="px-6 text-[11px] opacity-45 font-normal whitespace-nowrap overflow-hidden text-ellipsis mt-2">
          Backstory: <span className="text-black font-normal">{agent.backstory || 'N/A'}</span>
        </Text>
        {agent.tool_template_ids?.length > 0 && (
          <Space className="mt-3 pl-6 pr-6 flex flex-wrap gap-2.5">
            {agent.tool_template_ids.map((toolTemplateId: string) => {
              const toolTemplate = toolTemplates.find((t) => t.id === toolTemplateId);
              const imageUri = toolTemplate?.tool_image_uri;
              const imageSrc =
                imageUri && imageData[imageUri] ? imageData[imageUri] : '/fallback-image.png';

              return (
                <Tooltip
                  title={toolTemplate?.name || toolTemplateId}
                  key={toolTemplateId}
                  placement="top"
                >
                  <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center cursor-pointer">
                    <Image
                      src={imageSrc}
                      alt={toolTemplate?.name || toolTemplateId}
                      width={16}
                      height={16}
                      preview={false}
                      className="rounded object-cover"
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
      <Layout className="relative flex flex-row items-center justify-between h-11 shadow-md border-0 gap-1.5 pl-12 pr-3 bg-white w-[80%]">
        <Avatar
          className="absolute left-6 shadow-md bg-green-500 min-w-[24px] min-h-[24px] w-6 h-6 flex-none"
          size={24}
          icon={<FileDoneOutlined />}
        />
        <Text ellipsis className="flex-basis-[60%] text-sm font-normal ml-3">
          <span className="font-semibold">{`Task ${index + 1}: `}</span>
          {taskTemplate?.description || 'No description'}
        </Text>
        {assignedAgent && (
          <div className="w-[30%] flex justify-start">
            <Tooltip title={assignedAgent.name || 'Unassigned'}>
              <Tag
                icon={<UserOutlined />}
                className="max-w-full text-[11px] font-normal bg-blue-200 border-none text-ellipsis overflow-hidden whitespace-nowrap flex items-center pl-2 pr-2 gap-1"
              >
                <span className="max-w-[80%] overflow-hidden text-ellipsis whitespace-nowrap block">
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
    <Layout className="p-4 bg-white">
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
            dataSource={[
              {
                id: 'default-manager',
                name: 'Default Manager',
                goal: 'Uses default LLM model to manage workflow tasks',
                backstory: null,
              },
            ]}
            renderItem={(agent) => <List.Item>{renderAgentCard(agent, true)}</List.Item>}
          />
        </>
      )}

      <Title level={5} className="mt-5">
        Agents
      </Title>
      <List
        grid={{ gutter: 16, column: 2 }}
        dataSource={agentTemplateDetails}
        renderItem={(agent) => <List.Item>{renderAgentCard(agent)}</List.Item>}
      />

      <Title level={5} className="mt-5">
        Tasks
      </Title>
      <List
        dataSource={template.task_template_ids || []}
        renderItem={(taskId, index) => <List.Item>{renderTaskCard(taskId, index)}</List.Item>}
      />
    </Layout>
  );
};

export default WorkflowTemplateDetails;
