import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import AgentNode from './AgentNode';

// Mock window.matchMedia
window.matchMedia =
  window.matchMedia ||
  function () {
    return {
      matches: false,
      addListener: jest.fn(),
      removeListener: jest.fn(),
    };
  };

// Mock dependencies
jest.mock('@xyflow/react', () => ({
  Handle: jest.fn(() => <div data-testid="handle" />),
  Position: {
    Top: 'top',
    Bottom: 'bottom',
  },
  NodeToolbar: jest.fn(({ children, isVisible }) =>
    isVisible ? <div data-testid="toolbar">{children}</div> : null,
  ),
}));

// Create mock for dispatch function
const mockDispatch = jest.fn();

// Mock workflow context
const mockOnEditManager = jest.fn();
jest.mock('../workflowApp/WorkflowDiagram', () => ({
  useWorkflowDiagramContext: jest.fn(() => ({
    onEditManager: mockOnEditManager,
  })),
}));

// Mock redux hooks
jest.mock('@/app/lib/hooks/hooks', () => ({
  useAppDispatch: jest.fn(() => mockDispatch),
}));

// Create a simple redux store
const store = configureStore({
  reducer: {
    editor: (state = {}, _action) => state,
  },
});

describe('AgentNode component', () => {
  const defaultProps = {
    data: {
      name: 'Test Agent',
      iconData: '',
      manager: false,
      active: false,
      info: '',
      infoType: '',
      agentData: undefined,
      showEditButton: false,
      isDefaultManager: true,
    },
    id: 'test-id',
    width: 100,
    height: 50,
    selected: false,
    type: 'agent' as const,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    dragging: false,
    zIndex: 0,
    xPos: 0,
    yPos: 0,
    dragHandle: '',
    isConnectable: true,
  };

  const renderWithProps = (customProps: { data?: Partial<typeof defaultProps.data> } = {}) => {
    const props = {
      ...defaultProps,
      data: { ...defaultProps.data, ...(customProps.data || {}) },
    };

    return render(
      <Provider store={store}>
        <AgentNode {...props} />
      </Provider>,
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders agent name', () => {
    renderWithProps();
    expect(screen.getByText('Test Agent')).toBeInTheDocument();
  });

  test('renders manager agent differently', () => {
    renderWithProps({ data: { manager: true, name: 'Manager Agent' } });
    expect(screen.getByText('Manager Agent')).toBeInTheDocument();
  });

  test('renders active agent with animation', () => {
    renderWithProps({ data: { active: true } });
    expect(screen.getByText('Test Agent')).toBeInTheDocument();
  });

  test('renders agent with info', () => {
    renderWithProps({
      data: {
        info: 'This is an info message',
        infoType: 'Completion',
      },
    });

    expect(screen.getByTestId('toolbar')).toBeInTheDocument();
  });

  test('displays edit button for regular agents with agentData', () => {
    renderWithProps({
      data: {
        agentData: { id: 'agent-123', name: 'Test Agent' } as any,
        showEditButton: true,
      },
    });

    // The button should be visible
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  test('handles edit button click for regular agent', () => {
    const agentData = { id: 'agent-123', name: 'Test Agent' } as any;

    renderWithProps({
      data: {
        agentData,
        showEditButton: true,
      },
    });

    // Find and click the edit button
    const button = screen.getByRole('button');
    fireEvent.click(button);

    // Check that dispatch was called with the right actions
    expect(mockDispatch).toHaveBeenCalledTimes(3);
  });

  test('handles edit button click for custom manager agent', () => {
    const agentData = { id: 'manager-123', name: 'Custom Manager' } as any;

    renderWithProps({
      data: {
        manager: true,
        isDefaultManager: false,
        agentData,
        showEditButton: true,
      },
    });

    // Find and click the edit button
    const button = screen.getByRole('button');
    fireEvent.click(button);

    // Check that onEditManager was called with the right agent data
    expect(mockOnEditManager).toHaveBeenCalledWith(agentData);
  });

  test('changes hover state on mouse enter and leave', () => {
    renderWithProps({
      data: {
        info: 'Hover info message',
        infoType: 'Completion',
      },
    });

    // Find the node container
    const nodeContainer = screen.getByText('Test Agent').closest('div')?.parentElement;
    expect(nodeContainer).toBeInTheDocument();

    if (nodeContainer) {
      // Trigger mouse enter
      fireEvent.mouseEnter(nodeContainer);

      // The component should show the full info when hovered
      const toolbarContent = screen.getByTestId('toolbar');
      expect(toolbarContent).toHaveTextContent('Hover info message');

      // Trigger mouse leave
      fireEvent.mouseLeave(nodeContainer);

      // Now it should show the default info type message
      expect(toolbarContent).toHaveTextContent('Thinking...');
    }
  });
});
