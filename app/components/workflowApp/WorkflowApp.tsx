'use client';

import React, { useEffect, useRef, useState } from 'react';
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
  selectWorkflowSessionId,
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
import { selectWorkflowAppSessionFiles } from '@/app/workflows/workflowAppSlice';
import { useGetWorkflowDataQuery } from '@/app/workflows/workflowAppApi';
import {
  updatedWorkflowSessionDirectory,
  updatedWorkflowSessionId,
} from '@/app/workflows/editorSlice';
import { createSessionForWorkflow } from '@/app/lib/session';

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

const WorkflowApp: React.FC<WorkflowAppProps> = ({
  workflow,
  refetchWorkflow,
  agents,
  toolInstances,
  mcpInstances,
  tasks,
  renderMode,
}) => {
  const isRunning = useAppSelector(selectWorkflowIsRunning);
  const currentTraceId = useAppSelector(selectWorkflowCurrentTraceId);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const workflowPollingRef = useRef<NodeJS.Timeout | null>(null);
  const dispatch = useAppDispatch();
  const currentEvents = useAppSelector(selectCurrentEvents);
  const workflowState = useAppSelector(selectEditorWorkflow);
  const sessionId = useAppSelector(selectWorkflowSessionId);
  const sessionDirectory = useAppSelector((state: any) => state.editor.sessionDirectory);
  const sessionFiles = useAppSelector(selectWorkflowAppSessionFiles);
  const { data: workflowData } = useGetWorkflowDataQuery();

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
  const [activeTab, setActiveTab] = useState<string>('1');
  const [updateWorkflow] = useUpdateWorkflowMutation();
  const workflowDescription = useAppSelector(selectEditorWorkflowDescription);
  const [testModel] = useTestModelMutation();

  // Resizable splitter state for left/right panes when monitoring is visible
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [leftWidthPct, setLeftWidthPct] = useState<number>(40);
  const isDraggingRef = useRef<boolean>(false);

  const onSplitterDragStart = (e: React.MouseEvent<HTMLDivElement>) => {
    isDraggingRef.current = true;
    e.preventDefault();
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const relativeX = e.clientX - rect.left;
      const pct = Math.max(20, Math.min(80, (relativeX / rect.width) * 100));
      setLeftWidthPct(pct);
    };
    const handleMouseUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
      }
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // Thoughts box state
  interface ThoughtEntry {
    id: string;
    timestamp?: string;
    type: 'thought' | 'tool' | 'coworker';
    thought?: string;
    name?: string;
    status?: 'in_progress' | 'completed' | 'error';
    indentationLevel: number;
    toolRunKey?: string;
  }
  type FileInfo = { name: string; path: string; size: number; lastModified: string | null };
  const [thoughtEntries, setThoughtEntries] = useState<ThoughtEntry[]>([]); // non-conversational view
  const [areThoughtsCollapsed, setAreThoughtsCollapsed] = useState<boolean>(false);
  const [thoughtSessions, setThoughtSessions] = useState<
    { id: string; entries: ThoughtEntry[]; collapsed: boolean; artifacts: FileInfo[] }[]
  >([]); // conversational per-turn boxes
  const processedThoughtEventIdsRef = useRef<Set<string>>(new Set());
  const processedEventIdsRef = useRef<Set<string>>(new Set());
  const artifactsBaselineRef = useRef<Map<string, Set<string>>>(new Map());
  const artifactsSeenRef = useRef<Map<string, Set<string>>>(new Map());
  const thoughtSessionsRef = useRef<typeof thoughtSessions>(thoughtSessions);
  // Coworker nesting and tool run tracking across event polling cycles
  const coworkerStackRef = useRef<string[]>([]);
  const toolRunKeyToEntryIdsRef = useRef<Map<string, string[]>>(new Map());

  // keep a live ref of sessions to avoid stale closures inside polling effect
  useEffect(() => {
    thoughtSessionsRef.current = thoughtSessions;
  }, [thoughtSessions]);

  const loadArtifactsFromStorage = (sessionId: string): FileInfo[] => {
    try {
      const raw = localStorage.getItem(`thought_artifacts_${sessionId}`);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as FileInfo[];
      return [];
    } catch {
      return [];
    }
  };

  const saveArtifactsToStorage = (sessionId: string, artifacts: FileInfo[]) => {
    try {
      localStorage.setItem(`thought_artifacts_${sessionId}`, JSON.stringify(artifacts));
    } catch {}
  };

  const handleToggleThoughtSession = (id: string, next: boolean) => {
    setThoughtSessions((prev) => prev.map((s) => (s.id === id ? { ...s, collapsed: next } : s)));
  };

  // Track processed exception IDs
  const processedExceptionsRef = useRef<Set<string>>(new Set());
  const allEventsRef = useRef<any[]>([]);

  // Add effect to update showMonitoring when renderMode changes
  useEffect(() => {
    setShowMonitoring(renderMode === 'studio');
  }, [renderMode]);

  // Ensure session exists on load
  useEffect(() => {
    const initSession = async () => {
      try {
        if (!sessionId || !sessionDirectory) {
          const data = await createSessionForWorkflow({ renderMode, workflow, workflowData });
          dispatch(updatedWorkflowSessionId(data.session_id));
          dispatch(updatedWorkflowSessionDirectory(data.session_directory));
        }
      } catch (e) {
        console.error('Failed to initialize session', e);
      }
    };
    void initSession();
  }, [workflow?.workflow_id, renderMode]);

  const handleSliderChange = (value: number) => {
    setSliderValue(value);
    dispatch(updatedCurrentEventIndex(value));
  };

  const handleOpenArtifacts = () => {
    setShowMonitoring(true);
    setActiveTab('4'); // Switch to artifacts tab
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
    if (!workflow) return;

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
    const parseThoughtFromResponse = (
      raw: string,
    ): { thought?: string } => {
      try {
        const text = String(raw || '');

        // Strict: only capture content explicitly between Thought: and Action:/Final Answer:
        const thoughtMatch = text.match(
          /Thought:\s*([\s\S]*?)(?:\n\s*Action:|\n\s*Final Answer:|$)/i,
        );
        const thought = thoughtMatch ? thoughtMatch[1].trim() : undefined;

        return { thought };
      } catch {
        return {};
      }
    };

    // Helpers for tool and coworker tracking
    const parseToolArgs = (args: any): any => {
      if (!args) return {};
      try {
        if (typeof args === 'string') return JSON.parse(args);
        if (typeof args === 'object') return args;
      } catch {}
      return {};
    };

    const stableStringify = (obj: any): string => {
      const sortKeys = (o: any): any => {
        if (Array.isArray(o)) return o.map(sortKeys);
        if (o && typeof o === 'object') {
          return Object.keys(o)
            .sort()
            .reduce((acc: any, k: string) => {
              acc[k] = sortKeys(o[k]);
              return acc;
            }, {});
        }
        return o;
      };
      try {
        return JSON.stringify(sortKeys(obj));
      } catch {
        return String(obj ?? '');
      }
    };

    const getToolRunKey = (e: any): string => {
      const name = String(e?.tool_name || '');
      const argsObj = parseToolArgs(e?.tool_args);
      return `${name}|${stableStringify(argsObj)}`;
    };

    const isCoworkerTool = (name?: string) => /coworker/i.test(String(name || ''));
    const getActiveSessionId = () =>
      workflow?.is_conversational && thoughtSessionsRef.current.length > 0
        ? thoughtSessionsRef.current[thoughtSessionsRef.current.length - 1]?.id
        : null;
    const addEntry = (entry: ThoughtEntry) => {
      if (workflow?.is_conversational) {
        const activeSessionId = getActiveSessionId();
        if (!activeSessionId) return;
        setThoughtSessions((prev) => {
          if (prev.length === 0) return prev;
          const next = [...prev];
          const lastIdx = next.length - 1;
          const last = { ...next[lastIdx] };
          last.entries = [...last.entries, entry];
          next[lastIdx] = last;
          return next;
        });
      } else {
        setThoughtEntries((prev) => [...prev, entry]);
      }
    };
    const updateEntryToolStatus = (
      entryId: string,
      status: 'in_progress' | 'completed' | 'error',
    ) => {
      if (workflow?.is_conversational) {
        setThoughtSessions((prev) => {
          if (prev.length === 0) return prev;
          const next = [...prev];
          const lastIdx = next.length - 1;
          const last = { ...next[lastIdx] };
          last.entries = last.entries.map((en) => (en.id === entryId ? { ...en, status } : en));
          next[lastIdx] = last;
          return next;
        });
      } else {
        setThoughtEntries((prev) => prev.map((en) => (en.id === entryId ? { ...en, status } : en)));
      }
    };

    const fetchEvents = async () => {
      try {
        const { events: newEvents } = await getEvents({
          traceId: currentTraceId,
        }).unwrap();
        dispatch(addedCurrentEvents(newEvents));

        if (newEvents && newEvents.length > 0) {
          allEventsRef.current = [...allEventsRef.current, ...newEvents];

          // Extract thoughts from completed LLM calls (strict Thought: ... until Action:/Final Answer:)
          newEvents
            .filter((e: any) => e?.type === 'llm_call_completed')
            .forEach((e: any) => {
              const key =
                e.id ||
                `${e.timestamp || ''}-${e.type}-${e.agent_studio_id || ''}-${(e.response || '').length}`;
              if (processedThoughtEventIdsRef.current.has(key)) return;
              processedThoughtEventIdsRef.current.add(key);
              const { thought } = parseThoughtFromResponse(e.response || '');
              if (!thought || thought.length === 0) return;
              const indentationLevel = Math.max(0, coworkerStackRef.current.length);
              const entry: ThoughtEntry = {
                id: key,
                timestamp: e.timestamp,
                type: 'thought',
                thought,
                indentationLevel,
              };
              addEntry(entry);
            });

          // Handle tool and coworker usage events using started/finished/error; dedupe by event id/timestamp+key
          newEvents
            .filter(
              (e: any) =>
                e?.type === 'tool_usage_started' ||
                e?.type === 'tool_usage_finished' ||
                e?.type === 'tool_usage_error',
            )
            .forEach((e: any) => {
              const eventKey = e.id || `${e.timestamp || ''}-${e.type}-${e.tool_name || ''}-${getToolRunKey(e)}`;
              if (processedEventIdsRef.current.has(eventKey)) return;
              processedEventIdsRef.current.add(eventKey);
              const name = String(e.tool_name || '');
              const isCoworker = isCoworkerTool(name);
              const args = parseToolArgs(e.tool_args);
              const toolKey = getToolRunKey(e);
              if (e.type === 'tool_usage_started') {
                if (isCoworker) {
                  // Push coworker context
                  const coworkerName = String(args.coworker || args.Coworker || 'Coworker');
                  coworkerStackRef.current.push(coworkerName);
                  // Add coworker entry with spinner; indentation reflects pre-push depth
                  const indentationLevel = Math.max(0, coworkerStackRef.current.length - 1);
                  const entryId = `${e.timestamp}-coworker-${toolKey}`;
                  addEntry({
                    id: entryId,
                    timestamp: e.timestamp,
                    type: 'coworker',
                    name: coworkerName,
                    status: 'in_progress',
                    indentationLevel,
                    toolRunKey: toolKey,
                  });
                  const ids = toolRunKeyToEntryIdsRef.current.get(toolKey) || [];
                  ids.push(entryId);
                  toolRunKeyToEntryIdsRef.current.set(toolKey, ids);
                } else {
                  // Tool entry with spinner, nested if under coworker context
                  const entryId = `${e.timestamp}-tool-${toolKey}`;
                  const indentationLevel = Math.max(0, coworkerStackRef.current.length);
                  addEntry({
                    id: entryId,
                    timestamp: e.timestamp,
                    type: 'tool',
                    name,
                    status: 'in_progress',
                    indentationLevel,
                    toolRunKey: toolKey,
                  });
                  const ids = toolRunKeyToEntryIdsRef.current.get(toolKey) || [];
                  ids.push(entryId);
                  toolRunKeyToEntryIdsRef.current.set(toolKey, ids);
                }
              } else if (e.type === 'tool_usage_finished') {
                if (isCoworker) {
                  // Pop coworker context
                  coworkerStackRef.current.pop();
                  // Mark the latest matching coworker entry as completed
                  const ids = toolRunKeyToEntryIdsRef.current.get(toolKey) || [];
                  const lastId = ids.pop();
                  if (lastId) updateEntryToolStatus(lastId, 'completed');
                  toolRunKeyToEntryIdsRef.current.set(toolKey, ids);
                } else {
                  // Mark latest matching tool entry as completed
                  const ids = toolRunKeyToEntryIdsRef.current.get(toolKey) || [];
                  const lastId = ids.pop();
                  if (lastId) updateEntryToolStatus(lastId, 'completed');
                  toolRunKeyToEntryIdsRef.current.set(toolKey, ids);
                }
              } else if (e.type === 'tool_usage_error') {
                if (isCoworker) {
                  // Pop coworker context on error as well
                  coworkerStackRef.current.pop();
                  // Mark latest coworker entry as error
                  const ids = toolRunKeyToEntryIdsRef.current.get(toolKey) || [];
                  const lastId = ids.pop();
                  if (lastId) updateEntryToolStatus(lastId, 'error');
                  toolRunKeyToEntryIdsRef.current.set(toolKey, ids);
                } else {
                  // Mark latest matching tool entry as error
                  const ids = toolRunKeyToEntryIdsRef.current.get(toolKey) || [];
                  const lastId = ids.pop();
                  if (lastId) updateEntryToolStatus(lastId, 'error');
                  toolRunKeyToEntryIdsRef.current.set(toolKey, ids);
                }
              }
            });

          // Update artifacts for active conversational session
          if (workflow?.is_conversational && thoughtSessionsRef.current.length > 0) {
            const activeSessionId =
              thoughtSessionsRef.current[thoughtSessionsRef.current.length - 1]?.id;
            if (activeSessionId && sessionDirectory) {
              try {
                // Ensure we have baseline before computing deltas to avoid pulling all files
                if (!artifactsBaselineRef.current.has(activeSessionId)) {
                  // Skip this cycle; baseline will arrive shortly
                  return;
                }
                const resp = await fetch(
                  `/api/file/listDirectory?directoryPath=${encodeURIComponent(sessionDirectory)}`,
                );
                const data = await resp.json();
                if (resp.ok && Array.isArray(data.files)) {
                  const baseline =
                    artifactsBaselineRef.current.get(activeSessionId) || new Set<string>();
                  const seen = artifactsSeenRef.current.get(activeSessionId) || new Set<string>();
                  const incoming: FileInfo[] = data.files.filter(
                    (f: FileInfo) => f && f.name && typeof f.name === 'string',
                  );
                  const delta: FileInfo[] = [];
                  for (const f of incoming) {
                    const key = (f.path || f.name) as string;
                    if (!baseline.has(key) && !seen.has(key)) {
                      seen.add(key);
                      delta.push(f);
                    }
                  }
                  if (delta.length > 0) {
                    artifactsSeenRef.current.set(activeSessionId, seen);
                    setThoughtSessions((prev) => {
                      const next = [...prev];
                      const lastIdx = next.length - 1;
                      const last = { ...next[lastIdx] };
                      last.artifacts = [...(last.artifacts || []), ...delta];
                      next[lastIdx] = last;
                      // Persist to storage
                      saveArtifactsToStorage(activeSessionId, last.artifacts);
                      return next;
                    });
                  }
                }
              } catch {}
            }
          }

          // Check for successful completion as before
          const crewCompleteEvent = newEvents.find(
            (event) =>
              event.type === 'crew_kickoff_completed' || event.type === 'crew_kickoff_failed',
          );
          if (crewCompleteEvent) {
            stopPolling();
            dispatch(updatedCrewOutput(crewCompleteEvent.output || crewCompleteEvent.error));
            dispatch(updatedIsRunning(false));
            dispatch(addedCurrentEvents(newEvents));

            // Collapse thoughts box(es) at end of run
            setAreThoughtsCollapsed(true);
            setThoughtSessions((prev) => prev.map((s) => ({ ...s, collapsed: true })));

            if (workflow?.is_conversational) {
              dispatch(
                addedChatMessage({
                  id: crewCompleteEvent.id,
                  role: 'assistant',
                  content: crewCompleteEvent.output || crewCompleteEvent.error,
                  events: allEventsRef.current,
                  attachments: sessionFiles && sessionFiles.length > 0 ? sessionFiles : undefined,
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
      // Reset thoughts for new run and expand
      setThoughtEntries([]);
      processedThoughtEventIdsRef.current.clear();
      processedEventIdsRef.current.clear();
      coworkerStackRef.current = [];
      toolRunKeyToEntryIdsRef.current = new Map();
      setAreThoughtsCollapsed(false);
      if (workflow?.is_conversational) {
        const sessionKey = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        // Capture baseline of files at start for delta calculation
        if (sessionDirectory) {
          fetch(`/api/file/listDirectory?directoryPath=${encodeURIComponent(sessionDirectory)}`)
            .then((r) => r.json())
            .then((data) => {
              const baseline = new Set<string>(
                Array.isArray(data?.files) ? data.files.map((f: FileInfo) => f.path || f.name) : [],
              );
              artifactsBaselineRef.current.set(sessionKey, baseline);
              artifactsSeenRef.current.set(sessionKey, new Set<string>());
            })
            .catch(() => {
              artifactsBaselineRef.current.set(sessionKey, new Set());
              artifactsSeenRef.current.set(sessionKey, new Set<string>());
            });
        } else {
          artifactsBaselineRef.current.set(sessionKey, new Set());
          artifactsSeenRef.current.set(sessionKey, new Set<string>());
        }
        setThoughtSessions((prev) => [
          ...prev.map((s) => ({ ...s, collapsed: true })),
          {
            id: sessionKey,
            entries: [],
            collapsed: false,
            artifacts: loadArtifactsFromStorage(sessionKey) || [],
          },
        ]);
      }
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
  const hasValidTools = React.useMemo(() => {
    // Always return true if in workflow mode
    if (renderMode === 'workflow') return true;

    // Otherwise do the normal validation
    if (!workflow) return true;
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
    if (!agents || !toolInstances || !workflowId) return [];

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
      <Layout ref={containerRef} className="flex-1 flex flex-row bg-white rounded relative" style={{ overflowX: 'hidden' }}>
        {/* Left side - Workflow Inputs */}
        <Layout
          className={`bg-transparent flex-col flex-shrink-0 h-full transition-all duration-300 ease-in-out p-4`}
          style={{ width: showMonitoring ? `${leftWidthPct}%` : '100%', overflowX: 'hidden' }}
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
          ) : !sessionId || !sessionDirectory ? (
            renderAlert(
              'Initializing session',
              'Preparing a session for this workflow. Please wait a moment...',
              'loading',
            )
          ) : workflow.is_conversational ? (
            <WorkflowAppChatView
              workflow={workflow}
              tasks={tasks}
              onOpenArtifacts={handleOpenArtifacts}
              thoughts={thoughtEntries}
              thoughtsCollapsed={areThoughtsCollapsed}
              onToggleThoughts={setAreThoughtsCollapsed}
              thoughtSessions={thoughtSessions}
              onToggleThoughtSession={handleToggleThoughtSession}
            />
          ) : (
            <WorkflowAppInputsView
              workflow={workflow}
              tasks={tasks}
              onOpenArtifacts={handleOpenArtifacts}
              thoughts={thoughtEntries}
              thoughtsCollapsed={areThoughtsCollapsed}
              onToggleThoughts={setAreThoughtsCollapsed}
            />
          )}
        </Layout>

        {showMonitoring && (
          <div
            onMouseDown={onSplitterDragStart}
            style={{
              width: 6,
              cursor: 'col-resize',
              alignSelf: 'stretch',
              position: 'relative',
              zIndex: 5,
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: 2,
                width: 2,
                background: '#e5e7eb',
              }}
            />
          </div>
        )}

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
          <Layout className="bg-transparent flex-col flex-shrink-0 h-full m-0 pl-3 pr-3 relative" style={{ width: `${100 - leftWidthPct}%`, overflowX: 'hidden' }}>
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
              workflow={workflow}
              sessionId={sessionId}
              activeTab={activeTab}
              onTabChange={setActiveTab}
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
