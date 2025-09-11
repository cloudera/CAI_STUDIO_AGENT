/**
 * @jest-environment jsdom
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import WorkflowEditorConfigureInputs, {
  hasValidToolConfiguration,
} from './WorkflowEditorConfigureInputs';

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
jest.mock('../../tools/toolInstancesApi', () => ({
  useListToolInstancesQuery: () => ({ data: [] }),
}));

jest.mock('../../agents/agentApi', () => ({
  useListAgentsQuery: () => ({ data: [] }),
}));

jest.mock('@/app/mcp/mcpInstancesApi', () => ({
  useListMcpInstancesQuery: () => ({ data: [] }),
}));

jest.mock('../../lib/hooks/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: jest.fn(() => null),
}));

jest.mock('../../workflows/editorSlice', () => ({}));

jest.mock('../../lib/localStorage', () => ({
  readWorkflowConfigurationFromLocalStorage: jest.fn(),
  resetLocalStorageState: jest.fn(),
  writeWorkflowConfigurationToLocalStorage: jest.fn(),
}));

jest.mock('../../lib/constants', () => ({
  DEFAULT_GENERATION_CONFIG: {
    temperature: 0.7,
    max_new_tokens: 512,
  },
  TOOL_PARAMS_ALERT: {
    message: 'Required Parameters Missing',
    description: 'Please fill in all required tool parameters.',
  },
}));

jest.mock('../../lib/alertUtils', () => ({
  renderAlert: jest.fn(() => <div data-testid="alert">Alert</div>),
}));

// Create a mock store
const createMockStore = () => {
  return configureStore({
    reducer: {
      editor: (state = {}) => state,
    },
  });
};

describe('WorkflowEditorConfigureInputs', () => {
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
      // Import the actual selectors to match them
      const {
        selectWorkflowConfiguration,
        selectWorkflowGenerationConfig,
      } = require('../../workflows/editorSlice');

      // Match by reference
      if (selector === selectWorkflowConfiguration) {
        return {
          toolConfigurations: {},
          mcpInstanceConfigurations: {},
          generationConfig: { temperature: 0.7, max_new_tokens: 512 },
        };
      }

      if (selector === selectWorkflowGenerationConfig) {
        return {
          temperature: 0.7,
          max_new_tokens: 512,
        };
      }

      // For any other selector, try to execute it with a mock state
      if (selector && typeof selector === 'function') {
        try {
          const mockState = {
            editor: {
              workflowConfiguration: {
                toolConfigurations: {},
                mcpInstanceConfigurations: {},
                generationConfig: { temperature: 0.7, max_new_tokens: 512 },
              },
            },
          };
          const result = selector(mockState);
          return result;
        } catch (_error) {
          // If selector fails, return null as fallback
          return null;
        }
      }

      return null;
    });
  });

  it('renders without crashing', () => {
    const store = createMockStore();

    const { container } = render(
      <Provider store={store}>
        <WorkflowEditorConfigureInputs {...mockProps} />
      </Provider>,
    );

    expect(container).toBeTruthy();
  });

  it('renders main sections correctly', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <WorkflowEditorConfigureInputs {...mockProps} />
      </Provider>,
    );

    expect(screen.getByText('Agents & Managers')).toBeInTheDocument();
    expect(screen.getByText('Tools and MCPs')).toBeInTheDocument();
    expect(screen.getByText('Generation')).toBeInTheDocument();
  });

  it('renders generation configuration controls', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <WorkflowEditorConfigureInputs {...mockProps} />
      </Provider>,
    );

    expect(screen.getByText('Max New Tokens')).toBeInTheDocument();
    expect(screen.getByText('Temperature')).toBeInTheDocument();
  });

  it('shows no configuration required message by default', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <WorkflowEditorConfigureInputs {...mockProps} />
      </Provider>,
    );

    expect(screen.getByText('No Configuration Required')).toBeInTheDocument();
  });

  it('handles different workflow IDs', () => {
    const store = createMockStore();

    const { container } = render(
      <Provider store={store}>
        <WorkflowEditorConfigureInputs workflowId="different-workflow-id" />
      </Provider>,
    );

    expect(container).toBeTruthy();
  });

  it('component mounts and unmounts without errors', () => {
    const store = createMockStore();

    const { unmount } = render(
      <Provider store={store}>
        <WorkflowEditorConfigureInputs {...mockProps} />
      </Provider>,
    );

    expect(() => unmount()).not.toThrow();
  });

  // Snapshot tests for this large component
  it('matches snapshot with default configuration', () => {
    const store = createMockStore();

    const { container } = render(
      <Provider store={store}>
        <WorkflowEditorConfigureInputs {...mockProps} />
      </Provider>,
    );

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with tool configurations', () => {
    const store = createMockStore();
    const mockAgents = [
      {
        id: 'agent-1',
        name: 'Test Agent',
        workflow_id: 'test-workflow-id',
        tools_id: ['tool-1'],
      },
    ];
    const mockToolInstances = [
      {
        id: 'tool-1',
        name: 'Test Tool',
        tool_metadata: JSON.stringify({
          user_params: ['api_key'],
          user_params_metadata: {
            api_key: { required: true },
          },
        }),
      },
    ];

    // Mock the APIs
    const originalAgentApi = require('../../agents/agentApi');
    originalAgentApi.useListAgentsQuery = () => ({ data: mockAgents });

    const originalToolsApi = require('../../tools/toolInstancesApi');
    originalToolsApi.useListToolInstancesQuery = () => ({ data: mockToolInstances });

    const { container } = render(
      <Provider store={store}>
        <WorkflowEditorConfigureInputs {...mockProps} />
      </Provider>,
    );

    expect(container.firstChild).toMatchSnapshot();
  });
});

describe('hasValidToolConfiguration', () => {
  it('returns true when no agents or tools', () => {
    const result = hasValidToolConfiguration('workflow-id', undefined, undefined, {
      toolConfigurations: {},
      mcpInstanceConfigurations: {},
      generationConfig: {},
    });
    expect(result).toBe(true);
  });

  it('returns true when all required parameters are provided', () => {
    const agents = [
      {
        id: 'agent-1',
        workflow_id: 'workflow-id',
        tools_id: ['tool-1'],
      },
    ];
    const toolInstances = [
      {
        id: 'tool-1',
        tool_metadata: JSON.stringify({
          user_params_metadata: {
            api_key: { required: true },
          },
        }),
      },
    ];
    const workflowConfiguration = {
      toolConfigurations: {
        'tool-1': {
          parameters: {
            api_key: 'test-key',
          },
        },
      },
      mcpInstanceConfigurations: {},
      generationConfig: {},
    };

    const result = hasValidToolConfiguration(
      'workflow-id',
      agents as any,
      toolInstances as any,
      workflowConfiguration,
    );
    expect(result).toBe(true);
  });

  it('returns false when required parameters are missing', () => {
    const agents = [
      {
        id: 'agent-1',
        workflow_id: 'workflow-id',
        tools_id: ['tool-1'],
      },
    ];
    const toolInstances = [
      {
        id: 'tool-1',
        tool_metadata: JSON.stringify({
          user_params_metadata: {
            api_key: { required: true },
          },
        }),
      },
    ];
    const workflowConfiguration = {
      toolConfigurations: {}, // Missing configuration
      mcpInstanceConfigurations: {},
      generationConfig: {},
    };

    const result = hasValidToolConfiguration(
      'workflow-id',
      agents as any,
      toolInstances as any,
      workflowConfiguration,
    );
    expect(result).toBe(false);
  });
});
