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

const WorkflowAddMcpModal = ({
  workflowId,
  preSelectedMcpInstance,
  open,
  onCancel,
}: WorkflowAddMcpModalProps) => {
  const [shouldPollForMcpInstances, setShouldPollForMcpInstances] = useState(false);

  const { data: mcpTemplates = [] } = useListGlobalMcpTemplatesQuery({});
  const { data: mcpInstanceList = [] } = useListMcpInstancesQuery(
    {
      workflow_id: workflowId,
    },
    {
      pollingInterval: shouldPollForMcpInstances ? 3000 : 0, // Only poll when needed
    },
  );
  const { data: agents = [] } = useListAgentsQuery({ workflow_id: workflowId });
  const [isLoading, setIsLoading] = useState(false);
  const [selectedMcpTemplate, setSelectedMcpTemplate] = useState<MCPTemplate | null>(null);
  const [selectedMcpInstance, setSelectedMcpInstance] = useState<McpInstance | null>(null);
  const [selectedMcpInstanceTools, setSelectedMcpInstanceTools] = useState<string[]>([]);
  const [noToolsSelected, setNoToolsSelected] = useState<boolean>(false);
  const [editedMcpInstanceName, setEditedMcpInstanceName] = useState<string>('');
  const [mcpInstanceNameError, setMcpInstanceNameError] = useState<string>('');
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

    // Validate MCP instance name before updating
    if (editedMcpInstanceName && !/^[a-zA-Z0-9 _-]+$/.test(editedMcpInstanceName)) {
      setMcpInstanceNameError(
        'MCP name must only contain alphabets, numbers, spaces, underscores, and hyphens.',
      );
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

      await updateMcpInstance({
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
        className="mt-2"
        grid={{ gutter: 16, column: 1 }}
        dataSource={mcpTemplates}
        renderItem={(item) => (
          <List.Item>
            <div
              className={`rounded border border-[#f0f0f0] ${
                selectedMcpTemplate?.id === item.id ? 'bg-[#edf7ff] shadow-lg' : 'bg-white shadow'
              } w-full p-4 flex items-center cursor-pointer transition-transform duration-200 hover:scale-[1.02] hover:shadow-lg`}
              onClick={() => {
                setSelectedMcpTemplate(item);
                setSelectedMcpInstance(null);
              }}
            >
              <Radio
                checked={selectedMcpTemplate?.id === item.id}
                onChange={() => {
                  setSelectedMcpTemplate(item);
                  setSelectedMcpInstance(null);
                }}
                className="mr-3"
              />

              <div className="w-8 h-8 min-w-[32px] rounded-full bg-[#f1f1f1] flex items-center justify-center mr-3">
                <Image
                  src={imageData[item.image_uri] || '/mcp-icon.svg'}
                  alt={item.name}
                  width={20}
                  height={20}
                  preview={false}
                  className="rounded-[2px] object-cover"
                />
              </div>

              <div className="flex-1 flex items-center min-w-0">
                <Text
                  className="text-sm font-semibold whitespace-nowrap overflow-hidden text-ellipsis mr-2"
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
    setMcpInstanceNameError(''); // Clear any previous validation error
    setNoToolsSelected(false);
  };

  const renderMcpInstanceList = () => {
    // Get all MCP instances that belong to this agent from the map (which includes newly created instances)
    const filteredMcpInstancesForAgent = (createAgentState?.mcpInstances || [])
      .map((instanceId) => mcpInstancesMap[instanceId])
      .filter((instance) => instance !== undefined);

    return (
      <List
        className="mt-2"
        grid={{ gutter: 16, column: 1 }}
        dataSource={filteredMcpInstancesForAgent}
        renderItem={(item) => (
          <List.Item>
            <div
              className={`rounded border border-[#f0f0f0] ${
                selectedMcpInstance?.id === item.id ? 'bg-[#edf7ff] shadow-lg' : 'bg-white shadow'
              } w-full p-4 flex items-center cursor-pointer transition-transform duration-200 hover:scale-[1.02] hover:shadow-lg`}
              onClick={() => {
                handleSelectMcpInstance(item);
              }}
            >
              <Radio
                checked={selectedMcpInstance?.id === item.id}
                onChange={() => {
                  handleSelectMcpInstance(item);
                }}
                className="mr-3"
              />

              <div className="w-8 h-8 min-w-[32px] rounded-full bg-[#f1f1f1] flex items-center justify-center mr-3">
                <Image
                  src={imageData[item.image_uri] || '/mcp-icon.svg'}
                  alt={item.name}
                  width={20}
                  height={20}
                  preview={false}
                  className="rounded-[2px] object-cover"
                />
              </div>

              <div className="flex-1 flex items-center min-w-0">
                <Text
                  className="text-sm font-semibold whitespace-nowrap overflow-hidden text-ellipsis mr-2"
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
                    <CheckCircleOutlined className="text-[#52c41a] text-[16px] ml-2" />
                  ) : item.status === 'VALIDATING' ? (
                    <ClockCircleOutlined className="text-[#faad14] text-[16px] ml-2" />
                  ) : item.status === 'VALIDATION_FAILED' ? (
                    <CloseCircleOutlined className="text-[#f5222d] text-[16px] ml-2" />
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
        <div className="flex flex-col items-center justify-center h-full text-[#8c8c8c]">
          <Typography.Text className="text-[16px]">
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
        } else if (prev.includes(toolName)) {
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
      if (noToolsSelected) {
        return false;
      }
      return selectedMcpInstanceTools.length === 0 || selectedMcpInstanceTools.includes(toolName);
    };

    const isSelectAllChecked =
      !noToolsSelected &&
      (selectedMcpInstanceTools.length === 0 ||
        selectedMcpInstanceTools.length === allToolNames.length);

    return (
      <div className="py-2">
        <Typography.Title level={4} className="mb-4">
          Edit Server
        </Typography.Title>

        <div className="mb-6">
          <Typography.Text strong className="mb-2 block">
            MCP Server Name
          </Typography.Text>
          <Input
            value={editedMcpInstanceName}
            onChange={(e) => {
              const value = e.target.value;
              setEditedMcpInstanceName(value);

              // Validate on change
              if (value && !/^[a-zA-Z0-9 _-]+$/.test(value)) {
                setMcpInstanceNameError(
                  'MCP name must only contain alphabets, numbers, spaces, underscores, and hyphens.',
                );
              } else {
                setMcpInstanceNameError('');
              }
            }}
            placeholder="[Name]"
            className="w-full"
            status={mcpInstanceNameError ? 'error' : ''}
          />
          {mcpInstanceNameError && (
            <Typography.Text type="danger" className="text-[12px] mt-1 block">
              {mcpInstanceNameError}
            </Typography.Text>
          )}
        </div>

        <div className="mb-4">
          <div className="flex items-center mb-3">
            <Typography.Text strong className="mr-2">
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
                <CheckCircleOutlined className="text-[#52c41a] text-[16px]" />
              ) : selectedMcpInstance.status === 'VALIDATING' ? (
                <ClockCircleOutlined className="text-[#faad14] text-[16px]" />
              ) : selectedMcpInstance.status === 'VALIDATION_FAILED' ? (
                <CloseCircleOutlined className="text-[#f5222d] text-[16px]" />
              ) : null}
            </Tooltip>
          </div>

          {selectedMcpInstance.status === 'VALID' ? (
            <>
              <Checkbox
                checked={isSelectAllChecked}
                onChange={(e) => handleSelectAllToggle(e.target.checked)}
                className="mb-4"
              >
                {selectedCount}/{allToolNames.length} Tools Selected
              </Checkbox>
            </>
          ) : selectedMcpInstance.status === 'VALIDATING' ? (
            <Alert
              className="items-start justify-start p-3 mb-4"
              message={
                <Layout className="flex flex-col gap-1 p-0 bg-transparent">
                  <Text className="text-[13px] font-normal">
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
              className="items-start justify-start p-3 mb-4"
              message={
                <Layout className="flex flex-col gap-1 p-0 bg-transparent">
                  <Text className="text-[13px] font-normal">
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
              className="items-start justify-start p-3 mb-4"
              message={
                <Layout className="flex flex-col gap-1 p-0 bg-transparent">
                  <Layout className="flex flex-row items-center gap-2 bg-transparent">
                    <InfoCircleOutlined className="text-[16px] text-[#1890ff]" />
                    <Text className="text-[13px] font-normal bg-transparent">
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
                className={`mb-3 p-2 border border-[#f0f0f0] rounded ${
                  isToolSelected(tool.name) ? 'bg-[#f6ffed]' : 'bg-white'
                }`}
              >
                <Checkbox
                  checked={isToolSelected(tool.name)}
                  onChange={() => handleToolToggle(tool.name)}
                >
                  <div>
                    <div className="font-medium mb-[2px]">{tool.name}</div>
                    {tool.description && (
                      <div className="text-[12px] text-[#666] leading-[1.4] ml-0">
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
      rootClassName="!top-0"
      maskClosable={!isLoading}
      keyboard={!isLoading}
      footer={[
        <Button key="cancel" onClick={onCancel} disabled={isLoading}>
          Close
        </Button>,
        // If MCP Template is selected, show the create button else update button
        selectedMcpTemplate && !selectedMcpInstance ? (
          <Button
            key="create"
            type="primary"
            onClick={() => handleCreateMcpInstance(selectedMcpTemplate)}
            disabled={isLoading}
          >
            {getButtonText()}
          </Button>
        ) : selectedMcpInstance ? (
          !noToolsSelected ? (
            <Button
              key="update"
              type="primary"
              onClick={() => handleUpdateMcpInstance()}
              disabled={isLoading}
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
      <div className="relative">
        {isLoading && (
          <div className="absolute inset-0 bg-white/60 z-[1000] flex justify-center items-center cursor-not-allowed">
            <Spin size="large" />
          </div>
        )}
      </div>
      {isLoading ? (
        <div className="flex justify-center items-center h-full">
          <Spin size="large" />
        </div>
      ) : (
        <div className="overflow-y-auto h-[calc(95vh-108px)]">
          <Divider className="m-0 bg-[#f0f0f0]" />
          <Layout className="flex flex-row h-full bg-white">
            <Layout className="flex-[0.2] p-4 bg-white flex flex-col">
              <Layout className="flex flex-col bg-white flex-1 min-h-0">
                <Typography.Title level={5} className="mb-2">
                  Edit MCP Server
                </Typography.Title>
                <div className="flex-1 overflow-y-auto">{renderMcpInstanceList()}</div>
              </Layout>
              <Divider type="horizontal" className="m-2 bg-[#f0f0f0]" />
              <Layout className="flex flex-col bg-white flex-1 min-h-0">
                <Typography.Title level={5} className="mb-2">
                  Add MCP Server to Agent
                </Typography.Title>
                <div className="flex-1 overflow-y-auto">{renderMcpTemplateList()}</div>
              </Layout>
            </Layout>
            <Divider type="vertical" className="h-full bg-[#f0f0f0]" />
            <Layout className="flex-[0.8] overflow-y-auto p-4 bg-white">
              {renderMcpDetails()}
            </Layout>
          </Layout>
        </div>
      )}
    </Modal>
  );
};

export default WorkflowAddMcpModal;
