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
import { useListGlobalToolTemplatesQuery } from '@/app/tools/toolTemplatesApi';
import { useImageAssetsData } from '@/app/lib/hooks/useAssetData';
import { Editor } from '@monaco-editor/react';
import { useAppDispatch, useAppSelector } from '@/app/lib/hooks/hooks';
import {
  selectEditorWorkflowName,
  selectEditorAgentViewCreateAgentToolTemplates,
  selectEditorAgentViewCreateAgentState,
  updatedEditorAgentViewCreateAgentState,
  closedEditorToolView,
  selectEditorSelectedToolTemplateId,
  selectEditorSelectedToolInstanceId,
  selectEditorToolViewIsVisible,
  updatedEditorSelectedToolTemplateId,
  updatedEditorSelectedToolInstanceId,
  clearedEditorToolEditingState,
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
import { useGetEventsMutation } from '@/app/workflows/workflowAppApi'; // This is the same as WorkflowApp.tsx

const { Text } = Typography;

interface WorkflowAddToolModalProps {
  workflowId: string;
}

const WorkflowAddToolModal: React.FC<WorkflowAddToolModalProps> = ({ workflowId }) => {
  const { data: toolTemplates = [] } = useListGlobalToolTemplatesQuery({});
  const { data: parentProjectDetails } = useGetParentProjectDetailsQuery({});
  const selectedToolTemplate = useAppSelector(selectEditorSelectedToolTemplateId);
  const workflowName = useAppSelector(selectEditorWorkflowName);
  const open = useAppSelector(selectEditorToolViewIsVisible);
  const dispatch = useAppDispatch();
  const existingToolTemplateIds =
    useAppSelector(selectEditorAgentViewCreateAgentToolTemplates) || [];
  const notificationApi = useGlobalNotification(); // Initialize the notification API
  const selectedToolInstance = useAppSelector(selectEditorSelectedToolInstanceId);
  const isCreateSelected = !selectedToolTemplate && !selectedToolInstance;
  const createAgentState = useAppSelector(selectEditorAgentViewCreateAgentState);
  const { data: toolInstancesList = [], refetch: refetchToolInstances } = useListToolInstancesQuery(
    { workflow_id: workflowId },
  );
  const [toolInstancesMap, setToolInstancesMap] = useState<Record<string, any>>({});
  const [createToolInstance] = useCreateToolInstanceMutation();
  const [updateAgent] = useUpdateAgentMutation();
  const { data: agents = [] } = useListAgentsQuery({ workflow_id: workflowId });
  const [uploadedFilePath, setUploadedFilePath] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setUploading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [updateToolInstance] = useUpdateToolInstanceMutation();
  const [editedToolName, setEditedToolName] = useState<string>('');
  const [searchTemplates, setSearchTemplates] = useState('');
  const [searchTools, setSearchTools] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [playgroundEnabled, setPlaygroundEnabled] = useState(false);
  const [userParams, setUserParams] = useState<{ [key: string]: string }>({});
  const [toolParams, setToolParams] = useState<{ [key: string]: string }>({});
  const [logs, setLogs] = useState<any[]>([]);
  const [isTesting, setIsTesting] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [testToolInstance] = useTestToolInstanceMutation();
  const [getEvents] = useGetEventsMutation();
  const [deleteToolInstance] = useRemoveToolInstanceMutation();
  const [testError, setTestError] = useState<string | null>(null);
  const allEventsRef = useRef<any[]>([]);
  const [form] = Form.useForm<{
    toolname: string;
  }>();

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

  const { imageData: toolIconsData } = useImageAssetsData(allImageUris);

  const setSelectedToolTemplate = (toolTemplateId?: string) => {
    dispatch(updatedEditorSelectedToolTemplateId(toolTemplateId));
  };

  useEffect(() => {
    if (selectedToolInstance && toolInstancesMap[selectedToolInstance]) {
      setEditedToolName(toolInstancesMap[selectedToolInstance].name || '');
    } else if (selectedToolTemplate) {
      setEditedToolName(toolTemplates.find((t) => t.id === selectedToolTemplate)?.name || '');
    }
    resetPlaygroundState();
  }, [selectedToolInstance, selectedToolTemplate, toolInstancesMap]);

  const handleSelectToolTemplate = (toolTemplateId: string) => {
    setSelectedToolTemplate(toolTemplateId);
    resetPlaygroundState();
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

      let toolName: string;
      if (isCreateSelected) {
        toolName = values.toolname || `${workflowName} New Tool`;
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
    dispatch(updatedEditorSelectedToolInstanceId(toolInstanceId));
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
    if (!file) {
      return;
    }
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
    if (!selectedToolInstance) {
      return;
    }

    setIsRefreshing(true);
    try {
      await refetchToolInstances();
      notificationApi.success({
        message: 'Refreshed',
        description: 'Tool details have been refreshed.',
        placement: 'topRight',
      });
    } catch (_error) {
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
    if (!selectedToolInstance) {
      return;
    }

    const toolInstance = toolInstancesMap[selectedToolInstance];
    if (!toolInstance) {
      return;
    }

    try {
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

    // Tailwind conversion for the card
    const cardBg =
      selectedToolTemplate === template.id && !selectedToolInstance ? 'bg-green-50' : 'bg-white';
    const cardCursor = isDisabled ? 'cursor-not-allowed' : 'cursor-pointer';
    const cardOpacity = isDisabled ? 'opacity-50' : 'opacity-100';
    return (
      <List.Item>
        <div
          className={`rounded border border-[#f0f0f0] w-full h-[100px] p-4 flex flex-col transition-transform duration-200 ${cardBg} ${cardCursor} ${cardOpacity}`}
          onClick={() => {
            if (!isDisabled) {
              handleSelectToolTemplate(template.id);
            }
          }}
          onMouseEnter={(e: React.MouseEvent<HTMLElement>) => {
            e.currentTarget.classList.add('scale-[1.03]', 'shadow-lg');
          }}
          onMouseLeave={(e: React.MouseEvent<HTMLElement>) => {
            e.currentTarget.classList.remove('scale-[1.03]', 'shadow-lg');
          }}
        >
          <div className="flex items-center mb-2">
            <div className="w-6 h-6 rounded-full bg-[#f1f1f1] flex items-center justify-center mr-2">
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
                className="rounded object-cover w-4 h-4"
              />
            </div>
            <div className="flex items-center flex-1 gap-1">
              <Text
                className="text-[14px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis max-w-[70%] inline-block"
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
                  <CheckCircleOutlined className="text-green-500 text-[15px] font-extrabold ml-1" />
                ) : (
                  <ExclamationCircleOutlined className="text-yellow-500 text-[15px] font-extrabold ml-1" />
                )}
              </Tooltip>
            </div>
          </div>
          <Tooltip title={template.tool_description || 'N/A'}>
            <Text className="text-[11px] opacity-45 font-normal whitespace-nowrap overflow-hidden text-ellipsis cursor-help">
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
    if (!toolInstance) {
      return null;
    }

    // Find the corresponding tool template to get the image URI if needed
    const toolTemplate = toolTemplates.find((t) => t.id === toolInstance.tool_template_id);
    const imageUri = toolInstance.tool_image_uri || toolTemplate?.tool_image_uri;
    const description = toolInstance.tool_description || toolTemplate?.tool_description || 'N/A';

    const cardBg = selectedToolInstance === toolInstanceId ? 'bg-green-50' : 'bg-white';
    return (
      <List.Item>
        <div
          className={`rounded border border-[#f0f0f0] w-full h-[100px] p-4 flex flex-col transition-transform duration-200 relative ${cardBg} cursor-pointer`}
          onClick={() => handleSelectToolInstance(toolInstanceId)}
          onMouseEnter={(e: React.MouseEvent<HTMLElement>) => {
            e.currentTarget.classList.add('scale-[1.03]', 'shadow-lg');
          }}
          onMouseLeave={(e: React.MouseEvent<HTMLElement>) => {
            e.currentTarget.classList.remove('scale-[1.03]', 'shadow-lg');
          }}
        >
          <div className="flex items-center mb-2 justify-between">
            <div className="flex items-center">
              <div className="w-6 h-6 rounded-full bg-[#f1f1f1] flex items-center justify-center mr-2">
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
                  className="rounded object-cover"
                />
              </div>
              <div className="flex items-center gap-1">
                <Text
                  className="text-[14px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis max-w-[150px] inline-block"
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
                    <CheckCircleOutlined className="text-green-500 text-[15px] font-extrabold ml-1" />
                  ) : (
                    <ExclamationCircleOutlined className="text-yellow-500 text-[15px] font-extrabold ml-1" />
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
                icon={<DeleteOutlined className="text-[#ff4d4f]" />}
                onClick={(e) => e.stopPropagation()}
                disabled={isLoading}
                size="small"
                className="w-5 h-5 flex items-center justify-center p-0 min-w-0"
              />
            </Popconfirm>
          </div>
          <Tooltip title={description}>
            <Text className="text-[11px] opacity-45 font-normal whitespace-nowrap overflow-hidden text-ellipsis cursor-help">
              {description}
            </Text>
          </Tooltip>
        </div>
      </List.Item>
    );
  };

  const renderToolInstanceDetails = () => {
    const toolInstance = toolInstancesMap[selectedToolInstance || ''];
    if (!toolInstance) {
      return null;
    }

    const toolMetadata: {
      user_params_metadata?: Record<string, { required: boolean }>;
      tool_params_metadata?: Record<string, { required: boolean }>;
      [key: string]: any;
    } =
      typeof toolInstance.tool_metadata === 'string'
        ? JSON.parse(toolInstance.tool_metadata)
        : toolInstance.tool_metadata || {};

    return (
      <Layout className="flex-1 bg-white p-0 overflow-y-auto">
        <Typography.Title level={5} className="mb-4">
          Tool Details
        </Typography.Title>

        <Form layout="vertical">
          <Form.Item
            label={
              <Space>
                Tool Name
                <Tooltip title="The name of the tool, used to identify the tool in the workflow">
                  <QuestionCircleOutlined className="text-[#666]" />
                </Tooltip>
              </Space>
            }
          >
            <Input
              value={editedToolName}
              onChange={(e) => {
                setEditedToolName(e.target.value);
              }}
              placeholder="Enter tool name"
            />
          </Form.Item>

          {selectedToolInstance && toolInstancesMap[selectedToolInstance]?.is_valid === false && (
            <div className="mb-4">
              {renderAlert(
                'Tool Validation Error',
                `This tool instance is in an invalid state: ${
                  toolInstancesMap[selectedToolInstance]?.tool_metadata
                    ? (() => {
                        try {
                          const metadata = toolInstancesMap[selectedToolInstance]?.tool_metadata;
                          const parsedMetadata = JSON.parse(
                            typeof metadata === 'string' ? metadata : JSON.stringify(metadata),
                          );
                          return parsedMetadata.status || 'Unknown error';
                        } catch (_err) {
                          return 'Error parsing metadata';
                        }
                      })()
                    : 'Unknown error'
                }. Please consider deleting this tool and creating a new one.`,
                'warning',
              )}
            </div>
          )}

          <Form.Item>
            <div className="flex items-center justify-between">
              <div className="flex flex-row gap-2.5 min-w-[80px]">
                <div className="min-w-[80px]">Playground</div>
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
              <div className="flex flex-row items-center">
                <div className="min-w-[80px]">Tool Icon</div>
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
                      className="ml-2"
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
              <Divider className="my-2.5 mb-[11px]" />
              {Object.keys(toolMetadata.user_params_metadata || {}).length > 0 && (
                <Typography.Text className="font-semibold text-sm mb-2 block">
                  User Parameters
                </Typography.Text>
              )}
              <Row gutter={16} className="mb-0">
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
                <Typography.Text className="font-semibold text-sm mb-2 block">
                  Tool Parameters
                </Typography.Text>
              )}
              <Row gutter={16} className="mb-1">
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
              <div className="flex gap-2 flex-shrink-0">
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

                      // Start polling for events
                      intervalRef.current = setInterval(async () => {
                        try {
                          let { events: newEvents } = await getEvents({
                            trace_id: resp.trace_id,
                          }).unwrap();

                          // Filter events to only show ToolOutput events and events with "failed" in type
                          newEvents = (newEvents || []).filter(
                            (e: any) =>
                              e.type === 'ToolOutput' ||
                              (e.type && e.type.toLowerCase().includes('failed')),
                          );

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
                            (e) =>
                              e.type === e.type.toLowerCase().includes('failed') ||
                              e.type === 'ToolOutput',
                          );
                          if (hasFinalEvent) {
                            if (intervalRef.current) {
                              clearInterval(intervalRef.current);
                              intervalRef.current = null;
                            }
                            setIsTesting(false);
                          }
                        } catch (_err) {
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
                  className="flex-1"
                >
                  {isTesting ? 'Testing...' : 'Test Tool'}
                </Button>
              </div>
              {logs.length > 0 && (
                <div className="mt-1">
                  {logs.map((event, idx) => (
                    <Card
                      key={idx}
                      className={`
                        text-[9px]
                        max-w-full
                        overflow-hidden
                        shrink-0
                        shadow-[0_2px_4px_rgba(0,0,0,0.4)]
                        mb-2
                        ${
                          /error|fail/i.test(event.type)
                            ? 'bg-[#ffeaea]'
                            : event.type === 'ToolTestCompleted'
                              ? 'bg-[#a2f5bf]'
                              : 'bg-white'
                        }
                      `}
                      headStyle={{ fontSize: '14px' }}
                      bodyStyle={{ fontSize: '9px', padding: '12px', overflow: 'auto' }}
                    >
                      <pre className="text-[9px] m-0 overflow-auto max-w-full">
                        {event.error ? event.type + '\n' + event.error : event.output}
                      </pre>
                    </Card>
                  ))}
                </div>
              )}
              {testError && (
                <Alert type="error" message={testError} showIcon className="text-[12px] mt-2" />
              )}
            </>
          ) : (
            <>
              <div className="mb-6">
                <div className="w-full flex items-center justify-between mb-2">
                  <Space>
                    <Text className="font-normal">tool.py</Text>
                    <Tooltip title="The Python code that defines the tool's functionality and interface">
                      <QuestionCircleOutlined className="text-[#666]" />
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
                  key={`python-${selectedToolInstance}`}
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
                      <QuestionCircleOutlined className="text-[#666]" />
                    </Tooltip>
                  </Space>
                }
              >
                <Editor
                  key={`requirements-${selectedToolInstance}`}
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

  const renderCreateNewToolForm = () => (
    <Layout className="flex-1 bg-white p-0 overflow-y-auto">
      <Form form={form} layout="vertical">
        <Form.Item
          label={
            <Space>
              Tool Name
              <Tooltip title="Enter the name for the new tool">
                <QuestionCircleOutlined className="text-[#666]" />
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
          className="items-start justify-start p-3 mb-3"
          message={
            <Layout className="flex flex-col gap-1 p-0 bg-transparent">
              <Layout className="flex flex-row items-center gap-2 bg-transparent">
                <InfoCircleOutlined className="text-blue-500 text-base" />
                <Text className="text-sm font-semibold bg-transparent">Default Code</Text>
              </Layout>
              <Text className="text-sm font-normal bg-transparent">
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
                <QuestionCircleOutlined className="text-[#666]" />
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
                <QuestionCircleOutlined className="text-[#666]" />
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
        dispatch(clearedEditorToolEditingState());
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

  const onCancel = () => {
    if (!isLoading) {
      dispatch(closedEditorToolView());
    }
  };

  return (
    <Modal
      open={open}
      title="Create or Edit Tools"
      onCancel={!isLoading ? onCancel : undefined}
      centered
      width="98%"
      className="h-[95vh]"
      maskClosable={!isLoading}
      keyboard={!isLoading}
      footer={[
        <Button key="cancel" onClick={onCancel} disabled={isLoading}>
          Close
        </Button>,
        // Show either the create button or update button, not both
        isCreateSelected ? (
          <Button
            key="create"
            type="primary"
            onClick={() => handleCreateToolInstance(undefined)}
            disabled={isLoading}
          >
            {getButtonText()}
          </Button>
        ) : selectedToolTemplate ? (
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
              disabled={isLoading || !selectedTool?.is_valid}
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
            disabled={isLoading}
          >
            {getButtonText()}
          </Button>
        ) : null,
      ]}
    >
      <div className="relative">
        {isLoading && (
          <div className="absolute top-0 left-0 right-0 bottom-0 bg-white bg-opacity-60 z-1000 flex items-center justify-center cursor-not-allowed">
            <Spin size="large" />
          </div>
        )}
        <div className="overflow-y-auto h-[calc(95vh-108px)]">
          <Divider className="m-0 bg-[#f0f0f0]" />
          <Layout className="flex flex-row h-full bg-white">
            <Layout className="flex-1 overflow-y-auto p-4 bg-white">
              <div
                className={`mb-4 cursor-pointer border border-[#f0f0f0] rounded p-4 ${isCreateSelected ? 'shadow-lg bg-[#edf7ff]' : 'shadow-none bg-white'}`}
                onClick={() => {
                  dispatch(clearedEditorToolEditingState());
                  resetPlaygroundState();
                }}
              >
                <div className="flex items-center justify-between">
                  <Space size={16}>
                    <div className="w-8 h-8 rounded-full bg-[#edf7ff] flex items-center justify-center">
                      <PlusOutlined className="text-base text-blue-500" />
                    </div>
                    <div>
                      <div className="whitespace-nowrap overflow-hidden text-ellipsis">
                        Create New Tool
                      </div>
                      <Text className="text-[11px] opacity-45 whitespace-nowrap overflow-hidden text-ellipsis">
                        Create a new custom tool from scratch
                      </Text>
                    </div>
                  </Space>
                </div>
              </div>

              <Layout className="flex flex-row bg-white mb-2">
                <Layout className="flex-1 bg-white pr-4">
                  <Space direction="vertical" className="w-full mb-0">
                    <Typography.Title level={5} className="mb-2">
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
                <Layout className="flex-1 bg-white pl-4">
                  <Space direction="vertical" className="w-full mb-0">
                    <Typography.Title level={5} className="mb-2">
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

              <Layout className="flex flex-row h-full bg-white mt-2">
                <Layout className="flex-1 overflow-y-auto bg-white pr-4">
                  <List
                    className="mt-2"
                    grid={{ gutter: 16, column: 1 }}
                    dataSource={filterToolInstances(createAgentState?.tools || [])}
                    renderItem={(toolId) => renderToolInstance(toolId)}
                  />
                </Layout>
                <Layout className="flex-1 overflow-y-auto bg-white pl-4">
                  <List
                    className="mt-2"
                    grid={{ gutter: 16, column: 1 }}
                    dataSource={filterToolTemplates(toolTemplates)}
                    renderItem={(item) => renderToolTemplate(item)}
                  />
                </Layout>
              </Layout>
            </Layout>

            <Divider type="vertical" className="h-auto bg-[#f0f0f0]" />

            <Layout className="flex-1 bg-white p-4 overflow-y-auto">
              {isCreateSelected ? (
                renderCreateNewToolForm()
              ) : selectedToolInstance ? (
                renderToolInstanceDetails()
              ) : selectedTool ? (
                <>
                  <Typography.Title level={5} className="mb-4">
                    Tool Details
                  </Typography.Title>
                  <Form layout="vertical">
                    <Form.Item
                      label={
                        <Space>
                          Tool Name
                          <Tooltip title="The name of the tool">
                            <QuestionCircleOutlined className="text-[#666]" />
                          </Tooltip>
                        </Space>
                      }
                    >
                      <div className="flex items-center gap-2">
                        <Input value={selectedTool?.name} readOnly={true} />
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
                            <CheckCircleOutlined className="text-green-500 text-base" />
                          ) : (
                            <ExclamationCircleOutlined className="text-yellow-500 text-base" />
                          )}
                        </Tooltip>
                      </div>
                    </Form.Item>

                    {selectedTool && !selectedTool.is_valid && (
                      <div className="mb-4">
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
                            <QuestionCircleOutlined className="text-[#666]" />
                          </Tooltip>
                        </Space>
                      }
                    >
                      <Editor
                        key={`python-${selectedToolTemplate}`}
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
                            <QuestionCircleOutlined className="text-[#666]" />
                          </Tooltip>
                        </Space>
                      }
                    >
                      <Editor
                        key={`requirements-${selectedToolTemplate}`}
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
          <Divider className="m-0 bg-[#f0f0f0]" />
        </div>
      </div>
    </Modal>
  );
};

export default WorkflowAddToolModal;
