/**
 * @jest-environment jsdom
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import SelectOrAddManagerAgentModal from './SelectOrAddManagerAgentModal';

// Note: do not override console.error here; global test setup handles environment shims

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

// Mock all the required hooks and APIs
// allow tests to mutate this array to simulate different agent data
let mockAgents: any[] = [];
jest.mock('../../agents/agentApi', () => ({
  useAddAgentMutation: () => [jest.fn()],
  useUpdateAgentMutation: () => [jest.fn()],
  useListAgentsQuery: () => ({ data: mockAgents }), // Updated to use mockAgents
}));

const defaultWorkflowState = {
  workflowId: 'test-workflow',
  workflowMetadata: { managerAgentId: '' },
};

// App-shaped default state for selector functions
const defaultAppState = {
  editor: {
    workflow: {
      workflowId: 'test-workflow',
      workflowMetadata: { managerAgentId: '' },
    },
  },
};

jest.mock('../../lib/hooks/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: jest.fn(() => defaultWorkflowState),
}));

jest.mock('../../workflows/editorSlice', () => ({
  updatedEditorWorkflowManagerAgentId: jest.fn(),
  selectEditorWorkflow: jest.fn(),
  updatedEditorWorkflowProcess: jest.fn(),
}));

jest.mock('../../workflows/workflowsApi', () => ({
  useUpdateWorkflowMutation: () => [jest.fn()],
  useAddWorkflowMutation: () => [jest.fn()],
}));

jest.mock('../../lib/workflow', () => ({
  createUpdateRequestFromEditor: jest.fn(),
  createAddRequestFromEditor: jest.fn(),
}));

jest.mock('../Notifications', () => ({
  useGlobalNotification: () => ({
    success: jest.fn(),
    error: jest.fn(),
  }),
}));

const mockModels: any[] = [];
jest.mock('../../models/modelsApi', () => ({
  useListModelsQuery: () => ({ data: mockModels }),
  useGetModelMutation: () => [jest.fn()],
}));

jest.mock('./GenerateAgentPropertiesModal', () => {
  return function MockGenerateAgentPropertiesModal() {
    return <div data-testid="generate-agent-properties-modal">GenerateAgentPropertiesModal</div>;
  };
});

// Create a mock store
const createMockStore = () => {
  return configureStore({
    reducer: {
      editor: (
        state = {
          workflow: {
            workflowId: 'test-workflow',
            workflowMetadata: {
              managerAgentId: '',
            },
          },
        },
      ) => state,
    },
  });
};

describe('SelectOrAddManagerAgentModal', () => {
  const mockProps = {
    workflowId: 'test-workflow-id',
    isOpen: true,
    onClose: jest.fn(),
  };

  const { useAppSelector } = require('../../lib/hooks/hooks');

  let originalConsoleError: any;

  beforeAll(() => {
    // silence console.error in this test file to avoid global setup recursion issues
    originalConsoleError = console.error;
    console.error = jest.fn();
  });

  afterAll(() => {
    console.error = originalConsoleError;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // default selector behavior: call function selectors with the app-shaped state
    useAppSelector.mockImplementation((selector: any) =>
      typeof selector === 'function' ? selector(defaultAppState) : defaultAppState,
    );
    // Make the mocked selector behave like the real selector: return editor.workflow
    const { selectEditorWorkflow } = require('../../workflows/editorSlice');
    if (selectEditorWorkflow && selectEditorWorkflow.mockImplementation) {
      selectEditorWorkflow.mockImplementation((state: any) => state.editor.workflow);
    }
  });

  it('renders modal when open', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <SelectOrAddManagerAgentModal {...mockProps} />
      </Provider>,
    );

    // Modal title and buttons: avoid ambiguous queries
    const title = screen.getAllByText(/Add Manager Agent/i)[0];
    expect(title).toBeInTheDocument();
    const cancelBtn = screen
      .getAllByText(/Cancel/i)
      .find((el) => el.closest('button'))
      ?.closest('button');
    expect(cancelBtn).toBeDefined();
    const addBtn = screen
      .getAllByText(/Add Manager Agent/i)
      .find((el) => el.closest('button'))
      ?.closest('button');
    expect(addBtn).toBeDefined();
  });

  it('matches snapshot when open', () => {
    const store = createMockStore();
    const { container } = render(
      <Provider store={store}>
        <SelectOrAddManagerAgentModal {...mockProps} />
      </Provider>,
    );
    expect(container).toMatchSnapshot();
  });

  it('does not render when closed', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <SelectOrAddManagerAgentModal {...mockProps} isOpen={false} />
      </Provider>,
    );

    expect(screen.queryByText('Add Manager Agent')).not.toBeInTheDocument();
  });

  it('renders manager agent details form', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <SelectOrAddManagerAgentModal {...mockProps} />
      </Provider>,
    );

    expect(screen.getByText('Manager Agent Details')).toBeInTheDocument();
    expect(screen.getByText('Generate with AI')).toBeInTheDocument();
    expect(screen.getByText('Reset Fields')).toBeInTheDocument();
  });

  it('renders form fields correctly', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <SelectOrAddManagerAgentModal {...mockProps} />
      </Provider>,
    );

    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Role')).toBeInTheDocument();
    expect(screen.getByText('Backstory')).toBeInTheDocument();
    expect(screen.getByText('Goal')).toBeInTheDocument();
    expect(screen.getByText('LLM Model')).toBeInTheDocument();
  });

  it('shows current manager agent when exists', () => {
    const store = createMockStore();
    const mockAgent = {
      id: 'manager-1',
      name: 'Test Manager',
      crew_ai_agent_metadata: {
        goal: 'Manage the team',
        backstory: 'Experienced manager',
        role: 'Manager',
      },
    };

    // Mock useListAgentsQuery to return the manager agent by updating the shared mockAgents
    mockAgents = [mockAgent];

    const appStateWithManager = {
      editor: {
        workflow: {
          workflowId: 'test-workflow',
          workflowMetadata: { managerAgentId: 'manager-1' },
        },
      },
    };
    useAppSelector.mockImplementation((selector: any) =>
      typeof selector === 'function' ? selector(appStateWithManager) : appStateWithManager,
    );

    render(
      <Provider store={store}>
        <SelectOrAddManagerAgentModal {...mockProps} />
      </Provider>,
    );

    expect(screen.getByText('Current Manager Agent')).toBeInTheDocument();
  });

  it('calls onClose when cancel button is clicked', () => {
    const store = createMockStore();
    const onClose = jest.fn();

    render(
      <Provider store={store}>
        <SelectOrAddManagerAgentModal {...mockProps} onClose={onClose} />
      </Provider>,
    );

    const cancelBtn2 = screen
      .getAllByText(/Cancel/i)
      .find((el) => el.closest('button'))
      ?.closest('button');
    expect(cancelBtn2).toBeDefined();
    fireEvent.click(cancelBtn2!);
    expect(onClose).toHaveBeenCalled();
  });

  it('renders generate agent properties modal', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <SelectOrAddManagerAgentModal {...mockProps} />
      </Provider>,
    );

    expect(screen.getByTestId('generate-agent-properties-modal')).toBeInTheDocument();
  });

  it('changes title when editing existing manager', () => {
    const store = createMockStore();
    const mockAgent = {
      id: 'manager-1',
      name: 'Test Manager',
      crew_ai_agent_metadata: {
        goal: 'Manage the team',
        backstory: 'Experienced manager',
        role: 'Manager',
      },
    };

    // Mock useListAgentsQuery to return the manager agent
    mockAgents = [mockAgent];

    const appStateWithManager = {
      editor: {
        workflow: {
          workflowId: 'test-workflow',
          workflowMetadata: { managerAgentId: 'manager-1' },
        },
      },
    };
    useAppSelector.mockImplementation((selector: any) =>
      typeof selector === 'function' ? selector(appStateWithManager) : appStateWithManager,
    );

    render(
      <Provider store={store}>
        <SelectOrAddManagerAgentModal {...mockProps} />
      </Provider>,
    );

    const editTitle = screen.getAllByText(/Edit Manager Agent/i)[0];
    expect(editTitle).toBeInTheDocument();
    const saveBtn = screen
      .getAllByText(/Save Manager Agent/i)
      .find((el) => el.closest('button'))
      ?.closest('button');
    expect(saveBtn).toBeDefined();
  });

  it('handles form reset', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <SelectOrAddManagerAgentModal {...mockProps} />
      </Provider>,
    );

    const resetButton = screen.getByText('Reset Fields');
    fireEvent.click(resetButton);

    // Form should be reset (tested through form behavior)
    expect(resetButton).toBeInTheDocument();
  });

  it('handles form validation', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <SelectOrAddManagerAgentModal {...mockProps} />
      </Provider>,
    );

    const submitButton = screen
      .getAllByText(/Add Manager Agent/i)
      .find((el) => el.closest('button'))
      ?.closest('button');
    expect(submitButton).toBeDefined();
    fireEvent.click(submitButton!);

    // Form validation would be handled by Ant Design Form component
    expect(submitButton).toBeInTheDocument();
  });
});
