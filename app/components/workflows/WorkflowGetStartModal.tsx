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
import { WorkflowTemplateMetadata, AgentTemplateMetadata } from '@/studio/proto/agent_studio';
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
    <Layout style={{ background: '#fff' }}>
      {/* Show Manager Agent Template if exists */}
      {managerAgentTemplate && (
        <>
          <Title level={5}>Manager Agent</Title>
          <List
            grid={{ gutter: 16, column: 2 }}
            dataSource={[managerAgentTemplate]}
            renderItem={(agent) => (
              <List.Item>
                <Layout
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
                    <div
                      style={{
                        padding: '16px 24px',
                        display: 'flex',
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: '12px',
                      }}
                    >
                      <Avatar
                        style={{
                          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
                          backgroundColor: 'lightgrey',
                          minWidth: '24px',
                          minHeight: '24px',
                          width: '24px',
                          height: '24px',
                          flex: '0 0 24px',
                        }}
                        size={24}
                        icon={<UsergroupAddOutlined />}
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
                      Goal:{' '}
                      <span style={{ color: 'black', fontWeight: 400 }}>{agent.goal || 'N/A'}</span>
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
                      <span style={{ color: 'black', fontWeight: 400 }}>
                        {agent.backstory || 'N/A'}
                      </span>
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
                <Layout
                  style={{
                    borderRadius: '4px',
                    border: 'solid 1px #f0f0f0',
                    backgroundColor: '#fff',
                    width: '100%',
                    height: '40px',
                    padding: '0',
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                  }}
                >
                  <div
                    style={{
                      padding: '8px 24px',
                      display: 'flex',
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: '12px',
                    }}
                  >
                    <Avatar
                      style={{
                        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
                        backgroundColor: 'lightgrey',
                        minWidth: '24px',
                        minHeight: '24px',
                        width: '24px',
                        height: '24px',
                        flex: '0 0 24px',
                      }}
                      size={24}
                      icon={<UsergroupAddOutlined />}
                    />
                    <Text
                      style={{
                        fontSize: '14px',
                        fontWeight: 400,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        lineHeight: '24px',
                      }}
                    >
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
      <Title level={5} style={{ marginTop: '20px' }}>
        Agents
      </Title>
      <List
        grid={{ gutter: 16, column: 2 }}
        dataSource={agentTemplateDetails}
        renderItem={(agent) => (
          <List.Item>
            <Layout
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
                <div
                  style={{
                    padding: '16px 24px',
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: '12px',
                  }}
                >
                  <Avatar
                    style={{
                      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
                      backgroundColor: '#4b85d1',
                      minWidth: '24px',
                      minHeight: '24px',
                      width: '24px',
                      height: '24px',
                      flex: '0 0 24px',
                    }}
                    size={24}
                    icon={<UserOutlined />}
                  />
                  <Text
                    style={{
                      fontSize: '14px',
                      fontWeight: 400,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    title={agent?.name}
                  >
                    {agent?.name}
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
                  Goal:{' '}
                  <span style={{ color: 'black', fontWeight: 400 }}>{agent?.goal || 'N/A'}</span>
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
                  <span style={{ color: 'black', fontWeight: 400 }}>
                    {agent?.backstory || 'N/A'}
                  </span>
                </Text>
                {/* Add Tool Icons Section */}
                {(agent!.tool_template_ids?.length ?? 0) > 0 && (
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
                              border: '1px dashed #d9d9d9',
                            }}
                          >
                            <Image
                              src={imageSrc}
                              alt={toolTemplate?.name || toolTemplateId}
                              width={16}
                              height={16}
                              preview={false}
                              style={{
                                borderRadius: '2px',
                                objectFit: 'cover',
                              }}
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
      <Title level={5} style={{ marginTop: '20px' }}>
        Tasks
      </Title>
      <List
        dataSource={template.task_template_ids || []}
        renderItem={(taskId, index) => {
          const taskTemplate = taskTemplates?.find((t) => t.id === taskId);
          return (
            <List.Item>
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
                <Text
                  ellipsis
                  style={{ flexBasis: '60%', fontSize: 13, fontWeight: 400, marginLeft: '12px' }}
                >
                  <span style={{ fontWeight: 600 }}>{`Task ${index + 1}: `}</span>
                  {taskTemplate?.description || 'No description'}
                </Text>
                {taskTemplate?.assigned_agent_template_id && (
                  <div style={{ width: '30%', display: 'flex', justifyContent: 'flex-start' }}>
                    <Tooltip
                      title={
                        agentTemplates?.find(
                          (a) => a.id === taskTemplate.assigned_agent_template_id,
                        )?.name || 'Unassigned'
                      }
                    >
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
                        <span
                          style={{
                            maxWidth: '80%',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            display: 'block',
                          }}
                        >
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
      style={{
        cursor: 'pointer',
        boxShadow: selectedTemplate?.id === template.id ? '0 4px 8px rgba(0, 0, 0, 0.2)' : 'none',
        backgroundColor: selectedTemplate?.id === template.id ? '#e6ffe6' : '#fff',
        height: '180px',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
      }}
      onClick={() => setSelectedTemplate(template)}
    >
      <Layout
        style={{
          flex: 1,
          background: 'transparent',
          display: 'flex',
          flexDirection: 'column',
          paddingTop: '16px',
        }}
      >
        <Text
          style={{
            fontSize: '14px',
            fontWeight: 400,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          title={template.name}
        >
          {template.name}
        </Text>
        <Text
          style={{
            fontSize: '11px',
            opacity: 0.45,
            marginTop: '4px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {template.description}
        </Text>
        <Space
          style={{
            marginBottom: 'auto',
            marginTop: '24px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '6px',
          }}
        >
          {template.agent_template_ids?.map((agentId, index) => {
            const agentIconsColorPalette = ['#a9ccb9', '#cca9a9', '#c4a9cc', '#ccc7a9'];
            const agentName =
              agentTemplates?.find((a) => a.id === agentId)?.name || `Agent ${index + 1}`;
            return (
              <Tooltip key={agentId} title={agentName}>
                <Button
                  style={{
                    backgroundColor: agentIconsColorPalette[index % agentIconsColorPalette.length],
                    color: 'black',
                    fontSize: '10px',
                    height: '20px',
                    padding: '0 8px',
                    borderRadius: '4px',
                  }}
                >
                  <UserOutlined style={{ fontSize: '10px' }} />
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
      style={{ height: '95vh', padding: '0px' }}
      footer={[
        <Button key="cancel" onClick={onCancel}>
          Cancel
        </Button>,
        <Button key="create" type="primary" onClick={handleCreateWorkflow}>
          Create Workflow
        </Button>,
      ]}
    >
      <div style={{ overflowY: 'auto', height: 'calc(95vh - 108px)' }}>
        <Divider style={{ margin: 0, backgroundColor: '#f0f0f0' }} />
        <Layout
          style={{ display: 'flex', flexDirection: 'row', height: '100%', backgroundColor: '#fff' }}
        >
          <Layout style={{ flex: 1, overflowY: 'auto', padding: '16px', backgroundColor: '#fff' }}>
            <Title level={5} style={{ marginBottom: '16px' }}>
              New
            </Title>
            <Card
              style={{
                marginBottom: 16,
                cursor: 'pointer',
                boxShadow: !selectedTemplate ? '0 4px 8px rgba(0, 0, 0, 0.2)' : 'none',
                backgroundColor: !selectedTemplate ? '#e6ffe6' : '#fff',
              }}
              onClick={() => setSelectedTemplate(null)}
            >
              <div
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <Space size={16}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      backgroundColor: '#edf7ff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Image
                      src="/icon-partition.svg"
                      alt="New Workflow"
                      width={16}
                      height={16}
                      preview={false}
                    />
                  </div>
                  <div>
                    <div
                      style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                    >
                      New Workflow
                    </div>
                    <Text
                      style={{
                        fontSize: '11px',
                        opacity: 0.45,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      Build your Agentic Workflow from scratch
                    </Text>
                  </div>
                </Space>
              </div>
            </Card>

            <Title level={5} style={{ marginBottom: '16px' }}>
              Templates
            </Title>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                gap: 16,
                marginTop: 8,
              }}
            >
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

          <Divider
            type="vertical"
            style={{ height: 'auto', backgroundColor: '#f0f0f0', margin: 0 }}
          />

          <Layout style={{ flex: 1, backgroundColor: '#fff', padding: '16px', overflowY: 'auto' }}>
            <Title level={5} style={{ marginBottom: '16px' }}>
              Workflow Details
            </Title>
            <Form form={form} layout="vertical">
              <Form.Item
                label={
                  <Space>
                    Workflow Name
                    <Tooltip title="The name of your workflow">
                      <QuestionCircleOutlined style={{ color: '#666' }} />
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
        <Divider style={{ margin: 0, backgroundColor: '#f0f0f0' }} />
      </div>
    </Modal>
  );
};

export default WorkflowGetStartModal;
