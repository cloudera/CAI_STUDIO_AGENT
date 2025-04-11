import React, { useEffect, useRef, useState } from 'react';
import { Button, Card, Input, Layout, Typography, Alert, Spin } from 'antd';
import { getWorkflowInputs } from '@/app/lib/workflow';
import { useGetWorkflowByIdQuery, useTestWorkflowMutation } from '@/app/workflows/workflowsApi';
import { useListTasksQuery } from '@/app/tasks/tasksApi';
import { useAppDispatch, useAppSelector } from '@/app/lib/hooks/hooks';
import {
  addedChatMessage,
  selectWorkflowAppChatMessages,
  selectWorkflowAppChatUserInput,
  selectWorkflowAppStandardInputs,
  selectWorkflowCrewOutput,
  selectWorkflowIsRunning,
  updatedAppInputs,
  updatedChatUserInput,
  updatedCurrentTraceId,
  updatedIsRunning,
  clearedChatMessages,
} from '@/app/workflows/workflowAppSlice';
import {
  AgentMetadata,
  CrewAITaskMetadata,
  ToolInstance,
  Workflow,
} from '@/studio/proto/agent_studio';
import ChatMessages from '../ChatMessages';
import {
  selectWorkflowConfiguration,
  selectWorkflowGenerationConfig,
} from '@/app/workflows/editorSlice';
import { useGetWorkflowDataQuery } from '@/app/workflows/workflowAppApi';
import { useGlobalNotification } from '../Notifications';

const { Title, Text } = Typography;

export interface WorkflowAppChatViewProps {
  workflow?: Workflow;
  tasks?: CrewAITaskMetadata[];
}

const WorkflowAppChatView: React.FC<WorkflowAppChatViewProps> = ({ workflow, tasks }) => {
  const userInput = useAppSelector(selectWorkflowAppChatUserInput);
  const dispatch = useAppDispatch();
  const isRunning = useAppSelector(selectWorkflowIsRunning);
  const [testWorkflow] = useTestWorkflowMutation();
  const crewOutput = useAppSelector(selectWorkflowCrewOutput);
  const workflowGenerationConfig = useAppSelector(selectWorkflowGenerationConfig);
  const workflowConfiguration = useAppSelector(selectWorkflowConfiguration);
  const notificationApi = useGlobalNotification();

  // If we haven't determined our application render type, then we don't render yet!
  const { data: workflowData, isLoading } = useGetWorkflowDataQuery();
  const renderMode = workflowData?.renderMode;
  const workflowModelUrl = workflowData?.workflowModelUrl;

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messages = useAppSelector(selectWorkflowAppChatMessages);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  if (!workflow) {
    return <></>;
  }

  const handleInputChange = (key: string, value: string) => {
    dispatch(
      updatedAppInputs({
        [key]: value,
      }),
    );
  };

  const base64Encode = (obj: any): string => {
    return Buffer.from(JSON.stringify(obj)).toString('base64');
  };

  const handleCrewKickoff = async () => {
    // Create user_input and context from the messages and exsting input
    const context =
      messages.map((message) => ({ role: message.role, content: message.content })) || [];

    let traceId: string | undefined = undefined;
    if (renderMode === 'studio') {
      try {
        const response = await testWorkflow({
          workflow_id: workflow.workflow_id,
          inputs: {
            user_input: userInput || '', // TODO: fail on blank?
            context: JSON.stringify(context),
          },
          tool_user_parameters: workflowConfiguration?.toolConfigurations || {},
          generation_config: JSON.stringify(workflowGenerationConfig),
        }).unwrap();
        traceId = response.trace_id;
      } catch (error) {
        notificationApi.error({
          message: 'Test Workflow failed',
          description: JSON.stringify(error),
          placement: 'topRight',
        });
        return;
      }
    } else {
      console.log({
        action_type: 'kickoff',
        kickoff_inputs: {
          user_input: userInput || '',
          context: JSON.stringify(context),
        },
      });
      const kickoffResponse = await fetch(`${workflowModelUrl}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          request: {
            action_type: 'kickoff',
            kickoff_inputs: base64Encode({
              user_input: userInput || '',
              context: JSON.stringify(context),
            }),
          },
        }),
      });
      const kickoffResponseData = (await kickoffResponse.json()) as any;
      traceId = kickoffResponseData.response.trace_id;
    }

    if (traceId) {
      if (traceId.length === 31) {
        console.log('Trace Hex started with a 0! Add a 0!');
        traceId = '0' + traceId;
      }
      dispatch(updatedCurrentTraceId(traceId));
      dispatch(updatedIsRunning(true));

      // Add message to history
      dispatch(
        addedChatMessage({
          role: 'user',
          content: userInput || '', // TODO: fail on blank?
        }),
      );
      dispatch(updatedChatUserInput(''));
    } else {
      console.log('ERROR: could not start the crew!');
      dispatch(updatedIsRunning(false));
    }
  };

  const handleClearMessages = () => {
    dispatch(clearedChatMessages());
  };

  // If we are not fully loaded, don't display anything
  if (isLoading || !workflowData || !workflowData.renderMode) {
    return <></>;
  }

  return (
    <>
      <Layout
        style={{
          padding: 24,
          background: 'transparent',
          flex: 1,
        }}
      >
        <ChatMessages
          messages={messages}
          handleTestWorkflow={handleCrewKickoff}
          isProcessing={isRunning || false}
          messagesEndRef={messagesEndRef}
          clearMessages={handleClearMessages}
        />
      </Layout>
    </>
  );
};

export default WorkflowAppChatView;
