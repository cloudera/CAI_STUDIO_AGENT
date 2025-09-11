import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock matchMedia used by antd
beforeAll(() => {
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
});

// Mock RTK Query hooks used inside the component
jest.mock('../../agents/agentApi', () => ({
  useListAgentsQuery: jest.fn(() => ({ data: [], isLoading: false })),
}));
jest.mock('../../tasks/tasksApi', () => ({
  useListTasksQuery: jest.fn(() => ({ data: [], isLoading: false })),
}));
jest.mock('../../tools/toolInstancesApi', () => ({
  useListToolInstancesQuery: jest.fn(() => ({ data: [], isLoading: false })),
}));
jest.mock('@/app/mcp/mcpInstancesApi', () => ({
  useListMcpInstancesQuery: jest.fn(() => ({ data: [], isLoading: false })),
}));
jest.mock('@/app/lib/hooks/useAssetData', () => ({
  useImageAssetsData: jest.fn(() => ({ imageData: {} })),
}));
jest.mock('../../models/modelsApi', () => ({
  useGetDefaultModelQuery: jest.fn(() => ({ data: undefined })),
}));
jest.mock('../../workflows/editorSlice', () => ({
  selectEditorWorkflowManagerAgentId: jest.fn(() => undefined),
  selectEditorWorkflowAgentIds: jest.fn(() => []),
  selectEditorWorkflowTaskIds: jest.fn(() => []),
  selectEditorWorkflowProcess: jest.fn(() => ''),
  selectWorkflowConfiguration: jest.fn(() => ({})),
}));

// Mock next/navigation usePathname
jest.mock('next/navigation', () => ({ usePathname: jest.fn(() => '/workflows') }));

// Mock useAppSelector to avoid react-redux Provider
jest.mock('../../lib/hooks/hooks', () => ({ useAppSelector: jest.fn(() => undefined) }));
// Mock global notification hook used inside the component
jest.mock('../Notifications', () => ({
  useGlobalNotification: jest.fn(() => ({ error: jest.fn(), success: jest.fn() })),
}));

import WorkflowDetails from './WorkflowDetails';

describe('WorkflowDetails', () => {
  it('exports the component', () => {
    expect(WorkflowDetails).toBeDefined();
  });

  it('renders headings for Agents and Tasks when empty', () => {
    render(
      <WorkflowDetails
        workflowId="w-1"
        workflow={{
          workflow_id: 'w-1',
          crew_ai_workflow_metadata: { agent_id: [], task_id: [], process: '' },
        }}
        deployedWorkflows={[]}
        onDeleteDeployedWorkflow={jest.fn()}
      />,
    );

    expect(screen.getByText(/Agents/i)).toBeInTheDocument();
    expect(screen.getByText(/Tasks/i)).toBeInTheDocument();
  });

  it('renders deployment card and calls onDeleteDeployedWorkflow when confirm is clicked', () => {
    const onDeleteDeployedWorkflow = jest.fn();
    const deployment = {
      deployed_workflow_id: 'd-1',
      deployed_workflow_name: 'My Deployment',
      workflow_id: 'w-1',
      application_status: 'running',
    };

    render(
      <WorkflowDetails
        workflowId="w-1"
        workflow={{
          workflow_id: 'w-1',
          crew_ai_workflow_metadata: { agent_id: [], task_id: [], process: '' },
        }}
        deployedWorkflows={[deployment] as any}
        onDeleteDeployedWorkflow={onDeleteDeployedWorkflow}
      />,
    );

    // The deployment title should be present
    expect(screen.getByText(/My Deployment/i)).toBeInTheDocument();

    // Click the delete button inside the deployment card then confirm the Popconfirm
    const deploymentCard = screen.getByText(/My Deployment/i).closest('.ant-layout');
    expect(deploymentCard).toBeTruthy();
    const deleteTrigger = deploymentCard!.querySelector('button[aria-label], button.ant-btn-link');
    if (deleteTrigger) {
      fireEvent.click(deleteTrigger);
      // find confirm button by role and name 'Yes' (antd Popconfirm uses button text)
      const confirmButton =
        screen.queryByText(/Yes/i) || screen.queryByRole('button', { name: /Yes/i });
      if (confirmButton) {
        fireEvent.click(confirmButton);
        expect(onDeleteDeployedWorkflow).toHaveBeenCalledTimes(1);
      }
    }
  });
});
