import React, { useState, useMemo } from 'react';
import {
  Modal,
  Typography,
  Input,
  Layout,
  Card,
  Space,
  Button,
  Avatar,
  List,
  Divider,
  Tooltip,
  Image,
  Tag,
  Form,
} from 'antd';
import { WorkflowTemplateMetadata } from '@/studio/proto/agent_studio';
import {
  UserOutlined,
  UsergroupAddOutlined,
  FileDoneOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons';
import { useListTaskTemplatesQuery } from '../../tasks/tasksApi';
import { useListToolTemplatesQuery } from '../../tools/toolTemplatesApi';
import { useImageAssetsData } from '@/app/lib/hooks/useAssetData';
import { useListAgentTemplatesQuery } from '@/app/agents/agentApi';

const { Text, Title } = Typography;

interface WorkflowTemplateDetailsProps {
  template: WorkflowTemplateMetadata;
}

const WorkflowTemplateDetails: React.FC<WorkflowTemplateDetailsProps> = ({ template }) => {
  const { data: agentTemplates } = useListAgentTemplatesQuery({
    workflow_template_id: template.id,
  });
  const { data: toolTemplates } = useListToolTemplatesQuery({ workflow_template_id: template.id });
  const { data: taskTemplates } = useListTaskTemplatesQuery({ workflow_template_id: template.id });
  const managerAgentTemplate = template.manager_agent_template_id
    ? agentTemplates?.find((a) => a.id === template.manager_agent_template_id)
    : null;
  const agentTemplateDetails =
    template.agent_template_ids
      ?.map((id) => agentTemplates?.find((a) => a.id === id))
      .filter(Boolean) || [];

  // Create a map of tool template id to tool template data
  const toolTemplatesMap = useMemo(() => {
    if (!toolTemplates || toolTemplates.length === 0) {
      return {};
    }

    const map = toolTemplates.reduce(
      (acc, template) => {
        if (template && template.id) {
          acc[template.id] = template;
        }
        return acc;
      },
      {} as Record<string, any>,
    );

    return map;
  }, [toolTemplates]);

  // Get image URIs from tool templates
  const { imageData } = useImageAssetsData(
    toolTemplates
      ?.filter((template) => template?.tool_image_uri)
      .map((template) => template.tool_image_uri) || [],
  );

  return (
    <Layout className="bg-white">
      {/* Show Manager Agent Template if exists */}
      {managerAgentTemplate && (
        <>
          <Title level={5}>Manager Agent</Title>
          <List
            grid={{ gutter: 16, column: 2 }}
            dataSource={[managerAgentTemplate]}
            renderItem={(agent) => (
              <List.Item>
                <Layout className="rounded border border-[#f0f0f0] bg-white w-full h-[150px] p-0 flex flex-col shadow-[0_2px_4px_rgba(0,0,0,0.1)]">
                  <Layout className="flex-1 bg-transparent flex flex-col overflow-auto">
                    <div className="px-6 py-4 flex flex-row items-center gap-3">
                      <Avatar
                        className="shadow-[0_2px_4px_rgba(0,0,0,0.2)] bg-gray-300 min-w-[24px] min-h-[24px] w-6 h-6 flex-none"
                        size={24}
                        icon={<UsergroupAddOutlined />}
                      />
                      <Text
                        className="text-[14px] font-normal whitespace-nowrap overflow-hidden text-ellipsis"
                        title={agent.name}
                      >
                        {agent.name}
                      </Text>
                    </div>
                    <Text className="px-6 text-[11px] opacity-45 font-normal whitespace-nowrap overflow-hidden text-ellipsis">
                      Goal: <span className="text-black font-normal">{agent.goal || 'N/A'}</span>
                    </Text>
                    <Text className="px-6 text-[11px] opacity-45 font-normal whitespace-nowrap overflow-hidden text-ellipsis mt-2">
                      Backstory:{' '}
                      <span className="text-black font-normal">{agent.backstory || 'N/A'}</span>
                    </Text>
                  </Layout>
                </Layout>
              </List.Item>
            )}
          />
        </>
      )}

      {/* Show Default Manager if no manager agent template */}
      {!managerAgentTemplate && template.use_default_manager && (
        <>
          <Title level={5}>Manager Agent</Title>
          <List
            grid={{ gutter: 16, column: 2 }}
            dataSource={[
              {
                id: 'default-manager',
                name: 'Default Manager',
                description: 'Uses default LLM model to manage workflow tasks',
              },
            ]}
            renderItem={() => (
              <List.Item>
                <Layout className="rounded border border-[#f0f0f0] bg-white w-full h-10 p-0 flex flex-row items-center">
                  <div className="px-6 py-2 flex flex-row items-center gap-3">
                    <Avatar
                      className="shadow-[0_2px_4px_rgba(0,0,0,0.2)] bg-gray-300 min-w-[24px] min-h-[24px] w-6 h-6 flex-none"
                      size={24}
                      icon={<UsergroupAddOutlined />}
                    />
                    <Text className="text-[14px] font-normal whitespace-nowrap overflow-hidden text-ellipsis leading-6">
                      Default Manager
                    </Text>
                  </div>
                </Layout>
              </List.Item>
            )}
          />
        </>
      )}

      {/* Show Agent Templates */}
      <Title level={5} className="mt-5">
        Agents
      </Title>
      <List
        grid={{ gutter: 16, column: 2 }}
        dataSource={agentTemplateDetails}
        renderItem={(agent) => (
          <List.Item>
            <Layout className="rounded border border-[#f0f0f0] bg-white w-full h-[150px] p-0 flex flex-col shadow-[0_2px_4px_rgba(0,0,0,0.1)]">
              <Layout className="flex-1 bg-transparent flex flex-col overflow-auto">
                <div className="px-6 py-4 flex flex-row items-center gap-3">
                  <Avatar
                    className="shadow-[0_2px_4px_rgba(0,0,0,0.2)] bg-[#4b85d1] min-w-[24px] min-h-[24px] w-6 h-6 flex-none"
                    size={24}
                    icon={<UserOutlined />}
                  />
                  <Text
                    className="text-[14px] font-normal whitespace-nowrap overflow-hidden text-ellipsis"
                    title={agent?.name}
                  >
                    {agent?.name}
                  </Text>
                </div>
                <Text className="px-6 text-[11px] opacity-45 font-normal whitespace-nowrap overflow-hidden text-ellipsis">
                  Goal: <span className="text-black font-normal">{agent?.goal || 'N/A'}</span>
                </Text>
                <Text className="px-6 text-[11px] opacity-45 font-normal whitespace-nowrap overflow-hidden text-ellipsis mt-2">
                  Backstory:{' '}
                  <span className="text-black font-normal">{agent?.backstory || 'N/A'}</span>
                </Text>
                {/* Add Tool Icons Section */}
                {(agent!.tool_template_ids?.length ?? 0) > 0 && (
                  <Space className="mt-3 px-6 flex flex-wrap gap-2.5">
                    {agent!.tool_template_ids?.map((toolTemplateId) => {
                      const toolTemplate = toolTemplatesMap[toolTemplateId];
                      const imageUri = toolTemplate?.tool_image_uri;
                      const imageSrc =
                        imageUri && imageData[imageUri]
                          ? imageData[imageUri]
                          : '/fallback-image.png';

                      return (
                        <Tooltip
                          title={`${toolTemplate?.name || toolTemplateId}`}
                          key={`template-${toolTemplateId}`}
                          placement="top"
                        >
                          <div className="w-6 h-6 rounded-full bg-[#f1f1f1] flex items-center justify-center cursor-pointer border border-dashed border-[#d9d9d9]">
                            <Image
                              src={imageSrc}
                              alt={toolTemplate?.name || toolTemplateId}
                              width={16}
                              height={16}
                              preview={false}
                              className="rounded object-cover w-4 h-4"
                            />
                          </div>
                        </Tooltip>
                      );
                    })}
                  </Space>
                )}
              </Layout>
            </Layout>
          </List.Item>
        )}
      />

      {/* Show Task Templates */}
      <Title level={5} className="mt-5">
        Tasks
      </Title>
      <List
        dataSource={template.task_template_ids || []}
        renderItem={(taskId, index) => {
          const taskTemplate = taskTemplates?.find((t) => t.id === taskId);
          return (
            <List.Item>
              <Layout className="relative flex flex-row items-center justify-between h-[44px] shadow-[0_2px_4px_rgba(0,0,0,0.1)] border-0 gap-1.5 pl-12 pr-3 bg-white w-4/5">
                <Avatar
                  className="absolute left-6 shadow-[0_2px_4px_rgba(0,0,0,0.2)] bg-[#26bd67] min-w-[24px] min-h-[24px] w-6 h-6 flex-none"
                  size={24}
                  icon={<FileDoneOutlined />}
                />
                <Text ellipsis className="flex-basis-[60%] text-sm font-normal ml-3">
                  <span className="font-semibold">{`Task ${index + 1}: `}</span>
                  {taskTemplate?.description || 'No description'}
                </Text>
                {taskTemplate?.assigned_agent_template_id && (
                  <div className="w-[30%] flex justify-start overflow-hidden">
                    <Tooltip
                      title={
                        agentTemplates?.find(
                          (a) => a.id === taskTemplate.assigned_agent_template_id,
                        )?.name || 'Unassigned'
                      }
                    >
                      <Tag
                        icon={<UserOutlined />}
                        className="max-w-full text-[11px] font-normal bg-[#add8e6] border-none text-ellipsis overflow-hidden whitespace-nowrap flex items-center px-2 gap-1"
                      >
                        <span className="max-w-[80%] overflow-hidden text-ellipsis whitespace-nowrap block">
                          {agentTemplates?.find(
                            (a) => a.id === taskTemplate.assigned_agent_template_id,
                          )?.name || 'Unassigned'}
                        </span>
                      </Tag>
                    </Tooltip>
                  </div>
                )}
              </Layout>
            </List.Item>
          );
        }}
      />
    </Layout>
  );
};

interface WorkflowTemplateCardProps {
  template: WorkflowTemplateMetadata;
  selectedTemplate: WorkflowTemplateMetadata | null;
  setSelectedTemplate: any;
}

const WorkflowTemplateCard: React.FC<WorkflowTemplateCardProps> = ({
  template,
  selectedTemplate,
  setSelectedTemplate,
}) => {
  const { data: agentTemplates } = useListAgentTemplatesQuery({
    workflow_template_id: template.id,
  });

  return (
    <Card
      key={template.id}
      className={`cursor-pointer h-[180px] flex flex-col relative ${selectedTemplate?.id === template.id ? 'shadow-lg bg-green-100' : 'bg-white'}`}
      onClick={() => setSelectedTemplate(template)}
    >
      <Layout className="flex-1 bg-transparent flex flex-col pt-4">
        <Text
          className="text-sm font-normal whitespace-nowrap overflow-hidden text-ellipsis"
          title={template.name}
        >
          {template.name}
        </Text>
        <Text className="text-[11px] opacity-45 mt-1 whitespace-nowrap overflow-hidden text-ellipsis">
          {template.description}
        </Text>
        <Space className="mb-auto mt-6 flex flex-wrap gap-1.5">
          {template.agent_template_ids?.map((agentId, index) => {
            const agentIconsColorPalette = ['#a9ccb9', '#cca9a9', '#c4a9cc', '#ccc7a9'];
            const agentName =
              agentTemplates?.find((a) => a.id === agentId)?.name || `Agent ${index + 1}`;
            return (
              <Tooltip key={agentId} title={agentName}>
                <Button
                  className={`
                    text-black text-[10px] h-5 px-2 rounded
                    bg-[${agentIconsColorPalette[index % agentIconsColorPalette.length]}]
                  `}
                >
                  <UserOutlined className="text-[10px]" />
                </Button>
              </Tooltip>
            );
          })}
        </Space>
      </Layout>
    </Card>
  );
};

interface WorkflowGetStartModalProps {
  visible: boolean;
  onCancel: () => void;
  onCreateWorkflow: (name: string, templateId?: string) => void;
  workflowTemplates: WorkflowTemplateMetadata[];
}

const WorkflowGetStartModal: React.FC<WorkflowGetStartModalProps> = ({
  visible,
  onCancel,
  onCreateWorkflow,
  workflowTemplates,
}) => {
  const [form] = Form.useForm();
  const [selectedTemplate, setSelectedTemplate] = useState<WorkflowTemplateMetadata | null>(null);

  const handleCreateWorkflow = () => {
    form.validateFields().then((values) => {
      onCreateWorkflow(values.workflowName, selectedTemplate?.id);
    });
  };

  return (
    <Modal
      title={selectedTemplate ? 'Create From Template' : 'Create New Workflow'}
      open={visible}
      onCancel={onCancel}
      centered
      width="98%"
      className="!h-[95vh] !p-0"
      footer={[
        <Button key="cancel" onClick={onCancel}>
          Cancel
        </Button>,
        <Button key="create" type="primary" onClick={handleCreateWorkflow}>
          Create Workflow
        </Button>,
      ]}
    >
      <div className="overflow-y-auto h-[calc(95vh-108px)]">
        <Divider className="m-0 bg-[#f0f0f0]" />
        <Layout className="flex flex-row h-full bg-white">
          <Layout className="flex-1 overflow-y-auto p-4 bg-white">
            <Title level={5} className="mb-4">
              New
            </Title>
            <Card
              className={`mb-4 cursor-pointer ${!selectedTemplate ? 'shadow-[0_4px_8px_rgba(0,0,0,0.2)] bg-[#e6ffe6]' : 'bg-white'}`}
              onClick={() => setSelectedTemplate(null)}
            >
              <div className="flex items-center justify-between">
                <Space size={16}>
                  <div className="w-8 h-8 rounded-full bg-[#edf7ff] flex items-center justify-center">
                    <Image
                      src="/icon-partition.svg"
                      alt="New Workflow"
                      width={16}
                      height={16}
                      preview={false}
                    />
                  </div>
                  <div>
                    <div className="whitespace-nowrap overflow-hidden text-ellipsis">
                      New Workflow
                    </div>
                    <Text className="text-[11px] opacity-45 whitespace-nowrap overflow-hidden text-ellipsis">
                      Build your Agentic Workflow from scratch
                    </Text>
                  </div>
                </Space>
              </div>
            </Card>

            <Title level={5} className="mb-4">
              Templates
            </Title>
            <div className="grid [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))] gap-4 mt-2">
              {workflowTemplates.map((template, index) => {
                return (
                  <WorkflowTemplateCard
                    key={index}
                    template={template}
                    selectedTemplate={selectedTemplate}
                    setSelectedTemplate={setSelectedTemplate}
                  />
                );
              })}
            </div>
          </Layout>

          <Divider type="vertical" className="h-auto bg-[#f0f0f0] m-0" />

          <Layout className="flex-1 bg-white p-4 overflow-y-auto">
            <Title level={5} className="mb-4">
              Workflow Details
            </Title>
            <Form form={form} layout="vertical">
              <Form.Item
                label={
                  <Space>
                    Workflow Name
                    <Tooltip title="The name of your workflow">
                      <QuestionCircleOutlined className="text-[#666]" />
                    </Tooltip>
                  </Space>
                }
                name="workflowName"
                rules={[{ required: true, message: 'Workflow name is required' }]}
              >
                <Input onPressEnter={handleCreateWorkflow} />
              </Form.Item>
            </Form>

            {selectedTemplate && <WorkflowTemplateDetails template={selectedTemplate} />}
          </Layout>
        </Layout>
        <Divider className="m-0 bg-[#f0f0f0]" />
      </div>
    </Modal>
  );
};

export default WorkflowGetStartModal;
