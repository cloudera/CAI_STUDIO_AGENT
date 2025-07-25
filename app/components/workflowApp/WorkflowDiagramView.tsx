import React, { useLayoutEffect, useRef, useState } from 'react';
import { Alert, Card, Layout, Tabs, Tooltip, Typography, Checkbox } from 'antd';
import { ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  AgentMetadata,
  CrewAITaskMetadata,
  McpInstance,
  ToolInstance,
} from '@/studio/proto/agent_studio';
import { WorkflowState } from '@/app/workflows/editorSlice';
import WorkflowDiagram from './WorkflowDiagram';
import {
  ApiOutlined,
  BugOutlined,
  ExportOutlined,
  EyeOutlined,
  MonitorOutlined,
} from '@ant-design/icons';
import OpsIFrame from '../OpsIFrame';
import ReactMarkdown from 'react-markdown';
import { useAppSelector } from '@/app/lib/hooks/hooks';
import { selectCurrentEventIndex } from '@/app/workflows/workflowAppSlice';
import { useGetOpsDataQuery } from '@/app/ops/opsApi';

const { Text, Paragraph } = Typography;

export interface WorkflowDiagramViewProps {
  workflowState: WorkflowState;
  toolInstances?: ToolInstance[];
  mcpInstances?: McpInstance[];
  agents?: AgentMetadata[];
  tasks?: CrewAITaskMetadata[];
  events?: any[];
  displayDiagnostics?: boolean;
  renderMode?: 'studio' | 'workflow';
}

const WorkflowDiagramView: React.FC<WorkflowDiagramViewProps> = ({
  workflowState,
  toolInstances,
  mcpInstances,
  agents,
  tasks,
  events,
  displayDiagnostics,
  renderMode = 'studio',
}) => {
  const currentEventIndex = useAppSelector(selectCurrentEventIndex);
  const { data: opsData } = useGetOpsDataQuery();

  const eventLogs = useRef<(HTMLDivElement | null)[]>([]); // Create refs array
  const [eventTypeFilters, setEventTypeFilters] = useState<string[]>([]);
  const [categoryFilters, setCategoryFilters] = useState<string[]>([]);

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

  // Filtering logic
  const filteredEvents = (events || []).filter((event) => {
    // Error filter only
    if (eventTypeFilters.includes('error')) {
      const isError = /error|fail/i.test(event.type);
      if (!isError) return false;
    }
    // Category filter
    if (categoryFilters.length > 0) {
      const type = event.type.toLowerCase();
      const matches = categoryFilters.some((cat) => {
        if (cat === 'workflow') return type.includes('crew');
        if (cat === 'task') return type.includes('task');
        if (cat === 'agent') return type.includes('agent');
        if (cat === 'llm') return type.includes('llm');
        if (cat === 'tool') return type.includes('tool');
        return false;
      });
      if (!matches) return false;
    }
    return true;
  });

  if (!displayDiagnostics) {
    return (
      <ReactFlowProvider>
        <WorkflowDiagram
          key={`diagram-${workflowState.workflowId || 'default'}`}
          workflowState={workflowState}
          toolInstances={toolInstances}
          mcpInstances={mcpInstances}
          agents={agents}
          tasks={tasks}
          events={events}
          renderMode={renderMode}
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
                    mcpInstances={mcpInstances}
                    agents={agents}
                    tasks={tasks}
                    events={events?.slice(0, currentEventIndex && currentEventIndex + 1)}
                    renderMode={renderMode}
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
                {/* Filter checkboxes */}
                <div
                  style={{
                    display: 'flex',
                    gap: 12,
                    marginBottom: 8,
                    alignItems: 'center',
                    flexWrap: 'wrap',
                  }}
                >
                  <span style={{ fontSize: 12, color: '#888' }}>Filter:</span>
                  <Checkbox
                    checked={eventTypeFilters.includes('error')}
                    onChange={(e) => {
                      setEventTypeFilters((f) =>
                        e.target.checked ? [...f, 'error'] : f.filter((x) => x !== 'error'),
                      );
                    }}
                    style={{ fontSize: 11, padding: 0 }}
                  >
                    Error
                  </Checkbox>
                  <Checkbox
                    checked={categoryFilters.includes('workflow')}
                    onChange={(e) => {
                      setCategoryFilters((f) =>
                        e.target.checked ? [...f, 'workflow'] : f.filter((x) => x !== 'workflow'),
                      );
                    }}
                    style={{ fontSize: 11, padding: 0 }}
                  >
                    Workflow
                  </Checkbox>
                  <Checkbox
                    checked={categoryFilters.includes('task')}
                    onChange={(e) => {
                      setCategoryFilters((f) =>
                        e.target.checked ? [...f, 'task'] : f.filter((x) => x !== 'task'),
                      );
                    }}
                    style={{ fontSize: 11, padding: 0 }}
                  >
                    Task
                  </Checkbox>
                  <Checkbox
                    checked={categoryFilters.includes('agent')}
                    onChange={(e) => {
                      setCategoryFilters((f) =>
                        e.target.checked ? [...f, 'agent'] : f.filter((x) => x !== 'agent'),
                      );
                    }}
                    style={{ fontSize: 11, padding: 0 }}
                  >
                    Agent
                  </Checkbox>
                  <Checkbox
                    checked={categoryFilters.includes('llm')}
                    onChange={(e) => {
                      setCategoryFilters((f) =>
                        e.target.checked ? [...f, 'llm'] : f.filter((x) => x !== 'llm'),
                      );
                    }}
                    style={{ fontSize: 11, padding: 0 }}
                  >
                    LLM
                  </Checkbox>
                  <Checkbox
                    checked={categoryFilters.includes('tool')}
                    onChange={(e) => {
                      setCategoryFilters((f) =>
                        e.target.checked ? [...f, 'tool'] : f.filter((x) => x !== 'tool'),
                      );
                    }}
                    style={{ fontSize: 11, padding: 0 }}
                  >
                    Tool
                  </Checkbox>
                </div>
                {!filteredEvents || filteredEvents.length === 0 ? (
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
                    {filteredEvents.map((event, index) => {
                      const isError = /error|fail/i.test(event.type);
                      return (
                        <Card
                          key={index}
                          ref={(el) => {
                            eventLogs.current[index] = el;
                          }}
                          title={event.type}
                          style={{
                            margin: 8,
                            backgroundColor: isError
                              ? '#ffeaea'
                              : event.type === 'crew_kickoff_completed'
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
                      );
                    })}
                  </Layout>
                )}
              </div>
            ),
          },
          {
            key: '3',
            label: (
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <EyeOutlined
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
                Monitoring
                <Tooltip title="Open the Agent Ops & Metrics application in a new tab">
                  <ExportOutlined
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '4px',
                    }}
                    onClick={() => window.open(opsData?.ops_display_url)}
                  />
                </Tooltip>
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
                  <Alert message="No telemetry yet" type="info" showIcon />
                ) : events && events.length === 0 ? (
                  <Alert message="No telemetry yet" type="info" showIcon />
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
                    <OpsIFrame />
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
