import { useAppDispatch, useAppSelector } from '../../lib/hooks/hooks';
import {
  selectEditorWorkflowAgentIds,
  selectEditorWorkflowIsConversational,
  selectEditorWorkflowManagerAgentId,
  selectEditorWorkflowDescription,
  selectEditorWorkflowTaskIds,
  updatedEditorAgentViewOpen,
  updatedEditorAgentViewStep,
  updatedEditorAgentViewAgent,
  updatedEditorWorkflowAgentIds,
  updatedEditorWorkflowIsConversational,
  updatedEditorWorkflowManagerAgentId,
  updatedEditorWorkflowDescription,
  updatedEditorWorkflowTaskIds,
  selectEditorWorkflow,
  updatedEditorWorkflowId,
  selectEditorWorkflowProcess,
  updatedEditorWorkflowProcess,
} from '../../workflows/editorSlice';
import {
  Button,
  Divider,
  Input,
  Layout,
  Space,
  Tooltip,
  List,
  Image,
  Popconfirm,
  Avatar,
  Collapse,
  Switch,
} from 'antd';
import { Typography } from 'antd/lib';
const { Header, Content } = Layout;
const { Text } = Typography;
import {
  PlusCircleOutlined,
  QuestionCircleOutlined,
  EditOutlined,
  DeleteOutlined,
  UserOutlined,
  UsergroupAddOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import { useListAgentsQuery, useRemoveAgentMutation } from '../../agents/agentApi';
import { AgentMetadata, McpInstance, ToolInstance } from '@/studio/proto/agent_studio';
import {
  useAddTaskMutation,
  useListTasksQuery,
  useRemoveTaskMutation,
  useUpdateTaskMutation,
} from '../../tasks/tasksApi';
import SelectOrAddAgentModal from './SelectOrAddAgentModal';
import { useListToolInstancesQuery } from '@/app/tools/toolInstancesApi';
import { useState, useEffect } from 'react';
import { useImageAssetsData } from '@/app/lib/hooks/useAssetData';
import { useGlobalNotification } from '../Notifications';
import { useAddWorkflowMutation, useUpdateWorkflowMutation } from '../../workflows/workflowsApi';
import { createUpdateRequestFromEditor, createAddRequestFromEditor } from '../../lib/workflow';
import SelectOrAddManagerAgentModal from './SelectOrAddManagerAgentModal';
import { useListMcpInstancesQuery } from '@/app/mcp/mcpInstancesApi';

const WorkflowDescriptionComponent: React.FC = () => {
  const workflowDescription = useAppSelector(selectEditorWorkflowDescription);
  const dispatch = useAppDispatch();

  return (
    <>
      <Layout
        style={{
          flexGrow: 0,
          flexShrink: 0,
          flexDirection: 'column',
          gap: '8px',
          background: 'transparent',
        }}
      >
        <Collapse
          bordered={false}
          items={[
            {
              key: '1',
              label: 'Capability Guide',
              children: (
                <Input.TextArea
                  placeholder="Description"
                  value={workflowDescription}
                  onChange={(e) => dispatch(updatedEditorWorkflowDescription(e.target.value))}
                  autoSize={{ minRows: 1, maxRows: 6 }}
                />
              ),
            },
          ]}
        />
      </Layout>
    </>
  );
};

interface WorkflowAgentsComponentProps {
  workflowId: string;
}

const WorkflowAgentsComponent: React.FC<WorkflowAgentsComponentProps> = ({ workflowId }) => {
  const { data: agents } = useListAgentsQuery({ workflow_id: workflowId });
  const { data: toolInstances } = useListToolInstancesQuery({ workflow_id: workflowId });
  const { data: mcpInstances } = useListMcpInstancesQuery({ workflow_id: workflowId });
  const workflowAgentIds = useAppSelector(selectEditorWorkflowAgentIds);
  const dispatch = useAppDispatch();
  const [toolInstancesMap, setToolInstancesMap] = useState<Record<string, any>>({});
  const [mcpInstancesMap, setMcpInstancesMap] = useState<Record<string, any>>({});
  const [agentsInstancesMap, setAgentsInstancesMap] = useState<Record<string, any>>({});
  const [removeAgent] = useRemoveAgentMutation();
  const notificationApi = useGlobalNotification();
  const [updateWorkflow] = useUpdateWorkflowMutation();
  const [addWorkflow] = useAddWorkflowMutation();
  const workflowState = useAppSelector(selectEditorWorkflow);

  const toolImageUris = Object.values(toolInstancesMap)
    .map((instance) => instance.tool_image_uri)
    .filter((uri): uri is string => typeof uri === 'string' && uri.length > 0);
  const mcpImageUris = Object.values(mcpInstancesMap)
    .map((instance) => instance.image_uri)
    .filter((uri): uri is string => typeof uri === 'string' && uri.length > 0);
  const agentImageUris = Object.values(agentsInstancesMap)
    .map((agent) => agent.agent_image_uri)
    .filter((uri): uri is string => typeof uri === 'string' && uri.length > 0);
  const { imageData } = useImageAssetsData(toolImageUris.concat(mcpImageUris, agentImageUris));

  // Add effect to refetch images when tool instances change
  // TODO: this should be middleware at the RTK level
  useEffect(() => {
    if (!toolInstances || !mcpInstances || !agents) {
      return;
    }
    const tiMap = toolInstances.reduce<Record<string, ToolInstance>>(
      (acc, ti) => ({ ...acc, [ti.id]: ti }),
      {},
    );
    const miMap = mcpInstances.reduce<Record<string, McpInstance>>(
      (acc, mi) => ({ ...acc, [mi.id]: mi }),
      {},
    );
    const agMap = agents.reduce<Record<string, AgentMetadata>>(
      (acc, ag) => ({ ...acc, [ag.id]: ag }),
      {},
    );
    setToolInstancesMap(tiMap);
    setMcpInstancesMap(miMap);
    setAgentsInstancesMap(agMap);
  }, [toolInstances, mcpInstances, agents]);

  const handleDeleteAgent = async (agentId: string, agentName: string) => {
    try {
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

      notificationApi.success({
        message: 'Agent Removed',
        description: `Agent ${agentName} has been successfully removed.`,
        placement: 'topRight',
      });
    } catch (error) {
      notificationApi.error({
        message: 'Error Removing Agent',
        description: 'There was an error removing the agent. Please try again.',
        placement: 'topRight',
      });
    }
  };

  return (
    <>
      <SelectOrAddAgentModal workflowId={workflowId} />
      <Layout
        style={{
          gap: '10px',
          flexGrow: 0,
          flexShrink: 0,
          flexDirection: 'column',
          background: 'transparent',
        }}
      >
        <Layout
          style={{
            background: 'transparent',
            flexDirection: 'row',
            gap: 4,
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: 600 }}>Agents</Text>
          <Tooltip title="Agents are responsible for completing tasks." placement="right">
            <QuestionCircleOutlined />
          </Tooltip>
        </Layout>

        <Button
          onClick={() => {
            dispatch(updatedEditorAgentViewOpen(true));
            dispatch(updatedEditorAgentViewStep('Select'));
            dispatch(updatedEditorAgentViewAgent(undefined));
          }}
          style={{
            width: '100%',
            height: 40,
          }}
        >
          <Layout
            style={{
              background: 'transparent',
              flexDirection: 'row',
              justifyContent: 'center',
              gap: 11,
            }}
          >
            <PlusCircleOutlined />
            <Text style={{ fontSize: 14, fontWeight: 400 }}>Create or Edit Agents</Text>
          </Layout>
        </Button>

        {workflowAgentIds && workflowAgentIds.length > 0 && (
          <List
            grid={{ gutter: 16, column: 2 }}
            dataSource={agents?.filter((agent) => workflowAgentIds.includes(agent.id))}
            renderItem={(agent) => {
              const iconResourceIds = (agent.tools_id || []).concat(agent.mcp_instance_ids || []);
              return (
                <List.Item>
                  <Layout
                    style={{
                      borderRadius: '4px',
                      border: 'solid 1px #f0f0f0',
                      backgroundColor: '#fff',
                      width: '100%',
                      height: '180px',
                      margin: '0px 12px 16px 0px',
                      padding: '0',
                      display: 'flex',
                      flexDirection: 'column',
                      cursor: 'pointer',
                      transition: 'transform 0.2s, box-shadow 0.2s',
                      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'scale(1.03)';
                      e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1)';
                      e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
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
                        <span style={{ color: 'black', fontWeight: 400 }}>
                          {agent.crew_ai_agent_metadata?.goal || 'N/A'}
                        </span>
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
                          {agent.crew_ai_agent_metadata?.backstory || 'N/A'}
                        </span>
                      </Text>
                      {iconResourceIds.length > 0 && (
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
                          {iconResourceIds.map((resourceId) => {
                            const toolInstance = toolInstancesMap[resourceId];
                            const mcpInstance = mcpInstancesMap[resourceId];
                            const resourceType: 'tool' | 'mcp' = toolInstance ? 'tool' : 'mcp';
                            const imageUri =
                              resourceType === 'tool'
                                ? toolInstance?.tool_image_uri
                                : mcpInstance?.image_uri;
                            const imageSrc =
                              imageUri && imageData[imageUri]
                                ? imageData[imageUri]
                                : resourceType === 'tool'
                                  ? '/fallback-image.png'
                                  : '/mcp-icon.svg';
                            return (
                              <Tooltip
                                title={toolInstance?.name || mcpInstance?.name}
                                key={resourceId}
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
                                  }}
                                >
                                  <Image
                                    src={imageSrc}
                                    alt={toolInstance?.name || mcpInstance?.name}
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
                    <Divider style={{ flexGrow: 0, margin: '0px' }} type="horizontal" />
                    <Layout
                      style={{
                        display: 'flex',
                        flexDirection: 'row',
                        flexGrow: 0,
                        background: 'transparent',
                        justifyContent: 'space-around',
                        alignItems: 'center',
                      }}
                    >
                      <Button
                        type="link"
                        icon={<EditOutlined style={{ color: 'gray' }} />}
                        onClick={() => {
                          dispatch(updatedEditorAgentViewOpen(true));
                          dispatch(updatedEditorAgentViewStep('Select'));
                          dispatch(updatedEditorAgentViewAgent(agent));
                        }}
                      />
                      <Popconfirm
                        title={`Are you sure you want to delete agent ${agent.name}?`}
                        onConfirm={() => handleDeleteAgent(agent.id, agent.name)}
                        okText="Yes"
                        cancelText="No"
                      >
                        <Button type="link" icon={<DeleteOutlined style={{ color: 'red' }} />} />
                      </Popconfirm>
                    </Layout>
                  </Layout>
                </List.Item>
              );
            }}
          />
        )}
      </Layout>
    </>
  );
};

interface WorkflowManagerAgentsComponentProps {
  workflowId: string;
}

const WorkflowManagerAgentsComponent: React.FC<WorkflowManagerAgentsComponentProps> = ({
  workflowId,
}) => {
  const [isManagerModalOpen, setIsManagerModalOpen] = useState(false);
  const tasksTooltip = `
  A manager agent is responsible for delegating tasks to 
  coworkers to complete a workflow. In conversational workflows, 
  manager agents are also responsible for facilitating conversations
  with users.
  `;

  return (
    <>
      <Layout
        style={{
          paddingTop: 4,
          gap: '10px',
          flexGrow: 0,
          flexShrink: 0,
          flexDirection: 'column',
          background: 'transparent',
        }}
      >
        <Layout
          style={{
            borderRadius: '4px',
            border: 'solid 1px #f0f0f0',
            backgroundColor: '#fff',
            padding: '0px',
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
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
              title="Default Manager"
            >
              Default Manager
            </Text>
          </div>
          <Button type="primary" onClick={() => setIsManagerModalOpen(true)}>
            Configure Custom Manager
          </Button>
        </Layout>
      </Layout>
      <SelectOrAddManagerAgentModal
        workflowId={workflowId}
        isOpen={isManagerModalOpen}
        onClose={() => setIsManagerModalOpen(false)}
      />
    </>
  );
};

export interface ManagerAgentComponentProps {
  workflowId: string;
  isDisabled: boolean;
}

const ManagerAgentCheckComponent: React.FC<ManagerAgentComponentProps> = ({
  workflowId,
  isDisabled,
}) => {
  const dispatch = useAppDispatch();
  const managerAgentId = useAppSelector(selectEditorWorkflowManagerAgentId);
  const taskIds = useAppSelector(selectEditorWorkflowTaskIds) ?? [];
  const { data: tasks } = useListTasksQuery({ workflow_id: workflowId });
  const [updateTask] = useUpdateTaskMutation();
  const workflowState = useAppSelector(selectEditorWorkflow);
  const [updateWorkflow] = useUpdateWorkflowMutation();
  const notificationApi = useGlobalNotification();
  const { data: agents } = useListAgentsQuery({ workflow_id: workflowId });
  const [removeAgent] = useRemoveAgentMutation();

  const hasManagerAgent = workflowState.workflowMetadata.process === 'hierarchical';

  const handleManagerAgentChange = async (checked: boolean) => {
    console.log('Switch changed:', checked);

    try {
      // When checked, update tasks and set default model
      if (checked) {
        // Update all tasks to have an empty assigned_agent_id
        const updateTasksPromises = taskIds.map((taskId) => {
          const task = tasks?.find((task) => task.task_id === taskId);
          if (task) {
            return updateTask({
              task_id: taskId,
              UpdateCrewAITaskRequest: {
                ...task,
                assigned_agent_id: '',
              },
            }).unwrap();
          }
          return Promise.resolve();
        });

        await Promise.all(updateTasksPromises);

        // Set default model
        dispatch(updatedEditorWorkflowManagerAgentId(''));
        dispatch(updatedEditorWorkflowProcess('hierarchical'));

        // Update workflow state
        const updatedWorkflowState = {
          ...workflowState,
          workflowMetadata: {
            ...workflowState.workflowMetadata,
            managerAgentId: '',
            process: 'hierarchical',
          },
        };
        await updateWorkflow(createUpdateRequestFromEditor(updatedWorkflowState)).unwrap();
      } else {
        // If there's a custom manager agent, delete it first
        if (managerAgentId) {
          const agent = agents?.find((a) => a.id === managerAgentId);
          if (agent) {
            try {
              await removeAgent({ agent_id: managerAgentId }).unwrap();
              notificationApi.success({
                message: 'Manager Agent Removed',
                description: `Manager agent ${agent.name} has been removed.`,
                placement: 'topRight',
              });
            } catch (error) {
              console.error('Error removing manager agent:', error);
            }
          }
        }

        // Clear the manager agent/model
        dispatch(updatedEditorWorkflowManagerAgentId(''));
        dispatch(updatedEditorWorkflowProcess('sequential'));

        // Update workflow state
        const updatedWorkflowState = {
          ...workflowState,
          workflowMetadata: {
            ...workflowState.workflowMetadata,
            managerAgentId: '',
            process: 'sequential',
          },
        };
        await updateWorkflow(createUpdateRequestFromEditor(updatedWorkflowState)).unwrap();
      }
    } catch (error) {
      console.error('Error updating manager agent state:', error);
      notificationApi.error({
        message: 'Error Updating Manager',
        description: 'There was an error updating the manager agent state. Please try again.',
        placement: 'topRight',
      });
    }
  };

  return (
    <Space>
      <Switch
        disabled={isDisabled}
        checked={hasManagerAgent}
        onChange={(checked) => handleManagerAgentChange(checked)}
      ></Switch>
      <Text style={{ fontSize: 16, fontWeight: 600 }}>Manager Agent</Text>
      <Tooltip
        title="A manager agent is responsible for delegating tasks to coworkers to complete a workflow."
        placement="right"
      >
        <QuestionCircleOutlined style={{ color: '#666' }} />
      </Tooltip>
    </Space>
  );
};

interface SettingsComponentProps {
  workflowId: string;
}

const SettingsComponent: React.FC<SettingsComponentProps> = ({ workflowId }) => {
  const [isManagerModalOpen, setIsManagerModalOpen] = useState(false);
  const isConversational = useAppSelector(selectEditorWorkflowIsConversational);
  const dispatch = useAppDispatch();
  const { data: agents } = useListAgentsQuery({ workflow_id: workflowId });
  const [addTask] = useAddTaskMutation();
  const [removeTask] = useRemoveTaskMutation();
  const taskIds = useAppSelector(selectEditorWorkflowTaskIds) ?? [];
  const managerAgentId = useAppSelector(selectEditorWorkflowManagerAgentId);
  const process = useAppSelector(selectEditorWorkflowProcess);
  const hasManagerAgent: boolean = process === 'hierarchical';
  const notificationApi = useGlobalNotification();
  const workflowState = useAppSelector(selectEditorWorkflow);
  const [updateWorkflow] = useUpdateWorkflowMutation();
  const [removeAgent] = useRemoveAgentMutation();

  const handleResetToDefaultManager = async (agentId: string, agentName: string) => {
    try {
      // Remove the manager agent
      await removeAgent({ agent_id: agentId }).unwrap();

      // Update workflow to use default manager
      dispatch(updatedEditorWorkflowManagerAgentId(''));
      dispatch(updatedEditorWorkflowProcess('hierarchical'));

      const updatedWorkflowState = {
        ...workflowState,
        workflowMetadata: {
          ...workflowState.workflowMetadata,
          managerAgentId: '',
          process: 'hierarchical',
        },
      };

      await updateWorkflow(createUpdateRequestFromEditor(updatedWorkflowState)).unwrap();

      notificationApi.success({
        message: 'Manager Agent Reset',
        description: `Manager agent ${agentName} has been removed and reset to default manager.`,
        placement: 'topRight',
      });
    } catch (error) {
      notificationApi.error({
        message: 'Error Resetting Manager',
        description: 'There was an error resetting to default manager. Please try again.',
        placement: 'topRight',
      });
    }
  };

  return (
    <>
      <Layout
        style={{
          gap: '10px',
          flexGrow: 0,
          flexShrink: 0,
          flexDirection: 'column',
          background: 'transparent',
        }}
      >
        <Space>
          <Switch
            checked={isConversational}
            onChange={async (checked) => {
              dispatch(updatedEditorWorkflowIsConversational(checked));

              if (checked) {
                // Remove existing tasks
                await Promise.all(taskIds?.map((taskId) => removeTask({ task_id: taskId })));
                notificationApi.info({
                  message: 'Task Removed',
                  description: 'Existing tasks have been removed for conversational workflow.',
                  placement: 'topRight',
                });

                try {
                  // Add conversational task
                  const task_id: string = await addTask({
                    name: 'Conversational Task',
                    add_crew_ai_task_request: {
                      description:
                        "Respond to the user's message: '{user_input}'. Conversation history:\n{context}.",
                      expected_output:
                        'Provide a response that aligns with the conversation history.',
                      assigned_agent_id: '',
                    },
                    workflow_id: workflowId!,
                    template_id: '',
                  }).unwrap();

                  dispatch(updatedEditorWorkflowTaskIds([task_id]));

                  // Update workflow state
                  const updatedWorkflowState = {
                    ...workflowState,
                    isConversational: true,
                    workflowMetadata: {
                      ...workflowState.workflowMetadata,
                      isConversational: true,
                      taskIds: [task_id],
                    },
                  };
                  await updateWorkflow(
                    createUpdateRequestFromEditor(updatedWorkflowState),
                  ).unwrap();

                  notificationApi.success({
                    message: 'Task Added',
                    description: 'Conversational task has been added.',
                    placement: 'topRight',
                  });
                } catch (error: any) {
                  const errorMessage = error.data?.error || 'Failed to add task.';
                  notificationApi.error({
                    message: 'Error Adding Task',
                    description: errorMessage,
                    placement: 'topRight',
                  });
                }
              } else {
                // Remove conversational task
                if (taskIds?.at(0)) {
                  await removeTask({ task_id: taskIds.at(0)! });
                }
                dispatch(updatedEditorWorkflowTaskIds([]));

                // Update workflow state
                const updatedWorkflowState = {
                  ...workflowState,
                  isConversational: false,
                  workflowMetadata: {
                    ...workflowState.workflowMetadata,
                    isConversational: false,
                    taskIds: [],
                  },
                };
                await updateWorkflow(createUpdateRequestFromEditor(updatedWorkflowState)).unwrap();

                notificationApi.info({
                  message: 'Task Removed',
                  description: 'Conversational task has been removed.',
                  placement: 'topRight',
                });
              }
            }}
          ></Switch>
          <Text style={{ fontSize: 16, fontWeight: 600 }}>Is Conversational</Text>
          <Tooltip
            title="Enable this for workflows that involve back-and-forth conversations with users."
            placement="right"
          >
            <QuestionCircleOutlined style={{ color: '#666' }} />
          </Tooltip>
        </Space>

        <ManagerAgentCheckComponent workflowId={workflowId} isDisabled={false} />
        {hasManagerAgent && !managerAgentId && (
          <WorkflowManagerAgentsComponent workflowId={workflowId} />
        )}
        {hasManagerAgent && managerAgentId && (
          <Layout
            style={{
              gap: '10px',
              flexGrow: 0,
              flexShrink: 0,
              flexDirection: 'column',
              background: 'transparent',
              width: '50%',
            }}
          >
            {agents
              ?.filter((agent) => agent.id === managerAgentId)
              .map((agent) => (
                <Layout
                  key={agent.id}
                  style={{
                    borderRadius: '4px',
                    border: 'solid 1px #f0f0f0',
                    backgroundColor: '#fff',
                    width: '100%',
                    height: '150px',
                    padding: '0',
                    display: 'flex',
                    flexDirection: 'column',
                    cursor: 'pointer',
                    transition: 'transform 0.2s, box-shadow 0.2s',
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
                        icon={
                          agent.agent_image_uri ? (
                            <Image src={agent.agent_image_uri} alt={agent.name} />) : (
                            <UsergroupAddOutlined />)}
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
                      <span style={{ color: 'black', fontWeight: 400 }}>
                        {agent.crew_ai_agent_metadata?.goal || 'N/A'}
                      </span>
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
                        {agent.crew_ai_agent_metadata?.backstory || 'N/A'}
                      </span>
                    </Text>
                  </Layout>
                  <Divider style={{ flexGrow: 0, margin: '0px' }} type="horizontal" />
                  <Layout
                    style={{
                      display: 'flex',
                      flexDirection: 'row',
                      flexGrow: 0,
                      background: 'transparent',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 0',
                    }}
                  >
                    <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                      <Tooltip title="Edit Manager Agent">
                        <Button
                          type="link"
                          icon={<EditOutlined />}
                          onClick={() => setIsManagerModalOpen(true)}
                        />
                      </Tooltip>
                    </div>
                    <Divider type="vertical" style={{ height: '20px', margin: 0 }} />
                    <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                      <Tooltip title="Reset to Default Manager">
                        <Button
                          type="link"
                          icon={<UndoOutlined />}
                          onClick={() => handleResetToDefaultManager(agent.id, agent.name)}
                        />
                      </Tooltip>
                    </div>
                  </Layout>
                </Layout>
              ))}
          </Layout>
        )}
      </Layout>
      <SelectOrAddManagerAgentModal
        workflowId={workflowId}
        isOpen={isManagerModalOpen}
        onClose={() => setIsManagerModalOpen(false)}
      />
    </>
  );
};

interface WorkflowEditorAgentInputsProps {
  workflowId: string;
}

const WorkflowEditorAgentInputs: React.FC<WorkflowEditorAgentInputsProps> = ({ workflowId }) => {
  return (
    <>
      <Layout
        style={{
          flexDirection: 'column',
          flexShrink: 0,
          flexGrow: 0,
          padding: '16px 24px',
          width: '40%',
          height: '100%',
          background: 'transparent',
          gap: '12px',
          overflow: 'auto',
        }}
      >
        <WorkflowDescriptionComponent />
        <SettingsComponent workflowId={workflowId} />
        <Divider
          type="horizontal"
          style={{ marginTop: 0, marginBottom: 0, borderColor: 'lightgrey' }}
        />
        <WorkflowAgentsComponent workflowId={workflowId} />
      </Layout>
    </>
  );
};

export default WorkflowEditorAgentInputs;
