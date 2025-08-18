import React, { useState, useEffect } from 'react';
import { Button, Card, Input, Layout, Typography, Alert, Spin, Menu, Dropdown, Tag } from 'antd';
import ThoughtsBox, { ThoughtEntry } from './ThoughtsBox';
import { getWorkflowInputs } from '@/app/lib/workflow';
import { useTestWorkflowMutation } from '@/app/workflows/workflowsApi';
import { useAppDispatch, useAppSelector } from '@/app/lib/hooks/hooks';
import {
  selectWorkflowAppStandardInputs,
  selectWorkflowCrewOutput,
  selectWorkflowIsRunning,
  updatedAppInputs,
  updatedCurrentTraceId,
  updatedIsRunning,
  updatedCrewOutput,
  selectCurrentEvents,
} from '@/app/workflows/workflowAppSlice';
import {
  PauseCircleOutlined,
  SendOutlined,
  DownloadOutlined,
  MoreOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { CrewAITaskMetadata, Workflow } from '@/studio/proto/agent_studio';
import showdown from 'showdown';
import {
  selectWorkflowConfiguration,
  selectWorkflowGenerationConfig,
  selectWorkflowSessionId,
  updatedWorkflowSessionId,
  updatedWorkflowSessionDirectory,
  selectWorkflowSessionDirectory,
} from '@/app/workflows/editorSlice';
import { useGetWorkflowDataQuery } from '@/app/workflows/workflowAppApi';
import { useGlobalNotification } from '../Notifications';
import FileUploadButton from '../FileUploadButton';
import { getWorkflowDirectory } from '@/app/lib/workflowFileUpload';

const { Title, Text } = Typography;

// Helper function to split array into chunks
const chunk = <T,>(arr: T[], size: number): T[][] => {
  return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
    arr.slice(i * size, i * size + size),
  );
};

// Helper function removed - we'll send empty string if no session_id

export interface WorkflowAppInputsViewProps {
  workflow?: Workflow;
  tasks?: CrewAITaskMetadata[];
  onOpenArtifacts?: () => void;
  thoughts?: ThoughtEntry[];
  thoughtsCollapsed?: boolean;
  onToggleThoughts?: (next: boolean) => void;
}

const WorkflowAppInputsView: React.FC<WorkflowAppInputsViewProps> = ({
  workflow,
  tasks,
  onOpenArtifacts,
  thoughts = [],
  thoughtsCollapsed = false,
  onToggleThoughts = () => {},
}) => {
  const dispatch = useAppDispatch();
  const inputs = useAppSelector(selectWorkflowAppStandardInputs);
  const crewOutput = useAppSelector(selectWorkflowCrewOutput);
  const isRunning = useAppSelector(selectWorkflowIsRunning);
  const currentEvents = useAppSelector(selectCurrentEvents);
  const [testWorkflow] = useTestWorkflowMutation();
  const workflowGenerationConfig = useAppSelector(selectWorkflowGenerationConfig);
  const workflowConfiguration = useAppSelector(selectWorkflowConfiguration);
  const sessionId = useAppSelector(selectWorkflowSessionId);
  const sessionDirectory = useAppSelector(selectWorkflowSessionDirectory);
  const notificationApi = useGlobalNotification();
  // If we haven't determined our application render type, then we don't render yet!
  const { data: workflowData, isLoading } = useGetWorkflowDataQuery();
  const renderMode = workflowData?.renderMode;
  const workflowModelUrl = workflowData?.workflowModelUrl;

  const allEventsRef = React.useRef<any[]>([]);
  const [lastRun, setLastRun] = useState<{
    userInput: string;
    output: string;
    events: any[];
  } | null>(null);

  // Local state for non-conversational file chips - must be at top with other hooks
  const [fileStates, setFileStates] = useState<{
    [fileName: string]: {
      name: string;
      size: number;
      status: 'pending' | 'uploading' | 'completed' | 'failed';
    };
  }>({});
  const [submittedFiles, setSubmittedFiles] = useState<{ name: string; size: number }[]>([]);

  // Add effect to clear crew output when workflow changes
  useEffect(() => {
    dispatch(updatedCrewOutput(undefined));
    // Also clear file states when workflow changes
    setFileStates({});
    setSubmittedFiles([]);
  }, [workflow?.workflow_id, dispatch]);

  useEffect(() => {
    // Accumulate all events for the current run
    if (isRunning && currentEvents && currentEvents.length > 0) {
      allEventsRef.current = [...allEventsRef.current, ...currentEvents];
    }
  }, [currentEvents, isRunning]);

  useEffect(() => {
    // When workflow completes, store the last run info
    if (!isRunning && crewOutput && allEventsRef.current.length > 0) {
      setLastRun({
        userInput: Object.values(inputs).join(' | '),
        output: crewOutput,
        events: allEventsRef.current,
      });
    }
  }, [isRunning, crewOutput, inputs]);

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
    // Move completed files to submitted files when workflow is run.
    // Always replace the submitted list so previous run's attachments don't persist.
    const completedFiles = Object.values(fileStates).filter((f) => f.status === 'completed');
    setSubmittedFiles(completedFiles.map((f) => ({ name: f.name, size: f.size })));
    // Clear any pre-send chips regardless of whether there were completed files
    setFileStates({});

    // Get all possible inputs and create a dictionary with empty strings as defaults
    const allInputs = getWorkflowInputs(workflow?.crew_ai_workflow_metadata, tasks);
    const defaultInputs = Object.fromEntries(allInputs.map((input) => [input, '']));

    // Merge default empty inputs with provided inputs
    const finalInputs = { ...defaultInputs, ...inputs };

    let traceId: string | undefined = undefined;
    if (renderMode === 'studio') {
      try {
        const response = await testWorkflow({
          workflow_id: workflow.workflow_id,
          inputs: finalInputs, // Use finalInputs instead of inputs
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
      // For workflow mode, include session_id in kickoff inputs
      const kickoffInputsWithSession = {
        ...finalInputs,
        session_id: sessionId || '',
      };

      const kickoffResponse = await fetch(`${workflowModelUrl}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          request: {
            action_type: 'kickoff',
            kickoff_inputs: base64Encode(kickoffInputsWithSession),
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
      allEventsRef.current = [];
      setLastRun(null);
    } else {
      dispatch(updatedIsRunning(false));
    }
  };

  const handleDownloadPDF = async () => {
    if (!crewOutput) return;

    try {
      // Dynamically import html2pdf
      const html2pdf = (await import('html2pdf.js')).default;

      const converter = new showdown.Converter({
        tables: true,
        tasklists: true,
        strikethrough: true,
        emoji: true,
      });

      const html = converter.makeHtml(crewOutput);

      const container = document.createElement('div');
      container.innerHTML = html;
      container.style.padding = '20px';
      container.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial';
      container.style.fontSize = '12px';
      container.style.lineHeight = '1.5';
      container.style.color = '#000';

      const style = document.createElement('style');
      style.textContent = `
        h1, h2, h3, h4, h5, h6 { margin-top: 24px; margin-bottom: 16px; font-weight: 600; }
        h1 { font-size: 2em; }
        h2 { font-size: 1.5em; }
        p { margin-bottom: 16px; }
        code { background-color: #f6f8fa; padding: 2px 4px; border-radius: 3px; }
        pre { background-color: #f6f8fa; padding: 16px; border-radius: 6px; overflow-x: auto; }
        blockquote { border-left: 4px solid #dfe2e5; padding-left: 16px; margin-left: 0; }
        table { border-collapse: collapse; width: 100%; margin-bottom: 16px; }
        th, td { border: 1px solid #dfe2e5; padding: 6px 13px; }
        img { max-width: 100%; height: auto; }
        ul, ol { padding-left: 20px; margin-bottom: 16px; }
      `;
      container.appendChild(style);

      const opt = {
        margin: [10, 10],
        filename: 'workflow-output.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          letterRendering: true,
        },
        jsPDF: {
          unit: 'mm',
          format: 'a4',
          orientation: 'portrait',
        },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
      };

      await html2pdf().from(container).set(opt).save();
    } catch (error) {
      console.error('Error generating PDF:', error);
    }
  };

  const handleDownloadLogs = () => {
    if (!lastRun) return;
    const log = [
      {
        User: lastRun.userInput,
        Assistant: lastRun.output,
        events: lastRun.events,
      },
    ];
    const fileName = `${workflow?.name || 'workflow_log'}.json`;
    const blob = new Blob([JSON.stringify(log, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getAttachmentMeta = (name: string) => {
    const lower = name.toLowerCase();
    if (lower.endsWith('.csv') || lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
      return { label: 'Spreadsheet', emoji: '🟩' };
    }
    if (lower.endsWith('.ppt') || lower.endsWith('.pptx')) {
      return { label: 'Presentation', emoji: '🟧' };
    }
    if (lower.endsWith('.pdf')) {
      return { label: 'PDF', emoji: '🟥' };
    }
    if (
      lower.endsWith('.png') ||
      lower.endsWith('.jpg') ||
      lower.endsWith('.jpeg') ||
      lower.endsWith('.gif')
    ) {
      return { label: 'Image', emoji: '🖼️' };
    }
    return { label: 'File', emoji: '📄' };
  };

  const menu = (
    <Menu>
      <Menu.Item key="download" onClick={handleDownloadLogs}>
        <DownloadOutlined className="mr-2" />
        Log Bundle
      </Menu.Item>
    </Menu>
  );

  // If we are not fully loaded, don't display anything
  if (isLoading || !workflowData || !workflowData.renderMode) {
    return <></>;
  }

  return (
    <>
      <Layout
        style={{
          marginTop: '16px',
          borderRadius: '1px',
          flexDirection: 'column',
          gap: 8,
          padding: 12,
          background: 'transparent',
          display: 'flex',
          height: '100%',
          overflowY: 'auto',
        }}
      >
        <div style={{ flexShrink: 0, marginBottom: '16px' }}>
          {/* File chips above Inputs */}
          {Object.keys(fileStates).length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              {Object.values(fileStates).map((fileState) => (
                <Tag
                  key={fileState.name}
                  color={
                    fileState.status === 'uploading'
                      ? 'blue'
                      : fileState.status === 'failed'
                        ? 'red'
                        : 'default'
                  }
                  closable={true}
                  onClose={async (e) => {
                    e.preventDefault();
                    // Remove from UI immediately
                    setFileStates((prev) => {
                      const newStates = { ...prev };
                      delete newStates[fileState.name];
                      return newStates;
                    });

                    // If still uploading, cancel just this file's upload
                    if (fileState.status === 'uploading') {
                      try {
                        // @ts-ignore
                        if (typeof window !== 'undefined' && window.__cancelUpload) {
                          // @ts-ignore
                          window.__cancelUpload(fileState.name);
                        }
                      } catch {}
                    }

                    // Background deletion for completed files
                    if (fileState.status === 'completed') {
                      if (sessionDirectory) {
                        const filePath = `${sessionDirectory}/${fileState.name}`;
                        try {
                          await fetch('/api/file/delete', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ filePath }),
                          });
                        } catch (err) {
                          console.error('Background delete error:', err);
                        }
                      }
                    }
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <span role="img" aria-label="file">
                    📄
                  </span>
                  <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {fileState.name}
                  </span>
                  <span style={{ opacity: 0.8 }}>{(fileState.size / 1024).toFixed(1)} KB</span>
                  {fileState.status === 'uploading' && (
                    <Spin size="small" style={{ marginLeft: 4 }} />
                  )}
                  {fileState.status === 'failed' && (
                    <span style={{ color: 'red', marginLeft: 4 }}>✗</span>
                  )}
                </Tag>
              ))}
            </div>
          )}
          {getWorkflowInputs(workflow?.crew_ai_workflow_metadata, tasks).length > 0 ? (
            <>
              <Title level={5}>Inputs</Title>
              <div className="flex flex-col gap-2">
                {/* Group inputs into pairs */}
                {chunk(getWorkflowInputs(workflow?.crew_ai_workflow_metadata, tasks), 2).map(
                  (inputPair, rowIndex) => (
                    <div key={rowIndex} className="flex gap-4">
                      {inputPair.map((input, index) => (
                        <div key={index} className="flex-1 flex flex-col gap-1">
                          <Text className="text-sm font-normal">{input}</Text>
                          <Input
                            placeholder={`Enter ${input}`}
                            value={inputs[input]}
                            onChange={(e) => handleInputChange(input, e.target.value)}
                          />
                        </div>
                      ))}
                      {/* Add placeholder div if odd number of inputs */}
                      {inputPair.length === 1 && <div className="flex-1" />}
                    </div>
                  ),
                )}
              </div>
            </>
          ) : (
            <Alert
              message="No inputs required for this workflow."
              type="info"
              showIcon
              className="mb-4"
            />
          )}
        </div>

        {/* Submitted files display - below inputs and above Run Workflow */}
        {submittedFiles.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <Text style={{ fontSize: 13, fontWeight: 400, marginBottom: '4px', display: 'block' }}>
              Attachments
            </Text>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {submittedFiles.map((f, idx) => {
                const meta = getAttachmentMeta(f.name);
                return (
                  <Tag key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>{meta.emoji}</span>
                    <span style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {f.name}
                    </span>
                    {typeof f.size === 'number' && (
                      <span style={{ opacity: 0.8 }}>{(f.size / 1024).toFixed(1)} KB</span>
                    )}
                    <span style={{ opacity: 0.7 }}>{meta.label}</span>
                  </Tag>
                );
              })}
            </div>
          </div>
        )}

        <div
          style={{
            display: 'flex',
            gap: '8px',
            flexShrink: 0,
            marginBottom: '16px',
            alignItems: 'center',
          }}
        >
          <Button
            type="primary"
            icon={isRunning ? <Spin size="small" /> : <SendOutlined />}
            onClick={async () => {
              await handleCrewKickoff();
            }}
            disabled={isRunning}
            className="flex-1"
          >
            {isRunning ? 'Workflow Running...' : 'Run Workflow'}
          </Button>
          {/* Upload icon to the right of Run Workflow */}
          <FileUploadButton
            workflow={workflow}
            renderMode={renderMode || 'studio'}
            buttonType="icon"
            size="small"
            onUploadSuccess={onOpenArtifacts}
            onFilesAdded={(files) => {
              // Add files to uploading state
              setFileStates((prev) => {
                const newStates = { ...prev };
                files.forEach((f) => {
                  newStates[f.name] = { name: f.name, size: f.size, status: 'uploading' };
                });
                return newStates;
              });
            }}
            onFileUploaded={(file, success) => {
              setFileStates((prev) => {
                const newStates = { ...prev };
                if (newStates[file.name]) {
                  newStates[file.name].status = success ? 'completed' : 'failed';
                }
                return newStates;
              });
            }}
          />
          <Dropdown overlay={menu} trigger={['click']} placement="bottomRight">
            <Button icon={<MoreOutlined />} />
          </Dropdown>
        </div>

        {/* Thoughts above output box for non-conversational workflows */}
        <ThoughtsBox
          entries={thoughts}
          isCollapsed={thoughtsCollapsed}
          onToggle={onToggleThoughts}
          style={{ marginBottom: 12 }}
        />

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            background: '#fff',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
            minHeight: '200px',
            position: 'relative',
            marginBottom: '16px',
            alignSelf: 'stretch',
            flex: '1 0 auto',
          }}
        >
          {/* Removed floating upload button in non-conversational view per request */}

          {crewOutput && (
            <>
              <div
                id="crew-output-content"
                className="prose prose-lg max-w-none text-xs p-4 pb-12 w-full leading-relaxed font-sans"
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                  {crewOutput}
                </ReactMarkdown>
              </div>
              <Button
                type="text"
                icon={<DownloadOutlined />}
                onClick={handleDownloadPDF}
                className="absolute bottom-4 right-4 bg-white shadow-lg rounded-full w-8 h-8 flex items-center justify-center border-none"
              />
            </>
          )}
        </div>
      </Layout>
    </>
  );
};

export default WorkflowAppInputsView;
