import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import WorkflowDiagram from './WorkflowDiagram';

// Mock @xyflow/react exports used by the component
jest.mock('@xyflow/react', () => {
  const React = require('react');
  return {
    ReactFlow: ({ children }: any) => <div data-testid="reactflow">{children}</div>,
    Controls: ({ children }: any) => <div data-testid="controls">{children}</div>,
    ControlButton: ({ children, onClick }: any) => (
      <button data-testid="control-button" onClick={onClick}>
        {children}
      </button>
    ),
    Background: () => <div data-testid="background" />,
    applyNodeChanges: jest.fn(),
    applyEdgeChanges: jest.fn(),
    useReactFlow: () => ({ fitView: jest.fn() }),
  };
});

// Mock createDiagramStateFromWorkflow to return predictable nodes/edges
jest.mock('../../workflows/diagrams', () => ({
  createDiagramStateFromWorkflow: jest.fn(() => ({
    nodes: [
      { id: 'node-1', type: 'agent', data: { label: 'A' } },
      { id: 'node-2', type: 'mcp', data: { label: 'MCP' } },
      { id: 'node-3', type: 'tool', data: { label: 'Tool' } },
    ],
    edges: [],
  })),
}));

// Mock image asset hook
jest.mock('../../lib/hooks/useAssetData', () => ({
  useImageAssetsData: () => ({ imageData: {}, refetch: jest.fn() }),
}));

// Mock components that use RTK Query hooks internally to avoid needing Provider
jest.mock('../workflowEditor/SelectOrAddAgentModal', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('../workflowEditor/SelectOrAddManagerAgentModal', () => ({
  __esModule: true,
  default: () => null,
}));

// Mock Redux hooks and editorSlice actions
jest.mock('@/app/lib/hooks/hooks', () => ({
  useAppSelector: jest.fn(() => ({ nodes: [], edges: [], hasCustomPositions: false })),
  useAppDispatch: jest.fn(() => jest.fn()),
}));

jest.mock('@/app/workflows/editorSlice', () => ({
  selectDiagramState: jest.fn(),
  updatedDiagramState: (payload: any) => ({ type: 'updatedDiagramState', payload }),
  updatedDiagramNodes: (payload: any) => ({ type: 'updatedDiagramNodes', payload }),
  updatedDiagramEdges: (payload: any) => ({ type: 'updatedDiagramEdges', payload }),
  updatedEditorStep: (payload: any) => ({ type: 'updatedEditorStep', payload }),
  updatedEditorTaskEditingId: (payload: any) => ({ type: 'updatedEditorTaskEditingId', payload }),
  clearEditorTaskEditingState: () => ({ type: 'clearEditorTaskEditingState' }),
  updatedEditorAgentViewOpen: (payload: any) => ({ type: 'updatedEditorAgentViewOpen', payload }),
}));

describe('WorkflowDiagram', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders ReactFlow children (Controls & Background)', () => {
    const workflowState = {
      workflowId: 'w1',
      workflowMetadata: { managerAgentId: null, process: 'linear' },
    } as any;
    render(<WorkflowDiagram workflowState={workflowState} />);

    expect(screen.getByTestId('reactflow')).toBeInTheDocument();
    expect(screen.getByTestId('controls')).toBeInTheDocument();
    expect(screen.getByTestId('background')).toBeInTheDocument();
  });

  it('invokes reset diagram handler when control button clicked and dispatches updatedDiagramState', () => {
    const mockDispatch = jest.fn();
    const hooks = require('@/app/lib/hooks/hooks');
    hooks.useAppDispatch.mockReturnValue(mockDispatch);

    const workflowState = {
      workflowId: 'w1',
      workflowMetadata: { managerAgentId: null, process: 'linear' },
    } as any;
    render(<WorkflowDiagram workflowState={workflowState} />);

    const btn = screen.getByTestId('control-button');
    fireEvent.click(btn);

    const calledWithUpdatedDiagramState = mockDispatch.mock.calls.some((c: any[]) => {
      const action = c[0];
      return action && action.type === 'updatedDiagramState';
    });

    expect(calledWithUpdatedDiagramState).toBe(true);
  });

  it('handles multiple node types including mcp nodes', () => {
    const workflowState = {
      workflowId: 'w1',
      workflowMetadata: { managerAgentId: null, process: 'linear' },
    } as any;

    render(<WorkflowDiagram workflowState={workflowState} />);

    // Verify that the mocked diagram function was called which contains agent, mcp, and tool nodes
    const { createDiagramStateFromWorkflow } = require('../../workflows/diagrams');
    expect(createDiagramStateFromWorkflow).toHaveBeenCalled();
  });
});
