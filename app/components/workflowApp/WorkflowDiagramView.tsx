import React, { useLayoutEffect, useRef, useState } from 'react';
import { Alert, Card, Layout, Tabs, Tooltip, Checkbox } from 'antd';
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
import { ApiOutlined, BugOutlined, ExportOutlined, EyeOutlined } from '@ant-design/icons';
import OpsIFrame from '../OpsIFrame';
import ReactMarkdown from 'react-markdown';
import { useAppSelector } from '@/app/lib/hooks/hooks';
import { selectCurrentEventIndex } from '@/app/workflows/workflowAppSlice';
import { useGetOpsDataQuery } from '@/app/ops/opsApi';

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
    <Layout className="bg-transparent flex flex-col h-full w-full">
      <Tabs
        defaultActiveKey="1"
        className="w-full p-1 h-full"
        items={[
          {
            key: '1',
            label: (
              <span className="flex items-center gap-2">
                <ApiOutlined className="text-white bg-blue-500 rounded-full w-6 h-6 flex items-center justify-center p-1" />
                Flow Diagram
              </span>
            ),
            children: (
              <div className="h-full w-full">
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
              <span className="flex items-center gap-2">
                <BugOutlined className="text-white bg-blue-500 rounded-full w-6 h-6 flex items-center justify-center p-1" />
                Logs
              </span>
            ),
            children: (
              <div className="w-full h-full overflow-auto p-4 flex flex-col">
                {/* Filter checkboxes */}
                <div className="flex gap-3 mb-2 items-center flex-wrap">
                  <span className="text-xs text-gray-500">Filter:</span>
                  <Checkbox
                    checked={eventTypeFilters.includes('error')}
                    onChange={(e) => {
                      setEventTypeFilters((f) =>
                        e.target.checked ? [...f, 'error'] : f.filter((x) => x !== 'error'),
                      );
                    }}
                    className="text-xs p-0"
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
                    className="text-xs p-0"
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
                    className="text-xs p-0"
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
                    className="text-xs p-0"
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
                    className="text-xs p-0"
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
                    className="text-xs p-0"
                  >
                    Tool
                  </Checkbox>
                </div>
                {!filteredEvents || filteredEvents.length === 0 ? (
                  <Alert message="No events yet" type="info" showIcon />
                ) : (
                  <Layout className="bg-transparent flex-1 overflow-y-auto overflow-x-hidden gap-4 p-1">
                    {filteredEvents.map((event, index) => {
                      const isError = /error|fail/i.test(event.type);
                      return (
                        <Card
                          key={index}
                          ref={(el) => {
                            eventLogs.current[index] = el;
                          }}
                          title={event.type}
                          className={`m-2 text-xs max-w-full overflow-hidden flex-shrink-0 shadow-md ${isError ? 'bg-red-100' : event.type === 'crew_kickoff_completed' ? 'bg-green-200' : index === currentEventIndex ? 'bg-blue-200' : 'bg-white'}`}
                          classNames={{
                            header: 'text-sm',
                            body: 'text-[9px] p-3 overflow-auto',
                          }}
                        >
                          {event.type === 'crew_kickoff_completed' ? (
                            <ReactMarkdown>{event.output}</ReactMarkdown>
                          ) : (
                            <pre className="text-xs m-0 overflow-auto max-w-full">
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
              <span className="flex items-center gap-2">
                <EyeOutlined className="text-white bg-blue-500 rounded-full w-6 h-6 flex items-center justify-center p-1" />
                Monitoring
                <Tooltip title="Open the Agent Ops & Metrics application in a new tab">
                  <ExportOutlined
                    className="flex items-center justify-center p-1"
                    onClick={() => window.open(opsData?.ops_display_url)}
                  />
                </Tooltip>
              </span>
            ),
            children: (
              <div className="w-full h-full overflow-auto p-4 flex flex-col">
                {!events ? (
                  <Alert message="No telemetry yet" type="info" showIcon />
                ) : events && events.length === 0 ? (
                  <Alert message="No telemetry yet" type="info" showIcon />
                ) : (
                  <Layout className="bg-transparent flex-1 overflow-y-auto overflow-x-hidden gap-4 p-1">
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
