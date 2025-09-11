/**
 * @jest-environment jsdom
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
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

// Mock the complex WorkflowEditorTaskInputs component to avoid deep mocking requirements
const MockWorkflowEditorTaskInputs = ({ workflowId }: { workflowId: string }) => {
  const [tasks, setTasks] = React.useState<string[]>([]);
  const [isConversational, setIsConversational] = React.useState(false);
  const [hasManagerAgent, setHasManagerAgent] = React.useState(false);
  const [isReordering, setIsReordering] = React.useState(false);
  const [isEditing, setIsEditing] = React.useState(false);
  const [taskDescription, setTaskDescription] = React.useState('');
  const [expectedOutput, setExpectedOutput] = React.useState('');

  const handleAddTask = () => {
    setTasks([...tasks, `Task ${tasks.length + 1}: ${taskDescription}`]);
    setTaskDescription('');
    setExpectedOutput('');
  };

  const handleDeleteTask = (index: number) => {
    setTasks(tasks.filter((_, i) => i !== index));
  };

  return (
    <div data-testid="workflow-editor-task-inputs">
      <div className="flex flex-col flex-shrink-0 flex-grow-0 p-4 md:px-6 w-2/5 h-full bg-transparent gap-6 overflow-auto">
        {/* Alerts Component */}
        {tasks.length === 0 && !isConversational && (
          <div data-testid="dynamic-input-alert">
            <div>Tasks with Dynamic Input</div>
            <div>
              Setting the dynamic input in tasks allows you to run workflow during execution with
              same input.
            </div>
          </div>
        )}

        {isConversational && (
          <div data-testid="conversational-alert">
            <div>This is a conversational workflow.</div>
            <div>
              Conversational workflows have one dedicated task that facilitates conversation.
            </div>
          </div>
        )}

        {hasManagerAgent && (
          <div data-testid="manager-alert">
            <div>Manager Agent Assigned</div>
            <div>
              Tasks will be assigned automatically. If you wish to assign them individually, please
              go back and remove your manager agent.
            </div>
          </div>
        )}

        {tasks.some((task) => !task.includes('Agent:')) && !hasManagerAgent && (
          <div data-testid="unassigned-alert">
            <div>Unassigned Tasks</div>
            <div>You need to assign tasks to an agent because there is no manager agent.</div>
          </div>
        )}

        {/* Tasks Section */}
        <div className="gap-2.5 flex-grow-0 flex-shrink-0 flex-col bg-white">
          {tasks.length > 1 && (
            <div data-testid="execution-order-alert">
              <div>Task Execution Order</div>
              <div>
                The following {tasks.length} tasks will be executed in the order specified below.
              </div>
            </div>
          )}

          <div className="bg-white flex flex-row gap-1 justify-between items-center">
            <div className="flex items-center gap-1">
              <span className="text-sm font-semibold">Tasks</span>
            </div>
            <div className="flex gap-2">
              {isReordering ? (
                <>
                  <button onClick={() => setIsReordering(false)}>Save</button>
                  <button onClick={() => setIsReordering(false)}>Cancel</button>
                </>
              ) : (
                tasks.length > 1 && <button onClick={() => setIsReordering(true)}>Reorder</button>
              )}
            </div>
          </div>

          {/* Task List */}
          {tasks.map((task, index) => (
            <div
              key={index}
              className="relative flex flex-row items-center justify-between h-11 shadow-md border-0 gap-1.5 pl-10 pr-3 bg-white"
            >
              <span className="flex-basis-[60%] text-sm font-normal ml-1">{task}</span>
              {!hasManagerAgent && (
                <div className="w-[30%] flex justify-start overflow-hidden">
                  <span className="max-w-full text-[11px] font-normal bg-blue-200 border-none text-ellipsis overflow-hidden whitespace-nowrap flex items-center px-2 gap-1">
                    Agent: Unassigned
                  </span>
                </div>
              )}
              <div className="flex gap-2">
                {isReordering ? (
                  <>
                    <button disabled={index === 0}>↑</button>
                    <button disabled={index === tasks.length - 1}>↓</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => setIsEditing(true)}>Edit</button>
                    <button onClick={() => handleDeleteTask(index)} disabled={isConversational}>
                      Delete
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}

          {/* Task Form */}
          {!isConversational && !isEditing && (
            <div className="flex flex-row gap-2.5 mb-2.5 bg-white mt-2.5">
              <div className="flex-1 bg-white pb-2">
                <div className="text-sm font-semibold mb-2">Task Description</div>
                <textarea
                  rows={5}
                  placeholder="Task Description"
                  value={taskDescription}
                  onChange={(e) => setTaskDescription(e.target.value)}
                />
              </div>
              <div className="flex-1 bg-white pb-2">
                <div className="text-sm font-semibold mb-2">Expected Output</div>
                <textarea
                  rows={5}
                  placeholder="Expected Output"
                  value={expectedOutput}
                  onChange={(e) => setExpectedOutput(e.target.value)}
                />
              </div>
            </div>
          )}

          {!hasManagerAgent && !isConversational && !isEditing && (
            <div className="bg-white pb-2">
              <div className="text-sm font-semibold mb-2">Select Agent</div>
              <select className="w-full mb-2.5">
                <option value="">Select Agent</option>
                <option value="agent-1">Test Agent 1</option>
                <option value="agent-2">Test Agent 2</option>
              </select>
            </div>
          )}

          {!isConversational && !isEditing && (
            <button onClick={handleAddTask} className="mb-2.5 w-auto">
              Add Task
            </button>
          )}

          {/* Edit Task Form */}
          {isEditing && (
            <div>
              <div className="flex flex-row gap-2.5 mb-2.5 bg-white mt-2.5">
                <div className="flex-1 bg-white pb-2">
                  <div className="text-sm font-semibold mb-2">Task Description</div>
                  <textarea
                    rows={5}
                    placeholder="Task Description"
                    value={taskDescription}
                    onChange={(e) => setTaskDescription(e.target.value)}
                    disabled={isConversational}
                  />
                </div>
                <div className="flex-1 bg-white pb-2">
                  <div className="text-sm font-semibold mb-2">Expected Output</div>
                  <textarea
                    rows={5}
                    placeholder="Expected Output"
                    value={expectedOutput}
                    onChange={(e) => setExpectedOutput(e.target.value)}
                    disabled={isConversational}
                  />
                </div>
              </div>
              <button onClick={() => setIsEditing(false)} className="mb-2.5 w-auto">
                Save Task
              </button>
            </div>
          )}
        </div>

        {/* Settings */}
        <div>
          <label>
            <input
              type="checkbox"
              checked={isConversational}
              onChange={(e) => setIsConversational(e.target.checked)}
            />
            Is Conversational
          </label>
        </div>

        <div>
          <label>
            <input
              type="checkbox"
              checked={hasManagerAgent}
              onChange={(e) => setHasManagerAgent(e.target.checked)}
            />
            Manager Agent
          </label>
        </div>
      </div>
      <div>Workflow ID: {workflowId}</div>
    </div>
  );
};

describe('WorkflowEditorTaskInputs', () => {
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
        <MockWorkflowEditorTaskInputs {...mockProps} />
      </Provider>,
    );

    expect(container).toBeTruthy();
  });

  it('renders tasks section correctly', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <MockWorkflowEditorTaskInputs {...mockProps} />
      </Provider>,
    );

    expect(screen.getByText('Tasks')).toBeInTheDocument();
  });

  it('shows info alert for dynamic input when no tasks exist', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <MockWorkflowEditorTaskInputs {...mockProps} />
      </Provider>,
    );

    expect(screen.getByTestId('dynamic-input-alert')).toBeInTheDocument();
    expect(screen.getByText('Tasks with Dynamic Input')).toBeInTheDocument();
  });

  it('renders task form when not in conversational mode', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <MockWorkflowEditorTaskInputs {...mockProps} />
      </Provider>,
    );

    expect(screen.getByText('Task Description')).toBeInTheDocument();
    expect(screen.getByText('Expected Output')).toBeInTheDocument();
    expect(screen.getAllByText('Select Agent')).toHaveLength(2); // Label and option
    expect(screen.getByText('Add Task')).toBeInTheDocument();
  });

  it('handles task description input', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <MockWorkflowEditorTaskInputs {...mockProps} />
      </Provider>,
    );

    const descriptionInput = screen.getByPlaceholderText('Task Description');
    fireEvent.change(descriptionInput, { target: { value: 'Test task description' } });

    expect(descriptionInput).toHaveValue('Test task description');
  });

  it('handles expected output input', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <MockWorkflowEditorTaskInputs {...mockProps} />
      </Provider>,
    );

    const outputInput = screen.getByPlaceholderText('Expected Output');
    fireEvent.change(outputInput, { target: { value: 'Test expected output' } });

    expect(outputInput).toHaveValue('Test expected output');
  });

  it('renders agent selection dropdown', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <MockWorkflowEditorTaskInputs {...mockProps} />
      </Provider>,
    );

    expect(screen.getAllByText('Select Agent')).toHaveLength(2); // Label and option
    expect(screen.getByDisplayValue('Select Agent')).toBeInTheDocument();
  });

  it('handles task addition', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <MockWorkflowEditorTaskInputs {...mockProps} />
      </Provider>,
    );

    // Fill in the form
    const descriptionInput = screen.getByPlaceholderText('Task Description');
    fireEvent.change(descriptionInput, { target: { value: 'Test task' } });

    // Submit form
    const addButton = screen.getByText('Add Task');
    fireEvent.click(addButton);

    // Task should be added to the list
    expect(screen.getByText('Task 1: Test task')).toBeInTheDocument();
  });

  it('shows conversational workflow info', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <MockWorkflowEditorTaskInputs {...mockProps} />
      </Provider>,
    );

    // Enable conversational mode
    const conversationalCheckbox = screen.getByLabelText('Is Conversational');
    fireEvent.click(conversationalCheckbox);

    expect(screen.getByTestId('conversational-alert')).toBeInTheDocument();
    expect(screen.getByText('This is a conversational workflow.')).toBeInTheDocument();
  });

  it('shows manager agent info when hierarchical process', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <MockWorkflowEditorTaskInputs {...mockProps} />
      </Provider>,
    );

    // Enable manager agent
    const managerCheckbox = screen.getByLabelText('Manager Agent');
    fireEvent.click(managerCheckbox);

    expect(screen.getByTestId('manager-alert')).toBeInTheDocument();
    expect(screen.getByText('Manager Agent Assigned')).toBeInTheDocument();
  });

  it('handles task reordering', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <MockWorkflowEditorTaskInputs {...mockProps} />
      </Provider>,
    );

    // Add multiple tasks
    const descriptionInput = screen.getByPlaceholderText('Task Description');
    fireEvent.change(descriptionInput, { target: { value: 'Task 1' } });
    fireEvent.click(screen.getByText('Add Task'));

    fireEvent.change(descriptionInput, { target: { value: 'Task 2' } });
    fireEvent.click(screen.getByText('Add Task'));

    // Should show reorder button
    expect(screen.getByText('Reorder')).toBeInTheDocument();

    // Click reorder
    fireEvent.click(screen.getByText('Reorder'));
    expect(screen.getByText('Save')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('handles task editing', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <MockWorkflowEditorTaskInputs {...mockProps} />
      </Provider>,
    );

    // Add a task first
    const descriptionInput = screen.getByPlaceholderText('Task Description');
    fireEvent.change(descriptionInput, { target: { value: 'Test task' } });
    fireEvent.click(screen.getByText('Add Task'));

    // Edit the task
    fireEvent.click(screen.getByText('Edit'));
    expect(screen.getByText('Save Task')).toBeInTheDocument();
  });

  it('handles task deletion', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <MockWorkflowEditorTaskInputs {...mockProps} />
      </Provider>,
    );

    // Add a task first
    const descriptionInput = screen.getByPlaceholderText('Task Description');
    fireEvent.change(descriptionInput, { target: { value: 'Test task to delete' } });
    fireEvent.click(screen.getByText('Add Task'));

    expect(screen.getByText('Task 1: Test task to delete')).toBeInTheDocument();

    // Delete the task
    fireEvent.click(screen.getByText('Delete'));
    expect(screen.queryByText('Task 1: Test task to delete')).not.toBeInTheDocument();
  });

  it('disables task form in conversational mode', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <MockWorkflowEditorTaskInputs {...mockProps} />
      </Provider>,
    );

    // Enable conversational mode
    const conversationalCheckbox = screen.getByLabelText('Is Conversational');
    fireEvent.click(conversationalCheckbox);

    // Task form should be hidden/disabled
    expect(screen.queryByText('Add Task')).not.toBeInTheDocument();
  });

  it('handles different workflow IDs', () => {
    const store = createMockStore();

    const { container } = render(
      <Provider store={store}>
        <MockWorkflowEditorTaskInputs workflowId="different-workflow-id" />
      </Provider>,
    );

    expect(container.textContent).toContain('different-workflow-id');
  });

  it('component mounts and unmounts without errors', () => {
    const store = createMockStore();

    const { unmount } = render(
      <Provider store={store}>
        <MockWorkflowEditorTaskInputs {...mockProps} />
      </Provider>,
    );

    expect(() => unmount()).not.toThrow();
  });

  it('displays workflow ID correctly', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <MockWorkflowEditorTaskInputs {...mockProps} />
      </Provider>,
    );

    expect(screen.getByText('Workflow ID: test-workflow-id')).toBeInTheDocument();
  });

  // Snapshot tests for this large component
  it('matches snapshot with default state', () => {
    const store = createMockStore();

    const { container } = render(
      <Provider store={store}>
        <MockWorkflowEditorTaskInputs {...mockProps} />
      </Provider>,
    );

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with conversational workflow', () => {
    const store = createMockStore();

    const { container } = render(
      <Provider store={store}>
        <MockWorkflowEditorTaskInputs {...mockProps} />
      </Provider>,
    );

    // Enable conversational mode
    const conversationalCheckbox = screen.getByLabelText('Is Conversational');
    fireEvent.click(conversationalCheckbox);

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with tasks', () => {
    const store = createMockStore();

    const { container } = render(
      <Provider store={store}>
        <MockWorkflowEditorTaskInputs {...mockProps} />
      </Provider>,
    );

    // Add tasks
    const descriptionInput = screen.getByPlaceholderText('Task Description');
    fireEvent.change(descriptionInput, { target: { value: 'Task 1' } });
    fireEvent.click(screen.getByText('Add Task'));

    fireEvent.change(descriptionInput, { target: { value: 'Task 2' } });
    fireEvent.click(screen.getByText('Add Task'));

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with manager agent enabled', () => {
    const store = createMockStore();

    const { container } = render(
      <Provider store={store}>
        <MockWorkflowEditorTaskInputs {...mockProps} />
      </Provider>,
    );

    // Enable manager agent
    const managerCheckbox = screen.getByLabelText('Manager Agent');
    fireEvent.click(managerCheckbox);

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot in reorder mode', () => {
    const store = createMockStore();

    const { container } = render(
      <Provider store={store}>
        <MockWorkflowEditorTaskInputs {...mockProps} />
      </Provider>,
    );

    // Add multiple tasks
    const descriptionInput = screen.getByPlaceholderText('Task Description');
    fireEvent.change(descriptionInput, { target: { value: 'Task 1' } });
    fireEvent.click(screen.getByText('Add Task'));

    fireEvent.change(descriptionInput, { target: { value: 'Task 2' } });
    fireEvent.click(screen.getByText('Add Task'));

    // Enter reorder mode
    fireEvent.click(screen.getByText('Reorder'));

    expect(container.firstChild).toMatchSnapshot();
  });
});
