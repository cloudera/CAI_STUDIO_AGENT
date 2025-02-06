import React, { useEffect, useState } from 'react';
import {
  Modal,
  Button,
  List,
  Layout,
  Typography,
  Form,
  Input,
  Divider,
  Space,
  Tooltip,
  Image,
  Avatar,
  Alert,
  Popconfirm,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  QuestionCircleOutlined,
  UserOutlined,
} from '@ant-design/icons';
import {
  useListGlobalAgentTemplatesQuery,
  useAddAgentMutation,
  useUpdateAgentMutation,
  useListAgentsQuery,
} from '../agents/agentApi';
import { useAppDispatch, useAppSelector } from '../lib/hooks/hooks';
import {
  updatedEditorAgentViewOpen,
  selectEditorAgentViewIsOpen,
  selectEditorAgentViewStep,
  addedEditorWorkflowAgent,
  selectEditorWorkflowId,
  selectEditorAgentViewCreateAgentTools,
  selectEditorAgentViewCreateAgentState,
  updatedEditorAgentViewCreateAgentToolTemplates,
  selectEditorAgentViewCreateAgentToolTemplates,
  updatedEditorAgentViewCreateAgentState,
  updatedEditorWorkflowId,
  selectEditorWorkflow,
  updatedEditorWorkflowAgentIds,
} from '../workflows/editorSlice';
import { AgentTemplateMetadata } from '@/studio/proto/agent_studio';
import { useListGlobalToolTemplatesQuery } from '@/app/tools/toolTemplatesApi';
import { useImageAssetsData } from '@/app/lib/hooks/useAssetData';
import WorkflowAddToolModal from './WorkflowAddToolModal';
import { useSelector } from 'react-redux';
import { useAddWorkflowMutation, useUpdateWorkflowMutation } from '../workflows/workflowsApi';
import { createAddRequestFromEditor, createUpdateRequestFromEditor } from '../lib/workflow';
import { useGlobalNotification } from './Notifications';
import WorkflowViewToolModal from './WorkflowViewToolModal';
import { AgentMetadata } from '@/studio/proto/agent_studio';
import {
  useListToolInstancesQuery,
  useRemoveToolInstanceMutation,
} from '@/app/tools/toolInstancesApi';
import { CrewAIAgentMetadata } from '@/studio/proto/agent_studio';

const { Text } = Typography;
const { TextArea } = Input;

interface SelectAgentComponentProps {
  form: any;
  selectedAgentTemplate: AgentTemplateMetadata | null;
  setSelectedAgentTemplate: React.Dispatch<React.SetStateAction<AgentTemplateMetadata | null>>;
  agents?: AgentMetadata[];
  workflowAgentIds?: string[];
  toolInstances: Record<string, any>;
  imageData: Record<string, string>;
  selectedAssignedAgent: AgentMetadata | null;
  setSelectedAssignedAgent: React.Dispatch<React.SetStateAction<AgentMetadata | null>>;
  updateAgent: any;
  createAgentState: any;
}

const SelectAgentComponent: React.FC<SelectAgentComponentProps> = ({
  form,
  selectedAgentTemplate,
  setSelectedAgentTemplate,
  agents,
  workflowAgentIds,
  toolInstances,
  imageData,
  selectedAssignedAgent,
  setSelectedAssignedAgent,
  updateAgent,
  createAgentState,
}) => {
  const { data: agentTemplates = [] } = useListGlobalAgentTemplatesQuery();
  const { data: toolTemplates = [] } = useListGlobalToolTemplatesQuery({});
  const { imageData: toolIconsData, refetch: refetchToolImages } = useImageAssetsData(
    toolTemplates.map((tool) => tool.tool_image_uri),
  );
  const dispatch = useAppDispatch();
  const [isAddToolModalVisible, setAddToolModalVisible] = useState(false);
  const tools = useSelector(selectEditorAgentViewCreateAgentTools);
  const [toolDetails, setToolDetails] = useState<{
    name: string;
    description: string;
    pythonCode: string;
    pythonRequirements: string;
  }>({
    name: '',
    description: '',
    pythonCode: '',
    pythonRequirements: '',
  });
  const notificationApi = useGlobalNotification();
  const [isViewToolModalVisible, setViewToolModalVisible] = useState(false);
  const [isCreateMode, setIsCreateMode] = useState(false);
  const [deleteToolInstance] = useRemoveToolInstanceMutation();
  const { refetch: refetchAgents } = useListAgentsQuery({});
  const combinedToolTemplates = [
    ...new Set(useSelector(selectEditorAgentViewCreateAgentToolTemplates) || []),
  ];

  const toolTemplateCache = toolTemplates.reduce((acc: Record<string, any>, template: any) => {
    acc[template.id] = {
      name: template.name,
      imageURI: template.tool_image_uri,
    };
    return acc;
  }, {});

  // Filter agent templates to only show those with allow_delegation: false
  const filteredAgentTemplates = agentTemplates.filter(
    (template) => template.allow_delegation === false,
  );

  // Add refetch for tool instances
  const { data: toolInstancesList = [], refetch: refetchToolInstances } = useListToolInstancesQuery(
    {},
  );

  // Add effect to refetch when tool instances are updated
  useEffect(() => {
    const refreshData = async () => {
      await refetchToolInstances();
      await refetchToolImages();
    };
    refreshData();
  }, [toolInstancesList.length]);

  useEffect(() => {
    if (selectedAgentTemplate) {
      form.setFieldsValue({
        name: selectedAgentTemplate.name,
        role: selectedAgentTemplate.role,
        backstory: selectedAgentTemplate.backstory,
        goal: selectedAgentTemplate.goal,
      });
    } else {
      form.resetFields();
    }
  }, [selectedAgentTemplate, form]);

  useEffect(() => {
    if (selectedAgentTemplate?.tool_template_ids) {
      dispatch(
        updatedEditorAgentViewCreateAgentToolTemplates(selectedAgentTemplate.tool_template_ids),
      );
    } else {
      dispatch(updatedEditorAgentViewCreateAgentToolTemplates([]));
    }
  }, [selectedAgentTemplate, dispatch]);

  // Add this useEffect to force form updates when selectedAssignedAgent changes
  useEffect(() => {
    if (selectedAssignedAgent) {
      // Force form reset and update
      form.resetFields();
      setTimeout(() => {
        form.setFieldsValue({
          name: selectedAssignedAgent.name,
          role: (selectedAssignedAgent.crew_ai_agent_metadata as CrewAIAgentMetadata)?.role || '',
          backstory: selectedAssignedAgent.crew_ai_agent_metadata?.backstory || '',
          goal: selectedAssignedAgent.crew_ai_agent_metadata?.goal || '',
        });
      }, 0);
    }
  }, [selectedAssignedAgent, form]);

  // Add this effect to update selectedAssignedAgent when agents change
  useEffect(() => {
    if (selectedAssignedAgent) {
      const updatedAgent = (agents || []).find((a) => a.id === selectedAssignedAgent.id);
      if (updatedAgent) {
        setSelectedAssignedAgent(updatedAgent);
      }
    }
  }, [agents, selectedAssignedAgent]);

  useEffect(() => {
    // Set create mode and clear form on initial load
    setIsCreateMode(true);
    setSelectedAgentTemplate(null);
    setSelectedAssignedAgent(null);
    dispatch(
      updatedEditorAgentViewCreateAgentState({
        name: '',
        role: '',
        backstory: '',
        goal: '',
        tools: [],
      }),
    );
    form.resetFields();
  }, []); // Empty dependency array means this runs once on mount

  const handleCreateAgentClick = () => {
    setIsCreateMode(true);
    setSelectedAgentTemplate(null);
    setSelectedAssignedAgent(null);
    dispatch(
      updatedEditorAgentViewCreateAgentState({
        name: '',
        role: '',
        backstory: '',
        goal: '',
        tools: [],
      }),
    );
    form.resetFields(); // Clear the form
  };

  const handleSelectAgentTemplate = (template: AgentTemplateMetadata) => {
    setSelectedAgentTemplate(template);
    setSelectedAssignedAgent(null);
    setIsCreateMode(false);
    dispatch(
      updatedEditorAgentViewCreateAgentState({
        name: template.name,
        role: template.role,
        backstory: template.backstory,
        goal: template.goal,
        toolTemplateIds: template.tool_template_ids || [],
      }),
    );
  };

  const handleViewToolDetails = (toolId: string) => {
    const tool = toolTemplates.find((t) => t.id === toolId);
    if (tool) {
      setToolDetails({
        name: tool.name,
        description: tool.tool_description || '',
        pythonCode: tool.python_code || '',
        pythonRequirements: tool.python_requirements || '',
      });
      setViewToolModalVisible(true);
    }
  };

  const handleDeleteTool = async (toolId: string, toolName: string) => {
    if (selectedAgentTemplate) return;

    // Initial notification about starting the deletion process
    notificationApi.info({
      message: 'Initiating Tool Removal',
      description: `Starting to remove ${toolName} from the agent...`,
      placement: 'topRight',
    });

    try {
      // Delete tool instance
      await deleteToolInstance({ tool_instance_id: toolId }).unwrap();

      // Notification about successful tool deletion
      notificationApi.success({
        message: 'Tool Deletion In Progress',
        description: `${toolName} will be removed in a few seconds after cleanup of remaining artifacts.`,
        placement: 'topRight',
        duration: 5,
      });

      if (selectedAssignedAgent) {
        const updatedToolIds = (selectedAssignedAgent.tools_id || []).filter((id) => id !== toolId);

        await updateAgent({
          agent_id: selectedAssignedAgent.id,
          name: form.getFieldValue('name'),
          crew_ai_agent_metadata: {
            role: form.getFieldValue('role'),
            backstory: form.getFieldValue('backstory'),
            goal: form.getFieldValue('goal'),
            allow_delegation: false,
            verbose: false,
            cache: false,
            temperature: 0.1,
            max_iter: 0,
          },
          tools_id: updatedToolIds,
          tool_template_ids: [],
          llm_provider_model_id: '',
        }).unwrap();

        setSelectedAssignedAgent({
          ...selectedAssignedAgent,
          tools_id: updatedToolIds,
        });

        // Final success notification after agent update
        notificationApi.success({
          message: 'Agent Updated',
          description: `Agent configuration has been updated successfully.`,
          placement: 'topRight',
        });
      } else {
        const updatedTools = (createAgentState?.tools || []).filter((id: string) => id !== toolId);
        dispatch(
          updatedEditorAgentViewCreateAgentState({
            ...createAgentState,
            tools: updatedTools,
          }),
        );
      }
    } catch (error: unknown) {
      const errorMessage =
        (error as { data?: { error?: string } })?.data?.error ||
        'Failed to remove tool. Please try again.';
      notificationApi.error({
        message: 'Error Removing Tool',
        description: errorMessage,
        placement: 'topRight',
      });
    }
  };

  const handleSelectAssignedAgent = (agent: AgentMetadata) => {
    // Aggressively reset everything first
    setIsCreateMode(false);
    setSelectedAgentTemplate(null);
    form.resetFields();

    // Force immediate form update
    setTimeout(() => {
      form.setFieldsValue({
        name: agent.name,
        role: (agent.crew_ai_agent_metadata as CrewAIAgentMetadata)?.role || '',
        backstory: agent.crew_ai_agent_metadata?.backstory || '',
        goal: agent.crew_ai_agent_metadata?.goal || '',
      });
    }, 0);

    // Update selected agent state
    setSelectedAssignedAgent(agent);

    dispatch(
      updatedEditorAgentViewCreateAgentState({
        name: agent.name,
        role: (agent.crew_ai_agent_metadata as CrewAIAgentMetadata)?.role || '',
        backstory: agent.crew_ai_agent_metadata?.backstory || '',
        goal: agent.crew_ai_agent_metadata?.goal || '',
        tools: agent.tools_id || [],
        agentId: agent.id,
      }),
    );
  };

  const renderToolList = () => {
    if (selectedAgentTemplate) {
      // Show tool templates for agent template without delete button
      const items = combinedToolTemplates
        .map((id) => ({
          ...toolTemplateCache[id],
          id,
        }))
        .filter(Boolean);

      return (
        <List
          grid={{ gutter: 16, column: 2 }}
          dataSource={items}
          renderItem={({ name, imageURI, id }) => (
            <List.Item>
              <div
                style={{
                  borderRadius: '4px',
                  border: 'solid 1px #f0f0f0',
                  backgroundColor: '#fff',
                  width: '100%',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  cursor: 'pointer',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <div
                      style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        background: '#f1f1f1',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginRight: '8px',
                      }}
                    >
                      {imageURI && (
                        <Image
                          src={toolIconsData[imageURI] || imageURI}
                          alt={name}
                          width={16}
                          height={16}
                          preview={false}
                          style={{
                            borderRadius: '2px',
                            objectFit: 'cover',
                          }}
                        />
                      )}
                    </div>
                    <Text>{name}</Text>
                  </div>
                </div>
              </div>
            </List.Item>
          )}
        />
      );
    } else {
      // Show tool instances for both assigned agent and new agent
      const toolIds = selectedAssignedAgent
        ? selectedAssignedAgent.tools_id || []
        : createAgentState?.tools || [];

      const items = toolIds
        .map((id: string) => ({
          ...toolInstances[id],
          id,
        }))
        .filter(Boolean);

      return (
        <List
          grid={{ gutter: 16, column: 2 }}
          dataSource={items}
          renderItem={(tool: { id: string; tool_image_uri?: string; name: string }) => (
            <List.Item>
              <div
                style={{
                  borderRadius: '4px',
                  border: 'solid 1px #f0f0f0',
                  backgroundColor: '#fff',
                  width: '100%',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  cursor: 'pointer',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '8px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <div
                      style={{
                        width: '24px',
                        height: '24px',
                        minWidth: '24px',
                        minHeight: '24px',
                        flex: '0 0 24px',
                        borderRadius: '50%',
                        background: '#f1f1f1',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginRight: '8px',
                      }}
                    >
                      {tool.tool_image_uri && (
                        <Image
                          src={imageData[tool.tool_image_uri] || '/fallback-image.png'}
                          alt={tool.name}
                          width={16}
                          height={16}
                          preview={false}
                          style={{
                            borderRadius: '2px',
                            objectFit: 'cover',
                          }}
                        />
                      )}
                    </div>
                    <Text
                      style={{
                        fontSize: '14px',
                        fontWeight: 400,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                      title={tool.name}
                    >
                      {tool.name}
                    </Text>
                  </div>
                  <Popconfirm
                    title="Delete Tool"
                    description="Are you sure you want to delete this tool?"
                    onConfirm={(e) => {
                      e?.stopPropagation();
                      handleDeleteTool(tool.id, tool.name);
                    }}
                    onCancel={(e) => e?.stopPropagation()}
                  >
                    <Button
                      type="link"
                      icon={<DeleteOutlined style={{ color: '#ff4d4f' }} />}
                      onClick={(e) => e.stopPropagation()}
                      disabled={isFormDisabled}
                    />
                  </Popconfirm>
                </div>
              </div>
            </List.Item>
          )}
        />
      );
    }
  };

  const renderAssignedAgents = () => (
    <List
      grid={{ gutter: 16, column: 2 }}
      dataSource={agents?.filter((agent) => workflowAgentIds?.includes(agent.id))}
      renderItem={(agent) => (
        <List.Item>
          <div
            style={{
              borderRadius: '4px',
              border: 'solid 1px #f0f0f0',
              backgroundColor: selectedAssignedAgent?.id === agent.id ? '#edf7ff' : '#fff',
              width: '100%',
              height: '160px',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              cursor: 'pointer',
              transition: 'transform 0.2s, box-shadow 0.2s',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
            }}
            onClick={() => handleSelectAssignedAgent(agent)}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.03)';
              e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                gap: '12px',
                marginBottom: '16px',
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
                title={agent.name}
              >
                {agent.name}
              </Text>
            </div>
            <Text
              style={{
                fontSize: '11px',
                opacity: 0.45,
                fontWeight: 400,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                marginBottom: '4px',
              }}
            >
              Goal:{' '}
              <span style={{ color: 'black', fontWeight: 400 }}>
                {agent.crew_ai_agent_metadata?.goal || 'N/A'}
              </span>
            </Text>
            <Text
              style={{
                fontSize: '11px',
                opacity: 0.45,
                fontWeight: 400,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              Backstory:{' '}
              <span style={{ color: 'black', fontWeight: 400 }}>
                {agent.crew_ai_agent_metadata?.backstory || 'N/A'}
              </span>
            </Text>
            {(agent.tools_id || []).length > 0 && (
              <Space
                style={{
                  marginTop: '12px',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '10px',
                }}
              >
                {(agent.tools_id || []).map((toolId) => {
                  const toolInstance = toolInstances[toolId];
                  const imageUri = toolInstance?.tool_image_uri;
                  const imageSrc =
                    imageUri && imageData[imageUri] ? imageData[imageUri] : '/fallback-image.png';
                  return (
                    <Tooltip title={toolInstance?.name || toolId} key={toolId} placement="top">
                      <div
                        style={{
                          width: '24px',
                          height: '24px',
                          minWidth: '24px',
                          minHeight: '24px',
                          flex: '0 0 24px',
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
                          alt={toolInstance?.name || toolId}
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
          </div>
        </List.Item>
      )}
    />
  );

  const isFormDisabled = selectedAgentTemplate !== null;

  const renderToolSection = () => {
    if (selectedAgentTemplate) {
      return (
        <>
          <Alert
            style={{
              alignItems: 'flex-start',
              justifyContent: 'flex-start',
              padding: 12,
              marginBottom: 12,
            }}
            message={
              <Layout
                style={{ flexDirection: 'column', gap: 4, padding: 0, background: 'transparent' }}
              >
                <Layout
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    background: 'transparent',
                  }}
                >
                  <QuestionCircleOutlined />
                  <Text style={{ fontSize: 13, fontWeight: 600, background: 'transparent' }}>
                    Template Mode
                  </Text>
                </Layout>
                <Text style={{ fontSize: 13, fontWeight: 400, background: 'transparent' }}>
                  This is an Agent Template. To customize agent & tools and settings, first create
                  an agent from this template using the button below, then you can modify it.
                </Text>
              </Layout>
            }
            type="info"
            showIcon={false}
            closable={false}
          />
          {renderToolList()}
        </>
      );
    } else if (selectedAssignedAgent) {
      return (
        <>
          <Typography.Title level={5} style={{ marginBottom: '14px' }}>
            Add Optional Tools
          </Typography.Title>
          <Button
            type="dashed"
            icon={<PlusOutlined />}
            onClick={() => setAddToolModalVisible(true)}
            style={{ width: '100%', marginBottom: '16px' }}
            disabled={isFormDisabled}
          >
            Create or Edit Tools
          </Button>
          {renderToolList()}
        </>
      );
    } else {
      return (
        <>
          <Typography.Title level={5} style={{ marginBottom: '14px' }}>
            Add Optional Tools
          </Typography.Title>
          <Button
            type="dashed"
            icon={<PlusOutlined />}
            onClick={() => setAddToolModalVisible(true)}
            style={{ width: '100%', marginBottom: '16px' }}
          >
            Create or Edit Tools
          </Button>
          {renderToolList()}
        </>
      );
    }
  };

  return (
    <>
      <Divider style={{ margin: 0, backgroundColor: '#f0f0f0' }} />
      <Layout
        style={{ display: 'flex', flexDirection: 'row', height: '100%', backgroundColor: '#fff' }}
      >
        <Layout style={{ flex: 1, overflowY: 'auto', padding: '16px', backgroundColor: '#fff' }}>
          <div
            style={{
              marginBottom: 16,
              cursor: 'pointer',
              boxShadow: isCreateMode ? '0 4px 8px rgba(0, 0, 0, 0.2)' : 'none',
              width: '100%',
              border: 'solid 1px #f0f0f0',
              borderRadius: '4px',
              padding: '16px',
              backgroundColor: isCreateMode ? '#edf7ff' : '#fff',
            }}
            onClick={handleCreateAgentClick}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
                  <PlusOutlined style={{ fontSize: '16px', color: '#1890ff' }} />
                </div>
                <div>
                  <div
                    style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                  >
                    Create New Agent
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
                    Create a new custom agent from scratch
                  </Text>
                </div>
              </Space>
            </div>
          </div>
          <Layout style={{ display: 'flex', flexDirection: 'row', backgroundColor: '#fff' }}>
            <Layout style={{ flex: 1, backgroundColor: '#fff', paddingRight: '16px' }}>
              <Typography.Title level={5} style={{ marginBottom: '16px' }}>
                Edit Agents in Workflow
              </Typography.Title>
            </Layout>
            {/* <Layout style={{ flex: 1, backgroundColor: '#fff', paddingLeft: '16px' }}>
              <Typography.Title level={5} style={{ marginBottom: '16px' }}>
                Create Agent From Template
              </Typography.Title>
            </Layout> */}
          </Layout>
          <Layout
            style={{
              display: 'flex',
              flexDirection: 'row',
              height: '100%',
              backgroundColor: '#fff',
            }}
          >
            <Layout
              style={{ flex: 1, overflowY: 'auto', backgroundColor: '#fff', paddingRight: '16px' }}
            >
              {renderAssignedAgents()}
            </Layout>
            {/* <Layout
              style={{ flex: 1, overflowY: 'auto', backgroundColor: '#fff', paddingLeft: '16px' }}
            >
              <List
                grid={{ gutter: 16, column: 1 }}
                dataSource={filteredAgentTemplates}
                renderItem={(item: AgentTemplateMetadata) => (
                  <List.Item>
                    <div
                      style={{
                        borderRadius: '4px',
                        border: 'solid 1px #f0f0f0',
                        backgroundColor: selectedAgentTemplate?.id === item.id ? '#e6ffe6' : '#fff',
                        width: '100%',
                        height: '160px',
                        padding: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        cursor: 'pointer',
                        transition: 'transform 0.2s, box-shadow 0.2s',
                        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                      }}
                      onClick={() => handleSelectAgentTemplate(item)}
                      onMouseEnter={(e: React.MouseEvent<HTMLElement>) => {
                        e.currentTarget.style.transform = 'scale(1.03)';
                        e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
                      }}
                      onMouseLeave={(e: React.MouseEvent<HTMLElement>) => {
                        e.currentTarget.style.transform = 'scale(1)';
                        e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: '12px',
                          marginBottom: '16px',
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
                            flex: '0 0 24px'
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
                          title={item.name}
                        >
                          {item.name}
                        </Text>
                      </div>
                      <Text
                        style={{
                          fontSize: '11px',
                          opacity: 0.45,
                          fontWeight: 400,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          marginBottom: '4px',
                        }}
                      >
                        Goal:{' '}
                        <span style={{ color: 'black', fontWeight: 400 }}>
                          {item.goal || 'N/A'}
                        </span>
                      </Text>
                      <Text
                        style={{
                          fontSize: '11px',
                          opacity: 0.45,
                          fontWeight: 400,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        Backstory:{' '}
                        <span style={{ color: 'black', fontWeight: 400 }}>
                          {item.backstory || 'N/A'}
                        </span>
                      </Text>
                      {item.tool_template_ids?.length > 0 && (
                        <Space
                          style={{
                            marginTop: '12px',
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: '10px',
                          }}
                        >
                          {item.tool_template_ids.map((toolTemplateId) => {
                            const toolTemplate = toolTemplateCache[toolTemplateId];
                            return toolTemplate ? (
                              <Tooltip
                                title={toolTemplate.name}
                                key={toolTemplateId}
                                placement="top"
                              >
                                <div
                                  style={{
                                    width: '24px',
                                    height: '24px',
                                    minWidth: '24px',
                                    minHeight: '24px',
                                    flex: '0 0 24px',
                                    borderRadius: '50%',
                                    background: '#f1f1f1',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Image
                                    src={
                                      toolTemplate.imageURI && toolIconsData[toolTemplate.imageURI]
                                        ? toolIconsData[toolTemplate.imageURI]
                                        : '/fallback-image.png'
                                    }
                                    alt={toolTemplate.name}
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
                            ) : null;
                          })}
                        </Space>
                      )}
                    </div>
                  </List.Item>
                )}
              />
            </Layout> */}
          </Layout>
        </Layout>
        <Divider type="vertical" style={{ height: 'auto', backgroundColor: '#f0f0f0' }} />
        <Layout style={{ flex: 1, backgroundColor: '#fff', padding: '16px', overflowY: 'auto' }}>
          <Typography.Title level={5} style={{ marginBottom: '16px' }}>
            Agent Details
          </Typography.Title>
          <Form form={form} layout="vertical">
            <Form.Item
              label={
                <Space>
                  Name
                  <Tooltip title="The name of the agent">
                    <QuestionCircleOutlined style={{ color: '#666' }} />
                  </Tooltip>
                </Space>
              }
              name="name"
              rules={[{ required: true, message: 'Name is required' }]}
            >
              <Input disabled={isFormDisabled} />
            </Form.Item>
            <Form.Item
              label={
                <Space>
                  Role
                  <Tooltip title="The role this agent plays in the workflow">
                    <QuestionCircleOutlined style={{ color: '#666' }} />
                  </Tooltip>
                </Space>
              }
              name="role"
              rules={[{ required: true, message: 'Role is required' }]}
            >
              <Input disabled={isFormDisabled} />
            </Form.Item>
            <Form.Item
              label={
                <Space>
                  Backstory
                  <Tooltip title="Background information about this agent">
                    <QuestionCircleOutlined style={{ color: '#666' }} />
                  </Tooltip>
                </Space>
              }
              name="backstory"
              rules={[{ required: true, message: 'Backstory is required' }]}
            >
              <TextArea disabled={isFormDisabled} autoSize={{ minRows: 3, maxRows: 4 }} />
            </Form.Item>
            <Form.Item
              label={
                <Space>
                  Goal
                  <Tooltip title="The primary objective of this agent">
                    <QuestionCircleOutlined style={{ color: '#666' }} />
                  </Tooltip>
                </Space>
              }
              name="goal"
              rules={[{ required: true, message: 'Goal is required' }]}
            >
              <TextArea disabled={isFormDisabled} autoSize={{ minRows: 3, maxRows: 4 }} />
            </Form.Item>
            {renderToolSection()}
          </Form>
        </Layout>
      </Layout>
      <Divider style={{ margin: 0, backgroundColor: '#f0f0f0' }} />
      <WorkflowAddToolModal
        visible={isAddToolModalVisible}
        onCancel={() => setAddToolModalVisible(false)}
      />
      <WorkflowViewToolModal
        visible={isViewToolModalVisible}
        onCancel={() => setViewToolModalVisible(false)}
        toolDetails={toolDetails}
      />
    </>
  );
};

const SelectOrAddAgentModal: React.FC = () => {
  const isModalOpen = useAppSelector(selectEditorAgentViewIsOpen);
  const modalLayout = useAppSelector(selectEditorAgentViewStep);
  const dispatch = useAppDispatch();
  const [form] = Form.useForm();
  const [addAgent] = useAddAgentMutation();
  const workflowId = useSelector(selectEditorWorkflowId);
  const [selectedAgentTemplate, setSelectedAgentTemplate] = useState<AgentTemplateMetadata | null>(
    null,
  );
  const { data: toolTemplates = [] } = useListGlobalToolTemplatesQuery({});
  const toolTemplateIds = useSelector(selectEditorAgentViewCreateAgentToolTemplates) || [];
  const existingToolIds = useSelector(selectEditorAgentViewCreateAgentTools) || [];
  const [updateWorkflow] = useUpdateWorkflowMutation();
  const [addWorkflow] = useAddWorkflowMutation();
  const workflowState = useAppSelector(selectEditorWorkflow);
  const notificationApi = useGlobalNotification();
  const [isViewToolModalVisible, setViewToolModalVisible] = useState(false);
  const [toolDetails, setToolDetails] = useState<{
    name: string;
    description: string;
    pythonCode: string;
    pythonRequirements: string;
  }>({
    name: '',
    description: '',
    pythonCode: '',
    pythonRequirements: '',
  });
  const { data: agents = [] } = useListAgentsQuery({});
  const workflowAgentIds = useAppSelector(
    (state) => state.editor.workflow?.workflowMetadata?.agentIds || [],
  );
  const { data: toolInstancesList = [] } = useListToolInstancesQuery({});
  const toolInstances = toolInstancesList.reduce((acc: Record<string, any>, instance: any) => {
    acc[instance.id] = instance;
    return acc;
  }, {});
  const { imageData } = useImageAssetsData(
    Object.values(toolInstances).map((t: any) => t.tool_image_uri),
  );
  const [selectedAssignedAgent, setSelectedAssignedAgent] = useState<AgentMetadata | null>(null);
  const [updateAgent] = useUpdateAgentMutation();
  const [isCreateMode, setIsCreateMode] = useState(false);
  const createAgentState = useSelector(selectEditorAgentViewCreateAgentState);

  // Add this effect to reset everything when modal closes
  useEffect(() => {
    if (!isModalOpen) {
      // Reset all state when modal closes
      setSelectedAgentTemplate(null);
      setSelectedAssignedAgent(null);
      form.resetFields();
      dispatch(
        updatedEditorAgentViewCreateAgentState({
          name: '',
          role: '',
          backstory: '',
          goal: '',
          tools: [],
        }),
      );
      setToolDetails({
        name: '',
        description: '',
        pythonCode: '',
        pythonRequirements: '',
      });
      setViewToolModalVisible(false);
    } else {
      // When modal opens, set create mode as default
      setIsCreateMode(true);
      setSelectedAgentTemplate(null);
      setSelectedAssignedAgent(null);
      form.resetFields();
      dispatch(
        updatedEditorAgentViewCreateAgentState({
          name: '',
          role: '',
          backstory: '',
          goal: '',
          tools: [],
        }),
      );
    }
  }, [isModalOpen]); // Depend on modal open state

  const handleAddAgent = async () => {
    try {
      const values = await form.validateFields();

      if (selectedAssignedAgent) {
        // Show update initiation notification
        notificationApi.info({
          message: 'Updating Agent',
          description: 'Initiating agent update...',
          placement: 'topRight',
        });

        // Update existing agent
        await updateAgent({
          agent_id: selectedAssignedAgent.id,
          name: values.name,
          crew_ai_agent_metadata: {
            role: values.role,
            backstory: values.backstory,
            goal: values.goal,
            allow_delegation: false,
            verbose: false,
            cache: false,
            temperature: 0.1,
            max_iter: 0,
          },
          tools_id: selectedAssignedAgent.tools_id || [],
          tool_template_ids: [],
          llm_provider_model_id: '',
          tmp_agent_image_path: '',
        }).unwrap();

        notificationApi.success({
          message: 'Agent Updated',
          description: 'The agent has been successfully updated.',
          placement: 'topRight',
        });
      } else {
        // Show creation initiation notification
        notificationApi.info({
          message: 'Creating Agent',
          description: 'Initiating agent creation...',
          placement: 'topRight',
        });

        // Create new agent
        const newAgent = await addAgent({
          name: values.name,
          template_id: selectedAgentTemplate?.id || '',
          workflow_id: workflowId || '',
          crew_ai_agent_metadata: {
            role: values.role,
            backstory: values.backstory,
            goal: values.goal,
            allow_delegation: false,
            verbose: false,
            cache: false,
            temperature: 0.1,
            max_iter: 0,
          },
          tools_id: createAgentState?.tools || [],
          llm_provider_model_id: '',
          tool_template_ids: toolTemplateIds,
          tmp_agent_image_path: '',
        }).unwrap();

        // Show workflow update notification
        notificationApi.info({
          message: 'Updating Workflow',
          description: 'Adding agent to workflow...',
          placement: 'topRight',
        });

        const updatedAgentIds = [...(workflowState.workflowMetadata.agentIds || []), newAgent];
        dispatch(updatedEditorWorkflowAgentIds(updatedAgentIds));

        const updatedWorkflowState = {
          ...workflowState,
          workflowMetadata: {
            ...workflowState.workflowMetadata,
            agentIds: updatedAgentIds,
          },
        };

        if (workflowState.workflowId) {
          await updateWorkflow(createUpdateRequestFromEditor(updatedWorkflowState)).unwrap();
        } else {
          const workflowId = await addWorkflow(
            createAddRequestFromEditor(updatedWorkflowState),
          ).unwrap();
          dispatch(updatedEditorWorkflowId(workflowId));
        }

        notificationApi.success({
          message: 'Agent Added',
          description: 'The agent has been successfully added to the workflow.',
          placement: 'topRight',
        });

        // Reset form and state
        form.resetFields();
        setIsCreateMode(true);
        setSelectedAgentTemplate(null);
        setSelectedAssignedAgent(null);
        dispatch(
          updatedEditorAgentViewCreateAgentState({
            name: '',
            role: '',
            backstory: '',
            goal: '',
            tools: [],
          }),
        );
      }
    } catch (error: any) {
      console.error('Error details:', error);
      const errorMessage = error.data?.error || 'There was an error. Please try again.';
      notificationApi.error({
        message: selectedAssignedAgent ? 'Error Updating Agent' : 'Error Adding Agent',
        description: errorMessage,
        placement: 'topRight',
      });
    }
  };

  const title: string =
    modalLayout === 'Select'
      ? 'Create or Edit Agent'
      : modalLayout === 'Details'
        ? 'Agent Details'
        : modalLayout === 'Create'
          ? 'Create Agent'
          : '';

  const getButtonText = () => {
    if (selectedAgentTemplate) {
      return 'Create Agent from Template';
    } else if (selectedAssignedAgent) {
      return 'Save Agent';
    } else {
      return 'Create Agent';
    }
  };

  return (
    <Modal
      open={isModalOpen}
      onCancel={() => dispatch(updatedEditorAgentViewOpen(false))}
      centered
      title={title}
      width="98%"
      style={{ height: '95vh' }}
      footer={[
        <Button key="cancel" onClick={() => dispatch(updatedEditorAgentViewOpen(false))}>
          Close
        </Button>,
        <Button key="add" type="primary" onClick={handleAddAgent}>
          {getButtonText()}
        </Button>,
      ]}
    >
      <div style={{ overflowY: 'auto', height: 'calc(95vh - 108px)' }}>
        <SelectAgentComponent
          form={form}
          selectedAgentTemplate={selectedAgentTemplate}
          setSelectedAgentTemplate={setSelectedAgentTemplate}
          agents={agents}
          workflowAgentIds={workflowAgentIds}
          toolInstances={toolInstances}
          imageData={imageData}
          selectedAssignedAgent={selectedAssignedAgent}
          setSelectedAssignedAgent={setSelectedAssignedAgent}
          updateAgent={updateAgent}
          createAgentState={createAgentState}
        />
      </div>
    </Modal>
  );
};

export default SelectOrAddAgentModal;
