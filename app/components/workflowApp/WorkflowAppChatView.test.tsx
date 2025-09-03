/**
 * @jest-environment jsdom
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import WorkflowAppChatView from './WorkflowAppChatView';
import { Workflow, CrewAITaskMetadata } from '@/studio/proto/agent_studio';

// Mock all required hooks and methods
const mockDispatch = jest.fn();
const mockTestWorkflow = jest.fn().mockReturnValue({
  unwrap: jest.fn().mockResolvedValue({ trace_id: 'test-trace-123' }),
});

// Mock Redux hooks
jest.mock('@/app/lib/hooks/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: any) => {
    // Return different values based on the selector function
    if (selector.name === 'selectWorkflowAppChatUserInput') {
      return 'Test user input';
    }
    if (selector.name === 'selectWorkflowIsRunning') {
      return false;
    }
    if (selector.name === 'selectWorkflowAppChatMessages') {
      return [
        { id: '1', role: 'user', content: 'Hello' },
        { id: '2', role: 'assistant', content: 'How can I help you?' },
      ];
    }
    if (selector.name === 'selectWorkflowConfiguration') {
      return {
        toolConfigurations: {},
        mcpInstanceConfigurations: {},
      };
    }
    if (selector.name === 'selectWorkflowGenerationConfig') {
      return {
        temperature: 0.7,
        max_tokens: 1000,
      };
    }
    return undefined;
  },
}));

// Mock API hooks
jest.mock('@/app/workflows/workflowsApi', () => ({
  useTestWorkflowMutation: () => [mockTestWorkflow],
}));

// Mock workflowAppApi
jest.mock('@/app/workflows/workflowAppApi', () => ({
  useGetWorkflowDataQuery: () => ({
    data: { renderMode: 'studio', workflowModelUrl: 'http://test-url.com' },
    isLoading: false,
    isError: false,
  }),
}));

// Mock the ChatMessages component
jest.mock('../ChatMessages', () => {
  return {
    __esModule: true,
    default: ({
      messages,
      handleTestWorkflow,
      isProcessing,
      messagesEndRef,
      clearMessages,
      workflowName,
    }: any) => (
      <div data-testid="chat-messages">
        <div>Messages count: {messages.length}</div>
        <div>Processing: {isProcessing ? 'true' : 'false'}</div>
        <div>Workflow Name: {workflowName}</div>
        <button data-testid="send-button" onClick={handleTestWorkflow}>
          Send
        </button>
        <button data-testid="clear-button" onClick={clearMessages}>
          Clear
        </button>
        <div ref={messagesEndRef} />
      </div>
    ),
  };
});

// Mock notifications
const mockNotificationError = jest.fn();
jest.mock('../Notifications', () => ({
  useGlobalNotification: () => ({
    error: mockNotificationError,
  }),
}));

// Mock the global fetch
const mockFetch = jest.fn().mockResolvedValue({
  json: jest.fn().mockResolvedValue({ response: { trace_id: 'fetched-trace-123' } }),
});

global.fetch = mockFetch as any;

// Mock Buffer
global.Buffer = {
  from: jest.fn().mockReturnValue({
    toString: jest.fn().mockReturnValue('base64-encoded-string'),
  }),
} as any;

describe('WorkflowAppChatView', () => {
  // Sample data for testing
  const mockWorkflow: Partial<Workflow> = {
    workflow_id: 'workflow-1',
    name: 'Test Workflow',
    description: 'This is a test workflow',
  };

  const mockTasks: Partial<CrewAITaskMetadata>[] = [
    {
      task_id: 'task-1',
      description: 'Test Task',
    },
  ];

  // Cleanup after each test
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders the chat interface when workflow is provided', () => {
    render(
      <WorkflowAppChatView
        workflow={mockWorkflow as Workflow}
        tasks={mockTasks as CrewAITaskMetadata[]}
      />,
    );

    // Check if the chat interface is rendered
    expect(screen.getByTestId('chat-messages')).toBeInTheDocument();
    expect(screen.getByText('Messages count: 2')).toBeInTheDocument();
    expect(screen.getByText('Workflow Name: Test Workflow')).toBeInTheDocument();
  });

  it('does not render when workflow is undefined', () => {
    render(<WorkflowAppChatView workflow={undefined} tasks={mockTasks as CrewAITaskMetadata[]} />);

    // Component should not render anything when workflow is undefined
    expect(screen.queryByTestId('chat-messages')).not.toBeInTheDocument();
  });

  it('handles sending a message in studio mode', async () => {
    render(
      <WorkflowAppChatView
        workflow={mockWorkflow as Workflow}
        tasks={mockTasks as CrewAITaskMetadata[]}
      />,
    );

    // Find and click the send button
    const sendButton = screen.getByTestId('send-button');
    fireEvent.click(sendButton);

    // Check that testWorkflow was called with the correct parameters
    await waitFor(() => {
      expect(mockTestWorkflow).toHaveBeenCalledWith({
        workflow_id: 'workflow-1',
        inputs: {
          user_input: 'Test user input',
          context: expect.any(String),
        },
        tool_user_parameters: {},
        mcp_instance_env_vars: {},
        generation_config: expect.any(String),
      });
    });

    // Dispatch should be called to update trace ID, running state, and add message
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: expect.any(String),
        payload: 'test-trace-123',
      }),
    );
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: expect.any(String),
        payload: true,
      }),
    );
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: expect.any(String),
        payload: expect.objectContaining({
          role: 'user',
          content: 'Test user input',
        }),
      }),
    );
  });

  it('handles clearing messages', () => {
    render(
      <WorkflowAppChatView
        workflow={mockWorkflow as Workflow}
        tasks={mockTasks as CrewAITaskMetadata[]}
      />,
    );

    // Find and click the clear button
    const clearButton = screen.getByTestId('clear-button');
    fireEvent.click(clearButton);

    // Dispatch should be called to clear messages
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: expect.any(String),
      }),
    );
  });

  it('handles error when test workflow fails', async () => {
    // Override the mock to throw an error
    mockTestWorkflow.mockReturnValueOnce({
      unwrap: jest.fn().mockRejectedValue(new Error('Test workflow failed')),
    });

    render(
      <WorkflowAppChatView
        workflow={mockWorkflow as Workflow}
        tasks={mockTasks as CrewAITaskMetadata[]}
      />,
    );

    // Find and click the send button
    const sendButton = screen.getByTestId('send-button');
    fireEvent.click(sendButton);

    // Check that error notification was shown
    await waitFor(() => {
      expect(mockNotificationError).toHaveBeenCalled();
    });
  });

  it('handles sending a message in workflow mode', async () => {
    // Mock the workflowAppApi to return workflow mode
    jest
      .spyOn(require('@/app/workflows/workflowAppApi'), 'useGetWorkflowDataQuery')
      .mockReturnValue({
        data: { renderMode: 'workflow', workflowModelUrl: 'http://test-url.com' },
        isLoading: false,
        isError: false,
      });

    render(
      <WorkflowAppChatView
        workflow={mockWorkflow as Workflow}
        tasks={mockTasks as CrewAITaskMetadata[]}
      />,
    );

    // Find and click the send button
    const sendButton = screen.getByTestId('send-button');
    fireEvent.click(sendButton);

    // Check that fetch was called with the correct parameters
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        'http://test-url.com',
        expect.objectContaining({
          method: 'POST',
          headers: expect.any(Object),
          body: expect.any(String),
        }),
      );
    });

    // Dispatch should be called to update trace ID, running state, and add message
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: expect.any(String),
        payload: expect.any(String),
      }),
    );
  });

  it('does not render while loading workflow data', () => {
    // Mock the workflowAppApi to return isLoading true
    jest
      .spyOn(require('@/app/workflows/workflowAppApi'), 'useGetWorkflowDataQuery')
      .mockReturnValue({
        data: null,
        isLoading: true,
        isError: false,
      });

    render(
      <WorkflowAppChatView
        workflow={mockWorkflow as Workflow}
        tasks={mockTasks as CrewAITaskMetadata[]}
      />,
    );

    // Component should not render anything while loading
    expect(screen.queryByTestId('chat-messages')).not.toBeInTheDocument();
  });
});
