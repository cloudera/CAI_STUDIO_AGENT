'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Layout, Spin, Typography, Slider, Button, Tooltip, Input, Collapse } from 'antd';
import WorkflowAppInputsView from './WorkflowAppInputsView';
import { useAppDispatch, useAppSelector } from '@/app/lib/hooks/hooks';
import {
  addedChatMessage,
  addedCurrentEvents,
  selectCurrentEvents,
  selectWorkflowCurrentTraceId,
  selectWorkflowIsRunning,
  updatedCrewOutput,
  updatedCurrentEventIndex,
  updatedCurrentEvents,
  updatedIsRunning,
  clearedWorkflowApp,
} from '@/app/workflows/workflowAppSlice';
import {
  updatedEditorWorkflowDescription,
  selectEditorWorkflowDescription,
  selectWorkflowConfiguration,
  selectEditorWorkflow,
} from '@/app/workflows/editorSlice';
import WorkflowDiagramView from './WorkflowDiagramView';
import {
  AgentMetadata,
  CrewAITaskMetadata,
  McpInstance,
  ToolInstance,
  Workflow,
} from '@/studio/proto/agent_studio';
import WorkflowAppChatView from './WorkflowAppChatView';
import { CloseOutlined, DashboardOutlined } from '@ant-design/icons';
import { useGetDefaultModelQuery } from '@/app/models/modelsApi';
import { useGetEventsMutation } from '@/app/ops/opsApi';
import { useUpdateWorkflowMutation } from '@/app/workflows/workflowsApi';
import { useTestModelMutation } from '@/app/models/modelsApi';
import { useGlobalNotification } from '../Notifications';
import { renderAlert } from '@/app/lib/alertUtils';
import { hasValidToolConfiguration } from '@/app/components/workflowEditor/WorkflowEditorConfigureInputs';
import { TOOL_PARAMS_ALERT } from '@/app/lib/constants';

const { Title } = Typography;

export interface WorkflowAppProps {
  workflow: Workflow;
  refetchWorkflow: () => void;
  agents: AgentMetadata[];
  toolInstances: ToolInstance[];
  mcpInstances: McpInstance[];
  tasks: CrewAITaskMetadata[];
  renderMode: 'studio' | 'workflow';
}

const WorkflowApp = ({
  workflow,
  refetchWorkflow,
  agents,
  toolInstances,
  mcpInstances,
  tasks,
  renderMode,
}: WorkflowAppProps) => {
  const isRunning = useAppSelector(selectWorkflowIsRunning);
  const currentTraceId = useAppSelector(selectWorkflowCurrentTraceId);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const workflowPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dispatch = useAppDispatch();
  const currentEvents = useAppSelector(selectCurrentEvents);
  const workflowState = useAppSelector(selectEditorWorkflow);

  const [getEvents] = useGetEventsMutation();

  // NOTE: because we also run our workflow app in "standalone" mode, his
  // specific query may fail. Becuase of this, we also check our workflow
  // data to see if we are rendering in studio model. Making this actual api
  // call is acceptable from the frontend (but will show up as an error
  // in the logs), but we need to make sure we don't do anything with
  // the results of this api call if we are rendering in workflow app mode.
  // TODO: pull this out to either a prop to the component or maybe even
  // set somewhere in redux state.
  const { data: defaultModel } = useGetDefaultModelQuery();

  const notificationApi = useGlobalNotification();
  const [sliderValue, setSliderValue] = useState<number>(0);
  const [showMonitoring, setShowMonitoring] = useState(false);
  const [updateWorkflow] = useUpdateWorkflowMutation();
  const workflowDescription = useAppSelector(selectEditorWorkflowDescription);
  const [testModel] = useTestModelMutation();

  // Track processed exception IDs
  const processedExceptionsRef = useRef<Set<string>>(new Set());
  const allEventsRef = useRef<any[]>([]);

  // Add effect to update showMonitoring when renderMode changes
  useEffect(() => {
    setShowMonitoring(renderMode === 'studio');
  }, [renderMode]);

  const handleSliderChange = (value: number) => {
    setSliderValue(value);
    dispatch(updatedCurrentEventIndex(value));
  };

  const handleDescriptionChange = async (value: string) => {
    try {
      dispatch(updatedEditorWorkflowDescription(value));

      if (workflow) {
        const updateRequest = {
          ...workflow,
          description: value,
        };

        await updateWorkflow(updateRequest).unwrap();
      }
    } catch (error) {
      console.error('Error updating workflow description:', error);
    }
  };

  const generateDescriptionPrompt = (context: any) => {
    const agentDetails = context.agents
      .map(
        (agent: any) =>
          `- ${agent.name}: ${agent.role || 'No role'}, Goal: ${agent.goal || 'No goal'}`,
      )
      .join('\n');

    const taskDetails = context.tasks
      .map(
        (task: any) => `- ${task.name || 'Unnamed task'}: ${task.description || 'No description'}`,
      )
      .join('\n');

    const managerDetails = context.managerAgent
      ? `Manager Agent: ${context.managerAgent.name}, Role: ${context.managerAgent.role || 'No role'}, Goal: ${context.managerAgent.goal || 'No goal'}`
      : 'No Manager Agent';

    return `Please generate a concise description for a workflow with the following details:
    Name: ${context.name}
    Current Description: ${context.description || 'None'}
    
    Agents:
    ${agentDetails || 'No agents defined'}
    
    Tasks:
    ${taskDetails || 'No tasks defined'}
    
    ${managerDetails}
    
    Process Description: ${context.process || 'None'}
    
    The description should be a concise and meaningful paragraph explaining what this workflow does and its main capabilities, considering the specific agents, tools, and tasks involved.`;
  };

  const handleGenerateDescription = async () => {
    if (!workflow) {
      return;
    }

    if (!defaultModel) {
      notificationApi.error({
        message: 'No default LLM model configured',
        description: 'Please configure a default LLM model on the LLMs page',
        placement: 'topRight',
      });
      throw new Error(
        'No default LLM model configured. Please configure a default LLM model on the LLMs page.',
      );
    }

    // Get the agent and task details from the workflow
    const agentIds = workflow.crew_ai_workflow_metadata?.agent_id || [];
    const taskIds = workflow.crew_ai_workflow_metadata?.task_id || [];
    const managerAgentId = workflow.crew_ai_workflow_metadata?.manager_agent_id || '';

    // Find the actual agents and tasks from the available data
    const workflowAgents = agents?.filter((agent) => agentIds.includes(agent.id)) || [];
    const workflowTasks = tasks?.filter((task) => taskIds.includes(task.task_id)) || [];
    const managerAgent = agents?.find((agent) => agent.id === managerAgentId);

    const context = {
      name: workflow.name,
      description: workflow.description,
      agents: workflowAgents.map((agent) => ({
        name: agent.name,
        role: agent.crew_ai_agent_metadata?.role,
        backstory: agent.crew_ai_agent_metadata?.backstory,
        goal: agent.crew_ai_agent_metadata?.goal,
      })),
      tasks: workflowTasks.map((task) => ({
        description: task.description,
        expected_output: task.expected_output,
      })),
      managerAgent: managerAgent
        ? {
            name: managerAgent.name,
            role: managerAgent.crew_ai_agent_metadata?.role,
            backstory: managerAgent.crew_ai_agent_metadata?.backstory,
            goal: managerAgent.crew_ai_agent_metadata?.goal,
          }
        : null,
    };

    try {
      const response = await testModel({
        model_id: defaultModel.model_id,
        completion_role: 'user',
        completion_content: generateDescriptionPrompt(context),
        temperature: 0.1,
        max_tokens: 1000,
        timeout: 10,
      }).unwrap();

      handleDescriptionChange(response.trim());
    } catch (error) {
      console.error('Error generating description:', error);
      notificationApi.error({
        message: 'Error generating description',
        description: error instanceof Error ? error.message : 'An unknown error occurred',
        placement: 'topRight',
      });
    }
  };

  // Handle event changes
  useEffect(() => {
    currentEvents && handleSliderChange(currentEvents.length - 1);
  }, [currentEvents]);

  // We will use an effect for polling
  useEffect(() => {
    // We don't want to fetch any events if we're not running
    // Reset exception tracking when starting new run
    processedExceptionsRef.current.clear();

    if (!isRunning || !currentTraceId) {
      return;
    }

    // Set the interval function
    const fetchEvents = async () => {
      try {
        const { events: newEvents } = await getEvents({
          trace_id: currentTraceId,
        }).unwrap();
        dispatch(addedCurrentEvents(newEvents));

        if (newEvents && newEvents.length > 0) {
          allEventsRef.current = [...allEventsRef.current, ...newEvents];

          // Check for successful completion as before
          const crewCompleteEvent = newEvents.find(
            (event) =>
              event.type === 'crew_kickoff_completed' || event.type === 'crew_kickoff_failed',
          );
          if (crewCompleteEvent) {
            stopPolling();
            dispatch(updatedCrewOutput(crewCompleteEvent.output || crewCompleteEvent.error));
            dispatch(updatedIsRunning(false));

            if (workflow?.is_conversational) {
              dispatch(
                addedChatMessage({
                  id: crewCompleteEvent.id,
                  role: 'assistant',
                  content: crewCompleteEvent.output || crewCompleteEvent.error,
                  events: allEventsRef.current,
                }),
              );
            }
            return;
          }
        }
      } catch (error) {
        console.error('Error polling for events: ', error);
      }
    };

    const startPolling = () => {
      if (intervalRef.current) {
        return;
      } // Prevent duplicate polling
      intervalRef.current = setInterval(fetchEvents, 1000);
      setSliderValue(0);
      dispatch(updatedCrewOutput(undefined));
      dispatch(updatedCurrentEvents([]));
      dispatch(updatedCurrentEventIndex(0));
    };

    const stopPolling = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    startPolling();
    return () => {
      // Only stop polling when component unmounts
      stopPolling();
    };
  }, [isRunning, currentTraceId]);

  // Poll the workflow for changes every 2 seconds till it's ready
  useEffect(() => {
    if (!workflow?.is_ready && refetchWorkflow) {
      const startWorkflowPolling = () => {
        if (workflowPollingRef.current) {
          return;
        }
        workflowPollingRef.current = setInterval(refetchWorkflow, 2000);
      };

      const stopWorkflowPolling = () => {
        if (workflowPollingRef.current) {
          clearInterval(workflowPollingRef.current);
          workflowPollingRef.current = null;
        }
      };

      startWorkflowPolling();

      return () => {
        stopWorkflowPolling();
      };
    }
  }, [workflow?.is_ready, refetchWorkflow]);

  // Add effect to reset state when workflow changes
  useEffect(() => {
    dispatch(clearedWorkflowApp());
    setSliderValue(0);
    setShowMonitoring(renderMode === 'studio');

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (workflowPollingRef.current) {
      clearInterval(workflowPollingRef.current);
      workflowPollingRef.current = null;
    }
  }, [workflow?.workflow_id]); // Use workflow_id instead of id

  // Keep the existing cleanup effect as well
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (workflowPollingRef.current) {
        clearInterval(workflowPollingRef.current);
        workflowPollingRef.current = null;
      }

      dispatch(clearedWorkflowApp());
      setSliderValue(0);
      setShowMonitoring(renderMode === 'studio');
    };
  }, []);

  // Add this selector
  const workflowConfiguration = useAppSelector(selectWorkflowConfiguration);

  // Update the hasValidTools check to use workflowConfiguration from redux
  const hasValidTools = useMemo(() => {
    // Always return true if in workflow mode
    if (renderMode === 'workflow') {
      return true;
    }

    // Otherwise do the normal validation
    if (!workflow) {
      return true;
    }
    return hasValidToolConfiguration(
      workflow.workflow_id,
      agents,
      toolInstances,
      workflowConfiguration,
    );
  }, [workflow, agents, toolInstances, workflowConfiguration, renderMode]);

  // Add this function near the top with other functions
  const getInvalidTools = (
    agents: AgentMetadata[] | undefined,
    toolInstances: ToolInstance[] | undefined,
    workflowId: string | undefined,
  ) => {
    if (!agents || !toolInstances || !workflowId) {
      return [];
    }

    const invalidTools: { name: string; status: string }[] = [];

    agents
      .filter((agent) => agent.workflow_id === workflowId)
      .forEach((agent) => {
        agent.tools_id.forEach((toolId) => {
          const tool = toolInstances.find((t) => t.id === toolId);
          if (tool && !tool.is_valid) {
            const status = tool.tool_metadata
              ? JSON.parse(
                  typeof tool.tool_metadata === 'string'
                    ? tool.tool_metadata
                    : JSON.stringify(tool.tool_metadata),
                ).status
              : 'Unknown error';
            invalidTools.push({ name: tool.name, status });
          }
        });
      });

    return invalidTools;
  };

  // In the component, add before the return:
  const invalidTools = getInvalidTools(agents, toolInstances, workflow?.workflow_id);

  // Don't display anything if workflowId is nonexistent
  if (!workflow) {
    return (
      <div className="flex justify-center items-center h-full">
        <Spin size="large" />
      </div>
    );
  }

  const hasManagerAgent = workflow.crew_ai_workflow_metadata?.process === 'hierarchical';
  const hasDefaultManager =
    hasManagerAgent && !workflow.crew_ai_workflow_metadata?.manager_agent_id;

  const hasUnassignedTasks =
    !hasManagerAgent && !hasDefaultManager
      ? (workflow.crew_ai_workflow_metadata?.task_id?.some((taskId: string) => {
          const task = tasks?.find((t) => t.task_id === taskId);
          return task && !task.assigned_agent_id;
        }) ?? false)
      : false;

  return (
    <>
      <Layout className="flex-1 flex flex-row bg-white rounded relative">
        {/* Left side - Workflow Inputs */}
        <Layout
          className={`bg-transparent flex-col flex-shrink-0 h-full transition-all duration-300 ease-in-out p-4 ${
            showMonitoring ? 'w-[40%]' : 'w-full'
          }`}
        >
          <Collapse
            bordered={false}
            className="mb-6"
            items={[
              {
                key: '1',
                label: 'Capability Guide',
                children:
                  renderMode === 'studio' ? (
                    <div className="flex items-center">
                      <Input.TextArea
                        placeholder="Description"
                        value={workflowDescription}
                        onChange={(e) => handleDescriptionChange(e.target.value)}
                        autoSize={{ minRows: 1, maxRows: 6 }}
                      />
                      <Tooltip title="Generate description using AI">
                        <Button
                          type="text"
                          icon={
                            <img
                              src="/ai-assistant.svg"
                              alt="AI Assistant"
                              className="w-5 h-5 filter invert-[70%] sepia-[80%] saturate-[1000%] hue-rotate-[360deg]"
                            />
                          }
                          className="p-0.5 ml-2"
                          onClick={handleGenerateDescription}
                        />
                      </Tooltip>
                    </div>
                  ) : (
                    <div>{workflow.description}</div>
                  ),
              },
            ]}
          />
          {renderMode === 'studio' && !defaultModel ? (
            renderAlert(
              'No Default LLM Model',
              'Please configure a default LLM model on the LLMs page to use workflows.',
              'warning',
            )
          ) : invalidTools.length > 0 ? (
            renderAlert(
              'Invalid Tools Detected',
              `The following tools are invalid: ${invalidTools.map((t) => `${t.name} (${t.status})`).join(', ')}. Please go to Create or Edit Agent Modal to fix or delete these tools.`,
              'warning',
            )
          ) : !workflow?.is_ready ? (
            renderAlert(
              'Getting your workflow ready.',
              'This workflow is still being configured. This might take a few minutes.',
              'loading',
            )
          ) : !((workflow.crew_ai_workflow_metadata?.agent_id?.length ?? 0) > 0) ? (
            renderAlert(
              'No Agents Found',
              'This workflow does not have any agents. You need at least one agent to test or deploy the workflow.',
              'warning',
            )
          ) : !((workflow.crew_ai_workflow_metadata?.task_id?.length ?? 0) > 0) ? (
            renderAlert(
              'No Tasks Found',
              'This workflow does not have any tasks. You need at least one task to test or deploy the workflow.',
              'warning',
            )
          ) : hasUnassignedTasks ? (
            renderAlert(
              'Unassigned Tasks',
              'You need to assign tasks to an agent because there is no manager agent.',
              'warning',
            )
          ) : !hasValidTools ? (
            renderAlert(TOOL_PARAMS_ALERT.message, TOOL_PARAMS_ALERT.description, 'warning')
          ) : workflow.is_conversational ? (
            <WorkflowAppChatView workflow={workflow} tasks={tasks} />
          ) : (
            <WorkflowAppInputsView workflow={workflow} tasks={tasks} />
          )}
        </Layout>

        {/* Monitoring Button when monitoring is hidden */}
        {!showMonitoring && (
          <Tooltip title="Show Visual & Logs">
            <Button
              icon={<DashboardOutlined className="text-white" />}
              type="text"
              onClick={() => setShowMonitoring(true)}
              className="absolute top-4 right-4 bg-blue-500 shadow-lg rounded-full w-8 h-8 flex items-center justify-center border-none monitoring-button"
            />
          </Tooltip>
        )}

        {/* Right side - Monitoring View */}
        {showMonitoring && (
          <Layout className="bg-transparent flex-col w-[60%] flex-shrink-0 h-full m-0 pl-3 pr-3 relative">
            {/* Close button for monitoring view */}
            <Tooltip title="Close Visual & Logs">
              <Button
                icon={<CloseOutlined />}
                type="text"
                onClick={() => setShowMonitoring(false)}
                className="absolute top-4 right-4 z-10 bg-white shadow-lg rounded-full w-6 h-6 flex items-center justify-center"
              />
            </Tooltip>

            <WorkflowDiagramView
              workflowState={workflowState}
              toolInstances={toolInstances}
              mcpInstances={mcpInstances}
              tasks={tasks}
              agents={agents}
              events={currentEvents}
              displayDiagnostics={true}
              renderMode={renderMode}
            />

            <Layout className="bg-transparent m-3 p-4 border border-gray-400 rounded flex-shrink-0 flex-grow pl-12 pr-12">
              <Title level={5}>Playback</Title>
              <Slider
                min={0}
                max={!currentEvents || currentEvents.length == 0 ? 0 : currentEvents.length - 1}
                value={sliderValue}
                onChange={handleSliderChange}
                marks={{
                  0: 'Start',
                  [!currentEvents || currentEvents.length == 0 ? 0 : currentEvents.length - 1]:
                    'End',
                }}
                tooltip={{ formatter: (val) => `Event ${val}` }}
              />
            </Layout>
          </Layout>
        )}
      </Layout>
    </>
  );
};

export default WorkflowApp;
