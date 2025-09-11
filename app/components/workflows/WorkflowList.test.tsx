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

// Mock child components to keep tests focused
jest.mock('./WorkflowListItem', () => {
  const MockWorkflowListItem = (props: any) => (
    <div data-testid={`workflow-item-${props.workflow.workflow_id}`}>{props.workflow.name}</div>
  );
  MockWorkflowListItem.displayName = 'MockWorkflowListItem';
  return MockWorkflowListItem;
});

// Mock RTK hook used by ImportWorkflowTemplateModal inside WorkflowList
jest.mock('@/app/workflows/workflowsApi', () => ({
  useImportWorkflowTemplateMutation: jest.fn(() => [jest.fn(), { isLoading: false }]),
}));

import WorkflowList from './WorkflowList';

describe('WorkflowList', () => {
  it('exports the component', () => {
    expect(WorkflowList).toBeDefined();
  });

  it('shows empty state and calls handleGetStarted', () => {
    const handleGetStarted = jest.fn();
    render(
      <WorkflowList
        workflows={[]}
        deployedWorkflows={[]}
        workflowTemplates={[]}
        editWorkflow={jest.fn()}
        deleteWorkflow={jest.fn()}
        deleteWorkflowTemplate={jest.fn()}
        testWorkflow={jest.fn()}
        onDeploy={jest.fn()}
        onDeleteDeployedWorkflow={jest.fn()}
        onCreateWorkflow={jest.fn()}
        handleGetStarted={handleGetStarted}
      />,
    );

    expect(screen.getByText(/No workflows here yet/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Create Workflow/i }));
    expect(handleGetStarted).toHaveBeenCalledTimes(1);
  });

  it('renders deployed and draft workflows', () => {
    const workflows = [
      { workflow_id: 'w1', name: 'Workflow One' },
      { workflow_id: 'w2', name: 'Workflow Two' },
    ];
    const deployedWorkflows = [
      { deployed_workflow_id: 'd1', workflow_id: 'w1', workflow_name: 'Workflow One' },
    ];

    render(
      <WorkflowList
        workflows={workflows as any}
        deployedWorkflows={deployedWorkflows as any}
        workflowTemplates={[]}
        editWorkflow={jest.fn()}
        deleteWorkflow={jest.fn()}
        deleteWorkflowTemplate={jest.fn()}
        testWorkflow={jest.fn()}
        onDeploy={jest.fn()}
        onDeleteDeployedWorkflow={jest.fn()}
        onCreateWorkflow={jest.fn()}
        handleGetStarted={jest.fn()}
      />,
    );

    // Deployed workflow should render via mocked WorkflowListItem
    expect(screen.getByTestId('workflow-item-w1')).toBeInTheDocument();
    // Draft workflow that isn't deployed should render too
    expect(screen.getByTestId('workflow-item-w2')).toBeInTheDocument();
  });
});
