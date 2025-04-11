import React, { useState, useEffect } from 'react';
import { Button, Card, Input, Layout, Typography, Alert, Spin } from 'antd';
import { getWorkflowInputs } from '@/app/lib/workflow';
import { useGetWorkflowByIdQuery, useTestWorkflowMutation } from '@/app/workflows/workflowsApi';
import { useListTasksQuery } from '@/app/tasks/tasksApi';
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
import { PauseCircleOutlined, SendOutlined, DownloadOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import {
  AgentMetadata,
  CrewAITaskMetadata,
  ToolInstance,
  Workflow,
} from '@/studio/proto/agent_studio';
import showdown from 'showdown';
import {
  selectWorkflowConfiguration,
  selectWorkflowGenerationConfig,
} from '@/app/workflows/editorSlice';
import { useGetWorkflowDataQuery } from '@/app/workflows/workflowAppApi';
import { useGlobalNotification } from '../Notifications';

const { Title, Text } = Typography;

// Helper function to split array into chunks
const chunk = <T,>(arr: T[], size: number): T[][] => {
  return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
    arr.slice(i * size, i * size + size),
  );
};

export interface WorkflowAppInputsViewProps {
  workflow?: Workflow;
  tasks?: CrewAITaskMetadata[];
}

const WorkflowAppInputsView: React.FC<WorkflowAppInputsViewProps> = ({ workflow, tasks }) => {
  const dispatch = useAppDispatch();
  const inputs = useAppSelector(selectWorkflowAppStandardInputs);
  const crewOutput = useAppSelector(selectWorkflowCrewOutput);
  const isRunning = useAppSelector(selectWorkflowIsRunning);
  const currentEvents = useAppSelector(selectCurrentEvents);
  const [testWorkflow] = useTestWorkflowMutation();
  const workflowGenerationConfig = useAppSelector(selectWorkflowGenerationConfig);
  const workflowConfiguration = useAppSelector(selectWorkflowConfiguration);
  const notificationApi = useGlobalNotification();

  // If we haven't determined our application render type, then we don't render yet!
  const { data: workflowData, isLoading } = useGetWorkflowDataQuery();
  const renderMode = workflowData?.renderMode;
  const workflowModelUrl = workflowData?.workflowModelUrl;

  // Add effect to clear crew output when workflow changes
  useEffect(() => {
    dispatch(updatedCrewOutput(undefined));
  }, [workflow?.workflow_id, dispatch]);

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
      const kickoffResponse = await fetch(`${workflowModelUrl}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          request: {
            action_type: 'kickoff',
            kickoff_inputs: base64Encode(finalInputs), // Use finalInputs instead of inputs
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
    } else {
      console.log('ERROR: could not start the crew!');
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
          height: 'calc(100vh - 200px)',
        }}
      >
        <div style={{ flexShrink: 0, marginBottom: '16px' }}>
          {getWorkflowInputs(workflow?.crew_ai_workflow_metadata, tasks).length > 0 ? (
            <>
              <Title level={5}>Inputs</Title>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {/* Group inputs into pairs */}
                {chunk(getWorkflowInputs(workflow?.crew_ai_workflow_metadata, tasks), 2).map(
                  (inputPair, rowIndex) => (
                    <div
                      key={rowIndex}
                      style={{
                        display: 'flex',
                        gap: '16px',
                      }}
                    >
                      {inputPair.map((input, index) => (
                        <div
                          key={index}
                          style={{
                            flex: 1,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px',
                          }}
                        >
                          <Text style={{ fontSize: 13, fontWeight: 400 }}>{input}</Text>
                          <Input
                            placeholder={`Enter ${input}`}
                            value={inputs[input]}
                            onChange={(e) => handleInputChange(input, e.target.value)}
                          />
                        </div>
                      ))}
                      {/* Add placeholder div if odd number of inputs */}
                      {inputPair.length === 1 && <div style={{ flex: 1 }} />}
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
              style={{ marginBottom: '16px' }}
            />
          )}
        </div>

        <div style={{ display: 'flex', gap: '8px', flexShrink: 0, marginBottom: '16px' }}>
          <Button
            type="primary"
            icon={isRunning ? <Spin size="small" /> : <SendOutlined />}
            onClick={async () => {
              await handleCrewKickoff();
            }}
            disabled={isRunning}
            style={{
              flex: 1,
            }}
          >
            {isRunning ? 'Workflow Running...' : 'Run Workflow'}
          </Button>
        </div>

        <div
          style={{
            flex: '1 1 auto',
            display: 'flex',
            flexDirection: 'column',
            background: '#fff',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
            overflow: 'hidden',
            minHeight: '200px',
            position: 'relative',
          }}
        >
          {crewOutput && (
            <>
              <div
                id="crew-output-content"
                className="prose prose-lg max-w-none"
                style={{
                  fontSize: '12px',
                  padding: '16px',
                  overflow: 'auto',
                  flex: 1,
                  fontFamily:
                    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                }}
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                  {crewOutput}
                </ReactMarkdown>
              </div>
              <Button
                type="text"
                icon={<DownloadOutlined />}
                onClick={handleDownloadPDF}
                style={{
                  position: 'absolute',
                  bottom: '16px',
                  right: '16px',
                  background: 'white',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: 'none',
                }}
              />
            </>
          )}
        </div>
      </Layout>
    </>
  );
};

export default WorkflowAppInputsView;
