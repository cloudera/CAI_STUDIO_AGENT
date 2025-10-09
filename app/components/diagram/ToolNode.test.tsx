import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ToolNode from './ToolNode';

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
  Handle: ({ type, position }: any) => <div data-testid={`handle-${type}-${position}`} />,
  Position: {
    Top: 'top',
    Left: 'left',
    Right: 'right',
    Bottom: 'bottom',
  },
  NodeToolbar: ({ children, isVisible, position }: any) =>
    isVisible ? <div data-testid={`toolbar-${position}`}>{children}</div> : null,
}));

// Mock the Redux hooks and actions
const mockDispatch = jest.fn();
jest.mock('@/app/lib/hooks/hooks', () => ({
  useAppDispatch: () => mockDispatch,
}));

jest.mock('@/app/workflows/editorSlice', () => ({
  openedEditorToolView: jest.fn(() => ({ type: 'openedEditorToolView' })),
  updatedEditorAgentViewCreateAgentState: jest.fn((payload) => ({
    type: 'updatedEditorAgentViewCreateAgentState',
    payload,
  })),
  updatedEditorSelectedToolInstanceId: jest.fn((payload) => ({
    type: 'updatedEditorSelectedToolInstanceId',
    payload,
  })),
}));

describe('ToolNode component', () => {
  const defaultProps = {
    data: {
      name: 'Test Tool',
      iconData: 'test-icon-url',
      active: false,
      info: 'This is tool info',
      infoType: 'ToolInput' as const,
      isMostRecent: false,
      workflowId: 'workflow-123',
      toolInstanceId: 'tool-instance-123',
      agentId: 'agent-123',
      agentTools: ['tool-1'],
      showEditButton: true,
    },
    id: 'test-tool-id',
    width: 100,
    height: 120,
    selected: false,
    type: 'tool' as const,
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

    return render(<ToolNode {...(props as any)} />);
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders the tool node name correctly', () => {
    renderWithProps();
    expect(screen.getByText('Test Tool')).toBeInTheDocument();
  });

  test('renders the handle for React Flow', () => {
    renderWithProps();
    expect(screen.getByTestId('handle-target-top')).toBeInTheDocument();
  });

  test('renders the toolbar when info is provided', () => {
    renderWithProps();
    expect(screen.getByTestId('toolbar-top')).toBeInTheDocument();
    expect(screen.getByText('Tool Use')).toBeInTheDocument();
  });

  test('does not render the toolbar when info is not provided', () => {
    renderWithProps({ data: { info: undefined } });
    expect(screen.queryByTestId('toolbar-top')).not.toBeInTheDocument();
  });

  test('renders edit button when showEditButton is true', () => {
    renderWithProps();
    const editButton = screen.getByRole('button');
    expect(editButton).toBeInTheDocument();
  });

  test('does not render edit button when showEditButton is false', () => {
    renderWithProps({ data: { showEditButton: false } });
    const editButton = screen.queryByRole('button');
    expect(editButton).not.toBeInTheDocument();
  });

  test('calls dispatch actions when edit button is clicked', () => {
    renderWithProps();
    const editButton = screen.getByRole('button');

    // Create a mock event with stopPropagation
    const mockEvent = {
      stopPropagation: jest.fn(),
    };

    // Click the edit button
    fireEvent.click(editButton, mockEvent);

    // Check that the correct actions were dispatched
    expect(mockDispatch).toHaveBeenCalledTimes(3);
    expect(mockDispatch).toHaveBeenNthCalledWith(1, {
      type: 'updatedEditorAgentViewCreateAgentState',
      payload: {
        agentId: 'agent-123',
        tools: ['tool-1'],
      },
    });
    expect(mockDispatch).toHaveBeenNthCalledWith(2, {
      type: 'updatedEditorSelectedToolInstanceId',
      payload: 'tool-instance-123',
    });
    expect(mockDispatch).toHaveBeenNthCalledWith(3, {
      type: 'openedEditorToolView',
    });
  });

  test('changes hover state on mouse enter and leave', () => {
    renderWithProps();

    // Find the node container (div containing the tool name)
    const nodeContainer = screen.getByText('Test Tool').closest('div')?.parentElement;
    expect(nodeContainer).toBeInTheDocument();

    if (nodeContainer) {
      // Trigger mouse enter event
      fireEvent.mouseEnter(nodeContainer);

      // The toolbar text should change from "Tool Use" to the actual info on hover
      expect(screen.getByText('This is tool info')).toBeInTheDocument();

      // Trigger mouse leave event
      fireEvent.mouseLeave(nodeContainer);

      // The toolbar text should change back to "Tool Use"
      expect(screen.getByText('Tool Use')).toBeInTheDocument();
    }
  });

  test('renders with active animation style when active is true', () => {
    renderWithProps({ data: { active: true } });
    // We can't directly test CSS animations, but we can verify the component renders
    expect(screen.getByText('Test Tool')).toBeInTheDocument();
  });

  test('renders the default tool icon when iconData is not provided', () => {
    renderWithProps({ data: { iconData: '' } });
    // Check that the component renders correctly without iconData
    expect(screen.getByText('Test Tool')).toBeInTheDocument();
  });

  test('renders in default state when props are minimal', () => {
    render(
      <ToolNode
        data={{
          name: 'Minimal Tool',
          iconData: '',
          active: false,
          workflowId: 'minimal-workflow',
          toolInstanceId: 'minimal-tool',
          agentId: 'minimal-agent',
          agentTools: [],
        }}
        id="minimal-tool-id"
        width={100}
        height={100}
        selected={false}
        type="tool"
        positionAbsoluteX={0}
        positionAbsoluteY={0}
        dragging={false}
        zIndex={0}
        dragHandle=""
        isConnectable={true}
      />,
    );

    expect(screen.getByText('Minimal Tool')).toBeInTheDocument();

    // No toolbar should be present
    expect(screen.queryByTestId('toolbar-top')).not.toBeInTheDocument();
  });
});
