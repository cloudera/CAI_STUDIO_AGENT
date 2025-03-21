'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Layout, Spin, Typography, Slider, Alert, Button, Tooltip } from 'antd';
import WorkflowAppInputsView from './WorkflowAppInputsView';
import { useAppDispatch, useAppSelector } from '@/app/lib/hooks/hooks';
import {
  addedChatMessage,
  selectCurrentEvents,
  selectWorkflowCurrentTraceId,
  selectWorkflowIsRunning,
  updatedCrewOutput,
  updatedCurrentEventIndex,
  updatedCurrentEvents,
  updatedCurrentPhoenixProjectId,
  updatedIsRunning,
} from '@/app/workflows/workflowAppSlice';
import fetch from 'node-fetch';
import { WorkflowEvent } from '@/app/lib/workflow';
import WorkflowDiagramView from './WorkflowDiagramView';
import {
  AgentMetadata,
  CrewAITaskMetadata,
  ToolInstance,
  Workflow,
} from '@/studio/proto/agent_studio';
import WorkflowAppChatView from './WorkflowAppChatView';
import {
  InfoCircleOutlined,
  WarningOutlined,
  CloseOutlined,
  DashboardOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import { useGetDefaultModelQuery } from '@/app/models/modelsApi';
import { useGetWorkflowDataQuery } from '@/app/workflows/workflowAppApi';
import { useGetEventsMutation } from '@/app/ops/opsApi';

const { Title, Text } = Typography;

export interface WorkflowAppProps {
  workflow?: Workflow;
  refetchWorkflow?: () => void;
  toolInstances?: ToolInstance[];
  tasks?: CrewAITaskMetadata[];
  agents?: AgentMetadata[];
}

// Add interface for event type
interface EventError {
  name: string;
  message: string;
}

// Add interface for workflow event with errors
interface WorkflowEventWithErrors extends WorkflowEvent {
  events?: EventError[];
}

const renderAlert = (
  message: string,
  description: string,
  type: 'info' | 'warning' | 'error' | 'loading',
) => {
  const icon =
    type === 'warning' ? (
      <WarningOutlined style={{ fontSize: 16, color: '#faad14' }} />
    ) : type === 'loading' ? (
      <LoadingOutlined style={{ fontSize: 16, color: '#1890ff' }} />
    ) : (
      <InfoCircleOutlined style={{ fontSize: 16, color: '#1890ff' }} />
    );

  const alertType = type === 'loading' ? 'info' : type;

  return (
    <Alert
      style={{
        alignItems: 'flex-start',
        justifyContent: 'flex-start',
        padding: 12,
        margin: 12,
      }}
      message={
        <Layout style={{ flexDirection: 'column', gap: 4, padding: 0, background: 'transparent' }}>
          <Layout
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              background: 'transparent',
            }}
          >
            {icon}
            <Text style={{ fontSize: 13, fontWeight: 600, background: 'transparent' }}>
              {message}
            </Text>
          </Layout>
          <Text style={{ fontSize: 13, fontWeight: 400, background: 'transparent' }}>
            {description}
          </Text>
        </Layout>
      }
      type={alertType}
      showIcon={false}
      closable={false}
    />
  );
};

const WorkflowApp: React.FC<WorkflowAppProps> = ({
  workflow,
  refetchWorkflow,
  toolInstances,
  tasks,
  agents,
}) => {

  // TODO: pass render mode in to the workflow app directly
  // TODO: pass model url and render mode down to child components through props
  const { data: workflowData, isLoading } = useGetWorkflowDataQuery();
  const renderMode = workflowData?.renderMode;
  const workflowModelUrl = workflowData?.workflowModelUrl;

  const isRunning = useAppSelector(selectWorkflowIsRunning);
  const currentTraceId = useAppSelector(selectWorkflowCurrentTraceId);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const workflowPollingRef = useRef<NodeJS.Timeout | null>(null);
  const dispatch = useAppDispatch();
  const currentEvents = useAppSelector(selectCurrentEvents);

  const [ getEvents ] = useGetEventsMutation();

  // NOTE: because we also run our workflow app in "standalone" mode, his
  // specific query may fail. Becuase of this, we also check our workflow
  // data to see if we are rendering in studio model. Making this actual api
  // call is acceptable from the frontend (but will show up as an error 
  // in the logs), but we need to make sure we don't do anything with
  // the results of this api call if we are rendering in workflow app mode.
  // TODO: pull this out to either a prop to the component or maybe even
  // set somewhere in redux state.
  const { data: defaultModel } = useGetDefaultModelQuery();

  const [sliderValue, setSliderValue] = useState<number>(0);
  const [showMonitoring, setShowMonitoring] = useState(false);

  // Track processed exception IDs
  const processedExceptionsRef = useRef<Set<string>>(new Set());

  // Add effect to update showMonitoring when renderMode changes
  useEffect(() => {
    setShowMonitoring(renderMode === 'studio');
  }, [renderMode]);

  const handleSliderChange = (value: number) => {
    setSliderValue(value);
    dispatch(updatedCurrentEventIndex(value));
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
        const { projectId, events: allEvents } = await getEvents({traceId: currentTraceId}).unwrap();
        dispatch(updatedCurrentEvents(allEvents));
        dispatch(updatedCurrentEventIndex(allEvents.length - 1));
        dispatch(updatedCurrentPhoenixProjectId(projectId)); // TODO: there's a more graceful place for this

        if (allEvents && allEvents.length > 0) {
          // Find completion events and check for exceptions
          const completionEvent = allEvents.find((event: WorkflowEventWithErrors) => {
            if (event.name === 'completion') {
              const hasException = event.events?.some((e: EventError) => e.name === 'exception');
              return hasException && !processedExceptionsRef.current.has(event.id);
            }
            return false;
          });

          if (completionEvent) {
            const exceptionEvent = completionEvent.events?.find(
              (e: EventError) => e.name === 'exception',
            );
            if (exceptionEvent && isRunning) {
              processedExceptionsRef.current.add(completionEvent.id);
              stopPolling();
              dispatch(updatedIsRunning(false));
              const errorMessage = `Error: ${exceptionEvent.message}`;

              if (workflow?.is_conversational) {
                dispatch(addedChatMessage({ role: 'assistant', content: errorMessage }));
              } else {
                dispatch(updatedCrewOutput(errorMessage));
              }
              return;
            }
          }

          // Check for successful completion as before
          const crewCompleteEvent = allEvents.find(
            (event: WorkflowEvent) => event.name === 'Crew.complete',
          );
          if (crewCompleteEvent) {
            stopPolling();
            dispatch(updatedCrewOutput(crewCompleteEvent.attributes.crew_output));
            dispatch(updatedIsRunning(false));

            if (workflow?.is_conversational) {
              dispatch(
                addedChatMessage({
                  id: crewCompleteEvent.id,
                  role: 'assistant',
                  content: crewCompleteEvent.attributes.crew_output,
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
      if (intervalRef.current) return; // Prevent duplicate polling
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
        if (workflowPollingRef.current) return;
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

  // Don't display anything if workflowId is nonexistent
  if (!workflow) {
    return (
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
      <Layout
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'row',
          backgroundColor: 'white',
          borderRadius: 4,
          position: 'relative',
        }}
      >
        {/* Left side - Workflow Inputs */}
        <Layout
          style={{
            background: 'transparent',
            flexDirection: 'column',
            width: showMonitoring ? '40%' : '100%',
            flexShrink: 0,
            height: '100%',
            transition: 'width 0.3s ease',
          }}
        >
          {(renderMode === 'studio' && !defaultModel) ? (
            renderAlert(
              'No Default LLM Model',
              'Please configure a default LLM model on the LLMs page to use workflows.',
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
              icon={<DashboardOutlined style={{ color: 'white' }} />}
              type="text"
              onClick={() => setShowMonitoring(true)}
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                background: '#1890ff',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: 'none',
              }}
              className="monitoring-button"
            />
          </Tooltip>
        )}

        {/* Right side - Monitoring View */}
        {showMonitoring && (
          <Layout
            style={{
              background: 'transparent',
              flexDirection: 'column',
              width: '60%',
              display: 'flex',
              flexShrink: 0,
              height: '100%',
              margin: 0,
              paddingLeft: 12,
              paddingRight: 12,
              position: 'relative',
            }}
          >
            {/* Close button for monitoring view */}
            <Tooltip title="Close Visual & Logs">
              <Button
                icon={<CloseOutlined />}
                type="text"
                onClick={() => setShowMonitoring(false)}
                style={{
                  position: 'absolute',
                  top: '16px',
                  right: '16px',
                  zIndex: 1,
                  background: 'white',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                  borderRadius: '50%',
                  width: '24px',
                  height: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              />
            </Tooltip>

            <WorkflowDiagramView
              workflowState={{
                name: workflow.name,
                workflowId: '',
                isConversational: workflow.is_conversational,
                workflowMetadata: {
                  agentIds: workflow.crew_ai_workflow_metadata?.agent_id,
                  taskIds: workflow.crew_ai_workflow_metadata?.task_id,
                  process: workflow.crew_ai_workflow_metadata?.process,
                  managerAgentId: workflow.crew_ai_workflow_metadata?.manager_agent_id,
                },
              }}
              toolInstances={toolInstances}
              tasks={tasks}
              agents={agents}
              events={currentEvents}
              displayDiagnostics={true}
            />

            <Layout
              style={{
                backgroundColor: 'transparent',
                margin: '12px',
                padding: '16px',
                border: '1px solid #grey',
                borderRadius: '5px',
                flexShrink: 0,
                flexGrow: 1,
                paddingLeft: 48,
                paddingRight: 48,
              }}
            >
              <Title level={5}>Playback</Title>
              <Slider
                min={0}
                max={(!currentEvents || currentEvents.length == 0) ? 0 : currentEvents.length - 1}
                value={sliderValue}
                onChange={handleSliderChange}
                marks={{
                  0: 'Start',
                  [(!currentEvents || currentEvents.length == 0) ? 0 : currentEvents.length - 1]: 'End',
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
