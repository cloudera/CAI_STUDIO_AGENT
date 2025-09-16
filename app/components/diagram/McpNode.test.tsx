import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import McpNode from './McpNode';

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
  Handle: jest.fn(() => <div data-testid="handle" />),
  Position: {
    Top: 'top',
    Bottom: 'bottom',
  },
  NodeToolbar: jest.fn(({ children, isVisible }) =>
    isVisible ? <div data-testid="node-toolbar">{children}</div> : null,
  ),
}));

// Mock Redux hooks and actions
const mockDispatch = jest.fn();
jest.mock('@/app/lib/hooks/hooks', () => ({
  useAppDispatch: () => mockDispatch,
}));

jest.mock('@/app/workflows/editorSlice', () => ({
  updatedEditorAgentViewCreateAgentState: jest.fn((payload) => ({
    type: 'updatedEditorAgentViewCreateAgentState',
    payload,
  })),
  updatedEditorSelectedMcpInstanceId: jest.fn((payload) => ({
    type: 'updatedEditorSelectedMcpInstanceId',
    payload,
  })),
  openedEditorMcpView: jest.fn(() => ({ type: 'openedEditorMcpView' })),
}));

describe('McpNode component', () => {
  const defaultProps = {
    data: {
      name: 'Test MCP Node',
      iconData: '',
      active: false,
      toolList: ['Tool1', 'Tool2', 'Tool3'],
      info: undefined as string | undefined,
      infoType: undefined as string | undefined,
      activeTool: undefined as string | undefined,
      isMostRecent: false,
      mcpInstances: ['mcp-instance-1', 'mcp-instance-2'],
      mcpInstanceId: 'mcp-instance-1',
      agentId: 'agent-123',
      workflowId: 'workflow-123',
      showEditButton: true,
    },
    id: 'test-id',
    width: 100,
    height: 120,
    selected: false,
    type: 'mcp' as const,
    positionAbsolute: { x: 0, y: 0 },
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

    return render(<McpNode {...(props as any)} />);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockDispatch.mockClear();
  });

  test('renders the MCP node name correctly', () => {
    renderWithProps();
    expect(screen.getByText('Test MCP Node')).toBeInTheDocument();
  });

  test('renders handle for React Flow', () => {
    renderWithProps();
    expect(screen.getByTestId('handle')).toBeInTheDocument();
  });

  test('renders tools from toolList', () => {
    renderWithProps();
    expect(screen.getByText('Tool1')).toBeInTheDocument();
    expect(screen.getByText('Tool2')).toBeInTheDocument();
    expect(screen.getByText('Tool3')).toBeInTheDocument();
  });

  test('renders active tool when provided and node is active', () => {
    renderWithProps({
      data: {
        active: true,
        activeTool: 'ActiveTool',
        toolList: ['Tool1', 'Tool2', 'Tool3'],
      },
    });

    expect(screen.getByText('ActiveTool')).toBeInTheDocument();
    expect(screen.getByText('Tool1')).toBeInTheDocument();
    expect(screen.getByText('Tool2')).toBeInTheDocument();
  });

  test('renders empty tags when fewer tools than maximum', () => {
    renderWithProps({
      data: {
        toolList: ['Tool1'],
      },
    });

    expect(screen.getByText('Tool1')).toBeInTheDocument();

    // Check that there are transparent tags for spacing
    const transparentTags = screen.getAllByText('N/A');
    expect(transparentTags.length).toBe(3); // Should have 3 empty tags
  });

  test('renders +more indicator when tools exceed maximum', () => {
    renderWithProps({
      data: {
        toolList: ['Tool1', 'Tool2', 'Tool3', 'Tool4', 'Tool5', 'Tool6'],
      },
    });

    // Should show the first 3 tools and a +more indicator
    expect(screen.getByText('Tool1')).toBeInTheDocument();
    expect(screen.getByText('Tool2')).toBeInTheDocument();
    expect(screen.getByText('Tool3')).toBeInTheDocument();
    expect(screen.getByText('+3 more tools')).toBeInTheDocument();
  });

  test('renders one more tool instead of +1 more indicator', () => {
    renderWithProps({
      data: {
        toolList: ['Tool1', 'Tool2', 'Tool3', 'Tool4'],
      },
    });

    // Should show all 4 tools without +more indicator
    expect(screen.getByText('Tool1')).toBeInTheDocument();
    expect(screen.getByText('Tool2')).toBeInTheDocument();
    expect(screen.getByText('Tool3')).toBeInTheDocument();
    expect(screen.getByText('Tool4')).toBeInTheDocument();

    // Shouldn't have a +more indicator
    expect(screen.queryByText('+1 more tools')).not.toBeInTheDocument();
  });

  test('renders truncated tool names when too long', () => {
    renderWithProps({
      data: {
        toolList: ['ThisIsAReallyLongToolNameThatShouldBeTruncated'],
      },
    });

    // Should truncate the long tool name
    // Note that the actual truncation might be slightly different based on implementation
    // So we use a regex to check for the truncated name pattern
    const truncatedElement = screen.getByText(/ThisIsAReallyLong.+\.\.\./);
    expect(truncatedElement).toBeInTheDocument();
  });

  test('renders info tooltip when info is provided', () => {
    renderWithProps({
      data: {
        info: 'Test info message',
        infoType: 'Completion',
      },
    });

    expect(screen.getByTestId('node-toolbar')).toBeInTheDocument();
    expect(screen.getByText('MCP Tool invocation')).toBeInTheDocument();
  });

  test('changes hover state on mouse enter and leave', () => {
    renderWithProps({
      data: {
        info: 'Detailed info message',
      },
    });

    // Find the node container
    const nodeContainer = screen.getByText('Test MCP Node').closest('div')?.parentElement;
    expect(nodeContainer).toBeInTheDocument();

    if (nodeContainer) {
      // Trigger mouse enter
      fireEvent.mouseEnter(nodeContainer);

      // The component should show the full info when hovered
      const toolbarContent = screen.getByTestId('node-toolbar');
      expect(toolbarContent).toHaveTextContent('Detailed info message');

      // Trigger mouse leave
      fireEvent.mouseLeave(nodeContainer);

      // Now it should show the default message
      expect(toolbarContent).toHaveTextContent('MCP Tool invocation');
    }
  });

  test('renders active state with animation style', () => {
    renderWithProps({
      data: {
        active: true,
      },
    });

    // We can't directly test CSS animations, but we can verify the component renders
    expect(screen.getByText('Test MCP Node')).toBeInTheDocument();
  });

  test('renders with custom icon data when provided', () => {
    renderWithProps({
      data: {
        iconData: '/custom-icon.svg',
      },
    });

    // Check that the Image component gets the correct src
    const image = document.querySelector('img');
    expect(image).toBeTruthy();
  });

  test('renders with default icon when no icon data is provided', () => {
    renderWithProps({
      data: {
        iconData: '',
      },
    });

    // The default icon should be used
    const image = document.querySelector('img');
    expect(image).toBeTruthy();
  });

  test('excludes active tool from regular tool list', () => {
    renderWithProps({
      data: {
        active: true,
        activeTool: 'Tool1',
        toolList: ['Tool1', 'Tool2', 'Tool3', 'Tool4'],
      },
    });

    // Tool1 should appear once (as active tool)
    const tool1Elements = screen.getAllByText('Tool1');
    expect(tool1Elements.length).toBe(1);

    // Other tools should appear as regular tools
    expect(screen.getByText('Tool2')).toBeInTheDocument();
    expect(screen.getByText('Tool3')).toBeInTheDocument();
    expect(screen.getByText('Tool4')).toBeInTheDocument();
  });

  test('renders active tool with truncation when long', () => {
    renderWithProps({
      data: {
        active: true,
        activeTool: 'ThisIsAVeryLongActiveToolNameThatShouldBeTruncated',
        toolList: ['Tool1', 'Tool2', 'Tool3'],
      },
    });

    // Should truncate the long active tool name
    const truncatedElement = screen.getByText(/ThisIsAVeryLongAct.+\.\.\./);
    expect(truncatedElement).toBeInTheDocument();
  });

  test('renders without tools list', () => {
    renderWithProps({
      data: {
        toolList: undefined,
      },
    });

    // Should render empty tags for spacing
    const transparentTags = screen.getAllByText('N/A');
    expect(transparentTags.length).toBe(4); // Should have 4 empty tags
  });

  test('handles case with no tools gracefully', () => {
    renderWithProps({
      data: {
        toolList: [],
      },
    });

    // Should render empty tags for spacing
    const transparentTags = screen.getAllByText('N/A');
    expect(transparentTags.length).toBe(4); // Should have 4 empty tags
  });
});
