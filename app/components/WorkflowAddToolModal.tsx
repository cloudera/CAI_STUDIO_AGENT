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
  Row,
  Col,
} from 'antd';
import {
  PlusOutlined,
  UploadOutlined,
  EditOutlined,
  QuestionCircleOutlined,
  ExportOutlined,
  ReloadOutlined,
  SyncOutlined,
  InfoCircleOutlined,
  FileImageOutlined,
  DeleteOutlined,
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
  selectEditorWorkflowId,
  selectEditorAgentViewCreateAgentToolTemplates,
  selectEditorAgentViewCreateAgentState,
  updatedEditorAgentViewCreateAgentState,
} from '@/app/workflows/editorSlice';
import { useGlobalNotification } from './Notifications'; // Import the notification hook
import {
  useListToolInstancesQuery,
  useCreateToolInstanceMutation,
  useUpdateToolInstanceMutation,
} from '@/app/tools/toolInstancesApi';
import { useUpdateAgentMutation, useListAgentsQuery } from '../agents/agentApi';
import { uploadFile } from '../lib/fileUpload';
import { useGetParentProjectDetailsQuery } from '../lib/crossCuttingApi';
import { defaultToolPyCode, defaultRequirementsTxt } from '@/app/utils/defaultToolCode'; // Import default code

const { Text } = Typography;
const { TextArea } = Input;

interface WorkflowAddToolModalProps {
  open: boolean;
  onCancel: () => void;
}

const WorkflowAddToolModal: React.FC<WorkflowAddToolModalProps> = ({ open, onCancel }) => {
  const { data: toolTemplates = [], refetch } = useListGlobalToolTemplatesQuery({});
  const { data: parentProjectDetails } = useGetParentProjectDetailsQuery({});
  const [selectedToolTemplate, setSelectedToolTemplate] = useState<string | null>(null);
  const [isEditable, setIsEditable] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [addToolTemplate] = useAddToolTemplateMutation();
  const workflowName = useSelector(selectEditorWorkflowName);
  const workflowId = useSelector(selectEditorWorkflowId);
  const listRef = useRef<HTMLDivElement>(null);
  const dispatch = useDispatch();
  const existingToolTemplateIds = useSelector(selectEditorAgentViewCreateAgentToolTemplates) || [];
  const notificationApi = useGlobalNotification(); // Initialize the notification API
  const [isCreateSelected, setIsCreateSelected] = useState(false);
  const [selectedToolInstance, setSelectedToolInstance] = useState<string | null>(null);
  const createAgentState = useSelector(selectEditorAgentViewCreateAgentState);
  const { data: toolInstancesList = [] } = useListToolInstancesQuery({});
  const [createToolInstance] = useCreateToolInstanceMutation();
  const [selectedAssignedAgent, setSelectedAssignedAgent] = useState<any>(null);
  const [updateAgent] = useUpdateAgentMutation();
  const { data: agents = [] } = useListAgentsQuery({});
  const [uploadedFilePath, setUploadedFilePath] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setUploading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [updateToolInstance] = useUpdateToolInstanceMutation();
  const [editedToolName, setEditedToolName] = useState<string>('');
  const [newToolName, setNewToolName] = useState<string>(''); // State for new tool name
  const [getToolInstance] = useGetToolInstanceMutation();
  const [editorKey, setEditorKey] = useState<number>(0); // Add this state

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

  useEffect(() => {
    if (toolTemplates.length > 0 && !selectedToolTemplate && !isCreateSelected) {
      setSelectedToolTemplate(toolTemplates[0].id); // Preselect the first tool template
    }
  }, [toolTemplates, selectedToolTemplate, isCreateSelected]);

  const handleSelectToolTemplate = (toolTemplateId: string) => {
    setSelectedToolTemplate(toolTemplateId);
    setSelectedToolInstance(null);
    setIsCreateSelected(false);
    setIsEditable(false);
  };

  const handleCreateCardSelect = () => {
    setSelectedToolTemplate(null);
    setSelectedToolInstance(null);
    setIsCreateSelected(true);
    setIsEditable(false);
  };

  const handleCreateTool = async () => {
    const toolName = newToolName || `${workflowName || 'Workflow'} Tool`;

    setLoading(true);
    try {
      const newToolId = await addToolTemplate({
        tool_template_name: toolName,
        tmp_tool_image_path: '',
        workflow_template_id: '', // Assuming you have a workflow ID to associate
      }).unwrap();

      notificationApi.success({
        message: 'Tool Created',
        description: `Tool template "${toolName}" has been created.`,
        placement: 'topRight',
      });

      // Refetch the tool templates to get the updated list
      const updatedToolTemplates = await refetch().unwrap();

      // Preselect the newly created tool template and place it at the top
      const reorderedToolTemplates = [
        updatedToolTemplates.find((tool) => tool.id === newToolId),
        ...updatedToolTemplates.filter((tool) => tool.id !== newToolId),
      ];

      setSelectedToolTemplate(newToolId);
      setIsEditable(true);

      // Scroll to the newly added tool template
      setTimeout(() => {
        const listElement = listRef.current;
        if (listElement) {
          const newToolElement = listElement.children[0] as HTMLElement; // New tool is at the top
          if (newToolElement) {
            newToolElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
        setLoading(false); // Stop loading after the list is updated
      }, 0);
    } catch (error: any) {
      const errorMessage = error.data?.error || 'Failed to create tool template. Please try again.';
      notificationApi.error({
        message: 'Error Creating Tool',
        description: errorMessage,
        placement: 'topRight',
      });
      setLoading(false);
    }
  };

  const handleCreateToolInstance = async (toolTemplateId: string | undefined) => {
    if (!workflowId) {
      console.error('Workflow ID is not set.');
      return;
    }

    try {
      // Show initiating notification
      notificationApi.info({
        message: 'Creating Tool',
        description: 'Initializing tool creation...',
        placement: 'topRight',
      });

      let toolName = 'New Tool';
      if (isCreateSelected) {
        toolName = newToolName || `${workflowName || 'Workflow'} Tool`;
      } else {
        // Get the tool template details
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

      // Refetch tool instances
      await refetch();
    } catch (error: any) {
      const errorMessage = error.data?.error || 'Failed to create tool. Please try again.';
      notificationApi.error({
        message: 'Error Adding Tool',
        description: errorMessage,
        placement: 'topRight',
      });
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
      // Fetch the specific tool instance details using the mutation
      const response = await getToolInstance({ tool_instance_id: selectedToolInstance }).unwrap();

      if (!response || !response.tool_instance) {
        throw new Error('Failed to fetch tool data.');
      }

      console.log('Refreshed Tool:', response);

      // Update the tool instance map with the refreshed data
      const updatedToolInstancesMap = {
        ...toolInstancesMap,
        [selectedToolInstance]: response.tool_instance, // Access the nested tool_instance data
      };

      // Update the state with the refreshed tool instance data
      setToolInstancesMap(updatedToolInstancesMap);
      setEditorKey((prev) => prev + 1); // Force re-render of editors

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

      // Refetch everything
      await refetch();

      // Wait a brief moment to ensure the backend has processed the image
      setTimeout(async () => {
        await refetch();
        await refetchImages();
      }, 500);
    } catch (error: any) {
      const errorMessage = error.data?.error || 'Failed to update tool. Please try again.';
      notificationApi.error({
        message: 'Error Updating Tool',
        description: errorMessage,
        placement: 'topRight',
      });
    }
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
              {template.tool_image_uri && toolIconsData[template.tool_image_uri] && (
                <Image
                  src={toolIconsData[template.tool_image_uri]}
                  alt={template.name}
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
              title={template.name}
            >
              {template.name}
            </Text>
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
              {imageUri && (
                <Image
                  src={toolIconsData[imageUri] || '/fallback-image.png'}
                  alt={toolInstance.name}
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
              title={toolInstance.name}
            >
              {toolInstance.name}
            </Text>
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

          <Form.Item label="Tool Icon">
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
          </Form.Item>

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
      <Form layout="vertical">
        <Form.Item
          label={
            <Space>
              Tool Name
              <Tooltip title="Enter the name for the new tool">
                <QuestionCircleOutlined style={{ color: '#666' }} />
              </Tooltip>
            </Space>
          }
        >
          <Input
            value={newToolName}
            onChange={(e) => setNewToolName(e.target.value)}
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
                Right now, the tool will be created with these default codes. You will need to
                create the tool first to let us generate necessary artifacts, after which you can
                update the tool code.
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

  return (
    <Modal
      open={open}
      title="Create or Edit Tools"
      onCancel={onCancel}
      centered
      width="98%"
      style={{ height: '95vh' }}
      footer={[
        <Button key="cancel" onClick={onCancel} disabled={loading}>
          Close
        </Button>,
        // Show either the create button or update button, not both
        isCreateSelected ? (
          <Button
            key="create"
            type="primary"
            onClick={() => handleCreateToolInstance(undefined)}
            disabled={loading}
          >
            {getButtonText()}
          </Button>
        ) : selectedToolTemplate && !selectedToolInstance ? (
          <Button
            key="add"
            type="primary"
            onClick={() => handleCreateToolInstance(selectedToolTemplate)}
            disabled={loading}
          >
            {getButtonText()}
          </Button>
        ) : selectedToolInstance ? (
          <Button key="update" type="primary" onClick={handleUpdateToolInstance} disabled={loading}>
            {getButtonText()}
          </Button>
        ) : null,
      ]}
    >
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

              <Layout style={{ display: 'flex', flexDirection: 'row', backgroundColor: '#fff' }}>
                <Layout style={{ flex: 1, backgroundColor: '#fff', paddingRight: '16px' }}>
                  <Typography.Title level={5} style={{ marginBottom: '16px' }}>
                    Edit Agent Tools
                  </Typography.Title>
                </Layout>
                <Layout style={{ flex: 1, backgroundColor: '#fff', paddingLeft: '16px' }}>
                  <Typography.Title level={5} style={{ marginBottom: '16px' }}>
                    Create Tool From Template
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
                  style={{
                    flex: 1,
                    overflowY: 'auto',
                    backgroundColor: '#fff',
                    paddingRight: '16px',
                  }}
                >
                  <List
                    grid={{ gutter: 16, column: 1 }}
                    dataSource={createAgentState?.tools || []}
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
                    grid={{ gutter: 16, column: 1 }}
                    dataSource={toolTemplates}
                    renderItem={renderToolTemplate}
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
                      <Input value={selectedTool?.name} readOnly={!isEditable} />
                    </Form.Item>
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
    </Modal>
  );
};

export default WorkflowAddToolModal;
