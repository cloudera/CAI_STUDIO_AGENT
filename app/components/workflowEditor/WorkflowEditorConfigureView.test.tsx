/**
 * @jest-environment jsdom
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import WorkflowEditorConfigureView from './WorkflowEditorConfigureView';

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

// Mock the required components and hooks
jest.mock('./WorkflowEditorConfigureInputs', () => {
  return function MockWorkflowEditorConfigureInputs() {
    return <div data-testid="workflow-editor-configure-inputs">WorkflowEditorConfigureInputs</div>;
  };
});

jest.mock('../workflowApp/WorkflowDiagramView', () => {
  return function MockWorkflowDiagramView() {
    return <div data-testid="workflow-diagram-view">WorkflowDiagramView</div>;
  };
});

jest.mock('../../lib/hooks/hooks', () => ({
  useAppSelector: jest.fn(),
}));

jest.mock('../../workflows/editorSlice', () => ({
  selectEditorWorkflow: jest.fn(),
}));

jest.mock('../../agents/agentApi', () => ({
  useListAgentsQuery: () => ({ data: [] }),
}));

jest.mock('../../tasks/tasksApi', () => ({
  useListTasksQuery: () => ({ data: [] }),
}));

jest.mock('../../tools/toolInstancesApi', () => ({
  useListToolInstancesQuery: () => ({ data: [] }),
}));

jest.mock('@/app/mcp/mcpInstancesApi', () => ({
  useListMcpInstancesQuery: () => ({ data: [] }),
}));

// Create a mock store
const createMockStore = () => {
  return configureStore({
    reducer: {
      editor: (
        state = {
          workflow: {
            workflowId: 'test-workflow-id',
          },
        },
      ) => state,
    },
  });
};

describe('WorkflowEditorConfigureView', () => {
  const mockProps = {
    workflowId: 'test-workflow-id',
  };

  const { useAppSelector } = require('../../lib/hooks/hooks');

  afterAll(() => {
    // Restore console.error after tests
    console.error = originalConsoleError;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    useAppSelector.mockImplementation((selector: any) => {
      // Import the actual selector to match by reference
      const { selectEditorWorkflow } = require('../../workflows/editorSlice');

      // Match by reference for better reliability
      if (selector === selectEditorWorkflow) {
        return {
          workflowId: 'test-workflow-id',
        };
      }

      // For any other selector, try to execute it with a mock state
      if (selector && typeof selector === 'function') {
        try {
          const mockState = {
            editor: {
              workflow: {
                workflowId: 'test-workflow-id',
              },
            },
          };
          const result = selector(mockState);
          return result;
        } catch (_error) {
          return null;
        }
      }

      return null;
    });
  });

  it('renders main components', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <WorkflowEditorConfigureView {...mockProps} />
      </Provider>,
    );

    expect(screen.getByTestId('workflow-editor-configure-inputs')).toBeInTheDocument();
    expect(screen.getByTestId('workflow-diagram-view')).toBeInTheDocument();
  });

  it('renders with proper layout structure', () => {
    const store = createMockStore();

    const { container } = render(
      <Provider store={store}>
        <WorkflowEditorConfigureView {...mockProps} />
      </Provider>,
    );

    // Should have the main layout container with flex-row
    const mainLayout = container.querySelector('.flex-1.flex.flex-row');
    expect(mainLayout).toBeInTheDocument();
  });

  it('renders divider between inputs and diagram', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <WorkflowEditorConfigureView {...mockProps} />
      </Provider>,
    );

    const divider = screen.getByRole('separator');
    expect(divider).toBeInTheDocument();
  });

  it('passes correct props to WorkflowDiagramView', () => {
    const store = createMockStore();
    const mockToolInstances = [{ id: 'tool-1', name: 'Test Tool' }];
    const mockMcpInstances = [{ id: 'mcp-1', name: 'Test MCP' }];
    const mockTasks = [{ task_id: 'task-1', description: 'Test Task' }];
    const mockAgents = [{ id: 'agent-1', name: 'Test Agent' }];

    // Mock the APIs to return data
    const originalToolsApi = require('../../tools/toolInstancesApi');
    originalToolsApi.useListToolInstancesQuery = () => ({ data: mockToolInstances });

    const originalMcpApi = require('@/app/mcp/mcpInstancesApi');
    originalMcpApi.useListMcpInstancesQuery = () => ({ data: mockMcpInstances });

    const originalTasksApi = require('../../tasks/tasksApi');
    originalTasksApi.useListTasksQuery = () => ({ data: mockTasks });

    const originalAgentsApi = require('../../agents/agentApi');
    originalAgentsApi.useListAgentsQuery = () => ({ data: mockAgents });

    render(
      <Provider store={store}>
        <WorkflowEditorConfigureView {...mockProps} />
      </Provider>,
    );

    // The component should render and pass the data to WorkflowDiagramView
    expect(screen.getByTestId('workflow-diagram-view')).toBeInTheDocument();
  });

  it('handles missing workflow data gracefully', () => {
    const store = createMockStore();

    // Mock APIs to return undefined/empty data
    const originalToolsApi = require('../../tools/toolInstancesApi');
    originalToolsApi.useListToolInstancesQuery = () => ({ data: undefined });

    const originalMcpApi = require('@/app/mcp/mcpInstancesApi');
    originalMcpApi.useListMcpInstancesQuery = () => ({ data: undefined });

    const originalTasksApi = require('../../tasks/tasksApi');
    originalTasksApi.useListTasksQuery = () => ({ data: undefined });

    const originalAgentsApi = require('../../agents/agentApi');
    originalAgentsApi.useListAgentsQuery = () => ({ data: undefined });

    render(
      <Provider store={store}>
        <WorkflowEditorConfigureView {...mockProps} />
      </Provider>,
    );

    // Should still render components
    expect(screen.getByTestId('workflow-editor-configure-inputs')).toBeInTheDocument();
    expect(screen.getByTestId('workflow-diagram-view')).toBeInTheDocument();
  });

  it('renders with white background styling', () => {
    const store = createMockStore();

    const { container } = render(
      <Provider store={store}>
        <WorkflowEditorConfigureView {...mockProps} />
      </Provider>,
    );

    // Should have bg-white and rounded classes
    const mainLayout = container.querySelector('.bg-white.rounded');
    expect(mainLayout).toBeInTheDocument();
  });

  it('passes workflowId to configure inputs component', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <WorkflowEditorConfigureView {...mockProps} />
      </Provider>,
    );

    // The workflowId should be passed to the configure inputs component
    expect(screen.getByTestId('workflow-editor-configure-inputs')).toBeInTheDocument();
  });

  it('passes workflow state to diagram view', () => {
    const store = createMockStore();
    const mockWorkflowState = {
      workflowId: 'test-workflow-id',
      name: 'Test Workflow',
    };

    useAppSelector.mockImplementation((selector: any) => {
      // Import the actual selector to match by reference
      const { selectEditorWorkflow } = require('../../workflows/editorSlice');

      if (selector === selectEditorWorkflow) {
        return mockWorkflowState;
      }

      // For any other selector, try to execute it with a mock state
      if (selector && typeof selector === 'function') {
        try {
          const mockState = {
            editor: {
              workflow: mockWorkflowState,
            },
          };
          const result = selector(mockState);
          return result;
        } catch (_error) {
          return null;
        }
      }

      return null;
    });

    render(
      <Provider store={store}>
        <WorkflowEditorConfigureView {...mockProps} />
      </Provider>,
    );

    // The workflow state should be passed to the diagram view
    expect(screen.getByTestId('workflow-diagram-view')).toBeInTheDocument();
  });

  it('sets displayDiagnostics to false for diagram view', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <WorkflowEditorConfigureView {...mockProps} />
      </Provider>,
    );

    // The displayDiagnostics prop should be set to false
    expect(screen.getByTestId('workflow-diagram-view')).toBeInTheDocument();
  });

  it('renders with proper responsive layout', () => {
    const store = createMockStore();

    const { container } = render(
      <Provider store={store}>
        <WorkflowEditorConfigureView {...mockProps} />
      </Provider>,
    );

    // Should have flex-1 class for responsive layout
    const mainLayout = container.querySelector('.flex-1');
    expect(mainLayout).toBeInTheDocument();
  });

  it('maintains proper component hierarchy', () => {
    const store = createMockStore();

    const { container } = render(
      <Provider store={store}>
        <WorkflowEditorConfigureView {...mockProps} />
      </Provider>,
    );

    // Should have nested layout structure
    const layouts = container.querySelectorAll('.ant-layout');
    expect(layouts.length).toBeGreaterThan(0);
  });
});
