/**
 * @jest-environment jsdom
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import WorkflowApp from './WorkflowApp';
import {
  Workflow,
  AgentMetadata,
  ToolInstance,
  McpInstance,
  CrewAITaskMetadata,
} from '@/studio/proto/agent_studio';

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock all required hooks and methods
const mockDispatch = jest.fn();
const mockTestModel = jest.fn().mockReturnValue({
  unwrap: jest.fn().mockResolvedValue('This is a test generated description.'),
});

// Mock Redux hooks
jest.mock('@/app/lib/hooks/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: any) => {
    // Return different values based on the selector function
    if (selector.name === 'selectWorkflowIsRunning') {
      return false;
    }
    if (selector.name === 'selectWorkflowCurrentTraceId') {
      return 'trace-123';
    }
    if (selector.name === 'selectCurrentEvents') {
      return [];
    }
    if (selector.name === 'selectCurrentEventIndex') {
      return 0;
    }
    if (selector.name === 'selectEditorWorkflow') {
      return { nodes: [], edges: [] };
    }
    if (selector.name === 'selectEditorWorkflowDescription') {
      return 'Test description';
    }
    if (selector.name === 'selectWorkflowConfiguration') {
      return {};
    }
    return undefined;
  },
}));

// Mock API hooks
jest.mock('@/app/models/modelsApi', () => ({
  useGetDefaultModelQuery: () => ({
    data: { model_id: 'model-1', name: 'Default Model' },
    isLoading: false,
    isError: false,
  }),
  useTestModelMutation: () => [mockTestModel],
}));

jest.mock('@/app/ops/opsApi', () => ({
  useGetEventsMutation: () => [
    jest.fn().mockReturnValue({
      unwrap: jest.fn().mockResolvedValue({ events: [] }),
    }),
  ],
  useGetOpsDataQuery: () => ({
    data: null,
    isLoading: false,
    isError: false,
  }),
}));

jest.mock('@/app/workflows/workflowsApi', () => ({
  useUpdateWorkflowMutation: () => [
    jest.fn().mockReturnValue({
      unwrap: jest.fn().mockResolvedValue({}),
    }),
  ],
  useTestWorkflowMutation: () => [
    jest.fn().mockReturnValue({
      unwrap: jest.fn().mockResolvedValue({}),
    }),
  ],
}));

// Mock the imported components
jest.mock('./WorkflowAppInputsView', () => {
  return {
    __esModule: true,
    default: () => <div data-testid="workflow-inputs-view">Inputs View Mock</div>,
  };
});

jest.mock('./WorkflowAppChatView', () => {
  return {
    __esModule: true,
    default: () => <div data-testid="workflow-chat-view">Chat View Mock</div>,
  };
});

jest.mock('./WorkflowDiagramView', () => {
  return {
    __esModule: true,
    default: () => <div data-testid="workflow-diagram-view">Diagram View Mock</div>,
  };
});

// Mock Notifications hook
const mockSuccess = jest.fn();
const mockError = jest.fn();
jest.mock('../Notifications', () => ({
  useGlobalNotification: () => ({
    success: mockSuccess,
    error: mockError,
  }),
}));

// Mock the alert utils
jest.mock('@/app/lib/alertUtils', () => ({
  renderAlert: (title: string, message: string, type: string) => (
    <div data-testid="alert" data-type={type}>
      {title}: {message}
    </div>
  ),
}));

// Mock the validation function
jest.mock('@/app/components/workflowEditor/WorkflowEditorConfigureInputs', () => ({
  hasValidToolConfiguration: jest.fn().mockReturnValue(true),
}));

// Mock constants
jest.mock('@/app/lib/constants', () => ({
  TOOL_PARAMS_ALERT: {
    message: 'Tool params error',
    description: 'Some tools have invalid parameters',
  },
}));

describe('WorkflowApp', () => {
  // Sample props data for testing
  const mockWorkflow: Partial<Workflow> = {
    workflow_id: 'workflow-1',
    name: 'Test Workflow',
    description: 'This is a test workflow',
    is_ready: true,
    is_conversational: false,
    crew_ai_workflow_metadata: {
      agent_id: ['agent-1'],
      task_id: ['task-1'],
      process: 'democratic',
      manager_agent_id: 'agent-1',
    },
  };

  const mockAgents: Partial<AgentMetadata>[] = [
    {
      id: 'agent-1',
      name: 'Test Agent',
      workflow_id: 'workflow-1',
      tools_id: ['tool-1'],
      crew_ai_agent_metadata: {
        role: 'Test Role',
        goal: 'Test Goal',
        backstory: 'Test Backstory',
        allow_delegation: true,
        verbose: false,
        cache: false,
        temperature: 0.7,
        max_iter: 10,
      },
    },
  ];

  const mockTools: Partial<ToolInstance>[] = [
    {
      id: 'tool-1',
      name: 'Test Tool',
      is_valid: true,
    },
  ];

  const mockMcpInstances: Partial<McpInstance>[] = [
    {
      id: 'mcp-1',
      name: 'Test MCP',
    },
  ];

  const mockTasks: Partial<CrewAITaskMetadata>[] = [
    {
      task_id: 'task-1',
      description: 'Test Task',
      assigned_agent_id: 'agent-1',
    },
  ];

  // Cleanup after each test
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders the WorkflowApp component in studio mode', () => {
    render(
      <WorkflowApp
        workflow={mockWorkflow as Workflow}
        refetchWorkflow={() => {}}
        agents={mockAgents as AgentMetadata[]}
        toolInstances={mockTools as ToolInstance[]}
        mcpInstances={mockMcpInstances as McpInstance[]}
        tasks={mockTasks as CrewAITaskMetadata[]}
        renderMode="studio"
      />,
    );

    // Check if the component renders key elements
    expect(screen.getByText('Capability Guide')).toBeInTheDocument();
    expect(screen.getByText('Playback')).toBeInTheDocument();
    expect(screen.getByTestId('workflow-diagram-view')).toBeInTheDocument();
    expect(screen.getByTestId('workflow-inputs-view')).toBeInTheDocument();
  });

  it('renders the WorkflowApp component in workflow mode', () => {
    render(
      <WorkflowApp
        workflow={mockWorkflow as Workflow}
        refetchWorkflow={() => {}}
        agents={mockAgents as AgentMetadata[]}
        toolInstances={mockTools as ToolInstance[]}
        mcpInstances={mockMcpInstances as McpInstance[]}
        tasks={mockTasks as CrewAITaskMetadata[]}
        renderMode="workflow"
      />,
    );

    // Check that monitoring is not shown in workflow mode
    expect(screen.queryByText('Playback')).not.toBeInTheDocument();
    expect(screen.queryByTestId('workflow-diagram-view')).not.toBeInTheDocument();
  });

  it('toggles monitoring visibility when clicking the show/hide buttons', () => {
    render(
      <WorkflowApp
        workflow={mockWorkflow as Workflow}
        refetchWorkflow={() => {}}
        agents={mockAgents as AgentMetadata[]}
        toolInstances={mockTools as ToolInstance[]}
        mcpInstances={mockMcpInstances as McpInstance[]}
        tasks={mockTasks as CrewAITaskMetadata[]}
        renderMode="workflow"
      />,
    );

    // Initially monitoring should be hidden in workflow mode
    expect(screen.queryByTestId('workflow-diagram-view')).not.toBeInTheDocument();

    // Click the show monitoring button (use the button with dashboard icon)
    const showButton = screen.getByRole('button', {
      name: /dashboard/i, // The button has a dashboard icon
    });
    fireEvent.click(showButton);

    // Monitoring should now be visible
    expect(screen.getByTestId('workflow-diagram-view')).toBeInTheDocument();

    // Click the hide monitoring button (use the button with close icon)
    const hideButton = screen.getByRole('button', {
      name: /close/i, // The button has a close icon
    });
    fireEvent.click(hideButton);

    // Monitoring should be hidden again
    expect(screen.queryByTestId('workflow-diagram-view')).not.toBeInTheDocument();
  });

  it('shows the ChatView for conversational workflows', () => {
    const conversationalWorkflow = {
      ...mockWorkflow,
      is_conversational: true,
    };

    render(
      <WorkflowApp
        workflow={conversationalWorkflow as Workflow}
        refetchWorkflow={() => {}}
        agents={mockAgents as AgentMetadata[]}
        toolInstances={mockTools as ToolInstance[]}
        mcpInstances={mockMcpInstances as McpInstance[]}
        tasks={mockTasks as CrewAITaskMetadata[]}
        renderMode="workflow"
      />,
    );

    // Should show the chat view for conversational workflows
    expect(screen.getByTestId('workflow-chat-view')).toBeInTheDocument();
    expect(screen.queryByTestId('workflow-inputs-view')).not.toBeInTheDocument();
  });

  it('shows the InputsView for non-conversational workflows', () => {
    render(
      <WorkflowApp
        workflow={mockWorkflow as Workflow}
        refetchWorkflow={() => {}}
        agents={mockAgents as AgentMetadata[]}
        toolInstances={mockTools as ToolInstance[]}
        mcpInstances={mockMcpInstances as McpInstance[]}
        tasks={mockTasks as CrewAITaskMetadata[]}
        renderMode="workflow"
      />,
    );

    // Should show the inputs view for non-conversational workflows
    expect(screen.getByTestId('workflow-inputs-view')).toBeInTheDocument();
    expect(screen.queryByTestId('workflow-chat-view')).not.toBeInTheDocument();
  });

  it('shows loading spinner when workflow is undefined', () => {
    render(
      <WorkflowApp
        workflow={undefined as unknown as Workflow}
        refetchWorkflow={() => {}}
        agents={mockAgents as AgentMetadata[]}
        toolInstances={mockTools as ToolInstance[]}
        mcpInstances={mockMcpInstances as McpInstance[]}
        tasks={mockTasks as CrewAITaskMetadata[]}
        renderMode="studio"
      />,
    );

    // Check for the presence of the spin component by its class
    const spinElement = document.querySelector('.ant-spin');
    expect(spinElement).not.toBeNull();
  });

  it('shows an alert when workflow is not ready', () => {
    const notReadyWorkflow = {
      ...mockWorkflow,
      is_ready: false,
    };

    render(
      <WorkflowApp
        workflow={notReadyWorkflow as Workflow}
        refetchWorkflow={() => {}}
        agents={mockAgents as AgentMetadata[]}
        toolInstances={mockTools as ToolInstance[]}
        mcpInstances={mockMcpInstances as McpInstance[]}
        tasks={mockTasks as CrewAITaskMetadata[]}
        renderMode="studio"
      />,
    );

    // Should show the "Getting your workflow ready" alert
    const alert = screen.getByTestId('alert');
    expect(alert).toHaveTextContent('Getting your workflow ready');
    expect(alert).toHaveAttribute('data-type', 'loading');
  });

  it('shows an alert when workflow has no agents', () => {
    const noAgentsWorkflow = {
      ...mockWorkflow,
      crew_ai_workflow_metadata: {
        ...mockWorkflow.crew_ai_workflow_metadata,
        agent_id: [],
      },
    };

    render(
      <WorkflowApp
        workflow={noAgentsWorkflow as Workflow}
        refetchWorkflow={() => {}}
        agents={mockAgents as AgentMetadata[]}
        toolInstances={mockTools as ToolInstance[]}
        mcpInstances={mockMcpInstances as McpInstance[]}
        tasks={mockTasks as CrewAITaskMetadata[]}
        renderMode="studio"
      />,
    );

    // Should show the "No Agents Found" alert
    const alert = screen.getByTestId('alert');
    expect(alert).toHaveTextContent('No Agents Found');
    expect(alert).toHaveAttribute('data-type', 'warning');
  });

  it('updates description when changed in studio mode', async () => {
    const mockUpdateWorkflow = jest.fn().mockReturnValue({
      unwrap: jest.fn().mockResolvedValue({}),
    });

    jest.mock('@/app/workflows/workflowsApi', () => ({
      useUpdateWorkflowMutation: () => [mockUpdateWorkflow],
    }));

    render(
      <WorkflowApp
        workflow={mockWorkflow as Workflow}
        refetchWorkflow={() => {}}
        agents={mockAgents as AgentMetadata[]}
        toolInstances={mockTools as ToolInstance[]}
        mcpInstances={mockMcpInstances as McpInstance[]}
        tasks={mockTasks as CrewAITaskMetadata[]}
        renderMode="studio"
      />,
    );

    // Open the capability guide
    fireEvent.click(screen.getByText('Capability Guide'));

    // Find the description input and change it
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Updated description' } });

    // Dispatch should be called with the updated description
    expect(mockDispatch).toHaveBeenCalled();
  });

  it('generates a description using AI when the AI button is clicked', async () => {
    render(
      <WorkflowApp
        workflow={mockWorkflow as Workflow}
        refetchWorkflow={() => {}}
        agents={mockAgents as AgentMetadata[]}
        toolInstances={mockTools as ToolInstance[]}
        mcpInstances={mockMcpInstances as McpInstance[]}
        tasks={mockTasks as CrewAITaskMetadata[]}
        renderMode="studio"
      />,
    );

    // Open the capability guide
    fireEvent.click(screen.getByText('Capability Guide'));

    // Find and click the AI button
    const aiButton = screen.getByAltText('AI Assistant');
    fireEvent.click(aiButton.closest('button')!);

    // Check that the test model function was called
    await waitFor(() => {
      expect(mockTestModel).toHaveBeenCalled();
    });

    // The dispatch should be called to update the description
    expect(mockDispatch).toHaveBeenCalled();
  });

  it('handles slider change for event playback', () => {
    render(
      <WorkflowApp
        workflow={mockWorkflow as Workflow}
        refetchWorkflow={() => {}}
        agents={mockAgents as AgentMetadata[]}
        toolInstances={mockTools as ToolInstance[]}
        mcpInstances={mockMcpInstances as McpInstance[]}
        tasks={mockTasks as CrewAITaskMetadata[]}
        renderMode="studio"
      />,
    );

    // Find the slider and simulate click on it
    const slider = screen.getByRole('slider');
    // Mock clicks on the slider instead of direct value changes
    fireEvent.mouseDown(slider);
    fireEvent.mouseMove(slider);
    fireEvent.mouseUp(slider);

    // Dispatch should be called to update the current event index
    expect(mockDispatch).toHaveBeenCalled();
  });

  // Snapshot tests
  it('matches snapshot in studio mode', () => {
    const { container } = render(
      <WorkflowApp
        workflow={mockWorkflow as Workflow}
        refetchWorkflow={() => {}}
        agents={mockAgents as AgentMetadata[]}
        toolInstances={mockTools as ToolInstance[]}
        mcpInstances={mockMcpInstances as McpInstance[]}
        tasks={mockTasks as CrewAITaskMetadata[]}
        renderMode="studio"
      />,
    );

    expect(container).toMatchSnapshot();
  });

  it('matches snapshot in workflow mode', () => {
    const { container } = render(
      <WorkflowApp
        workflow={mockWorkflow as Workflow}
        refetchWorkflow={() => {}}
        agents={mockAgents as AgentMetadata[]}
        toolInstances={mockTools as ToolInstance[]}
        mcpInstances={mockMcpInstances as McpInstance[]}
        tasks={mockTasks as CrewAITaskMetadata[]}
        renderMode="workflow"
      />,
    );

    expect(container).toMatchSnapshot();
  });

  it('matches snapshot for conversational workflow', () => {
    const conversationalWorkflow = {
      ...mockWorkflow,
      is_conversational: true,
    };

    const { container } = render(
      <WorkflowApp
        workflow={conversationalWorkflow as Workflow}
        refetchWorkflow={() => {}}
        agents={mockAgents as AgentMetadata[]}
        toolInstances={mockTools as ToolInstance[]}
        mcpInstances={mockMcpInstances as McpInstance[]}
        tasks={mockTasks as CrewAITaskMetadata[]}
        renderMode="workflow"
      />,
    );

    expect(container).toMatchSnapshot();
  });

  it('matches snapshot when workflow is not ready', () => {
    const notReadyWorkflow = {
      ...mockWorkflow,
      is_ready: false,
    };

    const { container } = render(
      <WorkflowApp
        workflow={notReadyWorkflow as Workflow}
        refetchWorkflow={() => {}}
        agents={mockAgents as AgentMetadata[]}
        toolInstances={mockTools as ToolInstance[]}
        mcpInstances={mockMcpInstances as McpInstance[]}
        tasks={mockTasks as CrewAITaskMetadata[]}
        renderMode="studio"
      />,
    );

    expect(container).toMatchSnapshot();
  });
});
