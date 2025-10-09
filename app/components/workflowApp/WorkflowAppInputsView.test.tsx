/**
 * @jest-environment jsdom
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import WorkflowAppInputsView from './WorkflowAppInputsView';
import { CrewAITaskMetadata, Workflow } from '@/studio/proto/agent_studio';

// Mock ReactMarkdown to avoid rendering issues - do this before other imports to prevent conflicts
jest.mock('react-markdown', () => ({
  __esModule: true,
  default: ({ children }: { children: string }) => <div data-testid="markdown">{children}</div>,
}));

// Mock console.error to avoid stack overflow
const originalConsoleError = console.error;
console.error = jest.fn();

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

// Mock Redux hooks
jest.mock('@/app/lib/hooks/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: any) => {
    // Return different values based on the selector function
    if (selector.name === 'selectWorkflowAppStandardInputs') {
      return { input1: 'test value 1', input2: 'test value 2' };
    }
    if (selector.name === 'selectWorkflowCrewOutput') {
      return 'Test workflow output with **markdown**';
    }
    if (selector.name === 'selectWorkflowIsRunning') {
      return false;
    }
    if (selector.name === 'selectCurrentEvents') {
      return [];
    }
    if (selector.name === 'selectWorkflowConfiguration') {
      return { toolConfigurations: {}, mcpInstanceConfigurations: {} };
    }
    if (selector.name === 'selectWorkflowGenerationConfig') {
      return {};
    }
    return undefined;
  },
}));

// Mock API hooks
jest.mock('@/app/workflows/workflowsApi', () => ({
  useTestWorkflowMutation: () => [
    jest.fn().mockReturnValue({
      unwrap: jest.fn().mockResolvedValue({ trace_id: 'test-trace-123' }),
    }),
  ],
}));

// Mock workflow data query
jest.mock('@/app/workflows/workflowAppApi', () => ({
  useGetEventsMutation: () => [
    jest.fn().mockReturnValue({
      unwrap: jest.fn().mockResolvedValue({ events: [] }),
    }),
  ],
  useKickoffMutation: () => [
    jest.fn().mockReturnValue({
      unwrap: jest.fn().mockResolvedValue({ trace_id: 'test-trace-123' }),
    }),
  ],
  useGetWorkflowDataQuery: () => ({
    data: { renderMode: 'studio', workflowModelUrl: 'http://test-url' },
    isLoading: false,
    isError: false,
  }),
}));

// Mock Notifications hook
jest.mock('../Notifications', () => ({
  useGlobalNotification: () => ({
    success: jest.fn(),
    error: jest.fn(),
  }),
}));

// Mock workflow library function
jest.mock('@/app/lib/workflow', () => ({
  getWorkflowInputs: jest.fn().mockImplementation(() => ['input1', 'input2']),
}));

// Mock html2pdf.js
jest.mock('html2pdf.js', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    from: jest.fn().mockReturnValue({
      set: jest.fn().mockReturnThis(),
      save: jest.fn().mockResolvedValue(undefined),
    }),
  })),
}));

// Mock showdown
jest.mock('showdown', () => ({
  Converter: jest.fn().mockImplementation(() => ({
    makeHtml: jest.fn().mockReturnValue('<p>Test HTML</p>'),
  })),
}));

describe('WorkflowAppInputsView', () => {
  // Sample props data for testing
  const mockWorkflow: Partial<Workflow> = {
    workflow_id: 'workflow-1',
    name: 'Test Workflow',
    description: 'This is a test workflow',
    is_ready: true,
    crew_ai_workflow_metadata: {
      agent_id: ['agent-1'],
      task_id: ['task-1'],
      process: 'democratic',
      manager_agent_id: 'agent-1',
    },
  };

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

  afterAll(() => {
    // Restore original console.error after all tests
    console.error = originalConsoleError;
  });

  it('renders the inputs view when workflow is provided', () => {
    render(
      <WorkflowAppInputsView
        workflow={mockWorkflow as Workflow}
        tasks={mockTasks as CrewAITaskMetadata[]}
      />,
    );

    // Check if component renders key elements
    expect(screen.getByText('Inputs')).toBeInTheDocument();
    expect(screen.getByText('input1')).toBeInTheDocument();
    expect(screen.getByText('input2')).toBeInTheDocument();
    expect(screen.getByText('Run Workflow')).toBeInTheDocument();
  });

  it('does not render without a workflow', () => {
    const { container } = render(
      <WorkflowAppInputsView workflow={undefined} tasks={mockTasks as CrewAITaskMetadata[]} />,
    );

    // Container should be empty
    expect(container).toBeEmptyDOMElement();
  });

  it('shows info alert when no inputs are required', () => {
    // Mock getWorkflowInputs to return empty array for this test
    require('@/app/lib/workflow').getWorkflowInputs.mockReturnValueOnce([]);

    render(
      <WorkflowAppInputsView
        workflow={mockWorkflow as Workflow}
        tasks={mockTasks as CrewAITaskMetadata[]}
      />,
    );

    // Check if the info alert is shown
    expect(screen.getByText('No inputs required for this workflow.')).toBeInTheDocument();
  });

  // Add a snapshot test
  it('matches snapshot', () => {
    const { container } = render(
      <WorkflowAppInputsView
        workflow={mockWorkflow as Workflow}
        tasks={mockTasks as CrewAITaskMetadata[]}
      />,
    );

    expect(container).toMatchSnapshot();
  });
});
