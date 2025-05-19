import { useAppDispatch, useAppSelector } from '../../lib/hooks/hooks';
import {
  selectEditorWorkflow,
  selectEditorWorkflowIsConversational,
  selectEditorWorkflowManagerAgentId,
  selectEditorWorkflowName as _selectEditorWorkflowName,
  selectEditorWorkflowTaskIds,
  addedEditorWorkflowTask,
  removedEditorWorkflowTask,
  selectEditorWorkflowProcess,
} from '../../workflows/editorSlice';
import {
  Alert,
  Button,
  Divider,
  Input,
  Layout,
  Select,
  Space,
  Tooltip,
  notification,
  Tag,
  Avatar,
} from 'antd';
import { Typography } from 'antd';
const { Header: _Header, Content: _Content } = Layout;
const { Title: _Title } = Typography;
import {
  DeleteOutlined,
  InfoCircleOutlined,
  PlusCircleOutlined,
  QuestionCircleOutlined,
  UserOutlined,
  EditOutlined,
  FileDoneOutlined,
  WarningOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { useListAgentsQuery } from '../../agents/agentApi';
import { AgentMetadata, RemoveTaskRequest } from '@/studio/proto/agent_studio';
import {
  useListTasksQuery,
  useRemoveTaskMutation,
  useAddTaskMutation,
  useUpdateTaskMutation,
} from '../../tasks/tasksApi';
import { useUpdateWorkflowMutation } from '../../workflows/workflowsApi';
import { useState } from 'react';
import { createUpdateRequestFromEditor, createAddRequestFromEditor } from '../../lib/workflow';
import { useGlobalNotification } from '../Notifications';
import React from 'react';
const { Text } = Typography;

const getTagColor = (agentName: string): string => {
  const colors = [
    '#ffeb3b', // Bright Yellow
    '#40a9ff', // Bright Blue
    '#ff85c0', // Bright Pink
    '#b37feb', // Bright Purple
  ];

  // Create a simple hash of the agent name to get a consistent index
  const hash = agentName.split('').reduce((acc, char) => {
    return char.charCodeAt(0) + ((acc << 5) - acc);
  }, 0);

  // Use absolute value and modulo to get a positive index within array bounds
  return colors[Math.abs(hash) % colors.length];
};

interface AlertsComponentProps {
  workflowId: string;
}

const AlertsComponent: React.FC<AlertsComponentProps> = ({ workflowId }) => {
  const isConversational = useAppSelector(selectEditorWorkflowIsConversational);
  const managerAgentId = useAppSelector(selectEditorWorkflowManagerAgentId);
  const process = useAppSelector(selectEditorWorkflowProcess);
  const hasManagerAgent: boolean = process === 'hierarchical';
  const workflowTaskIds = useAppSelector(selectEditorWorkflowTaskIds) || [];
  const { data: tasks } = useListTasksQuery({ workflow_id: workflowId });

  const hasUnassignedTasks = workflowTaskIds.some((taskId) => {
    const task = tasks?.find((t) => t.task_id === taskId);
    return task && !task.assigned_agent_id && !hasManagerAgent;
  });

  const alertStyle = {
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    padding: 12,
    marginBottom: 12,
  };

  // If there are unassigned tasks, show only the warning alert
  if (hasUnassignedTasks) {
    return (
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
              <WarningOutlined style={{ fontSize: 16, color: '#faad14' }} />
              <Text style={{ fontSize: 13, fontWeight: 600, background: 'transparent' }}>
                Unassigned Tasks
              </Text>
            </Layout>
            <Text style={{ fontSize: 13, fontWeight: 400, background: 'transparent' }}>
              You need to assign tasks to an agent because there is no manager agent.
            </Text>
          </Layout>
        }
        type="warning"
        showIcon={false}
        closable={false}
      />
    );
  }

  // Only show other alerts if there are no unassigned tasks
  return (
    <>
      {isConversational ? (
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
                  This is a conversational workflow.
                </Text>
              </Layout>
              <Text style={{ fontSize: 13, fontWeight: 400, background: 'transparent' }}>
                Conversational workflows have one dedicated task that facilitates conversation.
              </Text>
            </Layout>
          }
          type="info"
          showIcon={false}
          closable={false}
        />
      ) : hasManagerAgent ? (
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
                  Manager Agent Assigned
                </Text>
              </Layout>
              <Text style={{ fontSize: 13, fontWeight: 400, background: 'transparent' }}>
                Tasks will be assigned automatically. If you wish to assign them individually,
                please go back and remove your manager agent.
              </Text>
            </Layout>
          }
          type="info"
          showIcon={false}
          closable={false}
        />
      ) : null}
    </>
  );
};

interface WorkflowTasksComponentProps {
  workflowId: string;
}

const WorkflowTasksComponent: React.FC<WorkflowTasksComponentProps> = ({ workflowId }) => {
  const alertStyle = {
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    padding: 12,
    marginBottom: 12,
  };
  const iconStyle = {
    fontSize: 16,
    color: '#1890ff',
  };

  const tasksTooltip = `
  Tasks are the "objectives" of the workflow. These tasks will be completed
  in order, with each task receiving the context of the previous tasks. Tasks
  can either be manually assigned to an agent, or a "Manager Agent" can delegate
  these tasks as seen fit.
  `;
  const { data: tasks } = useListTasksQuery({ workflow_id: workflowId });
  const { data: agents } = useListAgentsQuery({ workflow_id: workflowId });
  const workflowTaskIds = useAppSelector(selectEditorWorkflowTaskIds) || [];
  const workflowAgentIds = useAppSelector(selectEditorWorkflow).workflowMetadata.agentIds || [];
  const dispatch = useAppDispatch();
  const isConversational = useAppSelector(selectEditorWorkflowIsConversational);
  const managerAgentId = useAppSelector(selectEditorWorkflowManagerAgentId);
  const process = useAppSelector(selectEditorWorkflowProcess);
  const hasManagerAgent = process === 'hierarchical';
  const [description, setDescription] = useState('');
  const [expectedOutput, setExpectedOutput] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState(
    agents?.find((agent) => workflowAgentIds.includes(agent.id))?.id || '',
  );
  const [addTask] = useAddTaskMutation();
  const [removeTask] = useRemoveTaskMutation();
  const [updateWorkflow] = useUpdateWorkflowMutation();
  const workflowState = useAppSelector(selectEditorWorkflow);
  const notificationApi = useGlobalNotification();
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [updateTask] = useUpdateTaskMutation();

  // Find the name of the selected agent from the filtered list
  const selectedAgentName =
    agents
      ?.filter((agent) => workflowAgentIds.includes(agent.id))
      .find((agent) => agent.id === selectedAgentId)?.name || '';

  const handleAddTask = async () => {
    if (!selectedAgentId && !hasManagerAgent) {
      notificationApi.error({
        message: 'Error',
        description: 'Assigned agent is required.',
        placement: 'topRight',
      });
      return;
    }

    try {
      const newTask = await addTask({
        name: description,
        add_crew_ai_task_request: {
          description,
          expected_output: expectedOutput,
          assigned_agent_id: selectedAgentId || '',
        },
        workflow_id: workflowState.workflowId || '',
        template_id: '',
      }).unwrap();

      dispatch(addedEditorWorkflowTask(newTask));

      const updatedWorkflowState = {
        ...workflowState,
        workflowMetadata: {
          ...workflowState.workflowMetadata,
          taskIds: [...(workflowState.workflowMetadata.taskIds || []), newTask],
        },
      };

      await updateWorkflow(createUpdateRequestFromEditor(updatedWorkflowState)).unwrap();

      // Clear form fields after successful add
      setDescription('');
      setExpectedOutput('');
      setSelectedAgentId('');

      notificationApi.success({
        message: 'Task Added',
        description: `Task "${description}" was added successfully.`,
        placement: 'topRight',
      });
    } catch (error) {
      console.error('Failed to add task:', error);
      notificationApi.error({
        message: 'Error',
        description: 'Failed to add task. Please try again.',
        placement: 'topRight',
      });
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      const removeTaskRequest: RemoveTaskRequest = { task_id: taskId };

      await removeTask(removeTaskRequest).unwrap();

      const updatedTaskIds = workflowTaskIds.filter((id) => id !== taskId);
      const updatedWorkflowState = {
        ...workflowState,
        workflowMetadata: {
          ...workflowState.workflowMetadata,
          taskIds: updatedTaskIds,
        },
      };

      dispatch(removedEditorWorkflowTask(taskId));

      await updateWorkflow(createUpdateRequestFromEditor(updatedWorkflowState)).unwrap();

      notificationApi.success({
        message: 'Task Deleted',
        description: `Task was deleted successfully.`,
        placement: 'topRight',
      });
    } catch (error) {
      console.error('Failed to delete task:', error);
      notificationApi.error({
        message: 'Error',
        description: 'Failed to delete task. Please try again.',
        placement: 'topRight',
      });
    }
  };

  const handleEditTask = (taskId: string) => {
    const task = tasks?.find((task) => task.task_id === taskId);
    if (task) {
      setDescription(task.description);
      setExpectedOutput(task.expected_output);
      setSelectedAgentId(task.assigned_agent_id || '');
      setEditingTaskId(taskId);
    }
  };

  const handleSaveTask = async () => {
    if (!editingTaskId) return;

    if (!hasManagerAgent && !selectedAgentId) {
      notificationApi.error({
        message: 'Error',
        description: 'Please select an agent for this task.',
        placement: 'topRight',
      });
      return;
    }

    try {
      await updateTask({
        task_id: editingTaskId,
        UpdateCrewAITaskRequest: {
          description,
          expected_output: expectedOutput,
          assigned_agent_id: selectedAgentId || '',
        },
      }).unwrap();

      // Clear form fields and reset editing state after successful save
      setEditingTaskId(null);
      setDescription('');
      setExpectedOutput('');
      setSelectedAgentId('');

      notificationApi.success({
        message: 'Task Updated',
        description: `Task "${description}" was updated successfully.`,
        placement: 'topRight',
      });
    } catch (error) {
      console.error('Failed to update task:', error);
      notificationApi.error({
        message: 'Error',
        description: 'Failed to update task. Please try again.',
        placement: 'topRight',
      });
    }
  };

  return (
    <>
      <AlertsComponent workflowId={workflowId} />
      <Layout
        style={{
          gap: '10px',
          flexGrow: 0,
          flexShrink: 0,
          flexDirection: 'column',
          background: 'white',
        }}
      >
        {workflowTaskIds.length > 1 && (
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
                    Task Execution Order
                  </Text>
                </Layout>
                <Text style={{ fontSize: 13, fontWeight: 400, background: 'transparent' }}>
                  The following {workflowTaskIds.length} tasks will be executed in the order
                  specified below.
                </Text>
              </Layout>
            }
            type="info"
            showIcon={false}
            closable={false}
          />
        )}

        <Layout
          style={{
            background: 'white',
            flexDirection: 'row',
            gap: 4,
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: 600 }}>Tasks</Text>
          <Tooltip title={tasksTooltip} placement="right">
            <QuestionCircleOutlined />
          </Tooltip>
        </Layout>

        {workflowTaskIds.length === 0 && (
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
                    Tasks with Dynamic Input
                  </Text>
                </Layout>
                <Text style={{ fontSize: 13, fontWeight: 400, background: 'transparent' }}>
                  {
                    'Setting the dynamic input in tasks allows you to run workflow during execution with same input. This means lets say you add a Task description saying "For a User Name: {User Name}, Greet him with this name". In this case the User Name in curly braces becomes the dynamic input for tasks.'
                  }
                </Text>
              </Layout>
            }
            type="info"
            showIcon={false}
            closable={false}
          />
        )}

        {workflowTaskIds.map((task_id, index) => {
          const task = tasks?.find((task) => task.task_id === task_id);

          if (!task) {
            console.warn(`Task with ID ${task_id} not found.`);
            return null; // Skip rendering if task is not found
          }

          const assignedAgent = agents?.find((agent) => agent.id === task.assigned_agent_id);

          return (
            <Layout
              key={`task-${index}`}
              style={{
                position: 'relative',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                height: 44,
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                borderWidth: 0,
                gap: 6,
                paddingLeft: 42,
                paddingRight: 12,
                background: 'white',
              }}
            >
              <Avatar
                style={{
                  position: 'absolute',
                  left: 12,
                  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
                  backgroundColor: '#26bd67',
                }}
                size={24}
                icon={<FileDoneOutlined />}
              />
              <Text
                ellipsis
                style={{ flexBasis: '60%', fontSize: 13, fontWeight: 400, marginLeft: '4px' }}
              >
                <span style={{ fontWeight: 600 }}>{`Task ${index + 1}: `}</span>
                {task.description}
              </Text>
              {!hasManagerAgent && (
                <div
                  style={{
                    width: '30%',
                    display: 'flex',
                    justifyContent: 'flex-start',
                    overflow: 'hidden',
                  }}
                >
                  <Tooltip title={assignedAgent?.name || 'Unassigned'}>
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
                        {assignedAgent?.name || 'Unassigned'}
                      </span>
                    </Tag>
                  </Tooltip>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <Button
                  type="link"
                  icon={<EditOutlined />}
                  onClick={() => handleEditTask(task_id)}
                  disabled={!!(isConversational && Boolean(hasManagerAgent))}
                />
                <Button
                  danger
                  style={{ border: 'none' }}
                  icon={<DeleteOutlined color="red" />}
                  disabled={isConversational}
                  onClick={() => handleDeleteTask(task_id)}
                />
              </div>
            </Layout>
          );
        })}

        {!isConversational && !editingTaskId && (
          <>
            <Layout
              style={{
                flexDirection: 'row',
                gap: '10px',
                marginBottom: '10px',
                background: 'white',
                marginTop: '10px',
              }}
            >
              <Layout style={{ flex: 1, background: 'white', paddingBottom: '8px' }}>
                <Text style={{ fontSize: 13, fontWeight: 600, marginBottom: '8px' }}>
                  Task Description
                  <Tooltip title="Enter the task description here" placement="right">
                    <QuestionCircleOutlined style={{ marginLeft: 4 }} />
                  </Tooltip>
                </Text>
                <Input.TextArea
                  rows={5}
                  placeholder="Task Description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={false}
                />
              </Layout>
              <Layout style={{ flex: 1, background: 'white', paddingBottom: '8px' }}>
                <Text style={{ fontSize: 13, fontWeight: 600, marginBottom: '8px' }}>
                  Expected Output
                  <Tooltip title="Enter the expected output here" placement="right">
                    <QuestionCircleOutlined style={{ marginLeft: 4 }} />
                  </Tooltip>
                </Text>
                <Input.TextArea
                  rows={5}
                  placeholder="Expected Output"
                  value={expectedOutput}
                  onChange={(e) => setExpectedOutput(e.target.value)}
                  disabled={false}
                />
              </Layout>
            </Layout>
            {!hasManagerAgent && (
              <Layout style={{ background: 'white', paddingBottom: '8px' }}>
                <Text style={{ fontSize: 13, fontWeight: 600, marginBottom: '8px' }}>
                  Select Agent
                  <Tooltip title="Select an agent to assign this task" placement="right">
                    <QuestionCircleOutlined style={{ marginLeft: 4 }} />
                  </Tooltip>
                </Text>
                <Select
                  placeholder="Select Agent"
                  value={selectedAgentName}
                  onChange={(value) => setSelectedAgentId(value)}
                  style={{ width: '100%', marginBottom: '10px' }}
                >
                  {agents
                    ?.filter((agent) => workflowAgentIds.includes(agent.id))
                    .map((agent) => (
                      <Select.Option key={agent.id} value={agent.id}>
                        {agent.name}
                      </Select.Option>
                    ))}
                </Select>
              </Layout>
            )}
            <Button
              type="default"
              icon={<PlusCircleOutlined />}
              onClick={handleAddTask}
              style={{ marginBottom: '10px', width: 'auto' }}
            >
              Add Task
            </Button>
          </>
        )}

        {editingTaskId && (
          <>
            <Layout
              style={{
                flexDirection: 'row',
                gap: '10px',
                marginBottom: '10px',
                background: 'white',
                marginTop: '10px',
              }}
            >
              <Layout style={{ flex: 1, background: 'white', paddingBottom: '8px' }}>
                <Text style={{ fontSize: 13, fontWeight: 600, marginBottom: '8px' }}>
                  Task Description
                  <Tooltip title="Task description" placement="right">
                    <QuestionCircleOutlined style={{ marginLeft: 4 }} />
                  </Tooltip>
                </Text>
                <Input.TextArea
                  rows={5}
                  placeholder="Task Description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={isConversational}
                />
              </Layout>
              <Layout style={{ flex: 1, background: 'white', paddingBottom: '8px' }}>
                <Text style={{ fontSize: 13, fontWeight: 600, marginBottom: '8px' }}>
                  Expected Output
                  <Tooltip title="Expected output" placement="right">
                    <QuestionCircleOutlined style={{ marginLeft: 4 }} />
                  </Tooltip>
                </Text>
                <Input.TextArea
                  rows={5}
                  placeholder="Expected Output"
                  value={expectedOutput}
                  onChange={(e) => setExpectedOutput(e.target.value)}
                  disabled={isConversational}
                />
              </Layout>
            </Layout>
            {!hasManagerAgent && (
              <Layout style={{ background: 'white', paddingBottom: '8px' }}>
                <Text style={{ fontSize: 13, fontWeight: 600, marginBottom: '8px' }}>
                  Select Agent
                  <Tooltip title="Select an agent to assign this task" placement="right">
                    <QuestionCircleOutlined style={{ marginLeft: 4 }} />
                  </Tooltip>
                </Text>
                <Select
                  placeholder="Select Agent"
                  value={selectedAgentName}
                  onChange={(value) => setSelectedAgentId(value)}
                  style={{ width: '100%', marginBottom: '10px' }}
                >
                  {agents
                    ?.filter((agent) => workflowAgentIds.includes(agent.id))
                    .map((agent) => (
                      <Select.Option key={agent.id} value={agent.id}>
                        {agent.name}
                      </Select.Option>
                    ))}
                </Select>
              </Layout>
            )}
            <Button
              type="default"
              icon={<SaveOutlined />}
              onClick={handleSaveTask}
              style={{ marginBottom: '10px', width: 'auto' }}
            >
              Save Task
            </Button>
          </>
        )}
      </Layout>
    </>
  );
};

interface WorklfowEditorInputsProps {
  workflowId: string;
}

const WorkflowEditorInputs: React.FC<WorklfowEditorInputsProps> = ({ workflowId }) => {
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
          gap: '24px',
          overflow: 'auto',
        }}
      >
        <WorkflowTasksComponent workflowId={workflowId} />
      </Layout>
    </>
  );
};

export default WorkflowEditorInputs;
