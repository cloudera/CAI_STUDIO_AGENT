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
  FormInstance,
  Select,
  Spin,
  Upload,
  message,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  QuestionCircleOutlined,
  UserOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  UndoOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  FileImageOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import {
  useAddAgentMutation,
  useUpdateAgentMutation,
  useListAgentsQuery,
  useRemoveAgentMutation,
} from '../../agents/agentApi';
import { useAppDispatch, useAppSelector } from '../../lib/hooks/hooks';
import {
  updatedEditorAgentViewOpen,
  selectEditorAgentViewIsOpen,
  selectEditorAgentViewStep,
  selectEditorAgentViewAgent,
  selectEditorAgentViewCreateAgentState,
  updatedEditorAgentViewCreateAgentToolTemplates,
  selectEditorAgentViewCreateAgentToolTemplates,
  updatedEditorAgentViewCreateAgentState,
  updatedEditorWorkflowId,
  selectEditorWorkflow,
  updatedEditorWorkflowAgentIds,
  updatedEditorAgentViewAgent,
  openedEditorToolView,
  updatedEditorSelectedToolInstanceId,
  clearedEditorToolEditingState,
  openedEditorMcpView,
  updatedEditorSelectedMcpInstanceId,
  clearedEditorMcpEditingState,
} from '../../workflows/editorSlice';
import {
  AgentTemplateMetadata,
  McpInstance,
  ToolInstance,
  UpdateAgentRequest,
  UpdateAgentResponse,
} from '@/studio/proto/agent_studio';
import { useListGlobalToolTemplatesQuery } from '@/app/tools/toolTemplatesApi';
import { useImageAssetsData } from '@/app/lib/hooks/useAssetData';
import WorkflowAddMcpModal from './WorkflowAddMcpModal';
import { useSelector } from 'react-redux';
import { useAddWorkflowMutation, useUpdateWorkflowMutation } from '../../workflows/workflowsApi';
import { createAddRequestFromEditor, createUpdateRequestFromEditor } from '../../lib/workflow';
import { useGlobalNotification } from '../Notifications';
import { AgentMetadata } from '@/studio/proto/agent_studio';
import {
  useListToolInstancesQuery,
  useRemoveToolInstanceMutation,
} from '@/app/tools/toolInstancesApi';
import { CrewAIAgentMetadata } from '@/studio/proto/agent_studio';
import { useGetDefaultModelQuery, useListModelsQuery } from '../../models/modelsApi';
import { useListMcpInstancesQuery, useRemoveMcpInstanceMutation } from '@/app/mcp/mcpInstancesApi';
import { useRouter } from 'next/navigation';
import i18n from '../../utils/i18n';
import GenerateAgentPropertiesModal from './GenerateAgentPropertiesModal';
import { uploadFile } from '@/app/lib/fileUpload';

const { Text } = Typography;
const { TextArea } = Input;

interface SelectAgentComponentProps {
  workflowId: string;
  parentModalOpen: boolean;
  form: FormInstance<{
    name: string;
    role: string;
    backstory: string;
    goal: string;
    llm_provider_model_id: string;
  }>;
  selectedAgentTemplate: AgentTemplateMetadata | null;
  setSelectedAgentTemplate: React.Dispatch<React.SetStateAction<AgentTemplateMetadata | null>>;
  agents?: AgentMetadata[];
  workflowAgentIds?: string[];
  toolInstances: Record<string, ToolInstance>;
  mcpInstances: Record<string, McpInstance>;
  imageData: Record<string, string>;
  updateAgent: (params: UpdateAgentRequest) => Promise<UpdateAgentResponse>;
  createAgentState: any;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  isGenerateAgentPropertiesModalVisible: boolean;
  setIsGenerateAgentPropertiesModalVisible: (visible: boolean) => void;
  setUploadedFilePath: (path: string) => void;
  onDeleteAgent: (agentId: string, agentName: string) => Promise<void>;
}

const SelectAgentComponent: React.FC<SelectAgentComponentProps> = ({
  workflowId,
  parentModalOpen,
  form,
  selectedAgentTemplate,
  setSelectedAgentTemplate,
  agents,
  workflowAgentIds,
  toolInstances,
  mcpInstances,
  imageData,
  updateAgent,
  createAgentState,
  isLoading,
  setIsLoading,
  isGenerateAgentPropertiesModalVisible,
  setIsGenerateAgentPropertiesModalVisible,
  setUploadedFilePath,
  onDeleteAgent,
}) => {
  const router = useRouter();
  const { data: defaultModel } = useGetDefaultModelQuery();
  const { data: toolTemplates = [] } = useListGlobalToolTemplatesQuery({});
  const { imageData: toolIconsData } = useImageAssetsData(
    toolTemplates.map((tool) => tool.tool_image_uri),
  );
  const dispatch = useAppDispatch();
  const [isUploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const notificationApi = useGlobalNotification();
  const [isCreateMode, setIsCreateMode] = useState(false);
  const [deleteToolInstance] = useRemoveToolInstanceMutation();
  const [deleteMcpInstance] = useRemoveMcpInstanceMutation();
  const combinedToolTemplates = [
    ...new Set(useSelector(selectEditorAgentViewCreateAgentToolTemplates) || []),
  ];
  const selectedAssignedAgent = useAppSelector(selectEditorAgentViewAgent);
  const { data: models = [] } = useListModelsQuery({});

  const toolTemplateCache = toolTemplates.reduce((acc: Record<string, any>, template: any) => {
    acc[template.id] = {
      name: template.name,
      imageURI: template.tool_image_uri,
    };
    return acc;
  }, {});

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
      handleSelectAssignedAgent(selectedAssignedAgent);
    } else {
      changeToCreateAgentMode();
    }
  }, [selectedAssignedAgent, form, parentModalOpen]); // Run on mount and when these deps change

  // Add this effect to update selectedAssignedAgent when agents change
  useEffect(() => {
    if (selectedAssignedAgent) {
      const updatedAgent = (agents || []).find((a) => a.id === selectedAssignedAgent.id);
      if (updatedAgent) {
        dispatch(updatedEditorAgentViewAgent(updatedAgent));
      }
    }
  }, [agents, selectedAssignedAgent]);

  // Add this effect to handle default model selection
  useEffect(() => {
    if (isCreateMode && defaultModel?.model_id) {
      form.setFieldValue('llm_provider_model_id', defaultModel.model_id);
    }
  }, [isCreateMode, defaultModel, form]);

  const changeToCreateAgentMode = () => {
    setIsCreateMode(true);
    setSelectedAgentTemplate(null);
    dispatch(updatedEditorAgentViewAgent(undefined));
    dispatch(
      updatedEditorAgentViewCreateAgentState({
        name: '',
        role: '',
        backstory: '',
        goal: '',
        tools: [],
        mcpInstances: [],
      }),
    );
    form.resetFields();

    // Immediately set the default model if available
    if (defaultModel?.model_id) {
      form.setFieldValue('llm_provider_model_id', defaultModel.model_id);
    }
  };

  const handleDeleteMcp = async (mcpId: string, mcpName: string) => {
    if (selectedAgentTemplate) {
      return;
    }

    try {
      setIsLoading(true);

      notificationApi.info({
        message: i18n.t('agent.mcp.remove.startTitle'),
        description: i18n.t('agent.mcp.remove.startDesc', mcpName),
        placement: 'topRight',
      });

      await deleteMcpInstance({ mcp_instance_id: mcpId }).unwrap();

      notificationApi.success({
        message: i18n.t('agent.mcp.remove.inProgressTitle'),
        description: i18n.t('agent.mcp.remove.inProgressDesc', mcpName),
        placement: 'topRight',
        duration: 5,
      });

      if (selectedAssignedAgent) {
        const updatedMcpIds = (selectedAssignedAgent.mcp_instance_ids || []).filter(
          (id) => id !== mcpId,
        );

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
          tools_id: selectedAssignedAgent.tools_id || [],
          mcp_instance_ids: updatedMcpIds,
          tool_template_ids: [],
          llm_provider_model_id: form.getFieldValue('llm_provider_model_id'),
          tmp_agent_image_path: '',
        }).then((result) => result);

        dispatch(
          updatedEditorAgentViewAgent({
            ...selectedAssignedAgent,
            mcp_instance_ids: updatedMcpIds,
          }),
        );
      } else if (createAgentState) {
        const updatedMcpIds = (createAgentState.mcps || []).filter((id: string) => id !== mcpId);
        dispatch(
          updatedEditorAgentViewCreateAgentState({
            ...createAgentState,
            mcps: updatedMcpIds,
          }),
        );
      }
    } catch (error: any) {
      console.error('Error deleting MCP:', error);
      const errorMessage = error.data?.error || i18n.t('agent.mcp.remove.errorFallback');
      notificationApi.error({
        message: i18n.t('agent.mcp.remove.errorTitle'),
        description: errorMessage,
        placement: 'topRight',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteTool = async (toolId: string, toolName: string) => {
    if (selectedAgentTemplate) {
      return;
    }

    try {
      setIsLoading(true);

      notificationApi.info({
        message: i18n.t('agent.tool.remove.startTitle'),
        description: i18n.t('agent.tool.remove.startDesc', toolName),
        placement: 'topRight',
      });

      await deleteToolInstance({ tool_instance_id: toolId }).unwrap();

      notificationApi.success({
        message: i18n.t('agent.tool.remove.inProgressTitle'),
        description: i18n.t('agent.tool.remove.inProgressDesc', toolName),
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
          mcp_instance_ids: selectedAssignedAgent.mcp_instance_ids || [],
          tmp_agent_image_path: '',
        }).then((result) => result);

        dispatch(
          updatedEditorAgentViewAgent({
            ...selectedAssignedAgent,
            tools_id: updatedToolIds,
          }),
        );

        notificationApi.success({
          message: i18n.t('agent.update.successTitle'),
          description: i18n.t('agent.update.successDesc'),
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
        i18n.t('agent.tool.remove.errorFallback');
      notificationApi.error({
        message: i18n.t('agent.tool.remove.errorTitle'),
        description: errorMessage,
        placement: 'topRight',
      });
    } finally {
      setIsLoading(false);
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
        llm_provider_model_id: agent.llm_provider_model_id || defaultModel?.model_id,
      });
    }, 0);

    // Update selected agent state
    dispatch(updatedEditorAgentViewAgent(agent));

    dispatch(
      updatedEditorAgentViewCreateAgentState({
        name: agent.name,
        role: (agent.crew_ai_agent_metadata as CrewAIAgentMetadata)?.role || '',
        backstory: agent.crew_ai_agent_metadata?.backstory || '',
        goal: agent.crew_ai_agent_metadata?.goal || '',
        tools: agent.tools_id || [],
        mcpInstances: agent.mcp_instance_ids || [],
        agentId: agent.id,
      }),
    );
  };

  const handleFileUpload = async (file: File) => {
    if (!file) {
      return;
    }

    // Validate file type
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg'];
    if (!validTypes.includes(file.type)) {
      message.error('Please upload a PNG or JPEG image file');
      return;
    }

    // If file size is greater than 64KB, show a notification
    if (file.size > 64 * 1024) {
      notificationApi.warning({
        message: 'File size should be less than 64KB',
        placement: 'topRight',
      });
      return;
    }

    try {
      const fp = await uploadFile(file, setUploading);

      setUploadedFilePath(fp);
      setSelectedFile(file);
    } catch (error) {
      setSelectedFile(null);
      console.error('Upload failed:', error);
      message.error('Failed to upload file');
    }
  };
  const renderMcpList = () => {
    // Don't handle for Agent Templates
    const mcpInstanceIds = selectedAssignedAgent
      ? selectedAssignedAgent.mcp_instance_ids || []
      : createAgentState?.mcpInstances || [];

    const items: McpInstance[] = mcpInstanceIds
      .map((id: string) => mcpInstances[id])
      .filter(Boolean);

    return (
      <List
        grid={{ gutter: 16, column: items.length >= 2 ? 2 : 1 }}
        dataSource={items}
        renderItem={(mcp) => (
          <List.Item>
            <div
              className="rounded-md border border-solid border-gray-200 bg-white w-full p-0 flex flex-col cursor-pointer transition-all duration-200 shadow-sm hover:scale-[1.03] hover:shadow-md hover:bg-green-50"
              onClick={() => {
                dispatch(updatedEditorSelectedMcpInstanceId(mcp.id));
                dispatch(openedEditorMcpView());
              }}
            >
              <div className="flex-1 flex flex-col overflow-auto p-3">
                <div className="flex items-center min-w-0">
                  <div className="w-5 h-5 min-w-[20px] rounded-full bg-gray-100 flex items-center justify-center mr-1">
                    <Image
                      src={
                        mcp.image_uri
                          ? imageData[mcp.image_uri] || '/mcp-icon.svg'
                          : '/mcp-icon.svg'
                      }
                      alt={mcp.name}
                      width={16}
                      height={16}
                      preview={false}
                      className="rounded-sm object-cover"
                    />
                  </div>
                  <div className="flex items-center min-w-0">
                    <Text
                      className="text-sm font-semibold whitespace-nowrap overflow-hidden text-ellipsis max-w-[90%] inline-block"
                      title={mcp.name}
                    >
                      {mcp.name}
                    </Text>
                    <Tooltip
                      title={
                        mcp.status === 'VALID'
                          ? 'MCP has been validated'
                          : mcp.status === 'VALIDATING'
                            ? 'MCP is being validated'
                            : mcp.status === 'VALIDATION_FAILED'
                              ? 'MCP validation failed'
                              : 'MCP status unknown'
                      }
                    >
                      {mcp.status === 'VALID' ? (
                        <CheckCircleOutlined className="text-green-500 text-base font-extrabold ml-1.5" />
                      ) : mcp.status === 'VALIDATING' ? (
                        <ClockCircleOutlined className="text-yellow-500 text-base font-extrabold ml-1.5" />
                      ) : mcp.status === 'VALIDATION_FAILED' ? (
                        <CloseCircleOutlined className="text-red-500 text-base font-extrabold ml-1.5" />
                      ) : null}
                    </Tooltip>
                  </div>
                </div>
              </div>
              <Divider className="flex-grow-0 m-0" type="horizontal" />
              <div className="flex flex-row flex-grow-0 bg-transparent justify-center items-center p-0">
                <Popconfirm
                  title={i18n.t('agent.mcp.remove.confirmTitle')}
                  description={i18n.t('agent.mcp.remove.confirmDesc')}
                  onConfirm={(e) => {
                    e?.stopPropagation();
                    handleDeleteMcp(mcp.id, mcp.name);
                  }}
                  onCancel={(e) => e?.stopPropagation()}
                >
                  <Button
                    type="link"
                    icon={<DeleteOutlined className="text-red-500" />}
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
                className="rounded-md border border-solid border-gray-200 bg-white w-full p-4 flex flex-col cursor-pointer transition-all duration-200 shadow-sm hover:scale-[1.03] hover:shadow-md hover:bg-green-50"
                onClick={() => {
                  dispatch(updatedEditorSelectedToolInstanceId(id));
                  dispatch(openedEditorToolView());
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'scale(1.03)';
                  e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
                  e.currentTarget.style.backgroundColor = '#f6ffed';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
                  e.currentTarget.style.backgroundColor = '#fff';
                }}
              >
                <div className="flex items-center mb-2">
                  <div className="flex items-center">
                    <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center mr-2">
                      {imageURI && (
                        <Image
                          src={toolIconsData[imageURI] || imageURI}
                          alt={name}
                          width={16}
                          height={16}
                          preview={false}
                          className="rounded-sm object-cover"
                        />
                      )}
                    </div>
                    <Text
                      className="text-sm font-semibold whitespace-nowrap overflow-hidden text-ellipsis max-w-[40%] inline-block"
                      title={name}
                    >
                      {name}
                    </Text>
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
          grid={{ gutter: 16, column: items.length >= 2 ? 2 : 1 }}
          dataSource={items}
          renderItem={(tool: {
            id: string;
            tool_image_uri?: string;
            name: string;
            is_valid?: boolean;
            tool_metadata?: Record<string, string>;
          }) => (
            <List.Item>
              <div
                className="rounded border border-gray-200 bg-white w-full p-0 flex flex-col cursor-pointer transition-all duration-200 shadow-sm hover:scale-[1.03] hover:shadow-md hover:bg-green-50"
                onClick={() => {
                  dispatch(updatedEditorSelectedToolInstanceId(tool.id));
                  dispatch(openedEditorToolView());
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'scale(1.03)';
                  e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
                  e.currentTarget.style.backgroundColor = '#f6ffed';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
                  e.currentTarget.style.backgroundColor = '#fff';
                }}
              >
                <div className="flex-1 flex flex-col overflow-auto p-3">
                  <div className="flex items-center min-w-0">
                    <div className="w-5 h-5 min-w-[20px] rounded-full bg-gray-100 flex items-center justify-center mr-1">
                      <Image
                        src={
                          tool.tool_image_uri
                            ? imageData[tool.tool_image_uri] || '/fallback-image.png'
                            : '/fallback-image.png'
                        }
                        alt={tool.name}
                        width={16}
                        height={16}
                        preview={false}
                        className="rounded-sm object-cover"
                      />
                    </div>
                    <div className="flex items-center min-w-0">
                      <Text
                        className="text-sm font-semibold whitespace-nowrap overflow-hidden text-ellipsis max-w-[90%] inline-block"
                        title={tool.name}
                      >
                        {tool.name}
                      </Text>
                      <Tooltip
                        title={
                          tool.is_valid
                            ? 'Tool is valid'
                            : tool.tool_metadata
                              ? JSON.parse(
                                  typeof tool.tool_metadata === 'string'
                                    ? tool.tool_metadata
                                    : JSON.stringify(tool.tool_metadata),
                                ).status || 'Tool status unknown'
                              : 'Tool status unknown'
                        }
                      >
                        {tool.is_valid ? (
                          <CheckCircleOutlined className="text-green-500 text-[15px] font-extrabold ml-1.5" />
                        ) : (
                          <ExclamationCircleOutlined className="text-yellow-500 text-[15px] font-extrabold ml-1.5" />
                        )}
                      </Tooltip>
                    </div>
                  </div>
                </div>
                <Divider className="flex-grow-0 m-0" type="horizontal" />
                <div className="flex flex-row flex-grow-0 bg-transparent justify-center items-center p-0">
                  <Popconfirm
                    title={i18n.t('agent.tool.remove.confirmTitle')}
                    description={i18n.t('agent.tool.remove.confirmDesc')}
                    onConfirm={(e) => {
                      e?.stopPropagation();
                      handleDeleteTool(tool.id, tool.name);
                    }}
                    onCancel={(e) => e?.stopPropagation()}
                  >
                    <Button
                      type="link"
                      icon={<DeleteOutlined className="text-red-500" />}
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
      renderItem={(agent) => {
        const iconResourceIds = (agent.tools_id || []).concat(agent.mcp_instance_ids || []);
        return (
          <List.Item>
            <div
              className={`rounded border border-gray-200 bg-white w-full h-[160px] p-4 flex flex-col cursor-pointer transition-transform duration-200 shadow-sm ${selectedAssignedAgent?.id === agent.id ? 'shadow-lg bg-blue-50' : ''} group`}
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
              <div className="flex flex-row items-center justify-between mb-4">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <Avatar
                    className={`shadow-md min-w-[24px] min-h-[24px] w-6 h-6 flex-none ${imageData[agent.agent_image_uri] ? 'bg-blue-300 p-1' : 'bg-blue-500'}`}
                    size={24}
                    icon={
                      imageData[agent.agent_image_uri] ? (
                        <Image src={imageData[agent.agent_image_uri]} alt={agent.name} />
                      ) : (
                        <UserOutlined />
                      )
                    }
                  />
                  <Text
                    className="text-sm font-normal whitespace-nowrap overflow-hidden text-ellipsis max-w-[150px]"
                    title={agent.name}
                  >
                    {agent.name}
                  </Text>
                </div>
                {/* Delete Button - on the right side, same line as agent name */}
                <Popconfirm
                  title={i18n.t('agent.remove.confirmTitle')}
                  description={i18n.t('agent.remove.confirmDesc')}
                  onConfirm={(e) => {
                    e?.stopPropagation();
                    onDeleteAgent(agent.id, agent.name);
                  }}
                  onCancel={(e) => e?.stopPropagation()}
                >
                  <Button
                    type="link"
                    icon={<DeleteOutlined className="text-red-500" />}
                    onClick={(e) => e.stopPropagation()}
                    disabled={isLoading}
                    size="small"
                    className="w-5 h-5 flex items-center justify-center p-0 min-w-0"
                  />
                </Popconfirm>
              </div>
              <Text className="text-[11px] opacity-45 font-normal whitespace-nowrap overflow-hidden text-ellipsis mb-1">
                Goal:{' '}
                <span className="text-black font-normal">
                  {agent.crew_ai_agent_metadata?.goal || 'N/A'}
                </span>
              </Text>
              <Text className="text-[11px] opacity-45 font-normal whitespace-nowrap overflow-hidden text-ellipsis">
                Backstory:{' '}
                <span className="text-black font-normal">
                  {agent.crew_ai_agent_metadata?.backstory || 'N/A'}
                </span>
              </Text>
              {iconResourceIds.length > 0 && (
                <Space className="mt-3 flex flex-wrap gap-2.5">
                  {iconResourceIds.map((resourceId) => {
                    const toolInstance = toolInstances[resourceId];
                    const mcpInstance = mcpInstances[resourceId];
                    const resourceType: 'tool' | 'mcp' = toolInstance ? 'tool' : 'mcp';
                    const imageUri =
                      resourceType === 'tool'
                        ? toolInstance?.tool_image_uri
                        : mcpInstance?.image_uri;
                    const resourceName =
                      resourceType === 'tool' ? toolInstance?.name : mcpInstance?.name;
                    const imageSrc =
                      imageUri && imageData[imageUri]
                        ? imageData[imageUri]
                        : resourceType === 'tool'
                          ? '/fallback-image.png'
                          : '/mcp-icon.svg';
                    return (
                      <Tooltip title={resourceName} key={resourceId} placement="top">
                        <div className="w-6 h-6 min-w-[24px] min-h-[24px] flex-none rounded-full bg-gray-100 flex items-center justify-center cursor-pointer">
                          <Image
                            src={imageSrc}
                            alt={resourceName || resourceId}
                            width={16}
                            height={16}
                            preview={false}
                            className="rounded-sm object-cover"
                          />
                        </div>
                      </Tooltip>
                    );
                  })}
                </Space>
              )}
            </div>
          </List.Item>
        );
      }}
    />
  );

  const isFormDisabled = selectedAgentTemplate !== null;

  const renderToolAndMcpSection = () => {
    if (selectedAgentTemplate) {
      return (
        <>
          <Alert
            className="items-start justify-start p-3 mb-3"
            message={
              <Layout className="flex flex-col gap-1 p-0 bg-transparent">
                <Layout className="flex flex-row items-center gap-2 bg-transparent">
                  <QuestionCircleOutlined />
                  <Text className="text-sm font-semibold bg-transparent">
                    {i18n.t('agent.template.modeTitle')}
                  </Text>
                </Layout>
                <Text className="text-sm font-normal bg-transparent">
                  {i18n.t('agent.template.modeDesc')}
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
    } else {
      // This handles both selectedAssignedAgent and new agent creation
      return (
        <>
          <div className="flex gap-4 h-full">
            {/* Tools Section */}
            <div className="flex-1 flex flex-col">
              <Typography.Title level={5} className="mb-3.5">
                {i18n.t('agent.tools.sectionTitle')}
              </Typography.Title>
              <Button
                type="dashed"
                icon={<PlusOutlined />}
                onClick={() => {
                  dispatch(clearedEditorToolEditingState());
                  dispatch(openedEditorToolView());
                }}
                className="w-full mb-4"
                disabled={isFormDisabled}
              >
                {i18n.t('agent.tools.createOrEdit')}
              </Button>
              <div className="flex-1 overflow-y-auto max-h-[300px]">{renderToolList()}</div>
            </div>

            {/* Vertical Divider */}
            <Divider type="vertical" className="h-auto bg-gray-200 m-0 self-stretch" />

            {/* MCP Section */}
            <div className="flex-1 flex flex-col">
              <Typography.Title level={5} className="mb-3.5">
                <Space>
                  {i18n.t('agent.mcp.sectionTitle')}
                  <Tooltip
                    title={
                      <span>
                        {i18n.t('agent.mcp.tooltip.intro')}{' '}
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            router.push('/tools?section=mcp');
                          }}
                          className="text-blue-500 underline cursor-pointer"
                        >
                          {i18n.t('agent.mcp.tooltip.toolsCatalog')}
                        </button>{' '}
                        {i18n.t('agent.mcp.tooltip.pageSuffix')}{' '}
                        <a
                          href="https://modelcontextprotocol.io/introduction"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-500 underline"
                        >
                          {i18n.t('agent.mcp.tooltip.linkText')}
                        </a>
                        .
                      </span>
                    }
                  >
                    <QuestionCircleOutlined className="text-gray-600" />
                  </Tooltip>
                </Space>
              </Typography.Title>
              <Button
                type="dashed"
                icon={<PlusOutlined />}
                onClick={() => {
                  dispatch(clearedEditorMcpEditingState());
                  dispatch(openedEditorMcpView());
                }}
                className="w-full mb-4"
              >
                {i18n.t('agent.mcp.addButton')}
              </Button>
              <div className="flex-1 overflow-y-auto max-h-[300px]">{renderMcpList()}</div>
            </div>
          </div>
        </>
      );
    }
  };

  return (
    <>
      <Divider className="m-0 bg-gray-200" />
      <Layout className="flex flex-row h-full bg-white">
        <Layout className="flex-1 overflow-y-auto p-4 bg-white">
          <div
            className={`mb-4 cursor-pointer w-full border border-solid border-gray-200 rounded p-4 ${isCreateMode ? 'shadow-lg bg-blue-50' : 'bg-white'}`}
            onClick={changeToCreateAgentMode}
          >
            <div className="flex items-center justify-between">
              <Space size={16}>
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                  <PlusOutlined className="text-base text-blue-500" />
                </div>
                <div>
                  <div className="whitespace-nowrap overflow-hidden text-ellipsis">
                    {i18n.t('agent.createNew')}
                  </div>
                  <Text className="text-[11px] opacity-45 whitespace-nowrap overflow-hidden text-ellipsis">
                    {i18n.t('agent.createNew.subtitle')}
                  </Text>
                </div>
              </Space>
            </div>
          </div>
          <Layout className="flex flex-row bg-white">
            <Layout className="flex-1 bg-white pr-4">
              <Typography.Title level={5} className="mb-4">
                {i18n.t('agent.edit.sectionTitle')}
              </Typography.Title>
            </Layout>
          </Layout>
          <Layout className="flex flex-row h-full bg-white">
            <Layout className="flex-1 overflow-y-auto bg-white pr-4">
              {renderAssignedAgents()}
            </Layout>
          </Layout>
        </Layout>
        <Divider type="vertical" className="h-auto bg-gray-200" />
        <Layout className="flex-1 bg-white p-4 overflow-y-auto">
          <Typography.Title level={5} className="mb-4">
            <div className="flex items-center align-middle justify-between">
              <span className="flex items-center gap-2">{i18n.t('agent.details.title')}</span>
              <span className="flex items-center gap-2">
                <Button
                  type="default"
                  icon={
                    <img
                      src="/ai-assistant.svg"
                      alt="AI Assistant"
                      className="[filter:invert(27%)_sepia(99%)_saturate(1352%)_hue-rotate(204deg)_brightness(97%)_contrast(97%)] w-5 h-5"
                    />
                  }
                  className="text-blue-700 border-blue-700"
                  onClick={() => setIsGenerateAgentPropertiesModalVisible(true)}
                >
                  <span className="text-blue-700">{i18n.t('agent.details.generateWithAI')}</span>
                </Button>
                <Button
                  type="default"
                  icon={<UndoOutlined className="text-blue-700 text-lg mr-1" />}
                  className="text-blue-700 border-blue-700"
                  onClick={() => {
                    form.setFieldsValue({
                      name: '',
                      role: '',
                      backstory: '',
                      goal: '',
                    });
                  }}
                >
                  {i18n.t('common.resetFields')}
                </Button>
              </span>
            </div>
          </Typography.Title>
          <Form form={form} layout="vertical">
            <Form.Item
              label={
                <Space>
                  {i18n.t('agent.form.name')}
                  <Tooltip title={i18n.t('agent.form.name.help')}>
                    <QuestionCircleOutlined className="text-gray-600" />
                  </Tooltip>
                </Space>
              }
              name="name"
              rules={[{ required: true, message: i18n.t('agent.form.name.required') }]}
            >
              <Input disabled={isFormDisabled} />
            </Form.Item>
            <Form.Item
              label={
                <Space>
                  {i18n.t('agent.form.role')}
                  <Tooltip title={i18n.t('agent.form.role.help')}>
                    <QuestionCircleOutlined className="text-gray-600" />
                  </Tooltip>
                </Space>
              }
              name="role"
              rules={[{ required: true, message: i18n.t('agent.form.role.required') }]}
            >
              <Input disabled={isFormDisabled} />
            </Form.Item>
            <Form.Item
              label={
                <Space>
                  {i18n.t('agent.form.backstory')}
                  <Tooltip title={i18n.t('agent.form.backstory.help')}>
                    <QuestionCircleOutlined className="text-gray-600" />
                  </Tooltip>
                </Space>
              }
              name="backstory"
              rules={[{ required: true, message: i18n.t('agent.form.backstory.required') }]}
            >
              <TextArea disabled={isFormDisabled} autoSize={{ minRows: 3, maxRows: 4 }} />
            </Form.Item>
            <Form.Item
              label={
                <Space>
                  {i18n.t('agent.form.goal')}
                  <Tooltip title={i18n.t('agent.form.goal.help')}>
                    <QuestionCircleOutlined className="text-gray-600" />
                  </Tooltip>
                </Space>
              }
              name="goal"
              rules={[{ required: true, message: i18n.t('agent.form.goal.required') }]}
            >
              <TextArea disabled={isFormDisabled} autoSize={{ minRows: 3, maxRows: 4 }} />
            </Form.Item>
            <Form.Item
              label={
                <Space>
                  {i18n.t('agent.form.model')}
                  <Tooltip title={i18n.t('agent.form.model.help')}>
                    <QuestionCircleOutlined className="text-gray-600" />
                  </Tooltip>
                </Space>
              }
              name="llm_provider_model_id"
              rules={[{ required: true, message: i18n.t('agent.form.model.required') }]}
            >
              <Select>
                {models.map((model) => (
                  <Select.Option key={model.model_id} value={model.model_id}>
                    {model.model_name} {model.model_id === defaultModel?.model_id && '(Default)'}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item>
              <Text strong>{i18n.t('agent.form.icon')}</Text>
              <div className="flex flex-row items-center">
                <Upload
                  accept=".png,.jpg,.jpeg"
                  customRequest={({ file, onSuccess, onError }) => {
                    handleFileUpload(file as File)
                      .then(() => onSuccess?.('ok'))
                      .catch((err) => onError?.(err));
                  }}
                  showUploadList={false}
                  disabled={isUploading}
                >
                  <Button
                    icon={selectedFile ? <FileImageOutlined /> : <UploadOutlined />}
                    loading={isUploading}
                    className="mt-2"
                    disabled={selectedFile !== null}
                  >
                    {selectedFile ? selectedFile.name : i18n.t('common.uploadFile')}
                  </Button>
                </Upload>
                {selectedFile && (
                  <Button
                    icon={<DeleteOutlined />}
                    className="ml-2 mt-2"
                    onClick={() => {
                      setSelectedFile(null);
                      setUploadedFilePath('');
                    }}
                  />
                )}
              </div>
              <div className="my-4" />
            </Form.Item>
            {renderToolAndMcpSection()}
          </Form>
        </Layout>
      </Layout>
      <Divider className="m-0 bg-gray-200" />
      <WorkflowAddMcpModal workflowId={workflowId} />
      {defaultModel && (
        <GenerateAgentPropertiesModal
          open={isGenerateAgentPropertiesModalVisible}
          setOpen={setIsGenerateAgentPropertiesModalVisible}
          onCancel={() => setIsGenerateAgentPropertiesModalVisible(false)}
          form={form}
          llmModel={defaultModel}
          toolInstances={toolInstances}
        />
      )}
    </>
  );
};

interface SelectOrAddAgentModalProps {
  workflowId: string;
  onClose?: () => void; // Add optional onClose callback
}

const SelectOrAddAgentModal: React.FC<SelectOrAddAgentModalProps> = ({ workflowId, onClose }) => {
  const isModalOpen = useAppSelector(selectEditorAgentViewIsOpen);
  const modalLayout = useAppSelector(selectEditorAgentViewStep);
  const dispatch = useAppDispatch();
  const [form] = Form.useForm<{
    name: string;
    role: string;
    backstory: string;
    goal: string;
    llm_provider_model_id: string;
  }>();
  const [addAgent] = useAddAgentMutation();
  const [selectedAgentTemplate, setSelectedAgentTemplate] = useState<AgentTemplateMetadata | null>(
    null,
  );
  const toolTemplateIds = useSelector(selectEditorAgentViewCreateAgentToolTemplates) || [];
  const [updateWorkflow] = useUpdateWorkflowMutation();
  const [addWorkflow] = useAddWorkflowMutation();
  const workflowState = useAppSelector(selectEditorWorkflow);
  const notificationApi = useGlobalNotification();
  const [uploadedFilePath, setUploadedFilePath] = useState<string>('');
  const { data: agents = [] } = useListAgentsQuery({ workflow_id: workflowId });
  const workflowAgentIds = useAppSelector(
    (state) => state.editor.workflow?.workflowMetadata?.agentIds || [],
  );
  const { data: toolInstancesList = [] } = useListToolInstancesQuery({ workflow_id: workflowId });
  const toolInstances = toolInstancesList.reduce(
    (acc: Record<string, ToolInstance>, instance: ToolInstance) => {
      acc[instance.id] = instance;
      return acc;
    },
    {},
  );
  const { data: mcpInstancesList = [] } = useListMcpInstancesQuery({ workflow_id: workflowId });
  const mcpInstances = mcpInstancesList.reduce(
    (acc: Record<string, McpInstance>, instance: McpInstance) => {
      acc[instance.id] = instance;
      return acc;
    },
    {},
  );
  const { imageData } = useImageAssetsData([
    ...Object.values(toolInstances)
      .map((t: ToolInstance) => t.tool_image_uri)
      .filter((uri: string) => uri.length > 0),
    ...Object.values(mcpInstances)
      .map((m: McpInstance) => m.image_uri)
      .filter((uri: string) => uri.length > 0),
    ...agents
      .filter((agent: AgentMetadata) => workflowAgentIds.includes(agent.id))
      .map((a: AgentMetadata) => a.agent_image_uri)
      .filter((uri: string) => uri.length > 0),
  ]);
  const selectedAssignedAgent = useAppSelector(selectEditorAgentViewAgent);
  const [updateAgent] = useUpdateAgentMutation();
  const [removeAgent] = useRemoveAgentMutation();
  const createAgentState = useSelector(selectEditorAgentViewCreateAgentState);
  const { data: defaultModel } = useGetDefaultModelQuery();
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerateAgentPropertiesModalVisible, setIsGenerateAgentPropertiesModalVisible] =
    useState(false);

  // Add useEffect to set default model when form is initialized or when defaultModel changes
  useEffect(() => {
    if (defaultModel && !selectedAssignedAgent) {
      form.setFieldValue('llm_provider_model_id', defaultModel.model_id);
    }
  }, [defaultModel, form, selectedAssignedAgent]);

  // When editing an existing agent, set its model
  useEffect(() => {
    if (selectedAssignedAgent) {
      form.setFieldValue('llm_provider_model_id', selectedAssignedAgent.llm_provider_model_id);
    }
  }, [selectedAssignedAgent, form]);

  const handleDeleteAgent = async (agentId: string, agentName: string) => {
    try {
      setIsLoading(true);

      notificationApi.info({
        message: 'Initiating Agent Removal',
        description: `Starting to remove ${agentName} from the workflow...`,
        placement: 'topRight',
      });

      await removeAgent({ agent_id: agentId }).unwrap();

      const updatedAgentIds = (workflowAgentIds ?? []).filter((id) => id !== agentId);
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

      // Clear selection if the deleted agent was selected
      if (selectedAssignedAgent?.id === agentId) {
        dispatch(updatedEditorAgentViewAgent(undefined));
        form.resetFields();
      }

      notificationApi.success({
        message: 'Agent Removed',
        description: `Agent ${agentName} has been successfully removed.`,
        placement: 'topRight',
      });
    } catch (error: any) {
      const errorMessage = error.data?.error || 'Failed to remove agent. Please try again.';
      notificationApi.error({
        message: 'Error Removing Agent',
        description: errorMessage,
        placement: 'topRight',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Add this effect to reset everything when modal closes
  useEffect(() => {
    if (!isModalOpen) {
      // Reset all state when modal closes
      setSelectedAgentTemplate(null);
      dispatch(updatedEditorAgentViewAgent(undefined));
      form.resetFields();
      dispatch(
        updatedEditorAgentViewCreateAgentState({
          name: '',
          role: '',
          backstory: '',
          goal: '',
          tools: [],
          mcpInstances: [],
        }),
      );
    } else {
      setSelectedAgentTemplate(null);
    }
  }, [isModalOpen]); // Depend on modal open state

  const handleAddAgent = async () => {
    try {
      const values = await form.validateFields();

      if (selectedAssignedAgent) {
        // Show update initiation notification

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
          mcp_instance_ids: selectedAssignedAgent.mcp_instance_ids || [],
          tool_template_ids: [],
          llm_provider_model_id: values.llm_provider_model_id,
          tmp_agent_image_path: uploadedFilePath || '',
        }).unwrap();

        notificationApi.success({
          message: 'Agent Updated',
          description: 'The agent has been successfully updated.',
          placement: 'topRight',
        });
      } else {
        // Show creation initiation notification

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
          mcp_instance_ids: createAgentState?.mcpInstances || [],
          llm_provider_model_id: values.llm_provider_model_id,
          tool_template_ids: toolTemplateIds,
          tmp_agent_image_path: uploadedFilePath || '',
        }).unwrap();

        // Show workflow update notification

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
        setSelectedAgentTemplate(null);
        dispatch(updatedEditorAgentViewAgent(undefined));
        dispatch(
          updatedEditorAgentViewCreateAgentState({
            name: '',
            role: '',
            backstory: '',
            goal: '',
            tools: [],
            mcpInstances: [],
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

  const title: any =
    modalLayout === 'Select'
      ? i18n.t('agent.modal.title.select')
      : modalLayout === 'Details'
        ? i18n.t('agent.modal.title.details')
        : modalLayout === 'Create'
          ? i18n.t('agent.modal.title.create')
          : '';

  const getButtonText = () => {
    if (selectedAgentTemplate) {
      return i18n.t('agent.modal.cta.createFromTemplate');
    } else if (selectedAssignedAgent) {
      return i18n.t('agent.modal.cta.save');
    } else {
      return i18n.t('label.createAgent');
    }
  };

  return (
    <Modal
      open={isModalOpen}
      onCancel={() => {
        dispatch(updatedEditorAgentViewOpen(false));
        onClose?.(); // Call onClose callback if provided
      }}
      centered
      title={title}
      width="98%"
      className="!h-[95vh]"
      footer={[
        <Button
          key="cancel"
          onClick={() => {
            dispatch(updatedEditorAgentViewOpen(false));
            onClose?.(); // Call onClose callback if provided
          }}
        >
          {i18n.t('common.close')}
        </Button>,
        <Button
          key="add"
          type="primary"
          onClick={handleAddAgent}
          disabled={!defaultModel} // Disable button if no default model
        >
          {getButtonText()}
        </Button>,
      ]}
    >
      <div className="relative">
        {isLoading && (
          <div className="absolute inset-0 bg-white bg-opacity-60 z-1000 flex justify-center items-center cursor-not-allowed">
            <Spin size="large" />
          </div>
        )}
        <div className="overflow-y-auto h-[calc(95vh-108px)]">
          <SelectAgentComponent
            workflowId={workflowId}
            parentModalOpen={isModalOpen || false}
            form={form}
            selectedAgentTemplate={selectedAgentTemplate}
            setSelectedAgentTemplate={setSelectedAgentTemplate}
            agents={agents}
            workflowAgentIds={workflowAgentIds}
            toolInstances={toolInstances}
            mcpInstances={mcpInstances}
            imageData={imageData}
            updateAgent={updateAgent}
            createAgentState={createAgentState}
            isLoading={isLoading}
            setIsLoading={setIsLoading}
            isGenerateAgentPropertiesModalVisible={isGenerateAgentPropertiesModalVisible}
            setIsGenerateAgentPropertiesModalVisible={setIsGenerateAgentPropertiesModalVisible}
            setUploadedFilePath={setUploadedFilePath}
            onDeleteAgent={handleDeleteAgent}
          />
        </div>
      </div>
    </Modal>
  );
};

export default SelectOrAddAgentModal;
