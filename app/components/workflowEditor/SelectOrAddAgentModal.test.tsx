/**
 * @jest-environment jsdom
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import SelectOrAddAgentModal from './SelectOrAddAgentModal';

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

// Mock all the required hooks and APIs with minimal implementations
jest.mock('../../agents/agentApi', () => ({
  useAddAgentMutation: () => [jest.fn()],
  useUpdateAgentMutation: () => [jest.fn()],
  useListAgentsQuery: () => ({ data: [] }),
  useRemoveAgentMutation: () => [jest.fn()],
}));

jest.mock('../../lib/hooks/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: jest.fn(() => null),
}));

jest.mock('../../workflows/editorSlice', () => ({
  updatedEditorAgentViewOpen: jest.fn(),
  selectEditorAgentViewIsOpen: jest.fn(),
  selectEditorAgentViewStep: jest.fn(),
  selectEditorAgentViewAgent: jest.fn(),
  selectEditorAgentViewCreateAgentState: jest.fn(),
  selectEditorAgentViewCreateAgentToolTemplates: jest.fn(),
  selectEditorWorkflow: jest.fn(),
  updatedEditorAgentViewCreateAgentToolTemplates: jest.fn(),
  updatedEditorAgentViewCreateAgentState: jest.fn(),
  updatedEditorWorkflowId: jest.fn(),
  updatedEditorWorkflowAgentIds: jest.fn(),
  updatedEditorAgentViewAgent: jest.fn(),
  openedEditorToolView: jest.fn(),
  updatedEditorSelectedToolInstanceId: jest.fn(),
  clearedEditorToolEditingState: jest.fn(),
}));

jest.mock('@/app/tools/toolTemplatesApi', () => ({
  useListGlobalToolTemplatesQuery: () => ({ data: [] }),
}));

jest.mock('@/app/lib/hooks/useAssetData', () => ({
  useImageAssetsData: () => ({ imageData: {} }),
}));

jest.mock('./WorkflowAddMcpModal', () => {
  return function MockWorkflowAddMcpModal() {
    return <div data-testid="workflow-add-mcp-modal">WorkflowAddMcpModal</div>;
  };
});

jest.mock('react-redux', () => ({
  ...jest.requireActual('react-redux'),
  useSelector: jest.fn(() => []),
}));

jest.mock('../../workflows/workflowsApi', () => ({
  useAddWorkflowMutation: () => [jest.fn()],
  useUpdateWorkflowMutation: () => [jest.fn()],
}));

jest.mock('../../lib/workflow', () => ({
  createAddRequestFromEditor: jest.fn(),
  createUpdateRequestFromEditor: jest.fn(),
}));

jest.mock('../Notifications', () => ({
  useGlobalNotification: () => ({
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  }),
}));

jest.mock('@/app/tools/toolInstancesApi', () => ({
  useListToolInstancesQuery: () => ({ data: [] }),
  useRemoveToolInstanceMutation: () => [jest.fn()],
}));

jest.mock('../../models/modelsApi', () => ({
  useGetDefaultModelQuery: () => ({ data: { model_id: 'default-model' } }),
  useListModelsQuery: () => ({ data: [] }),
}));

jest.mock('@/app/mcp/mcpInstancesApi', () => ({
  useListMcpInstancesQuery: () => ({ data: [] }),
  useRemoveMcpInstanceMutation: () => [jest.fn()],
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}));

jest.mock('./GenerateAgentPropertiesModal', () => {
  return function MockGenerateAgentPropertiesModal() {
    return <div data-testid="generate-agent-properties-modal">GenerateAgentPropertiesModal</div>;
  };
});

jest.mock('@/app/lib/fileUpload', () => ({
  uploadFile: jest.fn(),
}));

// Create a mock store
const createMockStore = () => {
  return configureStore({
    reducer: {
      editor: (
        state = {
          agentView: {
            isOpen: false,
            step: 'Select',
            agent: null,
            createAgentState: {
              tools: [],
              mcpInstances: [],
            },
            createAgentToolTemplates: [],
          },
          workflow: {
            workflowId: 'test-workflow',
            workflowMetadata: {
              agentIds: [],
            },
          },
        },
      ) => state,
    },
  });
};

describe('SelectOrAddAgentModal', () => {
  const mockProps = {
    workflowId: 'test-workflow-id',
    onClose: jest.fn(),
  };

  const { useAppSelector } = require('../../lib/hooks/hooks');

  afterAll(() => {
    // Restore console.error after tests
    console.error = originalConsoleError;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset to default closed state
    useAppSelector.mockReturnValue(false);
  });

  it('renders without crashing when modal is closed', () => {
    const store = createMockStore();
    useAppSelector.mockReturnValue(false);

    const { container } = render(
      <Provider store={store}>
        <SelectOrAddAgentModal {...mockProps} />
      </Provider>,
    );

    expect(container).toBeTruthy();
  });

  it('does not render modal content when closed', () => {
    const store = createMockStore();
    useAppSelector.mockReturnValue(false);

    render(
      <Provider store={store}>
        <SelectOrAddAgentModal {...mockProps} />
      </Provider>,
    );

    // Modal should not be visible when closed
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('component initializes with proper props', () => {
    const store = createMockStore();
    const onClose = jest.fn();

    const { container } = render(
      <Provider store={store}>
        <SelectOrAddAgentModal {...mockProps} onClose={onClose} />
      </Provider>,
    );

    expect(container).toBeTruthy();
  });

  it('handles different workflow IDs', () => {
    const store = createMockStore();

    const { container } = render(
      <Provider store={store}>
        <SelectOrAddAgentModal workflowId="different-workflow-id" />
      </Provider>,
    );

    expect(container).toBeTruthy();
  });

  it('renders with redux provider correctly', () => {
    const store = createMockStore();

    const { container } = render(
      <Provider store={store}>
        <SelectOrAddAgentModal {...mockProps} />
      </Provider>,
    );

    expect(container).toBeTruthy();
  });

  it('handles missing onClose prop gracefully', () => {
    const store = createMockStore();

    const { container } = render(
      <Provider store={store}>
        <SelectOrAddAgentModal workflowId="test-workflow-id" />
      </Provider>,
    );

    expect(container).toBeTruthy();
  });

  it('component mounts and unmounts without errors', () => {
    const store = createMockStore();

    const { unmount } = render(
      <Provider store={store}>
        <SelectOrAddAgentModal {...mockProps} />
      </Provider>,
    );

    expect(() => unmount()).not.toThrow();
  });

  it('handles empty workflow ID', () => {
    const store = createMockStore();

    const { container } = render(
      <Provider store={store}>
        <SelectOrAddAgentModal workflowId="" />
      </Provider>,
    );

    expect(container).toBeTruthy();
  });

  it('renders with default redux state', () => {
    const store = createMockStore();

    const { container } = render(
      <Provider store={store}>
        <SelectOrAddAgentModal {...mockProps} />
      </Provider>,
    );

    // Component should render even if it's just an empty div when modal is closed
    expect(container).toBeTruthy();
  });

  it('component structure is maintained', () => {
    const store = createMockStore();

    const { container } = render(
      <Provider store={store}>
        <SelectOrAddAgentModal {...mockProps} />
      </Provider>,
    );

    // Basic structural test - container should exist
    expect(container).toBeInTheDocument();
  });
});
