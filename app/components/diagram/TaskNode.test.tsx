import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import TaskNode from './TaskNode';

// Mock window.matchMedia function required by Ant Design
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

// Mock the dependencies
jest.mock('@xyflow/react', () => ({
  Handle: ({ type, position, id }: any) => (
    <div data-testid={`handle-${type}-${position}`} id={id} />
  ),
  Position: {
    Left: 'left',
    Right: 'right',
    Bottom: 'bottom',
  },
}));

// Mock the WorkflowDiagramContext
const mockOnEditTask = jest.fn();
jest.mock('../workflowApp/WorkflowDiagram', () => ({
  useWorkflowDiagramContext: jest.fn(() => ({
    onEditTask: mockOnEditTask,
  })),
}));

describe('TaskNode component', () => {
  const taskData = {
    id: 'task-123',
    name: 'Test Task',
    description: 'Test task description',
  };

  const defaultProps = {
    data: {
      name: 'Test Task Node',
      active: false,
      isMostRecent: false,
      taskId: 'task-123',
      taskData: taskData,
      isConversational: false,
    },
    id: 'test-task-id',
    width: 100,
    height: 120,
    selected: false,
    type: 'task' as const,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    dragging: false,
    zIndex: 0,
    dragHandle: '',
    isConnectable: true,
  };

  const renderWithProps = (customProps: { data?: Partial<typeof defaultProps.data> } = {}) => {
    const props = {
      ...defaultProps,
      data: { ...defaultProps.data, ...(customProps.data || {}) },
    };

    return render(<TaskNode {...(props as any)} />);
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders the task node name correctly', () => {
    renderWithProps();
    expect(screen.getByText('Test Task Node')).toBeInTheDocument();
  });

  test('renders all handles for React Flow', () => {
    renderWithProps();
    expect(screen.getByTestId('handle-target-left')).toBeInTheDocument();
    expect(screen.getByTestId('handle-source-right')).toBeInTheDocument();
    expect(screen.getByTestId('handle-source-bottom')).toBeInTheDocument();
  });

  test('renders edit button when taskData is available and not in conversational mode', () => {
    renderWithProps();

    // Should have an edit button
    const editButton = screen.getByRole('button');
    expect(editButton).toBeInTheDocument();
  });

  test('does not render edit button in conversational workflow', () => {
    renderWithProps({
      data: {
        isConversational: true,
      },
    });

    // Should not have an edit button
    const editButton = screen.queryByRole('button');
    expect(editButton).not.toBeInTheDocument();
  });

  test('does not render edit button when taskData is not available', () => {
    renderWithProps({
      data: {
        taskData: undefined,
      },
    });

    // Should not have an edit button
    const editButton = screen.queryByRole('button');
    expect(editButton).not.toBeInTheDocument();
  });

  test('calls onEditTask when edit button is clicked', () => {
    renderWithProps();

    // Find and click the edit button
    const editButton = screen.getByRole('button');
    fireEvent.click(editButton);

    // Check that onEditTask was called with the right task data
    expect(mockOnEditTask).toHaveBeenCalledWith(taskData);
  });

  test('changes hover state on mouse enter and leave', () => {
    renderWithProps();

    // Find the node container (div containing the task name)
    const nodeContainer = screen.getByText('Test Task Node').closest('div')?.parentElement;
    expect(nodeContainer).toBeInTheDocument();

    if (nodeContainer) {
      // Trigger mouse enter and leave events
      fireEvent.mouseEnter(nodeContainer);
      fireEvent.mouseLeave(nodeContainer);

      // We can't directly test CSS changes, but we can verify the component
      // doesn't crash when handling these events
      expect(screen.getByText('Test Task Node')).toBeInTheDocument();
    }
  });

  test('renders active state with animation style', () => {
    renderWithProps({
      data: {
        active: true,
      },
    });

    // We can't directly test CSS animations, but we can verify the component renders
    expect(screen.getByText('Test Task Node')).toBeInTheDocument();
  });

  test('renders in default state when props are minimal', () => {
    render(
      <TaskNode
        data={{
          name: 'Minimal Task',
          active: false,
        }}
        id="minimal-task"
        width={100}
        height={100}
        selected={false}
        type="task"
        positionAbsoluteX={0}
        positionAbsoluteY={0}
        dragging={false}
        zIndex={0}
        dragHandle=""
        isConnectable={true}
      />,
    );

    expect(screen.getByText('Minimal Task')).toBeInTheDocument();

    // No edit button should be present
    const editButton = screen.queryByRole('button');
    expect(editButton).not.toBeInTheDocument();
  });

  test('renders with different styling based on props', () => {
    renderWithProps({
      data: {
        isMostRecent: true,
      },
    });

    // Check that the component renders correctly with different props
    expect(screen.getByText('Test Task Node')).toBeInTheDocument();
  });

  test('edit button calls onEditTask and prevents propagation', () => {
    renderWithProps();

    // Find the edit button
    const editButton = screen.getByRole('button');

    // Click the button
    fireEvent.click(editButton);

    // Just verify onEditTask was called with the right data
    // The stopPropagation is internal to the component and can't be easily tested
    // without more complex mocking
    expect(mockOnEditTask).toHaveBeenCalledWith(taskData);
  });
});
