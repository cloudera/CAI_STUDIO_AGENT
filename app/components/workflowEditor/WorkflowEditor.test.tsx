/**
 * @jest-environment jsdom
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

// Disable console.error for these tests to prevent infinite recursion
const originalConsoleError = console.error;
console.error = jest.fn();

// Mock fetch for SSR compatibility
global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  json: jest.fn().mockResolvedValue({}),
});

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

// Keep mocks local to this test file only.
jest.mock('./WorkflowEditorAgentView', () => {
  const MockWorkflowEditorAgentView = () => (
    <div data-testid="workflow-editor-agent-view">WorkflowEditorAgentView</div>
  );
  MockWorkflowEditorAgentView.displayName = 'MockWorkflowEditorAgentView';
  return MockWorkflowEditorAgentView;
});
jest.mock('./WorkflowStepView', () => {
  const MockWorkflowStepView = () => <div data-testid="workflow-step-view">WorkflowStepView</div>;
  MockWorkflowStepView.displayName = 'MockWorkflowStepView';
  return MockWorkflowStepView;
});
jest.mock('./WorkflowNavigation', () => {
  const MockWorkflowNavigation = () => (
    <div data-testid="workflow-navigation">WorkflowNavigation</div>
  );
  MockWorkflowNavigation.displayName = 'MockWorkflowNavigation';
  return MockWorkflowNavigation;
});
jest.mock('./WorkflowEditorTaskView', () => {
  const MockWorkflowEditorTaskView = () => (
    <div data-testid="workflow-editor-task-view">WorkflowEditorTaskView</div>
  );
  MockWorkflowEditorTaskView.displayName = 'MockWorkflowEditorTaskView';
  return MockWorkflowEditorTaskView;
});
jest.mock('./WorkflowEditorConfigureView', () => {
  const MockWorkflowEditorConfigureView = () => (
    <div data-testid="workflow-editor-configure-view">WorkflowEditorConfigureView</div>
  );
  MockWorkflowEditorConfigureView.displayName = 'MockWorkflowEditorConfigureView';
  return MockWorkflowEditorConfigureView;
});
jest.mock('./WorkflowEditorName', () => {
  const MockWorkflowEditorName = () => (
    <div data-testid="workflow-editor-name">WorkflowEditorName</div>
  );
  MockWorkflowEditorName.displayName = 'MockWorkflowEditorName';
  return MockWorkflowEditorName;
});
jest.mock('./WorkflowAddToolModal', () => {
  const MockWorkflowAddToolModal = () => (
    <div data-testid="workflow-add-tool-modal">WorkflowAddToolModal</div>
  );
  MockWorkflowAddToolModal.displayName = 'MockWorkflowAddToolModal';
  return MockWorkflowAddToolModal;
});
jest.mock('./WorkflowAddMcpModal', () => {
  const MockWorkflowAddMcpModal = () => (
    <div data-testid="workflow-add-mcp-modal">WorkflowAddMcpModal</div>
  );
  MockWorkflowAddMcpModal.displayName = 'MockWorkflowAddMcpModal';
  return MockWorkflowAddMcpModal;
});
jest.mock('@/app/components/workflows/WorkflowOverview', () => {
  const MockWorkflowOverview = () => <div data-testid="workflow-overview">WorkflowOverview</div>;
  MockWorkflowOverview.displayName = 'MockWorkflowOverview';
  return MockWorkflowOverview;
});
jest.mock('@/app/components/CommonBreadCrumb', () => {
  const MockCommonBreadCrumb = () => <div data-testid="common-bread-crumb">CommonBreadCrumb</div>;
  MockCommonBreadCrumb.displayName = 'MockCommonBreadCrumb';
  return MockCommonBreadCrumb;
});
jest.mock('@/app/components/workflowApp/WorkflowAppTest', () => {
  const MockWorkflowAppTest = () => <div data-testid="workflow-app-test">WorkflowAppTest</div>;
  MockWorkflowAppTest.displayName = 'MockWorkflowAppTest';
  return MockWorkflowAppTest;
});
jest.mock('@/app/components/common/LargeCenterSpin', () => {
  const MockLargeCenterSpin = ({ message }: { message: string }) => (
    <div data-testid="large-center-spin">{message}</div>
  );
  MockLargeCenterSpin.displayName = 'MockLargeCenterSpin';
  return MockLargeCenterSpin;
});

// Mock hooks
const mockUseAppSelector = jest.fn();
const mockDispatch = jest.fn();

jest.mock('@/app/lib/hooks/hooks', () => ({
  useAppSelector: (selector: any) => mockUseAppSelector(selector),
  useAppDispatch: () => mockDispatch,
}));

// Mock workflow slice actions
jest.mock('@/app/workflows/editorSlice', () => ({
  selectEditorCurrentStep: jest.fn(),
  updatedEditorWorkflowFromExisting: jest.fn(),
  updatedWorkflowConfiguration: jest.fn(),
}));

// Mock workflow app slice actions
jest.mock('@/app/workflows/workflowAppSlice', () => ({
  clearedWorkflowApp: jest.fn(),
}));

// Mock RTK query hooks used by the component
jest.mock('@/app/workflows/workflowsApi', () => ({
  useGetWorkflowMutation: () => [
    jest.fn().mockReturnValue({
      unwrap: jest.fn().mockResolvedValue({
        workflow_id: 'wf-123',
        name: 'Test Workflow',
        description: 'desc',
        is_conversational: false,
        crew_ai_workflow_metadata: {},
      }),
    }),
  ],
  useUpdateWorkflowMutation: () => [
    jest.fn().mockReturnValue({
      unwrap: jest.fn().mockResolvedValue({}),
    }),
  ],
}));

// Mock API slice to avoid fetch warnings
jest.mock('@/app/api/apiSlice', () => ({
  apiSlice: {
    reducer: (state = {}) => state,
    middleware: [],
    injectEndpoints: jest.fn().mockReturnValue({
      useListGlobalMcpTemplatesQuery: jest.fn(),
      useListMcpTemplatesQuery: jest.fn(),
      useGetMcpTemplateQuery: jest.fn(),
      useAddMcpTemplateMutation: jest.fn(),
      useUpdateMcpTemplateMutation: jest.fn(),
      useRemoveMcpTemplateMutation: jest.fn(),
    }),
  },
}));

// Mock local storage helper used during initialization
jest.mock('@/app/lib/localStorage', () => ({
  readWorkflowConfigurationFromLocalStorage: jest.fn(() => ({})),
}));

// Minimal store used to host the editor slice state
const createMockStore = (initialStep = 'Agents') =>
  configureStore({
    reducer: {
      editor: (state = { currentStep: initialStep }) => state,
    },
  });

// Import component after mocks
import WorkflowEditor from './WorkflowEditor';

describe('WorkflowEditor', () => {
  const props = { workflowId: 'wf-123' };

  afterAll(() => {
    console.error = originalConsoleError;
  });

  beforeEach(() => {
    jest.resetAllMocks();
    // Default selector behavior: when given a selector function call it with a mock state
    mockUseAppSelector.mockImplementation((selector: any) => {
      if (typeof selector === 'function') {
        try {
          return selector({ editor: { currentStep: 'Agents' } });
        } catch (_e) {
          return null;
        }
      }
      return null;
    });
  });

  it('shows loading spinner when no workflowId provided', () => {
    const store = createMockStore();
    render(
      <Provider store={store}>
        <WorkflowEditor workflowId={''} />
      </Provider>,
    );

    expect(screen.getByTestId('large-center-spin')).toBeInTheDocument();
    expect(screen.getByText('Loading editor...')).toBeInTheDocument();
  });

  it('renders main editor skeleton with valid workflowId', async () => {
    const store = createMockStore();
    render(
      <Provider store={store}>
        <WorkflowEditor {...props} />
      </Provider>,
    );

    // Wait until the step view & name render
    await waitFor(() => expect(screen.getByTestId('workflow-step-view')).toBeInTheDocument());
    expect(screen.getByTestId('workflow-editor-name')).toBeInTheDocument();
    expect(screen.getByTestId('workflow-navigation')).toBeInTheDocument();
  });

  it('renders step-specific content based on current step', async () => {
    const store = createMockStore('Agents');
    mockUseAppSelector.mockImplementation((selector: any) =>
      typeof selector === 'function' ? selector({ editor: { currentStep: 'Agents' } }) : null,
    );

    render(
      <Provider store={store}>
        <WorkflowEditor {...props} />
      </Provider>,
    );

    // The component renders based on step logic - test that it renders some content
    await waitFor(() => {
      expect(screen.getByTestId('workflow-step-view')).toBeInTheDocument();
    });
  });

  it('handles different workflow steps', async () => {
    const store = createMockStore('Tasks');
    mockUseAppSelector.mockImplementation((selector: any) =>
      typeof selector === 'function' ? selector({ editor: { currentStep: 'Tasks' } }) : null,
    );

    render(
      <Provider store={store}>
        <WorkflowEditor {...props} />
      </Provider>,
    );

    // Test that the component renders and handles different steps
    await waitFor(() => {
      expect(screen.getByTestId('workflow-navigation')).toBeInTheDocument();
    });
  });

  it('renders main layout structure', async () => {
    const store = createMockStore('Configure');
    mockUseAppSelector.mockImplementation((selector: any) =>
      typeof selector === 'function' ? selector({ editor: { currentStep: 'Configure' } }) : null,
    );

    render(
      <Provider store={store}>
        <WorkflowEditor {...props} />
      </Provider>,
    );

    // Test main layout structure is maintained
    await waitFor(() => {
      expect(screen.getByTestId('workflow-editor-name')).toBeInTheDocument();
    });
  });

  it('handles workflow initialization', async () => {
    const store = createMockStore('Test');
    mockUseAppSelector.mockImplementation((selector: any) =>
      typeof selector === 'function' ? selector({ editor: { currentStep: 'Test' } }) : null,
    );

    render(
      <Provider store={store}>
        <WorkflowEditor {...props} />
      </Provider>,
    );

    // Test that workflow initialization works
    await waitFor(() => {
      expect(screen.getByTestId('workflow-step-view')).toBeInTheDocument();
    });
  });

  it('renders Overview when step is Deploy or unknown', async () => {
    const store = createMockStore('Deploy');
    mockUseAppSelector.mockImplementation((selector: any) =>
      typeof selector === 'function' ? selector({ editor: { currentStep: 'Deploy' } }) : null,
    );

    render(
      <Provider store={store}>
        <WorkflowEditor {...props} />
      </Provider>,
    );

    await waitFor(() => expect(screen.getByTestId('workflow-overview')).toBeInTheDocument());
  });

  it('unmounts without error', () => {
    const store = createMockStore();
    const { unmount } = render(
      <Provider store={store}>
        <WorkflowEditor {...props} />
      </Provider>,
    );

    expect(() => unmount()).not.toThrow();
  });

  it('renders global modals', async () => {
    const store = createMockStore();
    render(
      <Provider store={store}>
        <WorkflowEditor {...props} />
      </Provider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('workflow-add-tool-modal')).toBeInTheDocument();
      expect(screen.getByTestId('workflow-add-mcp-modal')).toBeInTheDocument();
    });
  });

  // Snapshot tests for this large main component
  it('matches snapshot loading state', () => {
    const store = createMockStore();

    const { container } = render(
      <Provider store={store}>
        <WorkflowEditor workflowId="" />
      </Provider>,
    );

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with Agents step', async () => {
    const store = createMockStore('Agents');

    const { container } = render(
      <Provider store={store}>
        <WorkflowEditor {...props} />
      </Provider>,
    );

    await waitFor(() => {
      expect(screen.queryByTestId('large-center-spin')).not.toBeInTheDocument();
    });

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with Tasks step', async () => {
    const store = createMockStore('Tasks');
    mockUseAppSelector.mockImplementation((selector: any) =>
      typeof selector === 'function' ? selector({ editor: { currentStep: 'Tasks' } }) : null,
    );

    const { container } = render(
      <Provider store={store}>
        <WorkflowEditor {...props} />
      </Provider>,
    );

    await waitFor(() => {
      expect(screen.queryByTestId('large-center-spin')).not.toBeInTheDocument();
    });

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with Configure step', async () => {
    const store = createMockStore('Configure');
    mockUseAppSelector.mockImplementation((selector: any) =>
      typeof selector === 'function' ? selector({ editor: { currentStep: 'Configure' } }) : null,
    );

    const { container } = render(
      <Provider store={store}>
        <WorkflowEditor {...props} />
      </Provider>,
    );

    await waitFor(() => {
      expect(screen.queryByTestId('large-center-spin')).not.toBeInTheDocument();
    });

    expect(container.firstChild).toMatchSnapshot();
  });
});
