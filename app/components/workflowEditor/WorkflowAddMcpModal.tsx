import { useListGlobalMcpTemplatesQuery } from '@/app/mcp/mcpTemplatesApi';
import {
  useListMcpInstancesQuery,
  useCreateMcpInstanceMutation,
  useUpdateMcpInstanceMutation,
  useGetMcpInstanceMutation,
} from '@/app/mcp/mcpInstancesApi';
import { useState } from 'react';
import { McpInstance, MCPTemplate } from '@/studio/proto/agent_studio';
import { useEffect } from 'react';
import {
  Modal,
  Button,
  Spin,
  Divider,
  Layout,
  Typography,
  List,
  Radio,
  Image,
  Tooltip,
  Input,
  Checkbox,
  Alert,
} from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import {
  selectEditorAgentViewCreateAgentState,
  updatedEditorAgentViewCreateAgentState,
} from '@/app/workflows/editorSlice';
import { useDispatch, useSelector } from 'react-redux';
import { useImageAssetsData } from '@/app/lib/hooks/useAssetData';
import { useGlobalNotification } from '../Notifications';
import { useListAgentsQuery, useUpdateAgentMutation } from '@/app/agents/agentApi';
import McpTemplateView from '../McpTemplateView';

const { Text } = Typography;

interface Tool {
  name: string;
  description?: string;
  inputSchema?: any;
  annotations?: any;
}

interface WorkflowAddMcpModalProps {
  workflowId: string;
  preSelectedMcpInstance?: McpInstance;
  open: boolean;
  onCancel: () => void;
}

const WorkflowAddMcpModal: React.FC<WorkflowAddMcpModalProps> = ({
  workflowId,
  preSelectedMcpInstance,
  open,
  onCancel,
}) => {
  const [shouldPollForMcpInstances, setShouldPollForMcpInstances] = useState(false);

  const { data: mcpTemplates = [], refetch: refetchMcpTemplates } = useListGlobalMcpTemplatesQuery(
    {},
  );
  const { data: mcpInstanceList = [], refetch: refetchMcpInstanceList } = useListMcpInstancesQuery(
    {
      workflow_id: workflowId,
    },
    {
      pollingInterval: shouldPollForMcpInstances ? 3000 : 0, // Only poll when needed
    },
  );
  const { data: agents = [] } = useListAgentsQuery({ workflow_id: workflowId });
  const [isLoading, setIsLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedMcpTemplate, setSelectedMcpTemplate] = useState<MCPTemplate | null>(null);
  const [selectedMcpInstance, setSelectedMcpInstance] = useState<McpInstance | null>(null);
  const [selectedMcpInstanceTools, setSelectedMcpInstanceTools] = useState<string[]>([]);
  const [noToolsSelected, setNoToolsSelected] = useState<boolean>(false);
  const [editedMcpInstanceName, setEditedMcpInstanceName] = useState<string>('');
  const createAgentState = useSelector(selectEditorAgentViewCreateAgentState);
  const [createMcpInstance] = useCreateMcpInstanceMutation();
  const [getMcpInstance] = useGetMcpInstanceMutation();
  const [updateMcpInstance] = useUpdateMcpInstanceMutation();
  const [updateAgent] = useUpdateAgentMutation();
  const notificationApi = useGlobalNotification();
  const dispatch = useDispatch();

  // Load image data for MCP instances
  const { imageData } = useImageAssetsData([
    ...mcpInstanceList.map((instance) => instance.image_uri),
    ...mcpTemplates.map((template) => template.image_uri),
  ]);

  // create a map of mcp instances
  const [mcpInstancesMap, setMcpInstancesMap] = useState<Record<string, McpInstance>>(() => {
    return mcpInstanceList.reduce((acc: Record<string, McpInstance>, instance: McpInstance) => {
      acc[instance.id] = instance;
      return acc;
    }, {});
  });

  useEffect(() => {
    const hasValidatingInstances = mcpInstanceList.some((mcp) => mcp.status === 'VALIDATING');
    // update mcpInstancesMap whenever mcpInstanceList changes
    setMcpInstancesMap(
      mcpInstanceList.reduce((acc: Record<string, McpInstance>, instance: McpInstance) => {
        acc[instance.id] = instance;
        return acc;
      }, {}),
    );
    if (selectedMcpInstance) {
      // Refresh MCP Instance selection if list is refreshed.
      const updatedInstance = mcpInstanceList.find((i) => i.id === selectedMcpInstance.id);
      if (updatedInstance) {
        handleSelectMcpInstance(updatedInstance);
      }
    }
    setShouldPollForMcpInstances(hasValidatingInstances); // Only poll when needed
  }, [mcpInstanceList]);

  useEffect(() => {
    if (preSelectedMcpInstance && open) {
      handleSelectMcpInstance(preSelectedMcpInstance);
    }
    if (!open) {
      setSelectedMcpInstance(null);
      setSelectedMcpTemplate(null);
    }
  }, [preSelectedMcpInstance, open]); // reset the selected MCP instance and template when the modal is closed

  const getButtonText = () => {
    if (selectedMcpTemplate) {
      return 'Add MCP Server to Agent';
    } else if (selectedMcpInstance) {
      return 'Update MCP Server';
    } else {
      return 'Select MCP Server definition';
    }
  };

  const handleCreateMcpInstance = async (template: MCPTemplate) => {
    if (!workflowId) {
      console.error('Workflow ID is not set.');
      return;
    }

    try {
      setIsLoading(true);

      // Show initiating notification
      notificationApi.info({
        message: 'Adding MCP to Agent',
        description: 'Initializing MCP addition...',
        placement: 'topRight',
      });

      const response = await createMcpInstance({
        name: template.name,
        mcp_template_id: template.id,
        activated_tools: [], // Activate all tools by default
        workflow_id: workflowId,
      }).unwrap();

      // Update the createAgentState regardless of whether the agent exists or not
      dispatch(
        updatedEditorAgentViewCreateAgentState({
          ...createAgentState,
          mcpInstances: [...(createAgentState?.mcpInstances || []), response],
        }),
      );

      // If adding to an existing agent, update the agent's MCP instances
      if (createAgentState.agentId) {
        notificationApi.info({
          message: 'Updating Agent',
          description: 'Adding MCP to agent...',
          placement: 'topRight',
        });

        const agent = agents.find((a) => a.id === createAgentState.agentId);
        if (agent) {
          await updateAgent({
            agent_id: agent.id,
            name: agent.name,
            crew_ai_agent_metadata: agent.crew_ai_agent_metadata,
            tools_id: agent.tools_id || [],
            mcp_instance_ids: [...(agent.mcp_instance_ids || []), response], // Update MCP with newly created MCP instance
            tool_template_ids: [],
            llm_provider_model_id: '',
            tmp_agent_image_path: '',
          }).unwrap();
        }
      }

      // Clear selection and show success
      setSelectedMcpTemplate(null);
      notificationApi.success({
        message: 'MCP Added',
        description: 'MCP has been successfully created.',
        placement: 'topRight',
      });

      // Automatically select the new MCP instance
      const newMcpInstance = await getMcpInstance({ mcp_instance_id: response }).unwrap();

      // Manually update the mcpInstancesMap to include the new instance
      setMcpInstancesMap((prevMap) => ({
        ...prevMap,
        [newMcpInstance.id]: newMcpInstance,
      }));

      handleSelectMcpInstance(newMcpInstance);
    } catch (error: any) {
      const errorMessage = error.data?.error || 'Failed to create MCP. Please try again.';
      notificationApi.error({
        message: 'Error Adding MCP',
        description: errorMessage,
        placement: 'topRight',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateMcpInstance = async () => {
    if (!workflowId) {
      console.error('Workflow ID is not set.');
      return;
    }
    if (!selectedMcpInstance) {
      console.error('No MCP instance selected.');
      return;
    }
    if (noToolsSelected) {
      console.error('No tools selected.');
      return;
    }

    try {
      setIsLoading(true);

      // Show initiating notification
      notificationApi.info({
        message: 'Updating MCP',
        description: 'Initializing MCP update...',
        placement: 'topRight',
      });

      const response = await updateMcpInstance({
        mcp_instance_id: selectedMcpInstance.id,
        name: editedMcpInstanceName,
        activated_tools: selectedMcpInstanceTools,
        tmp_mcp_image_path: '',
      }).unwrap();
    } catch (error: any) {
      const errorMessage = error.data?.error || 'Failed to update MCP. Please try again.';
      notificationApi.error({
        message: 'Error Updating MCP',
        description: errorMessage,
        placement: 'topRight',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const renderMcpTemplateList = () => {
    return (
      <List
        style={{ marginTop: '8px' }}
        grid={{ gutter: 16, column: 1 }}
        dataSource={mcpTemplates}
        renderItem={(item) => (
          <List.Item>
            <div
              style={{
                borderRadius: '4px',
                border: 'solid 1px #f0f0f0',
                backgroundColor: selectedMcpTemplate?.id === item.id ? '#edf7ff' : '#fff',
                width: '100%',
                padding: '16px',
                display: 'flex',
                alignItems: 'center',
                cursor: 'pointer',
                transition: 'transform 0.2s, box-shadow 0.2s',
                boxShadow:
                  selectedMcpTemplate?.id === item.id
                    ? '0 4px 8px rgba(0, 0, 0, 0.2)'
                    : '0 2px 4px rgba(0, 0, 0, 0.1)',
              }}
              onClick={() => {
                setSelectedMcpTemplate(item);
                setSelectedMcpInstance(null);
              }}
              onMouseEnter={(e) => {
                if (selectedMcpTemplate?.id !== item.id) {
                  e.currentTarget.style.transform = 'scale(1.02)';
                  e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.15)';
                }
              }}
              onMouseLeave={(e) => {
                if (selectedMcpTemplate?.id !== item.id) {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
                }
              }}
            >
              <Radio
                checked={selectedMcpTemplate?.id === item.id}
                onChange={() => {
                  setSelectedMcpTemplate(item);
                  setSelectedMcpInstance(null);
                }}
                style={{ marginRight: '12px' }}
              />

              <div
                style={{
                  width: '32px',
                  height: '32px',
                  minWidth: '32px',
                  borderRadius: '50%',
                  background: '#f1f1f1',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: '12px',
                }}
              >
                <Image
                  src={imageData[item.image_uri] || '/mcp-icon.svg'}
                  alt={item.name}
                  width={20}
                  height={20}
                  preview={false}
                  style={{
                    borderRadius: '2px',
                    objectFit: 'cover',
                  }}
                />
              </div>

              <div style={{ flex: 1, display: 'flex', alignItems: 'center', minWidth: 0 }}>
                <Text
                  style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    marginRight: '8px',
                  }}
                  title={item.name}
                >
                  {item.name}
                </Text>
              </div>
            </div>
          </List.Item>
        )}
      />
    );
  };

  const handleSelectMcpInstance = (mcpInstance: McpInstance) => {
    setSelectedMcpInstance(mcpInstance);
    setSelectedMcpTemplate(null);
    setSelectedMcpInstanceTools(mcpInstance.activated_tools || []);
    setEditedMcpInstanceName(mcpInstance.name || '');
    setNoToolsSelected(false);
  };

  const renderMcpInstanceList = () => {
    // Get all MCP instances that belong to this agent from the map (which includes newly created instances)
    const filteredMcpInstancesForAgent = (createAgentState?.mcpInstances || [])
      .map((instanceId) => mcpInstancesMap[instanceId])
      .filter((instance) => instance !== undefined);

    return (
      <List
        style={{ marginTop: '8px' }}
        grid={{ gutter: 16, column: 1 }}
        dataSource={filteredMcpInstancesForAgent}
        renderItem={(item) => (
          <List.Item>
            <div
              style={{
                borderRadius: '4px',
                border: 'solid 1px #f0f0f0',
                backgroundColor: selectedMcpInstance?.id === item.id ? '#edf7ff' : '#fff',
                width: '100%',
                padding: '16px',
                display: 'flex',
                alignItems: 'center',
                cursor: 'pointer',
                transition: 'transform 0.2s, box-shadow 0.2s',
                boxShadow:
                  selectedMcpInstance?.id === item.id
                    ? '0 4px 8px rgba(0, 0, 0, 0.2)'
                    : '0 2px 4px rgba(0, 0, 0, 0.1)',
              }}
              onClick={() => {
                handleSelectMcpInstance(item);
              }}
              onMouseEnter={(e) => {
                if (selectedMcpInstance?.id !== item.id) {
                  e.currentTarget.style.transform = 'scale(1.02)';
                  e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.15)';
                }
              }}
              onMouseLeave={(e) => {
                if (selectedMcpInstance?.id !== item.id) {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
                }
              }}
            >
              <Radio
                checked={selectedMcpInstance?.id === item.id}
                onChange={() => {
                  handleSelectMcpInstance(item);
                }}
                style={{ marginRight: '12px' }}
              />

              <div
                style={{
                  width: '32px',
                  height: '32px',
                  minWidth: '32px',
                  borderRadius: '50%',
                  background: '#f1f1f1',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: '12px',
                }}
              >
                <Image
                  src={imageData[item.image_uri] || '/mcp-icon.svg'}
                  alt={item.name}
                  width={20}
                  height={20}
                  preview={false}
                  style={{
                    borderRadius: '2px',
                    objectFit: 'cover',
                  }}
                />
              </div>

              <div style={{ flex: 1, display: 'flex', alignItems: 'center', minWidth: 0 }}>
                <Text
                  style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    marginRight: '8px',
                  }}
                  title={item.name}
                >
                  {item.name}
                </Text>

                <Tooltip
                  title={
                    item.status === 'VALID'
                      ? 'MCP has been validated'
                      : item.status === 'VALIDATING'
                        ? 'MCP is being validated'
                        : item.status === 'VALIDATION_FAILED'
                          ? 'MCP validation failed'
                          : 'MCP status unknown'
                  }
                >
                  {item.status === 'VALID' ? (
                    <CheckCircleOutlined
                      style={{
                        color: '#52c41a',
                        fontSize: '16px',
                        marginLeft: '8px',
                      }}
                    />
                  ) : item.status === 'VALIDATING' ? (
                    <ClockCircleOutlined
                      style={{
                        color: '#faad14',
                        fontSize: '16px',
                        marginLeft: '8px',
                      }}
                    />
                  ) : item.status === 'VALIDATION_FAILED' ? (
                    <CloseCircleOutlined
                      style={{
                        color: '#f5222d',
                        fontSize: '16px',
                        marginLeft: '8px',
                      }}
                    />
                  ) : null}
                </Tooltip>
              </div>
            </div>
          </List.Item>
        )}
      />
    );
  };

  const renderMcpDetails = () => {
    if (!selectedMcpInstance && !selectedMcpTemplate) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: '#8c8c8c',
          }}
        >
          <Typography.Text style={{ fontSize: '16px' }}>
            Select an MCP server to view details
          </Typography.Text>
        </div>
      );
    }

    if (selectedMcpTemplate) {
      return <McpTemplateView mcpTemplateDetails={selectedMcpTemplate} mode="view" />;
    }
    if (!selectedMcpInstance) {
      return <></>;
    }

    // Parse the tools JSON
    let tools: Tool[] = [];
    try {
      tools = JSON.parse(selectedMcpInstance.tools || '[]');
    } catch (error) {
      console.error('Failed to parse tools JSON:', error);
      tools = [];
    }

    const allToolNames = tools.map((tool: Tool) => tool.name);

    // If selectedMcpInstanceTools is empty, it means all tools are selected
    const isAllToolsSelected = selectedMcpInstanceTools.length === 0;
    const selectedCount = isAllToolsSelected
      ? allToolNames.length
      : selectedMcpInstanceTools.length;

    const handleToolToggle = (toolName: string) => {
      setSelectedMcpInstanceTools((prev) => {
        if (noToolsSelected) {
          // No tools were selected, now select just this one
          setNoToolsSelected(false);
          return [toolName];
        } else if (prev.length === 0) {
          // All tools were selected, now deselect this one
          setNoToolsSelected(false);
          return allToolNames.filter((name: string) => name !== toolName);
        } else {
          if (prev.includes(toolName)) {
            // Remove the tool
            const newSelection = prev.filter((name: string) => name !== toolName);
            if (newSelection.length === 0) {
              setNoToolsSelected(true);
            }
            return newSelection;
          } else {
            // Add the tool
            const newSelection = [...prev, toolName];
            if (newSelection.length === allToolNames.length) {
              // All tools are now selected, set to empty array
              setNoToolsSelected(false);
              return [];
            }
            setNoToolsSelected(false);
            return newSelection;
          }
        }
      });
    };

    const handleSelectAllToggle = (checked: boolean) => {
      if (checked) {
        // Select all tools (empty array means all selected)
        setSelectedMcpInstanceTools([]);
        setNoToolsSelected(false);
      } else {
        // Deselect all tools
        setSelectedMcpInstanceTools([]);
        setNoToolsSelected(true);
      }
    };

    const isToolSelected = (toolName: string) => {
      if (noToolsSelected) return false;
      return selectedMcpInstanceTools.length === 0 || selectedMcpInstanceTools.includes(toolName);
    };

    const isSelectAllChecked =
      !noToolsSelected &&
      (selectedMcpInstanceTools.length === 0 ||
        selectedMcpInstanceTools.length === allToolNames.length);

    return (
      <div style={{ padding: '8px 0' }}>
        <Typography.Title level={4} style={{ marginBottom: '16px' }}>
          Edit Server
        </Typography.Title>

        <div style={{ marginBottom: '24px' }}>
          <Typography.Text strong style={{ marginBottom: '8px', display: 'block' }}>
            MCP Server Name
          </Typography.Text>
          <Input
            value={editedMcpInstanceName}
            onChange={(e) => setEditedMcpInstanceName(e.target.value)}
            placeholder="[Name]"
            style={{ width: '100%' }}
          />
        </div>

        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
            <Typography.Text strong style={{ marginRight: '8px' }}>
              Tools
            </Typography.Text>
            <Tooltip
              title={
                selectedMcpInstance.status === 'VALID'
                  ? 'MCP has been validated'
                  : selectedMcpInstance.status === 'VALIDATING'
                    ? 'MCP is being validated'
                    : selectedMcpInstance.status === 'VALIDATION_FAILED'
                      ? 'MCP validation failed'
                      : 'MCP status unknown'
              }
            >
              {selectedMcpInstance.status === 'VALID' ? (
                <CheckCircleOutlined
                  style={{
                    color: '#52c41a',
                    fontSize: '16px',
                  }}
                />
              ) : selectedMcpInstance.status === 'VALIDATING' ? (
                <ClockCircleOutlined
                  style={{
                    color: '#faad14',
                    fontSize: '16px',
                  }}
                />
              ) : selectedMcpInstance.status === 'VALIDATION_FAILED' ? (
                <CloseCircleOutlined
                  style={{
                    color: '#f5222d',
                    fontSize: '16px',
                  }}
                />
              ) : null}
            </Tooltip>
          </div>

          {selectedMcpInstance.status === 'VALID' ? (
            <>
              <Checkbox
                checked={isSelectAllChecked}
                onChange={(e) => handleSelectAllToggle(e.target.checked)}
                style={{ marginBottom: '16px' }}
              >
                {selectedCount}/{allToolNames.length} Tools Selected
              </Checkbox>
            </>
          ) : selectedMcpInstance.status === 'VALIDATING' ? (
            <Alert
              style={{
                alignItems: 'flex-start',
                justifyContent: 'flex-start',
                padding: 12,
                marginBottom: 16,
              }}
              message={
                <Layout
                  style={{ flexDirection: 'column', gap: 4, padding: 0, background: 'transparent' }}
                >
                  <Text style={{ fontSize: 13, fontWeight: 400 }}>
                    We're validating the MCP server. Tools made available by the MCP server would be
                    visible once the validation succeeds.
                  </Text>
                </Layout>
              }
              type="warning"
              showIcon={false}
              closable={false}
            />
          ) : selectedMcpInstance.status === 'VALIDATION_FAILED' ? (
            <Alert
              style={{
                alignItems: 'flex-start',
                justifyContent: 'flex-start',
                padding: 12,
                marginBottom: 16,
              }}
              message={
                <Layout
                  style={{ flexDirection: 'column', gap: 4, padding: 0, background: 'transparent' }}
                >
                  <Text style={{ fontSize: 13, fontWeight: 400 }}>
                    We could not figure out the tools offered by the MCP server. But you can still
                    use the MCP server in your agentic workflows.
                  </Text>
                </Layout>
              }
              type="error"
              showIcon={false}
              closable={false}
            />
          ) : (
            <Alert
              style={{
                alignItems: 'flex-start',
                justifyContent: 'flex-start',
                padding: 12,
                marginBottom: 16,
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
                    <InfoCircleOutlined style={{ fontSize: 16, color: '#1890ff' }} />
                    <Text style={{ fontSize: 13, fontWeight: 400, background: 'transparent' }}>
                      Sorry, we couldn't predetermine the tools made available by the MCP. The agent
                      will use all the tools made available to it by the MCP at runtime.
                    </Text>
                  </Layout>
                </Layout>
              }
              type="info"
              showIcon={false}
              closable={false}
            />
          )}
        </div>

        {selectedMcpInstance.status === 'VALID' && (
          <div>
            {tools.map((tool: Tool) => (
              <div
                key={tool.name}
                style={{
                  marginBottom: '12px',
                  padding: '8px',
                  border: '1px solid #f0f0f0',
                  borderRadius: '4px',
                  backgroundColor: isToolSelected(tool.name) ? '#f6ffed' : '#fff',
                }}
              >
                <Checkbox
                  checked={isToolSelected(tool.name)}
                  onChange={() => handleToolToggle(tool.name)}
                >
                  <div>
                    <div style={{ fontWeight: 500, marginBottom: '2px' }}>{tool.name}</div>
                    {tool.description && (
                      <div
                        style={{
                          fontSize: '12px',
                          color: '#666',
                          lineHeight: '1.4',
                          marginLeft: '0px',
                        }}
                      >
                        {tool.description}
                      </div>
                    )}
                  </div>
                </Checkbox>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <Modal
      open={open}
      title="Add or Edit MCPs"
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
        // If MCP Template is selected, show the create button else update button
        selectedMcpTemplate && !selectedMcpInstance ? (
          <Button
            key="create"
            type="primary"
            onClick={() => handleCreateMcpInstance(selectedMcpTemplate)}
            disabled={loading || isLoading}
          >
            {getButtonText()}
          </Button>
        ) : selectedMcpInstance ? (
          !noToolsSelected ? (
            <Button
              key="update"
              type="primary"
              onClick={() => handleUpdateMcpInstance()}
              disabled={loading || isLoading}
            >
              {getButtonText()}
            </Button>
          ) : (
            <Tooltip title="Please select at least one tool to update the MCP server">
              <Button key="nothing" type="primary" disabled={true}>
                {getButtonText()}
              </Button>
            </Tooltip>
          )
        ) : (
          <Button key="nothing" type="primary" disabled={true}>
            {getButtonText()}
          </Button>
        ),
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
      </div>
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
              style={{
                flex: 0.2,
                padding: '16px',
                backgroundColor: '#fff',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <Layout
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  backgroundColor: '#fff',
                  flex: 1,
                  minHeight: 0,
                }}
              >
                <Typography.Title level={5} style={{ marginBottom: '8px' }}>
                  Edit MCP Server
                </Typography.Title>
                <div style={{ flex: 1, overflowY: 'auto' }}>{renderMcpInstanceList()}</div>
              </Layout>
              <Divider type="horizontal" style={{ margin: '8px', backgroundColor: '#f0f0f0' }} />
              <Layout
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  backgroundColor: '#fff',
                  flex: 1,
                  minHeight: 0,
                }}
              >
                <Typography.Title level={5} style={{ marginBottom: '8px' }}>
                  Add MCP Server to Agent
                </Typography.Title>
                <div style={{ flex: 1, overflowY: 'auto' }}>{renderMcpTemplateList()}</div>
              </Layout>
            </Layout>
            <Divider type="vertical" style={{ height: '100%', backgroundColor: '#f0f0f0' }} />
            <Layout
              style={{ flex: 0.8, overflowY: 'auto', padding: '16px', backgroundColor: '#fff' }}
            >
              {renderMcpDetails()}
            </Layout>
          </Layout>
        </div>
      )}
    </Modal>
  );
};

export default WorkflowAddMcpModal;
