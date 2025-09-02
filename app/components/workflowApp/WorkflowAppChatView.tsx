import React, { useEffect, useRef } from 'react';
import { Layout } from 'antd';
import { useTestWorkflowMutation } from '@/app/workflows/workflowsApi';
import { useAppDispatch, useAppSelector } from '@/app/lib/hooks/hooks';
import {
  addedChatMessage,
  selectWorkflowAppChatMessages,
  selectWorkflowAppChatUserInput,
  selectWorkflowIsRunning,
  updatedChatUserInput,
  updatedCurrentTraceId,
  updatedIsRunning,
  clearedChatMessages,
} from '@/app/workflows/workflowAppSlice';
import { CrewAITaskMetadata, Workflow } from '@/studio/proto/agent_studio';
import ChatMessages from '../ChatMessages';
import { ThoughtEntry } from './ThoughtsBox';
import {
  selectWorkflowConfiguration,
  selectWorkflowGenerationConfig,
  selectWorkflowSessionId,
  updatedWorkflowSessionId,
  updatedWorkflowSessionDirectory,
} from '@/app/workflows/editorSlice';
import { useGetWorkflowDataQuery } from '@/app/workflows/workflowAppApi';
import { useGlobalNotification } from '../Notifications';
import { selectWorkflowAppSessionFiles } from '@/app/workflows/workflowAppSlice';

export interface WorkflowAppChatViewProps {
  workflow?: Workflow;
  tasks?: CrewAITaskMetadata[];
  onOpenArtifacts?: () => void;
  thoughts?: ThoughtEntry[];
  thoughtsCollapsed?: boolean;
  onToggleThoughts?: (next: boolean) => void;
  thoughtSessions?: { id: string; entries: ThoughtEntry[]; collapsed: boolean }[];
  onToggleThoughtSession?: (id: string, next: boolean) => void;
}

const WorkflowAppChatView: React.FC<WorkflowAppChatViewProps> = ({
  workflow,
  tasks: _tasks,
  onOpenArtifacts,
  thoughts: _thoughts = [],
  thoughtsCollapsed: _thoughtsCollapsed = false,
  onToggleThoughts: _onToggleThoughts = () => {},
  thoughtSessions = [],
  onToggleThoughtSession = () => {},
}) => {
  const userInput = useAppSelector(selectWorkflowAppChatUserInput);
  const dispatch = useAppDispatch();
  const isRunning = useAppSelector(selectWorkflowIsRunning);
  const [testWorkflow] = useTestWorkflowMutation();
  const workflowGenerationConfig = useAppSelector(selectWorkflowGenerationConfig);
  const workflowConfiguration = useAppSelector(selectWorkflowConfiguration);
  const sessionId = useAppSelector(selectWorkflowSessionId);
  const notificationApi = useGlobalNotification();
  const sessionFiles = useAppSelector(selectWorkflowAppSessionFiles);

  // If we haven't determined our application render type, then we don't render yet!
  const { data: workflowData, isLoading } = useGetWorkflowDataQuery();
  const renderMode = workflowData?.renderMode;
  const workflowModelUrl = workflowData?.workflowModelUrl;

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messages = useAppSelector(selectWorkflowAppChatMessages);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Only auto-scroll when new content is appended (new message, new session, or new thought in active session)
  const prevScrollStateRef = useRef<{
    messagesLen: number;
    sessionsLen: number;
    lastEntriesLen: number;
  }>({ messagesLen: 0, sessionsLen: 0, lastEntriesLen: 0 });

  useEffect(() => {
    const prev = prevScrollStateRef.current;
    const messagesLen = messages.length;
    const sessionsLen = thoughtSessions.length;
    const lastEntriesLen =
      sessionsLen > 0 ? thoughtSessions[sessionsLen - 1]?.entries?.length || 0 : 0;

    let shouldScroll = false;
    if (messagesLen > prev.messagesLen) shouldScroll = true;
    if (sessionsLen > prev.sessionsLen) shouldScroll = true;
    if (lastEntriesLen > prev.lastEntriesLen) shouldScroll = true;

    if (shouldScroll) scrollToBottom();

    prevScrollStateRef.current = { messagesLen, sessionsLen, lastEntriesLen };
  }, [messages, thoughtSessions]);

  if (!workflow) {
    return <></>;
  }

  // removed unused handleInputChange

  const base64Encode = (obj: any): string => {
    return Buffer.from(JSON.stringify(obj)).toString('base64');
  };

  const handleCrewKickoff = async () => {
    // Create user_input and context from the messages and exsting input
    const context =
      messages.map((message) => ({
        role: message.role,
        content: message.content,
        attachments: message.attachments || [],
      })) || [];

    // Build API user_input by appending attachment file names, while keeping the chat message content pure
    const attachmentNames = (sessionFiles || []).map((file) => file.name).filter(Boolean);
    const userInputForApi =
      attachmentNames.length > 0
        ? `${userInput || ''}${userInput ? '\n' : ''}Attachments: ${attachmentNames.join(', ')}`
        : userInput || '';

    let traceId: string | undefined = undefined;
    if (renderMode === 'studio') {
      try {
        const response = await testWorkflow({
          workflow_id: workflow.workflow_id,
          inputs: {
            user_input: userInputForApi, // user input with appended attachments for API only
            context: JSON.stringify(context),
          },
          tool_user_parameters: workflowConfiguration?.toolConfigurations || {},
          mcp_instance_env_vars: Object.fromEntries(
            Object.entries(workflowConfiguration?.mcpInstanceConfigurations || {}).map(
              ([key, config]) => [key, { env_vars: config.parameters }],
            ),
          ),
          generation_config: JSON.stringify(workflowGenerationConfig),
          session_id: sessionId || '',
        }).unwrap();
        traceId = response.trace_id;

        // Update session info from response
        if (response.session_id) {
          dispatch(updatedWorkflowSessionId(response.session_id));
        }
        if ((response as any).session_directory) {
          dispatch(updatedWorkflowSessionDirectory((response as any).session_directory));
        }
      } catch (error) {
        notificationApi.error({
          message: 'Test Workflow failed',
          description: JSON.stringify(error),
          placement: 'topRight',
        });
        return;
      }
    } else {
      const kickoffResponse = await fetch(`${workflowModelUrl}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          request: {
            action_type: 'kickoff',
            kickoff_inputs: base64Encode({
              user_input: userInputForApi,
              context: JSON.stringify(context),
              session_id: sessionId || '',
            }),
          },
        }),
      });
      const kickoffResponseData = (await kickoffResponse.json()) as any;
      traceId = kickoffResponseData.response.trace_id;

      // Extract session info from response if available
      if (kickoffResponseData.response.session_id) {
        dispatch(updatedWorkflowSessionId(kickoffResponseData.response.session_id));
      }
      if (kickoffResponseData.response.session_directory) {
        dispatch(updatedWorkflowSessionDirectory(kickoffResponseData.response.session_directory));
      }
    }

    if (traceId) {
      if (traceId.length === 31) {
        traceId = '0' + traceId;
      }
      dispatch(updatedCurrentTraceId(traceId));
      dispatch(updatedIsRunning(true));

      // Add message to history, include any session files as attachments
      dispatch(
        addedChatMessage({
          role: 'user',
          content: userInput || '', // TODO: fail on blank?
          attachments: sessionFiles && sessionFiles.length > 0 ? sessionFiles : undefined,
        }),
      );
      dispatch(updatedChatUserInput(''));
      // clear composer-side file chips handled in ChatMessages after send
    } else {
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
      <Layout className="p-px bg-transparent flex-1" style={{ overflowX: 'hidden' }}>
        <ChatMessages
          messages={messages}
          handleTestWorkflow={handleCrewKickoff}
          isProcessing={isRunning || false}
          messagesEndRef={messagesEndRef}
          clearMessages={handleClearMessages}
          workflowName={workflow.name}
          workflow={workflow}
          renderMode={renderMode}
          onOpenArtifacts={onOpenArtifacts}
          thoughtSessions={thoughtSessions}
          onToggleThoughtSession={onToggleThoughtSession}
        />
      </Layout>
    </>
  );
};

export default WorkflowAppChatView;
