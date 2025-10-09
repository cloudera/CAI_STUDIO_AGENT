import { useAppDispatch, useAppSelector } from '../../lib/hooks/hooks';
import {
  selectEditorWorkflow,
  selectEditorWorkflowIsConversational,
  selectEditorWorkflowTaskIds,
  addedEditorWorkflowTask,
  removedEditorWorkflowTask,
  selectEditorWorkflowProcess,
  updatedEditorWorkflowTaskIds,
  selectEditorTaskEditingId,
  updatedEditorTaskEditingId,
  clearEditorTaskEditingState,
} from '../../workflows/editorSlice';
import { Alert, Button, Input, Layout, Select, Tooltip, Tag, Avatar } from 'antd';
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
  ArrowUpOutlined,
  ArrowDownOutlined,
  SwapOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import { useListAgentsQuery } from '../../agents/agentApi';
import { RemoveTaskRequest } from '@/studio/proto/agent_studio';
import {
  useListTasksQuery,
  useRemoveTaskMutation,
  useAddTaskMutation,
  useUpdateTaskMutation,
} from '../../tasks/tasksApi';
import { useUpdateWorkflowMutation } from '../../workflows/workflowsApi';
import { useState, useEffect } from 'react';
import { createUpdateRequestFromEditor } from '../../lib/workflow';
import { useGlobalNotification } from '../Notifications';
import React from 'react';
const { Text } = Typography;

interface AlertsComponentProps {
  workflowId: string;
}

const AlertsComponent: React.FC<AlertsComponentProps> = ({ workflowId }) => {
  const isConversational = useAppSelector(selectEditorWorkflowIsConversational);
  const process = useAppSelector(selectEditorWorkflowProcess);
  const hasManagerAgent: boolean = process === 'hierarchical';
  const workflowTaskIds = useAppSelector(selectEditorWorkflowTaskIds) || [];
  const { data: tasks } = useListTasksQuery({ workflow_id: workflowId });

  const hasUnassignedTasks = workflowTaskIds.some((taskId) => {
    const task = tasks?.find((t) => t.task_id === taskId);
    return task && !task.assigned_agent_id && !hasManagerAgent;
  });

  // If there are unassigned tasks, show only the warning alert
  if (hasUnassignedTasks) {
    return (
      <Alert
        className="items-start justify-start p-3 mb-3"
        message={
          <Layout className="flex flex-col gap-1 p-0 bg-transparent">
            <Layout className="flex flex-row items-center gap-2 bg-transparent">
              <WarningOutlined className="text-base text-yellow-500" />
              <Text className="text-sm font-semibold bg-transparent">Unassigned Tasks</Text>
            </Layout>
            <Text className="text-sm font-normal bg-transparent">
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
          className="items-start justify-start p-3 mb-3"
          message={
            <Layout className="flex flex-col gap-1 p-0 bg-transparent">
              <Layout className="flex flex-row items-center gap-2 bg-transparent">
                <InfoCircleOutlined className="text-base text-blue-500" />
                <Text className="text-sm font-semibold bg-transparent">
                  This is a conversational workflow.
                </Text>
              </Layout>
              <Text className="text-sm font-normal bg-transparent">
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
          className="items-start justify-start p-3 mb-3"
          message={
            <Layout className="flex flex-col gap-1 p-0 bg-transparent">
              <Layout className="flex flex-row items-center gap-2 bg-transparent">
                <InfoCircleOutlined className="text-base text-blue-500" />
                <Text className="text-sm font-semibold bg-transparent">Manager Agent Assigned</Text>
              </Layout>
              <Text className="text-sm font-normal bg-transparent">
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
  const editingTaskId = useAppSelector(selectEditorTaskEditingId);
  const [updateTask] = useUpdateTaskMutation();
  const [isReordering, setIsReordering] = useState(false);
  const [localTaskIds, setLocalTaskIds] = useState(workflowTaskIds);

  useEffect(() => {
    if (!isReordering) {
      setLocalTaskIds(workflowTaskIds);
    }
  }, [workflowTaskIds, isReordering]);

  // Effect to automatically populate form when editingTaskId is set from Redux
  useEffect(() => {
    if (editingTaskId && tasks) {
      const task = tasks.find((task) => task.task_id === editingTaskId);
      if (task) {
        setDescription(task.description);
        setExpectedOutput(task.expected_output);
        setSelectedAgentId(task.assigned_agent_id || '');
      }
    } else if (!editingTaskId) {
      // Clear form fields when editingTaskId is cleared
      setDescription('');
      setExpectedOutput('');
      setSelectedAgentId('');
    }
  }, [editingTaskId, tasks]);

  // Find the name of the selected agent from the filtered list
  const selectedAgentName =
    agents
      ?.filter((agent) => workflowAgentIds.includes(agent.id))
      .find((agent) => agent.id === selectedAgentId)?.name || '';

  const handleMoveTask = (index: number, direction: 'up' | 'down') => {
    const newTasks = [...localTaskIds];
    const newIndex = direction === 'up' ? index - 1 : index + 1;

    if (newIndex < 0 || newIndex >= newTasks.length) {
      return;
    }

    [newTasks[index], newTasks[newIndex]] = [newTasks[newIndex], newTasks[index]];
    setLocalTaskIds(newTasks);
  };

  const handleSaveReorder = async () => {
    try {
      notificationApi.info({
        message: 'Saving new task order...',
        placement: 'topRight',
      });

      const updatedWorkflowState = {
        ...workflowState,
        workflowMetadata: {
          ...workflowState.workflowMetadata,
          taskIds: localTaskIds,
        },
      };

      await updateWorkflow(createUpdateRequestFromEditor(updatedWorkflowState)).unwrap();
      dispatch(updatedEditorWorkflowTaskIds(localTaskIds));
      setIsReordering(false);

      notificationApi.success({
        message: 'Task Order Saved',
        description: 'The new task order has been saved successfully.',
        placement: 'topRight',
      });
    } catch (error) {
      console.error('Failed to save task order:', error);
      notificationApi.error({
        message: 'Error',
        description: 'Failed to save the new task order.',
        placement: 'topRight',
      });
      setLocalTaskIds(workflowTaskIds);
      setIsReordering(false);
    }
  };

  const handleCancelReorder = () => {
    setLocalTaskIds(workflowTaskIds);
    setIsReordering(false);
  };

  const handleAddTask = async () => {
    const shouldClearAssignedAgent = hasManagerAgent;

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
          assigned_agent_id: shouldClearAssignedAgent ? '' : selectedAgentId || '',
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
      dispatch(updatedEditorTaskEditingId(taskId));
    }
  };

  const handleSaveTask = async () => {
    if (!editingTaskId) {
      return;
    }

    if (!hasManagerAgent && !selectedAgentId) {
      notificationApi.error({
        message: 'Error',
        description: 'Please select an agent for this task.',
        placement: 'topRight',
      });
      return;
    }

    const shouldClearAssignedAgent = hasManagerAgent;

    try {
      await updateTask({
        task_id: editingTaskId,
        UpdateCrewAITaskRequest: {
          description,
          expected_output: expectedOutput,
          assigned_agent_id: shouldClearAssignedAgent ? '' : selectedAgentId || '',
        },
      }).unwrap();

      // Clear form fields and reset editing state after successful save
      dispatch(clearEditorTaskEditingState());
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
      <Layout className="gap-2.5 flex-grow-0 flex-shrink-0 flex-col bg-white">
        {workflowTaskIds.length > 1 && (
          <Alert
            className="items-start justify-start p-3 mb-3"
            message={
              <Layout className="flex flex-col gap-1 p-0 bg-transparent">
                <Layout className="flex flex-row items-center gap-2 bg-transparent">
                  <InfoCircleOutlined className="text-base text-blue-500" />
                  <Text className="text-sm font-semibold bg-transparent">Task Execution Order</Text>
                </Layout>
                <Text className="text-sm font-normal bg-transparent">
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

        <Layout className="bg-white flex flex-row gap-1 justify-between items-center">
          <div className="flex items-center gap-1">
            <Text className="text-sm font-semibold">Tasks</Text>
            <Tooltip title={tasksTooltip} placement="right">
              <QuestionCircleOutlined />
            </Tooltip>
          </div>
          <div className="flex gap-2">
            {isReordering ? (
              <>
                <Button
                  size="small"
                  icon={<SaveOutlined />}
                  onClick={handleSaveReorder}
                  type="primary"
                >
                  Save
                </Button>
                <Button size="small" icon={<CloseOutlined />} onClick={handleCancelReorder}>
                  Cancel
                </Button>
              </>
            ) : (
              localTaskIds.length > 1 && (
                <Button size="small" icon={<SwapOutlined />} onClick={() => setIsReordering(true)}>
                  Reorder
                </Button>
              )
            )}
          </div>
        </Layout>

        {workflowTaskIds.length === 0 && (
          <Alert
            className="items-start justify-start p-3 mb-3"
            message={
              <Layout className="flex flex-col gap-1 p-0 bg-transparent">
                <Layout className="flex flex-row items-center gap-2 bg-transparent">
                  <InfoCircleOutlined className="text-base text-blue-500" />
                  <Text className="text-sm font-semibold bg-transparent">
                    Tasks with Dynamic Input
                  </Text>
                </Layout>
                <Text className="text-sm font-normal bg-transparent">
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

        {localTaskIds.map((task_id, index) => {
          const task = tasks?.find((task) => task.task_id === task_id);

          if (!task) {
            console.warn(`Task with ID ${task_id} not found.`);
            return null; // Skip rendering if task is not found
          }

          const assignedAgent = agents?.find((agent) => agent.id === task.assigned_agent_id);

          return (
            <Layout
              key={`task-${index}`}
              className="relative flex flex-row items-center justify-between h-11 shadow-md border-0 gap-1.5 pl-10 pr-3 bg-white"
            >
              <Avatar
                className="absolute left-3 shadow-md bg-green-500"
                size={24}
                icon={<FileDoneOutlined />}
              />
              <Text ellipsis className="flex-basis-[60%] text-sm font-normal ml-1">
                <span className="font-semibold">{`Task ${index + 1}: `}</span>
                {task.description}
              </Text>
              {!hasManagerAgent && (
                <div className="w-[30%] flex justify-start overflow-hidden">
                  <Tooltip title={assignedAgent?.name || 'Unassigned'}>
                    <Tag
                      icon={<UserOutlined />}
                      className="max-w-full text-[11px] font-normal bg-blue-200 border-none text-ellipsis overflow-hidden whitespace-nowrap flex items-center px-2 gap-1"
                    >
                      <span className="max-w-[80%] overflow-hidden text-ellipsis whitespace-nowrap block">
                        {assignedAgent?.name || 'Unassigned'}
                      </span>
                    </Tag>
                  </Tooltip>
                </div>
              )}
              <div className="flex gap-2">
                {isReordering ? (
                  <>
                    <Button
                      type="link"
                      icon={<ArrowUpOutlined />}
                      onClick={() => handleMoveTask(index, 'up')}
                      disabled={index === 0}
                    />
                    <Button
                      type="link"
                      icon={<ArrowDownOutlined />}
                      onClick={() => handleMoveTask(index, 'down')}
                      disabled={index === localTaskIds.length - 1}
                    />
                  </>
                ) : (
                  <>
                    <Button
                      type="link"
                      icon={<EditOutlined />}
                      onClick={() => handleEditTask(task_id)}
                      disabled={!!(isConversational && Boolean(hasManagerAgent))}
                    />
                    <Button
                      danger
                      className="border-none"
                      icon={<DeleteOutlined className="text-red-500" />}
                      disabled={isConversational}
                      onClick={() => handleDeleteTask(task_id)}
                    />
                  </>
                )}
              </div>
            </Layout>
          );
        })}

        {!isConversational && !editingTaskId && (
          <>
            <Layout className="flex flex-row gap-2.5 mb-2.5 bg-white mt-2.5">
              <Layout className="flex-1 bg-white pb-2">
                <Text className="text-sm font-semibold mb-2">
                  Task Description
                  <Tooltip title="Enter the task description here" placement="right">
                    <QuestionCircleOutlined className="ml-1" />
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
              <Layout className="flex-1 bg-white pb-2">
                <Text className="text-sm font-semibold mb-2">
                  Expected Output
                  <Tooltip title="Expected output" placement="right">
                    <QuestionCircleOutlined className="ml-1" />
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
              <Layout className="bg-white pb-2">
                <Text className="text-sm font-semibold mb-2">
                  Select Agent
                  <Tooltip title="Select an agent to assign this task" placement="right">
                    <QuestionCircleOutlined className="ml-1" />
                  </Tooltip>
                </Text>
                <Select
                  placeholder="Select Agent"
                  value={selectedAgentName}
                  onChange={(value) => setSelectedAgentId(value)}
                  className="w-full mb-2.5"
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
              className="mb-2.5 w-auto"
            >
              Add Task
            </Button>
          </>
        )}

        {editingTaskId && (
          <>
            <Layout className="flex flex-row gap-2.5 mb-2.5 bg-white mt-2.5">
              <Layout className="flex-1 bg-white pb-2">
                <Text className="text-sm font-semibold mb-2">
                  Task Description
                  <Tooltip title="Task description" placement="right">
                    <QuestionCircleOutlined className="ml-1" />
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
              <Layout className="flex-1 bg-white pb-2">
                <Text className="text-sm font-semibold mb-2">
                  Expected Output
                  <Tooltip title="Expected output" placement="right">
                    <QuestionCircleOutlined className="ml-1" />
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
              <Layout className="bg-white pb-2">
                <Text className="text-sm font-semibold mb-2">
                  Select Agent
                  <Tooltip title="Select an agent to assign this task" placement="right">
                    <QuestionCircleOutlined className="ml-1" />
                  </Tooltip>
                </Text>
                <Select
                  placeholder="Select Agent"
                  value={selectedAgentName}
                  onChange={(value) => setSelectedAgentId(value)}
                  className="w-full mb-2.5"
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
              className="mb-2.5 w-auto"
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
      <Layout className="flex flex-col flex-shrink-0 flex-grow-0 p-4 md:px-6 w-2/5 h-full bg-transparent gap-6 overflow-auto">
        <WorkflowTasksComponent workflowId={workflowId} />
      </Layout>
    </>
  );
};

export default WorkflowEditorInputs;
