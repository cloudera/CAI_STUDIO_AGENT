import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  Button,
  Layout,
  List,
  Typography,
  Divider,
  Image,
  Form,
  Input,
  Upload,
  Spin,
  Space,
  Tooltip,
  Alert,
  Switch,
  Row,
  Col,
  Card,
  Popconfirm,
} from 'antd';
import {
  PlusOutlined,
  UploadOutlined,
  QuestionCircleOutlined,
  ExportOutlined,
  ReloadOutlined,
  SyncOutlined,
  InfoCircleOutlined,
  FileImageOutlined,
  DeleteOutlined,
  SearchOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import {
  useListGlobalToolTemplatesQuery,
  useAddToolTemplateMutation,
} from '@/app/tools/toolTemplatesApi';
import { useGetToolInstanceMutation } from '@/app/tools/toolInstancesApi';
import { useImageAssetsData } from '@/app/lib/hooks/useAssetData';
import { Editor } from '@monaco-editor/react';
import { useSelector, useDispatch } from 'react-redux';
import {
  selectEditorWorkflowName,
  selectEditorAgentViewCreateAgentToolTemplates,
  selectEditorAgentViewCreateAgentState,
  updatedEditorAgentViewCreateAgentState,
} from '@/app/workflows/editorSlice';
import { useGlobalNotification } from '../Notifications'; // Import the notification hook
import {
  useListToolInstancesQuery,
  useCreateToolInstanceMutation,
  useUpdateToolInstanceMutation,
  useTestToolInstanceMutation,
  useRemoveToolInstanceMutation,
} from '@/app/tools/toolInstancesApi';
import { useUpdateAgentMutation, useListAgentsQuery } from '../../agents/agentApi';
import { uploadFile } from '../../lib/fileUpload';
import { useGetParentProjectDetailsQuery } from '../../lib/crossCuttingApi';
import { defaultToolPyCode, defaultRequirementsTxt } from '@/app/utils/defaultToolCode'; // Import default code
import { renderAlert } from '@/app/lib/alertUtils';
import { useGetEventsMutation } from '@/app/ops/opsApi'; // This is the same as WorkflowApp.tsx

const { Text } = Typography;

interface WorkflowAddToolModalProps {
  workflowId: string;
  preSelectedToolInstanceId?: string;
  open: boolean;
  onCancel: () => void;
}

const WorkflowAddToolModal: React.FC<WorkflowAddToolModalProps> = ({
  workflowId,
  preSelectedToolInstanceId,
  open,
  onCancel,
}) => {
  const { data: toolTemplates = [], refetch } = useListGlobalToolTemplatesQuery({});
  const { data: parentProjectDetails } = useGetParentProjectDetailsQuery({});
  const [selectedToolTemplate, setSelectedToolTemplate] = useState<string | null>(null);
  const [isEditable, setIsEditable] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [addToolTemplate] = useAddToolTemplateMutation();
  const workflowName = useSelector(selectEditorWorkflowName);
  const listRef = useRef<HTMLDivElement>(null);
  const dispatch = useDispatch();
  const existingToolTemplateIds = useSelector(selectEditorAgentViewCreateAgentToolTemplates) || [];
  const notificationApi = useGlobalNotification(); // Initialize the notification API
  const [isCreateSelected, setIsCreateSelected] = useState(false);
  const [selectedToolInstance, setSelectedToolInstance] = useState<string | null>(null);
  const createAgentState = useSelector(selectEditorAgentViewCreateAgentState);
  const { data: toolInstancesList = [] } = useListToolInstancesQuery({ workflow_id: workflowId });
  const [createToolInstance] = useCreateToolInstanceMutation();
  const [updateAgent] = useUpdateAgentMutation();
  const { data: agents = [] } = useListAgentsQuery({ workflow_id: workflowId });
  const [uploadedFilePath, setUploadedFilePath] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setUploading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [updateToolInstance] = useUpdateToolInstanceMutation();
  const [editedToolName, setEditedToolName] = useState<string>('');
  const [newToolName, setNewToolName] = useState<string>(''); // State for new tool name
  const [getToolInstance] = useGetToolInstanceMutation();
  const [editorKey, setEditorKey] = useState<number>(0); // Add this state
  const [searchTemplates, setSearchTemplates] = useState('');
  const [searchTools, setSearchTools] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [playgroundEnabled, setPlaygroundEnabled] = useState(false);
  const [userParams, setUserParams] = useState<{ [key: string]: string }>({});
  const [toolParams, setToolParams] = useState<{ [key: string]: string }>({});
  const [traceId, setTraceId] = useState<string>('');
  const [logs, setLogs] = useState<any[]>([]);
  const [isTesting, setIsTesting] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const [testToolInstance] = useTestToolInstanceMutation();
  const [getEvents] = useGetEventsMutation();
  const [deleteToolInstance] = useRemoveToolInstanceMutation();
  const [testError, setTestError] = useState<string | null>(null);
  const allEventsRef = useRef<any[]>([]);
  const [form] = Form.useForm<{
    toolname: string;
  }>();

  // Create a map of tool instances
  const [toolInstancesMap, setToolInstancesMap] = useState<Record<string, any>>(() => {
    return toolInstancesList.reduce((acc: Record<string, any>, instance: any) => {
      acc[instance.id] = instance;
      return acc;
    }, {});
  });

  useEffect(() => {
    // Update toolInstancesMap whenever toolInstancesList changes
    setToolInstancesMap(
      toolInstancesList.reduce((acc: Record<string, any>, instance: any) => {
        acc[instance.id] = instance;
        return acc;
      }, {}),
    );
  }, [toolInstancesList]);

  // Keep only this combined version
  const allImageUris = React.useMemo(() => {
    const templateUris = toolTemplates.map((tool) => tool.tool_image_uri);
    const instanceUris = Object.values(toolInstancesMap).map((tool: any) => tool.tool_image_uri);
    return [...new Set([...templateUris, ...instanceUris])].filter(Boolean);
  }, [toolTemplates, toolInstancesMap]);

  const { imageData: toolIconsData, refetch: refetchImages } = useImageAssetsData(allImageUris);

  // Fix: Only preselect first template if modal is open, no template is selected, and isCreateSelected is false
  useEffect(() => {
    // Don't auto-select template if we're in create mode or if a tool instance is selected
    if (
      open &&
      toolTemplates.length > 0 &&
      !selectedToolTemplate &&
      !isCreateSelected &&
      !selectedToolInstance
    ) {
      setSelectedToolTemplate(toolTemplates[0].id); // Preselect the first tool template
    }
  }, [open, toolTemplates, selectedToolTemplate, isCreateSelected, selectedToolInstance]);

  // Separate useEffect to clear template when switching to create mode
  useEffect(() => {
    if (isCreateSelected) {
      setSelectedToolTemplate(null);
    }
  }, [isCreateSelected]);

  // Handle pre-selected tool instance
  useEffect(() => {
    if (selectedToolInstance) {
      if (toolInstancesMap[selectedToolInstance] && open) {
        handleSelectToolInstance(selectedToolInstance);
      } else if (open) {
        handleCreateCardSelect();
      }
    }
  }, [toolInstancesMap, open, selectedToolInstance]);

  React.useMemo(() => {
    if (preSelectedToolInstanceId) {
      setSelectedToolInstance(preSelectedToolInstanceId);
    }
  }, [preSelectedToolInstanceId]);

  // Add a useRef to track the last mode (create/template/instance)
  const lastModeRef = useRef<string>('');

  // Add a useEffect to robustly reset state when switching between modes
  useEffect(() => {
    // Determine the current mode
    let mode = 'none';
    if (isCreateSelected) mode = 'create';
    else if (selectedToolInstance) mode = 'instance';
    else if (selectedToolTemplate) mode = 'template';

    // If the mode changed, reset all relevant state
    if (lastModeRef.current !== mode) {
      if (mode === 'create') {
        setSelectedToolInstance(null);
        setSelectedToolTemplate(null);
        setIsEditable(false);
        setNewToolName('');
        resetPlaygroundState();
      } else if (mode === 'template') {
        setSelectedToolInstance(null);
        setIsCreateSelected(false);
        setIsEditable(false);
        resetPlaygroundState();
      } else if (mode === 'instance') {
        setSelectedToolTemplate(null);
        setIsCreateSelected(false);
        setIsEditable(false);
        resetPlaygroundState();
      }
      lastModeRef.current = mode;
    }
  }, [isCreateSelected, selectedToolInstance, selectedToolTemplate]);

  const handleSelectToolTemplate = (toolTemplateId: string) => {
    setSelectedToolTemplate(toolTemplateId);
    setSelectedToolInstance(null);
    setIsCreateSelected(false);
    setIsEditable(false);
    resetPlaygroundState();
  };

  const handleCreateCardSelect = () => {
    // Clear all other selections first
    setSelectedToolTemplate(null);
    setSelectedToolInstance(null);
    setIsEditable(false);
    resetPlaygroundState();
    // Set create mode last to ensure other state is cleared first
    setIsCreateSelected(true);
  };

  const handleCreateToolInstance = async (toolTemplateId: string | undefined) => {
    if (!workflowId) {
      console.error('Workflow ID is not set.');
      return;
    }

    try {
      setIsLoading(true); // Set loading state before starting
      const values = await form.validateFields();
      if (!values) {
        throw new Error('input validation error');
      }
      // Show initiating notification
      notificationApi.info({
        message: 'Creating Tool',
        description: 'Initializing tool creation...',
        placement: 'topRight',
      });

      let toolName = values.toolname || 'New Tool'; // Default name if not provided
      if (isCreateSelected) {
        toolName = newToolName || `${workflowName || 'Workflow'} Tool`;
      } else {
        const toolTemplate = toolTemplates.find((t) => t.id === toolTemplateId);
        if (!toolTemplate) {
          throw new Error('Tool template not found');
        }
        toolName = toolTemplate.name;
      }

      // Create tool instance
      const response = await createToolInstance({
        workflow_id: workflowId,
        name: toolName,
        tool_template_id: isCreateSelected ? '' : toolTemplateId,
      }).unwrap();

      // Show agent update notification if needed
      if (createAgentState.agentId) {
        notificationApi.info({
          message: 'Updating Agent',
          description: 'Adding tool to agent...',
          placement: 'topRight',
        });

        const agent = agents.find((a) => a.id === createAgentState.agentId);
        if (agent) {
          await updateAgent({
            agent_id: agent.id,
            name: agent.name,
            crew_ai_agent_metadata: agent.crew_ai_agent_metadata,
            tools_id: [...(agent.tools_id || []), response],
            mcp_instance_ids: agent.mcp_instance_ids || [],
            tool_template_ids: [],
            llm_provider_model_id: '',
            tmp_agent_image_path: '',
          }).unwrap();
        }
      }

      // Update the createAgentState
      dispatch(
        updatedEditorAgentViewCreateAgentState({
          ...createAgentState,
          tools: [...(createAgentState?.tools || []), response],
        }),
      );

      // Clear selection and show success
      setSelectedToolTemplate(null);
      setIsCreateSelected(false);
      notificationApi.success({
        message: 'Tool Added',
        description: 'Tool has been successfully created.',
        placement: 'topRight',
      });

      // Automatically select the new tool instance
      setEditedToolName(toolName);
      handleSelectToolInstance(response);
    } catch (error: any) {
      const errorMessage = error.data?.error || 'Failed to create tool. Please try again.';
      notificationApi.error({
        message: 'Error Adding Tool',
        description: errorMessage,
        placement: 'topRight',
      });
    } finally {
      setIsLoading(false); // Reset loading state whether success or failure
    }
  };

  const handleSelectToolInstance = (toolInstanceId: string) => {
    setSelectedToolInstance(toolInstanceId);
    setSelectedToolTemplate(null);
    setIsCreateSelected(false);
    setIsEditable(false);
    setSelectedFile(null);
    setUploadedFilePath('');
    // Set the initial tool name when selecting an instance
    const toolInstance = toolInstancesMap[toolInstanceId];
    if (toolInstance) {
      setEditedToolName(toolInstance.name);
    }
    resetPlaygroundState();
  };

  const selectedTool = toolTemplates.find((tool) => tool.id === selectedToolTemplate);

  const handleFileUpload = async (file: File) => {
    if (!file) return;
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg'];
    if (!validTypes.includes(file.type)) {
      notificationApi.error({
        message: 'Invalid File Type',
        description: 'Please upload a PNG or JPEG image file',
        placement: 'topRight',
      });
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
      console.error('Upload failed:', error);
      setSelectedFile(null);
      notificationApi.error({
        message: 'Upload Failed',
        description: 'Failed to upload file',
        placement: 'topRight',
      });
    }
  };

  const handleEditToolFile = () => {
    const selectedInstance = toolInstancesMap[selectedToolInstance || ''];
    if (selectedInstance?.source_folder_path && parentProjectDetails?.project_base) {
      const fileUrl = new URL(
        `files/${parentProjectDetails?.studio_subdirectory && parentProjectDetails?.studio_subdirectory.length > 0 ? parentProjectDetails?.studio_subdirectory + '/' : ''}${selectedInstance.source_folder_path}/`,
        parentProjectDetails.project_base,
      );
      window.open(fileUrl, '_blank');
    } else {
      notificationApi.error({
        message: 'Error',
        description: 'File path or project base URL is not available.',
        placement: 'topRight',
      });
    }
  };

  const handleRefresh = async () => {
    if (!selectedToolInstance) return;

    setIsRefreshing(true);
    try {
      const response = await getToolInstance({ tool_instance_id: selectedToolInstance }).unwrap();

      if (!response || !response.tool_instance) {
        notificationApi.error({
          message: 'Refresh Failed',
          description: 'Failed to fetch tool details.',
          placement: 'topRight',
        });
        setIsRefreshing(false);
        return;
      }

      // Only update code/requirements, keep all other state as is
      setToolInstancesMap((prev) => {
        if (!prev[selectedToolInstance]) return prev; // Defensive: don't update if not present
        return {
          ...prev,
          [selectedToolInstance]: {
            ...prev[selectedToolInstance],
            python_code: response.tool_instance!.python_code,
            python_requirements: response.tool_instance!.python_requirements,
            // Optionally update other fields if you want them refreshed
          },
        };
      });
      setEditorKey((prev) => prev + 1);

      // Do NOT touch selection state here!

      notificationApi.success({
        message: 'Refreshed',
        description: 'Tool details have been refreshed.',
        placement: 'topRight',
      });
    } catch (error) {
      notificationApi.error({
        message: 'Refresh Failed',
        description: 'Failed to refresh tool details.',
        placement: 'topRight',
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleUpdateToolInstance = async () => {
    if (!selectedToolInstance) return;

    const toolInstance = toolInstancesMap[selectedToolInstance];
    if (!toolInstance) return;

    try {
      notificationApi.info({
        message: 'Updating Tool',
        description: 'Saving tool changes...',
        placement: 'topRight',
      });

      const toolMetadata: {
        user_params_metadata?: Record<string, { required: boolean }>;
        tool_params_metadata?: Record<string, { required: boolean }>;
        [key: string]: any;
      } =
        typeof toolInstance.tool_metadata === 'string'
          ? JSON.parse(toolInstance.tool_metadata)
          : toolInstance.tool_metadata || {};

      await updateToolInstance({
        tool_instance_id: selectedToolInstance,
        name: editedToolName,
        description: toolInstance.tool_description || '',
        tmp_tool_image_path: uploadedFilePath || '',
      }).unwrap();

      // Show success notification
      notificationApi.success({
        message: 'Tool Updated',
        description: 'Tool has been successfully updated.',
        placement: 'topRight',
      });

      // Clear the uploaded file path
      setUploadedFilePath('');
    } catch (error: any) {
      const errorMessage = error.data?.error || 'Failed to update tool. Please try again.';
      notificationApi.error({
        message: 'Error Updating Tool',
        description: errorMessage,
        placement: 'topRight',
      });
    }
  };

  const filterToolTemplates = (templates: any[]) => {
    return templates.filter(
      (template) =>
        template.name.toLowerCase().includes(searchTemplates.toLowerCase()) ||
        (template.tool_description || '').toLowerCase().includes(searchTemplates.toLowerCase()),
    );
  };

  const filterToolInstances = (toolIds: string[]) => {
    return toolIds.filter((id) => {
      const tool = toolInstancesMap[id];
      return (
        tool &&
        (tool.name.toLowerCase().includes(searchTools.toLowerCase()) ||
          (tool.tool_description || '').toLowerCase().includes(searchTools.toLowerCase()))
      );
    });
  };

  const renderToolTemplate = (template: any) => {
    const isDisabled = existingToolTemplateIds.includes(template.id);

    return (
      <List.Item>
        <div
          style={{
            borderRadius: '4px',
            border: 'solid 1px #f0f0f0',
            backgroundColor:
              selectedToolTemplate === template.id && !selectedToolInstance ? '#e6ffe6' : '#fff',
            width: '100%',
            height: '100px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            cursor: isDisabled ? 'not-allowed' : 'pointer',
            transition: 'transform 0.2s, box-shadow 0.2s',
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
            opacity: isDisabled ? 0.5 : 1,
          }}
          onClick={() => {
            if (!isDisabled) {
              handleSelectToolTemplate(template.id);
            }
          }}
          onMouseEnter={(e: React.MouseEvent<HTMLElement>) => {
            e.currentTarget.style.transform = 'scale(1.03)';
            e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
          }}
          onMouseLeave={(e: React.MouseEvent<HTMLElement>) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
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
              <Image
                src={
                  template.tool_image_uri && toolIconsData[template.tool_image_uri]
                    ? toolIconsData[template.tool_image_uri]
                    : '/fallback-image.png'
                }
                alt={template.name}
                width={16}
                height={16}
                preview={false}
                style={{
                  borderRadius: '2px',
                  objectFit: 'cover',
                }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', flex: 1, gap: '4px' }}>
              <Text
                style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: '70%',
                  display: 'inline-block',
                }}
                title={template.name}
              >
                {template.name}
              </Text>
              <Tooltip
                title={
                  template.is_valid
                    ? 'Tool is valid'
                    : template.tool_metadata
                      ? JSON.parse(
                          typeof template.tool_metadata === 'string'
                            ? template.tool_metadata
                            : JSON.stringify(template.tool_metadata),
                        ).status || 'Tool status unknown'
                      : 'Tool status unknown'
                }
              >
                {template.is_valid ? (
                  <CheckCircleOutlined
                    style={{
                      color: '#52c41a',
                      fontSize: '15px',
                      fontWeight: 1000,
                      marginLeft: '4px',
                    }}
                  />
                ) : (
                  <ExclamationCircleOutlined
                    style={{
                      color: '#faad14',
                      fontSize: '15px',
                      fontWeight: 1000,
                      marginLeft: '4px',
                    }}
                  />
                )}
              </Tooltip>
            </div>
          </div>
          <Tooltip title={template.tool_description || 'N/A'}>
            <Text
              style={{
                fontSize: '11px',
                opacity: 0.45,
                fontWeight: 400,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                cursor: 'help',
              }}
            >
              {template.tool_description || 'N/A'}
            </Text>
          </Tooltip>
          {isDisabled}
        </div>
      </List.Item>
    );
  };

  const renderToolInstance = (toolInstanceId: string) => {
    const toolInstance = toolInstancesMap[toolInstanceId];
    if (!toolInstance) return null;

    // Find the corresponding tool template to get the image URI if needed
    const toolTemplate = toolTemplates.find((t) => t.id === toolInstance.tool_template_id);
    const imageUri = toolInstance.tool_image_uri || toolTemplate?.tool_image_uri;
    const description = toolInstance.tool_description || toolTemplate?.tool_description || 'N/A';

    return (
      <List.Item>
        <div
          style={{
            borderRadius: '4px',
            border: 'solid 1px #f0f0f0',
            backgroundColor: selectedToolInstance === toolInstanceId ? '#e6ffe6' : '#fff',
            width: '100%',
            height: '100px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            cursor: 'pointer',
            transition: 'transform 0.2s, box-shadow 0.2s',
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
            position: 'relative',
          }}
          onClick={() => handleSelectToolInstance(toolInstanceId)}
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
              alignItems: 'center',
              marginBottom: '8px',
              justifyContent: 'space-between',
            }}
          >
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
                <Image
                  src={
                    imageUri && toolIconsData[imageUri]
                      ? toolIconsData[imageUri]
                      : '/fallback-image.png'
                  }
                  alt={toolInstance.name}
                  width={16}
                  height={16}
                  preview={false}
                  style={{
                    borderRadius: '2px',
                    objectFit: 'cover',
                  }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Text
                  style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: '150px',
                    display: 'inline-block',
                  }}
                  title={toolInstance.name}
                >
                  {toolInstance.name}
                </Text>
                <Tooltip
                  title={
                    toolInstance.is_valid
                      ? 'Tool is valid'
                      : toolInstance.tool_metadata
                        ? JSON.parse(
                            typeof toolInstance.tool_metadata === 'string'
                              ? toolInstance.tool_metadata
                              : JSON.stringify(toolInstance.tool_metadata),
                          ).status || 'Tool status unknown'
                        : 'Tool status unknown'
                  }
                >
                  {toolInstance.is_valid ? (
                    <CheckCircleOutlined
                      style={{
                        color: '#52c41a',
                        fontSize: '15px',
                        fontWeight: 1000,
                        marginLeft: '4px',
                      }}
                    />
                  ) : (
                    <ExclamationCircleOutlined
                      style={{
                        color: '#faad14',
                        fontSize: '15px',
                        fontWeight: 1000,
                        marginLeft: '4px',
                      }}
                    />
                  )}
                </Tooltip>
              </div>
            </div>
            {/* Delete Button - on the right side, same line as tool name */}
            <Popconfirm
              title="Delete Tool"
              description="Are you sure you want to delete this tool?"
              onConfirm={(e) => {
                e?.stopPropagation();
                handleDeleteTool(toolInstanceId, toolInstance.name);
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
          <Tooltip title={description}>
            <Text
              style={{
                fontSize: '11px',
                opacity: 0.45,
                fontWeight: 400,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                cursor: 'help',
              }}
            >
              {description}
            </Text>
          </Tooltip>
        </div>
      </List.Item>
    );
  };

  const renderToolInstanceDetails = () => {
    const toolInstance = toolInstancesMap[selectedToolInstance || ''];
    if (!toolInstance) return null;

    const toolMetadata: {
      user_params_metadata?: Record<string, { required: boolean }>;
      tool_params_metadata?: Record<string, { required: boolean }>;
      [key: string]: any;
    } =
      typeof toolInstance.tool_metadata === 'string'
        ? JSON.parse(toolInstance.tool_metadata)
        : toolInstance.tool_metadata || {};

    return (
      <Layout style={{ flex: 1, backgroundColor: '#fff', padding: '0px', overflowY: 'auto' }}>
        <Typography.Title level={5} style={{ marginBottom: '16px' }}>
          Tool Details
        </Typography.Title>

        <Form layout="vertical">
          <Form.Item
            label={
              <Space>
                Tool Name
                <Tooltip title="The name of the tool, used to identify the tool in the workflow">
                  <QuestionCircleOutlined style={{ color: '#666' }} />
                </Tooltip>
              </Space>
            }
          >
            <Input
              value={editedToolName}
              onChange={(e) => setEditedToolName(e.target.value)}
              placeholder="Enter tool name"
            />
          </Form.Item>

          {selectedToolInstance && toolInstancesMap[selectedToolInstance]?.is_valid === false && (
            <div style={{ marginBottom: '16px' }}>
              {renderAlert(
                'Tool Validation Error',
                `This tool instance is in an invalid state: ${
                  toolInstancesMap[selectedToolInstance]?.tool_metadata
                    ? JSON.parse(
                        typeof toolInstancesMap[selectedToolInstance]?.tool_metadata === 'string'
                          ? toolInstancesMap[selectedToolInstance]?.tool_metadata
                          : JSON.stringify(toolInstancesMap[selectedToolInstance]?.tool_metadata),
                      ).status
                    : 'Unknown error'
                }. Please consider deleting this tool and creating a new one.`,
                'warning',
              )}
            </div>
          )}

          <Form.Item>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', flexDirection: 'row', gap: '10px' }}>
                <div style={{ minWidth: '80px' }}>Playground</div>
                <Switch
                  checked={playgroundEnabled}
                  onChange={(checked) => {
                    if (!checked) {
                      resetPlaygroundState();
                    }
                    setPlaygroundEnabled(checked);
                  }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
                <div style={{ minWidth: '80px' }}>Tool Icon</div>
                <div>
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
                      disabled={selectedFile !== null}
                    >
                      {selectedFile ? selectedFile.name : 'Upload File'}
                    </Button>
                  </Upload>
                  {selectedFile && (
                    <Button
                      icon={<DeleteOutlined />}
                      style={{ marginLeft: '8px' }}
                      onClick={() => {
                        setSelectedFile(null);
                        setUploadedFilePath('');
                      }}
                    />
                  )}
                </div>
              </div>
            </div>
          </Form.Item>

          {playgroundEnabled ? (
            <>
              <Divider style={{ margin: '8px 0 11px 0' }} />
              {Object.keys(toolMetadata.user_params_metadata || {}).length > 0 && (
                <Typography.Text
                  style={{ fontWeight: 600, fontSize: 14, marginBottom: 8, display: 'block' }}
                >
                  User Parameters
                </Typography.Text>
              )}
              <Row gutter={16} style={{ marginBottom: 0 }}>
                {Object.entries(toolMetadata.user_params_metadata || {}).map(([key, meta]) => (
                  <Col span={12} key={key}>
                    <Form.Item label={key} required={meta.required}>
                      <Input.Password
                        value={userParams[key] || ''}
                        onChange={(e) => setUserParams({ ...userParams, [key]: e.target.value })}
                        visibilityToggle={true}
                      />
                    </Form.Item>
                  </Col>
                ))}
              </Row>

              {Object.keys(toolMetadata.tool_params_metadata || {}).length > 0 && (
                <Typography.Text
                  style={{ fontWeight: 600, fontSize: 14, marginBottom: 8, display: 'block' }}
                >
                  Tool Parameters
                </Typography.Text>
              )}
              <Row gutter={16} style={{ marginBottom: 4 }}>
                {Object.entries(toolMetadata.tool_params_metadata || {}).map(([key, meta]) => (
                  <Col span={12} key={key}>
                    <Form.Item label={key} required={meta.required}>
                      <Input
                        value={toolParams[key] || ''}
                        onChange={(e) => setToolParams({ ...toolParams, [key]: e.target.value })}
                      />
                    </Form.Item>
                  </Col>
                ))}
              </Row>
              <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                <Button
                  type="primary"
                  block
                  icon={isTesting ? <Spin size="small" /> : undefined}
                  onClick={async () => {
                    setIsTesting(true);
                    setLogs([]);
                    setTestError(null);
                    allEventsRef.current = [];
                    if (intervalRef.current) {
                      clearInterval(intervalRef.current);
                      intervalRef.current = null;
                    }
                    try {
                      setTestError(null); // Clear previous error
                      const resp = await testToolInstance({
                        tool_instance_id: toolInstance.id,
                        user_params: userParams,
                        tool_params: toolParams,
                      }).unwrap();
                      setTraceId(resp.trace_id);

                      // Start polling for events
                      intervalRef.current = setInterval(async () => {
                        try {
                          const { events: newEvents } = await getEvents({
                            traceId: resp.trace_id,
                          }).unwrap();

                          // Always deduplicate by a unique key (timestamp+type+output+error)
                          const makeKey = (e: any) =>
                            [e.timestamp, e.type, e.output, e.error, e.tool_instance_id].join('|');

                          // Build a set of all seen event keys
                          const seenKeys = new Set(allEventsRef.current.map(makeKey));

                          // Only add truly new events
                          const trulyNewEvents = (newEvents || []).filter(
                            (e) => !seenKeys.has(makeKey(e)),
                          );

                          if (trulyNewEvents.length > 0) {
                            allEventsRef.current = [...allEventsRef.current, ...trulyNewEvents];
                            setLogs([...allEventsRef.current]);
                          }

                          // Always update logs even if only a single event arrives
                          if (
                            allEventsRef.current.length === 0 &&
                            newEvents &&
                            newEvents.length > 0
                          ) {
                            allEventsRef.current = [...newEvents];
                            setLogs([...allEventsRef.current]);
                          }

                          // Check for final event in the accumulated list
                          const hasFinalEvent = allEventsRef.current.some(
                            (e) => e.type === 'ToolTestCompleted' || e.type === 'ToolTestFailed',
                          );
                          if (hasFinalEvent) {
                            if (intervalRef.current) {
                              clearInterval(intervalRef.current);
                              intervalRef.current = null;
                            }
                            setIsTesting(false);
                          }
                        } catch (err) {
                          // Optionally handle error
                        }
                      }, 1000);
                    } catch (err: any) {
                      setIsTesting(false);
                      let errorMsg = 'Failed to test tool.';
                      if (err?.data?.detail) {
                        errorMsg =
                          typeof err.data.detail === 'string'
                            ? err.data.detail
                            : JSON.stringify(err.data.detail);
                      } else if (err?.error) {
                        errorMsg = err.error;
                      } else if (err?.message) {
                        errorMsg = err.message;
                      } else if (typeof err === 'string') {
                        errorMsg = err;
                      } else {
                        errorMsg = JSON.stringify(err);
                      }
                      setTestError(errorMsg);
                    }
                  }}
                  disabled={isTesting}
                  style={{ flex: 1 }}
                >
                  {isTesting ? 'Testing...' : 'Test Tool'}
                </Button>
              </div>
              {logs.length > 0 && (
                <div style={{ marginTop: 4 }}>
                  {logs.map((event, idx) => (
                    <Card
                      key={idx}
                      title={event.type}
                      style={{
                        backgroundColor: /error|fail/i.test(event.type)
                          ? '#ffeaea'
                          : event.type === 'ToolTestCompleted'
                            ? '#a2f5bf'
                            : 'white',
                        fontSize: '9px',
                        maxWidth: '100%',
                        overflow: 'hidden',
                        flexShrink: 0,
                        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.4)',
                        marginBottom: 8,
                      }}
                      headStyle={{ fontSize: '14px' }}
                      bodyStyle={{ fontSize: '9px', padding: '12px', overflow: 'auto' }}
                    >
                      <pre
                        style={{
                          fontSize: '9px',
                          margin: 0,
                          overflow: 'auto',
                          maxWidth: '100%',
                        }}
                      >
                        {JSON.stringify(event, null, 2)}
                      </pre>
                    </Card>
                  ))}
                </div>
              )}
              {testError && (
                <Alert
                  type="error"
                  message={testError}
                  showIcon
                  style={{ fontSize: 12, marginTop: 8 }}
                />
              )}
            </>
          ) : (
            <>
              <div style={{ marginBottom: '24px' }}>
                <div
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '8px',
                  }}
                >
                  <Space>
                    <Text style={{ fontWeight: 'normal' }}>tool.py</Text>
                    <Tooltip title="The Python code that defines the tool's functionality and interface">
                      <QuestionCircleOutlined style={{ color: '#666' }} />
                    </Tooltip>
                  </Space>
                  <Space>
                    <Button
                      type="text"
                      icon={<ExportOutlined />}
                      onClick={handleEditToolFile}
                      size="small"
                    >
                      Edit
                    </Button>
                    <Button
                      type="text"
                      icon={isRefreshing ? <SyncOutlined spin /> : <ReloadOutlined />}
                      onClick={handleRefresh}
                      disabled={isRefreshing}
                      size="small"
                    >
                      Refresh
                    </Button>
                  </Space>
                </div>
                <Editor
                  key={`python-${editorKey}`}
                  height="400px"
                  defaultLanguage="python"
                  value={toolInstance.python_code || 'N/A'}
                  options={{ readOnly: true }}
                  theme="vs-dark"
                />
              </div>
              <Form.Item
                label={
                  <Space>
                    requirements.txt
                    <Tooltip title="Python package dependencies required by this tool">
                      <QuestionCircleOutlined style={{ color: '#666' }} />
                    </Tooltip>
                  </Space>
                }
              >
                <Editor
                  key={`requirements-${editorKey}`}
                  height="150px"
                  defaultLanguage="plaintext"
                  value={toolInstance.python_requirements || 'N/A'}
                  options={{ readOnly: true }}
                  theme="vs-dark"
                />
              </Form.Item>
            </>
          )}
        </Form>
      </Layout>
    );
  };

  const alertStyle = {
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    padding: 12,
    marginBottom: 12,
  };

  const renderCreateNewToolForm = () => (
    <Layout style={{ flex: 1, backgroundColor: '#fff', padding: '0px', overflowY: 'auto' }}>
      <Form form={form} layout="vertical">
        <Form.Item
          label={
            <Space>
              Tool Name
              <Tooltip title="Enter the name for the new tool">
                <QuestionCircleOutlined style={{ color: '#666' }} />
              </Tooltip>
            </Space>
          }
          name="toolname"
          required
          rules={[{ required: true, message: 'Please enter a tool name' }]}
        >
          <Input
            value={form.getFieldValue('toolname')}
            onChange={(e) => form.setFieldValue('toolname', e.target.value)}
            placeholder="Enter tool name"
          />
        </Form.Item>
        <Alert
          style={alertStyle}
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
                <InfoCircleOutlined style={{ fontSize: 16, color: '#1890ff' }} />
                <Text style={{ fontSize: 13, fontWeight: 600, background: 'transparent' }}>
                  Default Code
                </Text>
              </Layout>
              <Text style={{ fontSize: 13, fontWeight: 400, background: 'transparent' }}>
                Every new tool will be initialized with this default code. You can modify the tool's
                code or other properties after it has been created.
              </Text>
            </Layout>
          }
          type="info"
          showIcon={false}
          closable={false}
        />
        <Form.Item
          label={
            <Space>
              tool.py
              <Tooltip title="The default python implementation of the tool">
                <QuestionCircleOutlined style={{ color: '#666' }} />
              </Tooltip>
            </Space>
          }
        >
          <Editor
            height="300px"
            defaultLanguage="python"
            value={defaultToolPyCode}
            options={{ readOnly: true }}
            theme="vs-dark"
          />
        </Form.Item>
        <Form.Item
          label={
            <Space>
              requirements.txt
              <Tooltip title="Default Python package dependencies required by this tool">
                <QuestionCircleOutlined style={{ color: '#666' }} />
              </Tooltip>
            </Space>
          }
        >
          <Editor
            height="150px"
            defaultLanguage="plaintext"
            value={defaultRequirementsTxt}
            options={{ readOnly: true }}
            theme="vs-dark"
          />
        </Form.Item>
      </Form>
    </Layout>
  );

  // Modify the getButtonText function to be simpler
  const getButtonText = () => {
    if (isCreateSelected) {
      return 'Create New Tool';
    } else if (selectedToolInstance) {
      return 'Save Tool'; // Changed from 'Save Tool Instance'
    } else if (selectedToolTemplate) {
      return 'Create Tool from Template';
    }
    return 'Add Tool';
  };

  const resetPlaygroundState = () => {
    setLogs([]);
    setTraceId('');
    setUserParams({});
    setToolParams({});
    setIsTesting(false);
    setPlaygroundEnabled(false); // Disable playground
    setTestError(null); // Clear error alert
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const handleDeleteTool = async (toolId: string, toolName: string) => {
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

      // Update the createAgentState to remove the tool
      if (createAgentState) {
        const updatedTools = (createAgentState.tools || []).filter((t) => t !== toolId);
        dispatch(
          updatedEditorAgentViewCreateAgentState({
            ...createAgentState,
            tools: updatedTools,
          }),
        );
      }

      // Update the agent to remove the tool
      const agent = agents.find((a) => a.id === createAgentState.agentId);
      if (agent) {
        const updatedToolIds = (agent.tools_id || []).filter((id) => id !== toolId);
        await updateAgent({
          agent_id: agent.id,
          name: agent.name,
          crew_ai_agent_metadata: agent.crew_ai_agent_metadata,
          tools_id: updatedToolIds,
          mcp_instance_ids: agent.mcp_instance_ids || [],
          tool_template_ids: [],
          llm_provider_model_id: '',
          tmp_agent_image_path: '',
        }).unwrap();
      }

      // Clear selection if the deleted tool was selected
      if (selectedToolInstance === toolId) {
        setSelectedToolInstance(null);
        setEditedToolName('');
        resetPlaygroundState();
      }
    } catch (error: any) {
      const errorMessage = error.data?.error || 'Failed to remove tool. Please try again.';
      notificationApi.error({
        message: 'Error Removing Tool',
        description: errorMessage,
        placement: 'topRight',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  return (
    <Modal
      open={open}
      title="Create or Edit Tools"
      onCancel={!isLoading ? onCancel : undefined}
      centered
      width="98%"
      style={{ height: '95vh' }}
      maskClosable={!isLoading}
      keyboard={!isLoading}
      footer={[
        <Button key="cancel" onClick={onCancel} disabled={loading || isLoading}>
          Close
        </Button>,
        // Show either the create button or update button, not both
        isCreateSelected ? (
          <Button
            key="create"
            type="primary"
            onClick={() => handleCreateToolInstance(undefined)}
            disabled={loading || isLoading}
          >
            {getButtonText()}
          </Button>
        ) : selectedToolTemplate && !selectedToolInstance ? (
          <Tooltip
            key="create-from-template"
            title={
              !selectedTool?.is_valid
                ? selectedTool?.tool_metadata
                  ? JSON.parse(
                      typeof selectedTool.tool_metadata === 'string'
                        ? selectedTool.tool_metadata
                        : JSON.stringify(selectedTool.tool_metadata),
                    ).status || 'Tool template is invalid'
                  : 'Tool template is invalid'
                : ''
            }
          >
            <Button
              key="add"
              type="primary"
              onClick={() => handleCreateToolInstance(selectedToolTemplate)}
              disabled={loading || isLoading || !selectedTool?.is_valid}
              loading={isLoading}
            >
              {getButtonText()}
            </Button>
          </Tooltip>
        ) : selectedToolInstance ? (
          <Button
            key="update"
            type="primary"
            onClick={handleUpdateToolInstance}
            disabled={loading || isLoading}
          >
            {getButtonText()}
          </Button>
        ) : null,
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
        {loading ? (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              height: '100%',
            }}
          >
            <Spin size="large" />
          </div>
        ) : (
          <div style={{ overflowY: 'auto', height: 'calc(95vh - 108px)' }}>
            <Divider style={{ margin: 0, backgroundColor: '#f0f0f0' }} />
            <Layout
              style={{
                display: 'flex',
                flexDirection: 'row',
                height: '100%',
                backgroundColor: '#fff',
              }}
            >
              <Layout
                style={{ flex: 1, overflowY: 'auto', padding: '16px', backgroundColor: '#fff' }}
              >
                <div
                  style={{
                    marginBottom: 16,
                    cursor: 'pointer',
                    boxShadow: isCreateSelected ? '0 4px 8px rgba(0, 0, 0, 0.2)' : 'none',
                    width: '100%',
                    border: 'solid 1px #f0f0f0',
                    borderRadius: '4px',
                    padding: '16px',
                    backgroundColor: isCreateSelected ? '#edf7ff' : '#fff',
                  }}
                  onClick={handleCreateCardSelect}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
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
                        <PlusOutlined style={{ fontSize: '16px', color: '#1890ff' }} />
                      </div>
                      <div>
                        <div
                          style={{
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          Create New Tool
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
                          Create a new custom tool from scratch
                        </Text>
                      </div>
                    </Space>
                  </div>
                </div>

                <Layout
                  style={{
                    display: 'flex',
                    flexDirection: 'row',
                    backgroundColor: '#fff',
                    marginBottom: '8px',
                  }}
                >
                  <Layout style={{ flex: 1, backgroundColor: '#fff', paddingRight: '16px' }}>
                    <Space direction="vertical" style={{ width: '100%', marginBottom: '0px' }}>
                      <Typography.Title level={5} style={{ marginBottom: '8px' }}>
                        Edit Agent Tools
                      </Typography.Title>
                      <Input
                        placeholder="Search tools..."
                        prefix={<SearchOutlined />}
                        value={searchTools}
                        onChange={(e) => setSearchTools(e.target.value)}
                        allowClear
                      />
                    </Space>
                  </Layout>
                  <Layout style={{ flex: 1, backgroundColor: '#fff', paddingLeft: '16px' }}>
                    <Space direction="vertical" style={{ width: '100%', marginBottom: '0px' }}>
                      <Typography.Title level={5} style={{ marginBottom: '8px' }}>
                        Create Tool From Template
                      </Typography.Title>
                      <Input
                        placeholder="Search templates..."
                        prefix={<SearchOutlined />}
                        value={searchTemplates}
                        onChange={(e) => setSearchTemplates(e.target.value)}
                        allowClear
                      />
                    </Space>
                  </Layout>
                </Layout>

                <Layout
                  style={{
                    display: 'flex',
                    flexDirection: 'row',
                    height: '100%',
                    backgroundColor: '#fff',
                    marginTop: '8px',
                  }}
                >
                  <Layout
                    style={{
                      flex: 1,
                      overflowY: 'auto',
                      backgroundColor: '#fff',
                      paddingRight: '16px',
                    }}
                  >
                    <List
                      style={{ marginTop: '8px' }}
                      grid={{ gutter: 16, column: 1 }}
                      dataSource={filterToolInstances(createAgentState?.tools || [])}
                      renderItem={(toolId) => renderToolInstance(toolId)}
                    />
                  </Layout>
                  <Layout
                    style={{
                      flex: 1,
                      overflowY: 'auto',
                      backgroundColor: '#fff',
                      paddingLeft: '16px',
                    }}
                  >
                    <List
                      style={{ marginTop: '8px' }}
                      grid={{ gutter: 16, column: 1 }}
                      dataSource={filterToolTemplates(toolTemplates)}
                      renderItem={(item) => renderToolTemplate(item)}
                    />
                  </Layout>
                </Layout>
              </Layout>

              <Divider type="vertical" style={{ height: 'auto', backgroundColor: '#f0f0f0' }} />

              <Layout
                style={{ flex: 1, backgroundColor: '#fff', padding: '16px', overflowY: 'auto' }}
              >
                {isCreateSelected ? (
                  renderCreateNewToolForm()
                ) : selectedToolInstance ? (
                  renderToolInstanceDetails()
                ) : selectedTool ? (
                  <>
                    <Typography.Title level={5} style={{ marginBottom: '16px' }}>
                      Tool Details
                    </Typography.Title>
                    <Form layout="vertical">
                      <Form.Item
                        label={
                          <Space>
                            Tool Name
                            <Tooltip title="The name of the tool">
                              <QuestionCircleOutlined style={{ color: '#666' }} />
                            </Tooltip>
                          </Space>
                        }
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Input value={selectedTool?.name} readOnly={!isEditable} />
                          <Tooltip
                            title={
                              selectedTool.is_valid
                                ? 'Tool is valid'
                                : selectedTool.tool_metadata
                                  ? JSON.parse(
                                      typeof selectedTool.tool_metadata === 'string'
                                        ? selectedTool.tool_metadata
                                        : JSON.stringify(selectedTool.tool_metadata),
                                    ).status || 'Tool status unknown'
                                  : 'Tool status unknown'
                            }
                          >
                            {selectedTool.is_valid ? (
                              <CheckCircleOutlined style={{ color: '#52c41a', fontSize: '15px' }} />
                            ) : (
                              <ExclamationCircleOutlined
                                style={{ color: '#faad14', fontSize: '15px' }}
                              />
                            )}
                          </Tooltip>
                        </div>
                      </Form.Item>

                      {selectedTool && !selectedTool.is_valid && (
                        <div style={{ marginBottom: '16px' }}>
                          {renderAlert(
                            'Tool Validation Error',
                            `This tool template is in an invalid state: ${
                              selectedTool.tool_metadata
                                ? JSON.parse(
                                    typeof selectedTool.tool_metadata === 'string'
                                      ? selectedTool.tool_metadata
                                      : JSON.stringify(selectedTool.tool_metadata),
                                  ).status
                                : 'Unknown error'
                            }. Please consider deleting this tool and creating a new one.`,
                            'warning',
                          )}
                        </div>
                      )}

                      <Form.Item
                        label={
                          <Space>
                            tool.py
                            <Tooltip title="The Python code that defines the tool's functionality and interface">
                              <QuestionCircleOutlined style={{ color: '#666' }} />
                            </Tooltip>
                          </Space>
                        }
                      >
                        <Editor
                          key={`python-${editorKey}`}
                          height="400px"
                          defaultLanguage="python"
                          value={selectedTool?.python_code || 'N/A'}
                          options={{ readOnly: true }}
                          theme="vs-dark"
                        />
                      </Form.Item>
                      <Form.Item
                        label={
                          <Space>
                            requirements.txt
                            <Tooltip title="Python package dependencies required by this tool">
                              <QuestionCircleOutlined style={{ color: '#666' }} />
                            </Tooltip>
                          </Space>
                        }
                      >
                        <Editor
                          key={`requirements-${editorKey}`}
                          height="150px"
                          defaultLanguage="plaintext"
                          value={selectedTool?.python_requirements || 'N/A'}
                          options={{ readOnly: true }}
                          theme="vs-dark"
                        />
                      </Form.Item>
                    </Form>
                  </>
                ) : null}
              </Layout>
            </Layout>
            <Divider style={{ margin: 0, backgroundColor: '#f0f0f0' }} />
          </div>
        )}
      </div>
    </Modal>
  );
};

export default WorkflowAddToolModal;
