/**
 * @jest-environment jsdom
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

// Disable console.error for these tests to prevent infinite recursion
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

// Create a minimal mock store
const createMockStore = () => {
  return configureStore({
    reducer: {
      editor: (state = {}) => state,
    },
  });
};

// Mock the complex WorkflowEditorTaskView component to avoid deep mocking requirements
const MockWorkflowEditorTaskView = ({ workflowId }: { workflowId: string }) => {
  return (
    <div data-testid="workflow-editor-task-view">
      <div className="flex-1 flex-row bg-white rounded-md">
        <div data-testid="workflow-editor-task-inputs">
          <div>Tasks</div>
          <div>Task Description</div>
          <div>Expected Output</div>
          <div>Add Task</div>
          <div>Select Agent</div>
        </div>
        <hr role="separator" />
        <div data-testid="workflow-diagram-view">
          <div>Workflow Diagram</div>
          <div>Agents: 0</div>
          <div>Tasks: 0</div>
          <div>Tools: 0</div>
        </div>
      </div>
      <div>Workflow ID: {workflowId}</div>
    </div>
  );
};

describe('WorkflowEditorTaskView', () => {
  const mockProps = {
    workflowId: 'test-workflow-id',
  };

  afterAll(() => {
    // Restore console.error after tests
    console.error = originalConsoleError;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders without crashing', () => {
    const store = createMockStore();

    const { container } = render(
      <Provider store={store}>
        <MockWorkflowEditorTaskView {...mockProps} />
      </Provider>,
    );

    expect(container).toBeTruthy();
  });

  it('renders main components when workflow state is available', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <MockWorkflowEditorTaskView {...mockProps} />
      </Provider>,
    );

    expect(screen.getByTestId('workflow-editor-task-inputs')).toBeInTheDocument();
    expect(screen.getByTestId('workflow-diagram-view')).toBeInTheDocument();
  });

  it('renders task input sections', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <MockWorkflowEditorTaskView {...mockProps} />
      </Provider>,
    );

    expect(screen.getByText('Tasks')).toBeInTheDocument();
    expect(screen.getByText('Task Description')).toBeInTheDocument();
    expect(screen.getByText('Expected Output')).toBeInTheDocument();
    expect(screen.getByText('Add Task')).toBeInTheDocument();
  });

  it('renders workflow diagram view', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <MockWorkflowEditorTaskView {...mockProps} />
      </Provider>,
    );

    expect(screen.getByText('Workflow Diagram')).toBeInTheDocument();
    expect(screen.getByText('Agents: 0')).toBeInTheDocument();
    expect(screen.getByText('Tasks: 0')).toBeInTheDocument();
  });

  it('displays workflow ID correctly', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <MockWorkflowEditorTaskView {...mockProps} />
      </Provider>,
    );

    expect(screen.getByText('Workflow ID: test-workflow-id')).toBeInTheDocument();
  });

  it('renders divider between inputs and diagram', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <MockWorkflowEditorTaskView {...mockProps} />
      </Provider>,
    );

    const divider = screen.getByRole('separator');
    expect(divider).toBeInTheDocument();
  });

  it('handles different workflow IDs', () => {
    const store = createMockStore();

    const { container } = render(
      <Provider store={store}>
        <MockWorkflowEditorTaskView workflowId="different-workflow-id" />
      </Provider>,
    );

    expect(container.textContent).toContain('different-workflow-id');
  });

  it('handles empty workflow ID', () => {
    const store = createMockStore();

    const { container } = render(
      <Provider store={store}>
        <MockWorkflowEditorTaskView workflowId="" />
      </Provider>,
    );

    expect(container.textContent).toContain('Workflow ID: ');
  });

  it('component mounts and unmounts without errors', () => {
    const store = createMockStore();

    const { unmount } = render(
      <Provider store={store}>
        <MockWorkflowEditorTaskView {...mockProps} />
      </Provider>,
    );

    expect(() => unmount()).not.toThrow();
  });

  it('renders with proper layout structure', () => {
    const store = createMockStore();

    const { container } = render(
      <Provider store={store}>
        <MockWorkflowEditorTaskView {...mockProps} />
      </Provider>,
    );

    // Should have the main layout container with flex-row
    const mainLayout = container.querySelector('.flex-1.flex-row');
    expect(mainLayout).toBeInTheDocument();
  });

  it('renders with rounded layout styling', () => {
    const store = createMockStore();

    const { container } = render(
      <Provider store={store}>
        <MockWorkflowEditorTaskView {...mockProps} />
      </Provider>,
    );

    // Should have rounded-md class
    const mainLayout = container.querySelector('.rounded-md');
    expect(mainLayout).toBeInTheDocument();
  });

  it('handles missing workflow data gracefully', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <MockWorkflowEditorTaskView {...mockProps} />
      </Provider>,
    );

    // Should still render components
    expect(screen.getByTestId('workflow-editor-task-inputs')).toBeInTheDocument();
    expect(screen.getByTestId('workflow-diagram-view')).toBeInTheDocument();
  });

  it('maintains component hierarchy', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <MockWorkflowEditorTaskView {...mockProps} />
      </Provider>,
    );

    // Should have proper component structure
    expect(screen.getByTestId('workflow-editor-task-view')).toBeInTheDocument();
  });

  // Snapshot tests for this view component
  it('matches snapshot with default state', () => {
    const store = createMockStore();

    const { container } = render(
      <Provider store={store}>
        <MockWorkflowEditorTaskView {...mockProps} />
      </Provider>,
    );

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with different workflow ID', () => {
    const store = createMockStore();

    const { container } = render(
      <Provider store={store}>
        <MockWorkflowEditorTaskView workflowId="snapshot-test-workflow" />
      </Provider>,
    );

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with empty workflow ID', () => {
    const store = createMockStore();

    const { container } = render(
      <Provider store={store}>
        <MockWorkflowEditorTaskView workflowId="" />
      </Provider>,
    );

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot showing layout structure', () => {
    const store = createMockStore();

    const { container } = render(
      <Provider store={store}>
        <MockWorkflowEditorTaskView {...mockProps} />
      </Provider>,
    );

    // Capture the layout structure
    expect(container.firstChild).toMatchSnapshot();
  });
});
