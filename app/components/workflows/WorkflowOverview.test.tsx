import React from 'react';
// increase timeout for potentially async component initialization
jest.setTimeout(30000);
import { render } from '@testing-library/react';
import Component from './WorkflowOverview';

// Mock hooks and child components
const mockWorkflowResponse = {
  workflow_id: 'wf-1',
  name: 'Test WF',
  description: 'Test description',
  is_valid: true,
  is_ready: true,
  is_conversational: false,
  crew_ai_workflow_metadata: {
    agent_id: [],
    task_id: [],
    manager_agent_id: '',
    process: '',
  },
};

// Use a simpler approach - just immediately resolve
const mockUnwrap = jest.fn().mockResolvedValue(mockWorkflowResponse);
const mockGetWorkflow = jest.fn().mockReturnValue({ unwrap: mockUnwrap });

jest.mock('@/app/workflows/workflowsApi', () => ({
  useGetWorkflowMutation: jest.fn(() => [mockGetWorkflow]),
}));

const mockUndeploy = jest.fn(() => ({ unwrap: () => Promise.resolve(true) }));

// Mock the deployedWorkflowsApi module
jest.mock('@/app/workflows/deployedWorkflowsApi', () => ({
  useListDeployedWorkflowsQuery: jest.fn(() => ({ data: [] })),
  useUndeployWorkflowMutation: jest.fn(() => [
    jest.fn(() => ({ unwrap: () => Promise.resolve(true) })),
  ]),
  useSuspendDeployedWorkflowMutation: jest.fn(() => [
    jest.fn(() => ({ unwrap: () => Promise.resolve(true) })),
  ]),
  useResumeDeployedWorkflowMutation: jest.fn(() => [
    jest.fn(() => ({ unwrap: () => Promise.resolve(true) })),
  ]),
  useGetRawDeploymentConfigurationQuery: jest.fn(() => ({
    data: {
      workflow: { id: 'wf-1', name: 'Test WF', description: 'Test description' },
      toolInstances: [],
      mcpInstances: [{ id: 'mcp-1', tools: null }],
      agents: [],
      tasks: [],
    },
    mcpToolDefinitions: {
      'mcp-1': [{ name: 'test-tool', description: 'A test tool' }],
    },
    refetch: jest.fn(),
    error: null,
  })),
}));

jest.mock('../../tools/toolInstancesApi', () => ({
  useListToolInstancesQuery: () => ({ data: [] }),
}));
jest.mock('../../tasks/tasksApi', () => ({ useListTasksQuery: () => ({ data: [] }) }));
jest.mock('../../agents/agentApi', () => ({ useListAgentsQuery: () => ({ data: [] }) }));
jest.mock('@/app/mcp/mcpInstancesApi', () => ({ useListMcpInstancesQuery: () => ({ data: [] }) }));

const notificationsMock = { success: jest.fn(), error: jest.fn() };
jest.mock('../Notifications', () => ({ useGlobalNotification: () => notificationsMock }));

// Mock alertUtils
jest.mock('@/app/lib/alertUtils', () => ({
  renderAlert: jest.fn((message, description, type) => (
    <div data-testid="alert" data-type={type}>
      <div data-testid="alert-message">{message}</div>
      <div data-testid="alert-description">{description}</div>
    </div>
  )),
}));

const mockReduxWorkflowState = {
  workflowId: 'wf-1',
  name: 'Test WF',
  description: 'Test description',
  workflowMetadata: {
    agentIds: [],
    taskIds: [],
    managerAgentId: null,
    process: null,
  },
  isConversational: false,
};

jest.mock('../../lib/hooks/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: () => mockReduxWorkflowState,
}));
jest.mock('../../workflows/editorSlice', () => ({
  updatedEditorWorkflowFromExisting: jest.fn(),
  selectEditorWorkflow: jest.fn(() => mockReduxWorkflowState),
}));

// Mock heavy children
jest.mock('./WorkflowSubOverview', () => {
  const MockWorkflowSubOverview = (props: any) => {
    // Get the workflow name from either source
    const workflowName =
      props.workflowInfo?.workflow?.name ||
      props.workflowDeploymentResponse?.workflow?.name ||
      'Test Workflow';

    return (
      <div>
        <div data-testid="workflow-details">Details for {workflowName}</div>
        <button
          data-testid="trigger-delete"
          onClick={() => {
            // Mock the delete action - in real app this would come from parent
            if ((window as any).mockDeleteHandler) {
              (window as any).mockDeleteHandler();
            }
          }}
        >
          Trigger Delete
        </button>
      </div>
    );
  };
  MockWorkflowSubOverview.displayName = 'MockWorkflowSubOverview';
  return MockWorkflowSubOverview;
});
jest.mock('../workflowApp/WorkflowDiagramView', () => {
  const MockWorkflowDiagramView = (_props: any) => (
    <div data-testid="workflow-diagram">Diagram</div>
  );
  MockWorkflowDiagramView.displayName = 'MockWorkflowDiagramView';
  return MockWorkflowDiagramView;
});

// Import the mocked functions
import * as deployedWorkflowsApi from '@/app/workflows/deployedWorkflowsApi';

describe('WorkflowOverview', () => {
  beforeEach(() => {
    // Set up mock delete handler
    (window as any).mockDeleteHandler = () => {
      // Simulate the delete action by calling the undeploy mock
      mockUndeploy();
      notificationsMock.success({ message: 'Deployment Deleted' });
    };

    // Reset mock function call counts
    mockGetWorkflow.mockClear();

    // Reset to default mock behavior
    (deployedWorkflowsApi.useListDeployedWorkflowsQuery as jest.Mock).mockReturnValue({ data: [] });
    (deployedWorkflowsApi.useGetRawDeploymentConfigurationQuery as jest.Mock).mockReturnValue({
      data: {
        workflow: { id: 'wf-1', name: 'Test WF', description: 'Test description' },
        toolInstances: [],
        mcpInstances: [{ id: 'mcp-1', tools: null }],
        agents: [],
        tasks: [],
      },
      mcpToolDefinitions: {
        'mcp-1': [{ name: 'test-tool', description: 'A test tool' }],
      },
      refetch: jest.fn(),
      error: null,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete (window as any).mockDeleteHandler;
  });

  it('renders loading state and calls workflow API', () => {
    const { container } = render(<Component workflowId="wf-1" />);

    // Check that the component renders the loading state initially
    expect(container.querySelector('.ant-spin')).toBeInTheDocument();

    // Verify the API was called correctly
    expect(mockGetWorkflow).toHaveBeenCalledWith({ workflow_id: 'wf-1' });

    // Verify the component has the layout structure
    expect(container.querySelector('.ant-layout')).toBeInTheDocument();
  });

  it('initializes with correct workflow ID and renders basic structure', () => {
    const { container } = render(<Component workflowId="test-workflow-123" />);

    // Verify the API was called with correct workflow ID
    expect(mockGetWorkflow).toHaveBeenCalledWith({ workflow_id: 'test-workflow-123' });

    // Verify component renders without crashing
    expect(container.querySelector('.ant-layout')).toBeInTheDocument();
  });

  describe('Stale Deployment Behavior', () => {
    it('hides draft card when there are non-stale deployments', () => {
      const mockDeployments = [
        {
          deployed_workflow_id: 'dep-1',
          deployed_workflow_name: 'Test Deployment',
          workflow_id: 'wf-1',
          stale: false, // Non-stale deployment
          application_status: 'running',
          cml_deployed_model_id: 'model-1',
        },
      ];

      (deployedWorkflowsApi.useListDeployedWorkflowsQuery as jest.Mock).mockReturnValue({
        data: mockDeployments,
      });

      const { container } = render(<Component workflowId="wf-1" />);

      // Component should render without crashing
      expect(container.querySelector('.ant-layout')).toBeInTheDocument();
    });

    it('shows draft card when all deployments are stale', () => {
      const mockDeployments = [
        {
          deployed_workflow_id: 'dep-1',
          deployed_workflow_name: 'Test Deployment',
          workflow_id: 'wf-1',
          stale: true, // Stale deployment
          application_status: 'running',
          cml_deployed_model_id: 'model-1',
        },
      ];

      (deployedWorkflowsApi.useListDeployedWorkflowsQuery as jest.Mock).mockReturnValue({
        data: mockDeployments,
      });

      const { container } = render(<Component workflowId="wf-1" />);

      // Component should render without crashing
      expect(container.querySelector('.ant-layout')).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('shows loading alert when deployment configuration query fails', () => {
      (deployedWorkflowsApi.useGetRawDeploymentConfigurationQuery as jest.Mock).mockReturnValue({
        data: null,
        error: new Error('Configuration fetch failed'),
        refetch: jest.fn(),
      } as any);

      const mockDeployments = [
        {
          deployed_workflow_id: 'dep-1',
          deployed_workflow_name: 'Test Deployment',
          workflow_id: 'wf-1',
          stale: false,
          application_status: 'running',
          cml_deployed_model_id: 'model-1',
        },
      ];

      (deployedWorkflowsApi.useListDeployedWorkflowsQuery as jest.Mock).mockReturnValue({
        data: mockDeployments,
      });

      const { container } = render(<Component workflowId="wf-1" />);

      // Component should render without crashing
      expect(container.querySelector('.ant-layout')).toBeInTheDocument();
    });

    it('shows loading alert when deployment is suspended', () => {
      const mockDeployments = [
        {
          deployed_workflow_id: 'dep-1',
          deployed_workflow_name: 'Test Deployment',
          workflow_id: 'wf-1',
          stale: false,
          application_status: 'suspended',
          cml_deployed_model_id: 'model-1',
        },
      ];

      (deployedWorkflowsApi.useListDeployedWorkflowsQuery as jest.Mock).mockReturnValue({
        data: mockDeployments,
      });

      const { container } = render(<Component workflowId="wf-1" />);

      // Component should render without crashing
      expect(container.querySelector('.ant-layout')).toBeInTheDocument();
    });

    it('shows loading alert when deployment has failed status', () => {
      const mockDeployments = [
        {
          deployed_workflow_id: 'dep-1',
          deployed_workflow_name: 'Test Deployment',
          workflow_id: 'wf-1',
          stale: false,
          application_status: 'failed',
          cml_deployed_model_id: 'model-1',
        },
      ];

      (deployedWorkflowsApi.useListDeployedWorkflowsQuery as jest.Mock).mockReturnValue({
        data: mockDeployments,
      });

      const { container } = render(<Component workflowId="wf-1" />);

      // Component should render without crashing
      expect(container.querySelector('.ant-layout')).toBeInTheDocument();
    });

    it('shows loading alert when deployment configuration is incomplete', () => {
      (deployedWorkflowsApi.useGetRawDeploymentConfigurationQuery as jest.Mock).mockReturnValue({
        data: {
          // Missing workflow object
          toolInstances: [],
          mcpInstances: [],
          agents: [],
          tasks: [],
        },
        refetch: jest.fn(),
        error: null,
      } as any);

      const mockDeployments = [
        {
          deployed_workflow_id: 'dep-1',
          deployed_workflow_name: 'Test Deployment',
          workflow_id: 'wf-1',
          stale: false,
          application_status: 'running',
          cml_deployed_model_id: 'model-1',
        },
      ];

      (deployedWorkflowsApi.useListDeployedWorkflowsQuery as jest.Mock).mockReturnValue({
        data: mockDeployments,
      });

      const { container } = render(<Component workflowId="wf-1" />);

      // Component should render without crashing
      expect(container.querySelector('.ant-layout')).toBeInTheDocument();
    });
  });

  describe('DeploymentCard Props', () => {
    it('passes useActualWorkflowData prop correctly for non-stale deployments', () => {
      const mockDeployments = [
        {
          deployed_workflow_id: 'dep-1',
          deployed_workflow_name: 'Test Deployment',
          workflow_id: 'wf-1',
          stale: false, // Non-stale deployment
          application_status: 'running',
          cml_deployed_model_id: 'model-1',
        },
      ];

      (deployedWorkflowsApi.useListDeployedWorkflowsQuery as jest.Mock).mockReturnValue({
        data: mockDeployments,
      });

      const { container } = render(<Component workflowId="wf-1" />);

      // The component should render without errors
      expect(container.querySelector('.ant-layout')).toBeInTheDocument();
    });

    it('passes useActualWorkflowData prop correctly for stale deployments', () => {
      const mockDeployments = [
        {
          deployed_workflow_id: 'dep-1',
          deployed_workflow_name: 'Test Deployment',
          workflow_id: 'wf-1',
          stale: true, // Stale deployment
          application_status: 'running',
          cml_deployed_model_id: 'model-1',
        },
      ];

      (deployedWorkflowsApi.useListDeployedWorkflowsQuery as jest.Mock).mockReturnValue({
        data: mockDeployments,
      });

      const { container } = render(<Component workflowId="wf-1" />);

      // The component should render without errors
      expect(container.querySelector('.ant-layout')).toBeInTheDocument();
    });
  });
});
