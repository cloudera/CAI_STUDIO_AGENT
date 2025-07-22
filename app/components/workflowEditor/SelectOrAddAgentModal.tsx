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
  selectEditorAgentViewCreateAgentTools,
  selectEditorAgentViewCreateAgentState,
  updatedEditorAgentViewCreateAgentToolTemplates,
  selectEditorAgentViewCreateAgentToolTemplates,
  updatedEditorAgentViewCreateAgentState,
  updatedEditorWorkflowId,
  selectEditorWorkflow,
  updatedEditorWorkflowAgentIds,
  updatedEditorAgentViewAgent,
} from '../../workflows/editorSlice';
import {
  AgentTemplateMetadata,
  McpInstance,
  Model,
  ToolInstance,
  UpdateAgentRequest,
  UpdateAgentResponse,
} from '@/studio/proto/agent_studio';
import { useListGlobalToolTemplatesQuery } from '@/app/tools/toolTemplatesApi';
import { useImageAssetsData } from '@/app/lib/hooks/useAssetData';
import WorkflowAddToolModal from './WorkflowAddToolModal';
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
import GenerateAgentPropertiesModal from './GenerateAgentPropertiesModal';
import { uploadFile } from '@/app/lib/fileUpload';

const { Text } = Typography;
const { TextArea } = Input;

interface GenerateAgentPropertiesModalProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  onCancel: () => void;
  form: FormInstance<{
    name: string;
    role: string;
    backstory: string;
    goal: string;
    llm_provider_model_id: string;
  }>;
  llmModel: Model;
  toolInstances: Record<string, ToolInstance>;
}

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
  const [isAddToolModalVisible, setAddToolModalVisible] = useState(false);
  const [isAddMcpModalVisible, setAddMcpModalVisible] = useState(false);
  const [clickedToolInstanceId, setClickedToolInstanceId] = useState<string | undefined>(undefined);
  const [isUploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [clickedMcpInstance, setClickedMcpInstance] = useState<McpInstance | undefined>(undefined);
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
    if (selectedAgentTemplate) return;

    try {
      setIsLoading(true);

      notificationApi.info({
        message: 'Initiating MCP Removal',
        description: `Starting to dissociate ${mcpName} from the agent...`,
        placement: 'topRight',
      });

      await deleteMcpInstance({ mcp_instance_id: mcpId }).unwrap();

      notificationApi.success({
        message: 'MCP Deletion In Progress',
        description: `${mcpName} will be removed in a few seconds after cleanup of remaining artifacts.`,
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
      const errorMessage = error.data?.error || 'Failed to delete MCP. Please try again.';
      notificationApi.error({
        message: 'MCP Deletion Failed',
        description: errorMessage,
        placement: 'topRight',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteTool = async (toolId: string, toolName: string) => {
    if (selectedAgentTemplate) return;

    try {
      setIsLoading(true);

      notificationApi.info({
        message: 'Initiating Tool Removal',
        description: `Starting to remove ${toolName} from the agent...`,
        placement: 'topRight',
      });

      await deleteToolInstance({ tool_instance_id: toolId }).unwrap();

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
      if (!file) return;
  
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
        console.log('File uploaded to:', fp);
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
              style={{
                borderRadius: '4px',
                border: 'solid 1px #f0f0f0',
                backgroundColor: '#fff',
                width: '100%',
                padding: '0',
                display: 'flex',
                flexDirection: 'column',
                cursor: 'pointer',
                transition: 'transform 0.2s, box-shadow 0.2s, background-color 0.2s',
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
              }}
              onClick={() => {
                setClickedMcpInstance(mcp);
                setAddMcpModalVisible(true);
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
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'auto',
                  padding: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
                  <div
                    style={{
                      width: '20px',
                      height: '20px',
                      minWidth: '20px',
                      borderRadius: '50%',
                      background: '#f1f1f1',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: '4px',
                    }}
                  >
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
                      style={{
                        borderRadius: '2px',
                        objectFit: 'cover',
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
                    <Text
                      style={{
                        fontSize: '14px',
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: '90%',
                        display: 'inline-block',
                      }}
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
                        <CheckCircleOutlined
                          style={{
                            color: '#52c41a',
                            fontSize: '15px',
                            fontWeight: 1000,
                            marginLeft: '6px',
                          }}
                        />
                      ) : mcp.status === 'VALIDATING' ? (
                        <ClockCircleOutlined
                          style={{
                            color: '#faad14',
                            fontSize: '15px',
                            fontWeight: 1000,
                            marginLeft: '6px',
                          }}
                        />
                      ) : mcp.status === 'VALIDATION_FAILED' ? (
                        <CloseCircleOutlined
                          style={{
                            color: '#f5222d',
                            fontSize: '15px',
                            fontWeight: 1000,
                            marginLeft: '6px',
                          }}
                        />
                      ) : null}
                    </Tooltip>
                  </div>
                </div>
              </div>
              <Divider style={{ flexGrow: 0, margin: '0px' }} type="horizontal" />
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  flexGrow: 0,
                  background: 'transparent',
                  justifyContent: 'center',
                  alignItems: 'center',
                  padding: '0px',
                }}
              >
                <Popconfirm
                  title="Dissociate MCP"
                  description="Are you sure you want to dissociate this MCP from the agent?"
                  onConfirm={(e) => {
                    e?.stopPropagation();
                    handleDeleteMcp(mcp.id, mcp.name);
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
                  transition: 'transform 0.2s, box-shadow 0.2s, background-color 0.2s',
                  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                }}
                onClick={() => {
                  setClickedToolInstanceId(id);
                  setAddToolModalVisible(true);
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
                    <Text
                      style={{
                        fontSize: '14px',
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: '40%',
                        display: 'inline-block',
                      }}
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
                style={{
                  borderRadius: '4px',
                  border: 'solid 1px #f0f0f0',
                  backgroundColor: '#fff',
                  width: '100%',
                  padding: '0',
                  display: 'flex',
                  flexDirection: 'column',
                  cursor: 'pointer',
                  transition: 'transform 0.2s, box-shadow 0.2s, background-color 0.2s',
                  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                }}
                onClick={() => {
                  setClickedToolInstanceId(tool.id);
                  setAddToolModalVisible(true);
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
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'auto',
                    padding: '12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
                    <div
                      style={{
                        width: '20px',
                        height: '20px',
                        minWidth: '20px',
                        borderRadius: '50%',
                        background: '#f1f1f1',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginRight: '4px',
                      }}
                    >
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
                        style={{
                          borderRadius: '2px',
                          objectFit: 'cover',
                        }}
                      />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
                      <Text
                        style={{
                          fontSize: '14px',
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          maxWidth: '90%',
                          display: 'inline-block',
                        }}
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
                          <CheckCircleOutlined
                            style={{
                              color: '#52c41a',
                              fontSize: '15px',
                              fontWeight: 1000,
                              marginLeft: '6px',
                            }}
                          />
                        ) : (
                          <ExclamationCircleOutlined
                            style={{
                              color: '#faad14',
                              fontSize: '15px',
                              fontWeight: 1000,
                              marginLeft: '6px',
                            }}
                          />
                        )}
                      </Tooltip>
                    </div>
                  </div>
                </div>
                <Divider style={{ flexGrow: 0, margin: '0px' }} type="horizontal" />
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'row',
                    flexGrow: 0,
                    background: 'transparent',
                    justifyContent: 'center',
                    alignItems: 'center',
                    padding: '0px',
                  }}
                >
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
      renderItem={(agent) => {
        const iconResourceIds = (agent.tools_id || []).concat(agent.mcp_instance_ids || []);
        return (
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
                  justifyContent: 'space-between',
                  marginBottom: '16px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    minWidth: 0,
                    flex: 1,
                  }}
                >
                  <Avatar
                    style={{
                      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
                      backgroundColor: imageData[agent.agent_image_uri] ? '#b8d6ff' : '#78b2ff',
                      minWidth: '24px',
                      minHeight: '24px',
                      width: '24px',
                      height: '24px',
                      flex: '0 0 24px',
                      padding: imageData[agent.agent_image_uri] ? 4 : 0,
                    }}
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
                    style={{
                      fontSize: '14px',
                      fontWeight: 400,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: '150px',
                    }}
                    title={agent.name}
                  >
                    {agent.name}
                  </Text>
                </div>
                {/* Delete Button - on the right side, same line as agent name */}
                <Popconfirm
                  title="Delete Agent"
                  description="Are you sure you want to delete this agent?"
                  onConfirm={(e) => {
                    e?.stopPropagation();
                    onDeleteAgent(agent.id, agent.name);
                  }}
                  onCancel={(e) => e?.stopPropagation()}
                >
                  <Button
                    type="link"
                    icon={<DeleteOutlined style={{ color: '#ff4d4f' }} />}
                    onClick={(e) => e.stopPropagation()}
                    disabled={isLoading}
                    size="small"
                    style={{
                      width: '20px',
                      height: '20px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 0,
                      minWidth: 'auto',
                    }}
                  />
                </Popconfirm>
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
              {iconResourceIds.length > 0 && (
                <Space
                  style={{
                    marginTop: '12px',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '10px',
                  }}
                >
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
                            alt={resourceName || resourceId}
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
        );
      }}
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
    } else {
      // This handles both selectedAssignedAgent and new agent creation
      return (
        <>
          <div style={{ display: 'flex', gap: '16px', height: '100%' }}>
            {/* Tools Section */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <Typography.Title level={5} style={{ marginBottom: '14px' }}>
                Add Optional Tools
              </Typography.Title>
              <Button
                type="dashed"
                icon={<PlusOutlined />}
                onClick={() => {
                  setClickedToolInstanceId(undefined);
                  setAddToolModalVisible(true);
                }}
                style={{ width: '100%', marginBottom: '16px' }}
                disabled={isFormDisabled}
              >
                Create or Edit Tools
              </Button>
              <div
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  maxHeight: '300px',
                }}
              >
                {renderToolList()}
              </div>
            </div>

            {/* Vertical Divider */}
            <Divider
              type="vertical"
              style={{
                height: 'auto',
                backgroundColor: '#f0f0f0',
                margin: 0,
                alignSelf: 'stretch',
              }}
            />

            {/* MCP Section */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <Typography.Title level={5} style={{ marginBottom: '14px' }}>
                <Space>
                  Add Optional MCP Servers
                  <Tooltip
                    title={
                      <span>
                        Use tools and data sources registered as MCP servers. MCP servers can be
                        registered in Agent Studio from the{' '}
                        <a
                          onClick={(e) => {
                            e.preventDefault();
                            router.push('/tools?section=mcp');
                          }}
                          style={{
                            color: '#1890ff',
                            textDecoration: 'underline',
                            cursor: 'pointer',
                          }}
                        >
                          Tools Catalog
                        </a>{' '}
                        page. Learn more about Model Context Protocol{' '}
                        <a
                          href="https://modelcontextprotocol.io/introduction"
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: '#1890ff', textDecoration: 'underline' }}
                        >
                          here
                        </a>
                        .
                      </span>
                    }
                  >
                    <QuestionCircleOutlined style={{ color: '#666' }} />
                  </Tooltip>
                </Space>
              </Typography.Title>
              <Button
                type="dashed"
                icon={<PlusOutlined />}
                onClick={() => {
                  setClickedMcpInstance(undefined);
                  setAddMcpModalVisible(true);
                }}
                style={{ width: '100%', marginBottom: '16px' }}
              >
                Add MCP Server to Agent
              </Button>
              <div
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  maxHeight: '300px',
                }}
              >
                {renderMcpList()}
              </div>
            </div>
          </div>
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
            onClick={changeToCreateAgentMode}
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
          </Layout>
        </Layout>
        <Divider type="vertical" style={{ height: 'auto', backgroundColor: '#f0f0f0' }} />
        <Layout style={{ flex: 1, backgroundColor: '#fff', padding: '16px', overflowY: 'auto' }}>
          <Typography.Title level={5} style={{ marginBottom: '16px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                verticalAlign: 'middle',
                justifyContent: 'space-between',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>Agent Details</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Button
                  type="default"
                  icon={
                    <img
                      src="/ai-assistant.svg"
                      alt="AI Assistant"
                      style={{
                        filter:
                          'invert(27%) sepia(99%) saturate(1352%) hue-rotate(204deg) brightness(97%) contrast(97%)',
                        width: '20px',
                        height: '20px',
                      }}
                    />
                  }
                  style={{ color: '#0074D2', borderColor: '#0074D2' }}
                  onClick={() => setIsGenerateAgentPropertiesModalVisible(true)}
                >
                  <span style={{ color: '#0074D2' }}>Generate with AI</span>
                </Button>
                <Button
                  type="default"
                  icon={<UndoOutlined style={{ color: '#0074D2', fontSize: 18, marginRight: 4 }} />}
                  style={{ color: '#0074D2', borderColor: '#0074D2' }}
                  onClick={() => {
                    form.setFieldsValue({
                      name: '',
                      role: '',
                      backstory: '',
                      goal: '',
                    });
                  }}
                >
                  Reset Fields
                </Button>
              </span>
            </div>
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
            <Form.Item
              label={
                <Space>
                  LLM Model
                  <Tooltip title="The language model this agent will use">
                    <QuestionCircleOutlined style={{ color: '#666' }} />
                  </Tooltip>
                </Space>
              }
              name="llm_provider_model_id"
              rules={[{ required: true, message: 'Language model is required' }]}
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
              <Text strong>Agent Icon</Text>
                 <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
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
                        style={{ marginTop: '8px' }}
                        disabled={selectedFile !== null}
                        >
                        {selectedFile ? selectedFile.name : 'Upload File'}
                      </Button>
                      </Upload>
                      {selectedFile && (
                        <Button
                          icon={<DeleteOutlined />}
                          style={{ marginLeft: '8px', marginTop: '8px' }}
                          onClick={() => {
                            setSelectedFile(null);
                            setUploadedFilePath('');
                          }}
                        />
                      )}
                    </div>
                  <div style={{ margin: '16px 0' }} />
                </Form.Item>
            {renderToolSection()}
          </Form>
        </Layout>
      </Layout>
      <Divider style={{ margin: 0, backgroundColor: '#f0f0f0' }} />
      <WorkflowAddToolModal
        workflowId={workflowId}
        preSelectedToolInstanceId={clickedToolInstanceId}
        open={isAddToolModalVisible}
        onCancel={() => {
          setAddToolModalVisible(false);
          setClickedToolInstanceId(undefined);
        }}
      />
      <WorkflowAddMcpModal
        workflowId={workflowId}
        preSelectedMcpInstance={clickedMcpInstance}
        open={isAddMcpModalVisible}
        onCancel={() => {
          setAddMcpModalVisible(false);
          setClickedMcpInstance(undefined);
        }}
      />
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
  const existingToolIds = useSelector(selectEditorAgentViewCreateAgentTools) || [];
  const [updateWorkflow] = useUpdateWorkflowMutation();
  const [addWorkflow] = useAddWorkflowMutation();
  const workflowState = useAppSelector(selectEditorWorkflow);
  const notificationApi = useGlobalNotification();
  const [uploadedFilePath, setUploadedFilePath] = useState<string>('');
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
      setToolDetails({
        name: '',
        description: '',
        pythonCode: '',
        pythonRequirements: '',
      });
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
      onCancel={() => {
        dispatch(updatedEditorAgentViewOpen(false));
        onClose?.(); // Call onClose callback if provided
      }}
      centered
      title={title}
      width="98%"
      style={{ height: '95vh' }}
      footer={[
        <Button key="cancel" onClick={() => {
          dispatch(updatedEditorAgentViewOpen(false));
          onClose?.(); // Call onClose callback if provided
        }}>
          Close
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
      <div style={{ position: 'relative' }}>
        {isLoading && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(255, 255, 255, 0.6)',
              zIndex: 1000,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              cursor: 'not-allowed',
            }}
          >
            <Spin size="large" />
          </div>
        )}
        <div style={{ overflowY: 'auto', height: 'calc(95vh - 108px)' }}>
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
