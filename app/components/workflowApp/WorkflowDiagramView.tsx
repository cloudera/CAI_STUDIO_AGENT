import { Alert, Card, Layout, Tabs, Typography } from 'antd';
import { ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useLayoutEffect, useRef } from 'react';
import { AgentMetadata, CrewAITaskMetadata, ToolInstance } from '@/studio/proto/agent_studio';
import { WorkflowState } from '@/app/workflows/editorSlice';
import WorkflowDiagram from './WorkflowDiagram';
import { ApiOutlined, BugOutlined, MonitorOutlined } from '@ant-design/icons';
import OpsIFrame from '../OpsIFrame';
import ReactMarkdown from 'react-markdown';
import { useAppSelector } from '@/app/lib/hooks/hooks';
import { selectCurrentEventIndex } from '@/app/workflows/workflowAppSlice';

const { Text, Paragraph } = Typography;

export interface WorkflowDiagramViewProps {
  workflowState: WorkflowState;
  toolInstances?: ToolInstance[];
  agents?: AgentMetadata[];
  tasks?: CrewAITaskMetadata[];
  events?: any[];
  displayDiagnostics?: boolean;
}

const WorkflowDiagramView: React.FC<WorkflowDiagramViewProps> = ({
  workflowState,
  toolInstances,
  agents,
  tasks,
  events,
  displayDiagnostics,
}) => {
  const currentEventIndex = useAppSelector(selectCurrentEventIndex);

  const eventLogs = useRef<(HTMLDivElement | null)[]>([]); // Create refs array

  const scrollToEventLog = (index: number) => {
    if (eventLogs.current[index]) {
      eventLogs.current[index]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  useLayoutEffect(() => {
    if (currentEventIndex && eventLogs.current[currentEventIndex]) {
      scrollToEventLog(currentEventIndex);
    }
  }, [currentEventIndex]);

  if (!displayDiagnostics) {
    return (
      <ReactFlowProvider>
        <WorkflowDiagram
          workflowState={workflowState}
          toolInstances={toolInstances}
          agents={agents}
          tasks={tasks}
          events={events}
        />
      </ReactFlowProvider>
    );
  }

  return (
    <Layout
      style={{
        background: 'transparent',
        flexDirection: 'column',
        display: 'flex',
        height: '100%',
        width: '100%',
      }}
    >
      <Tabs
        defaultActiveKey="1"
        style={{
          width: '100%',
          padding: '4px',
          height: '100%',
        }}
        items={[
          {
            key: '1',
            label: (
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ApiOutlined
                  style={{
                    color: 'white',
                    background: '#1890ff',
                    borderRadius: '50%',
                    width: '24px',
                    height: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '4px',
                  }}
                />
                Flow Diagram
              </span>
            ),
            children: (
              <div
                style={{
                  height: '100%',
                  width: '100%',
                }}
              >
                <ReactFlowProvider>
                  <WorkflowDiagram
                    workflowState={workflowState}
                    toolInstances={toolInstances}
                    agents={agents}
                    tasks={tasks}
                    events={events?.slice(0, currentEventIndex && currentEventIndex + 1)}
                  />
                </ReactFlowProvider>
              </div>
            ),
          },
          {
            key: '2',
            label: (
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <BugOutlined
                  style={{
                    color: 'white',
                    background: '#1890ff',
                    borderRadius: '50%',
                    width: '24px',
                    height: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '4px',
                  }}
                />
                Logs
              </span>
            ),
            children: (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  overflow: 'auto',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {!events ? (
                  <Alert message="No events yet" type="info" showIcon />
                ) : events && events.length === 0 ? (
                  <Alert message="No events yet" type="info" showIcon />
                ) : (
                  <Layout
                    style={{
                      background: 'transparent',
                      flex: 1,
                      overflowY: 'auto',
                      overflowX: 'hidden',
                      gap: 16,
                      padding: 4,
                    }}
                  >
                    {events &&
                      events.map((event, index) => (
                        <Card
                          key={index}
                          ref={(el) => {
                            eventLogs.current[index] = el;
                          }}
                          title={event.type}
                          style={{
                            margin: 8,
                            backgroundColor:
                              event.type === 'crew_kickoff_completed'
                                ? '#a2f5bf'
                                : index === currentEventIndex
                                  ? '#8fe6ff'
                                  : 'white',
                            fontSize: '9px',
                            maxWidth: '100%',
                            overflow: 'hidden',
                            flexShrink: 0,
                            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.4)',
                          }}
                          headStyle={{ fontSize: '14px' }}
                          bodyStyle={{ fontSize: '9px', padding: '12px', overflow: 'auto' }}
                        >
                          {event.type === 'crew_kickoff_completed' ? (
                            <ReactMarkdown>{event.output}</ReactMarkdown>
                          ) : (
                            <pre
                              style={{
                                fontSize: '9px',
                                margin: 0,
                                overflow: 'auto',
                                maxWidth: '100%',
                              }}
                            >
                              {JSON.stringify(event, null, 2)}
                            </pre>
                          )}
                        </Card>
                      ))}
                  </Layout>
                )}
              </div>
            ),
          },
        ]}
      />
    </Layout>
  );
};

export default WorkflowDiagramView;
