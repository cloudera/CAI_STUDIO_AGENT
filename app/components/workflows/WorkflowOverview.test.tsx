import React from 'react';
// increase timeout for potentially async component initialization
jest.setTimeout(20000);
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Component from './WorkflowOverview';

// Mock hooks and child components
const mockGetWorkflow = jest.fn(() => ({
  unwrap: () => Promise.resolve({ workflow_id: 'wf-1', name: 'Test WF' }),
}));
jest.mock('@/app/workflows/workflowsApi', () => ({
  useGetWorkflowMutation: () => [mockGetWorkflow],
}));

const mockUndeploy = jest.fn(() => ({ unwrap: () => Promise.resolve(true) }));
const mockSuspend = jest.fn(() => ({ unwrap: () => Promise.resolve(true) }));
const mockResume = jest.fn(() => ({ unwrap: () => Promise.resolve(true) }));
jest.mock('@/app/workflows/deployedWorkflowsApi', () => ({
  useListDeployedWorkflowsQuery: () => ({ data: [] }),
  useUndeployWorkflowMutation: () => [mockUndeploy],
  useSuspendDeployedWorkflowMutation: () => [mockSuspend],
  useResumeDeployedWorkflowMutation: () => [mockResume],
}));

jest.mock('../../tools/toolInstancesApi', () => ({
  useListToolInstancesQuery: () => ({ data: [] }),
}));
jest.mock('../../tasks/tasksApi', () => ({ useListTasksQuery: () => ({ data: [] }) }));
jest.mock('../../agents/agentApi', () => ({ useListAgentsQuery: () => ({ data: [] }) }));
jest.mock('@/app/mcp/mcpInstancesApi', () => ({ useListMcpInstancesQuery: () => ({ data: [] }) }));

const notificationsMock = { success: jest.fn(), error: jest.fn() };
jest.mock('../Notifications', () => ({ useGlobalNotification: () => notificationsMock }));

jest.mock('../../lib/hooks/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: () => ({ workflowId: 'wf-1' }),
}));
jest.mock('../../workflows/editorSlice', () => ({
  updatedEditorWorkflowFromExisting: jest.fn(),
  selectEditorWorkflow: jest.fn(),
}));

// Mock heavy children
jest.mock('./WorkflowDetails', () => {
  const MockWorkflowDetails = (props: any) => (
    <div>
      <div data-testid="workflow-details">Details for {props.workflow?.name}</div>
      <button
        data-testid="trigger-delete"
        onClick={() =>
          props.onDeleteDeployedWorkflow?.({
            deployed_workflow_id: 'd-1',
            deployed_workflow_name: 'D1',
          })
        }
      >
        Trigger Delete
      </button>
    </div>
  );
  MockWorkflowDetails.displayName = 'MockWorkflowDetails';
  return MockWorkflowDetails;
});
jest.mock('../workflowApp/WorkflowDiagramView', () => {
  const MockWorkflowDiagramView = (_props: any) => (
    <div data-testid="workflow-diagram">Diagram</div>
  );
  MockWorkflowDiagramView.displayName = 'MockWorkflowDiagramView';
  return MockWorkflowDiagramView;
});

describe('WorkflowOverview', () => {
  afterEach(() => jest.clearAllMocks());

  it('renders loading state then workflow details and diagram', async () => {
    render(<Component workflowId="wf-1" />);

    expect(
      await screen.findByTestId('workflow-details', {}, { timeout: 15000 }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('workflow-diagram')).toBeInTheDocument();
  });

  it('handleDeleteDeployedWorkflow calls undeploy and shows notification on success', async () => {
    // Render component so hooks initialize
    render(<Component workflowId="wf-1" />);

    // Wait until the workflow details rendered
    await screen.findByTestId('workflow-details', {}, { timeout: 10000 });

    // Click the button in the mocked WorkflowDetails that triggers the handler
    const btn = screen.getByTestId('trigger-delete');
    fireEvent.click(btn);

    // Wait for the async undeploy and notification to run
    await waitFor(() => expect(mockUndeploy).toHaveBeenCalled(), { timeout: 10000 });
    await waitFor(() => expect(notificationsMock.success).toHaveBeenCalled(), { timeout: 10000 });
  });
});
