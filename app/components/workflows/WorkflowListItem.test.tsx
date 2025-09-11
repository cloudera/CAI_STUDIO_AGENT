import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Component from './WorkflowListItem';

// Mocks for next/router
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Mock RTK Query mutation hooks used by the component
jest.mock('../../workflows/workflowsApi', () => ({
  useAddWorkflowMutation: () => [
    jest.fn(() => ({ unwrap: () => Promise.resolve('new-workflow-id') })),
  ],
  useAddWorkflowTemplateMutation: () => [jest.fn()],
  useExportWorkflowTemplateMutation: () => [jest.fn()],
}));

// Mock notifications
jest.mock('../Notifications', () => ({
  useGlobalNotification: () => ({ info: jest.fn(), success: jest.fn(), error: jest.fn() }),
}));

// Mock dispatch hook
jest.mock('../../lib/hooks/hooks', () => ({
  useAppDispatch: () => jest.fn(),
}));

// Mock agents and asset hooks
jest.mock('@/app/agents/agentApi', () => ({
  useListAgentsQuery: () => ({ data: [] }),
  useListAgentTemplatesQuery: () => ({ data: [] }),
}));
jest.mock('@/app/lib/hooks/useAssetData', () => ({
  useImageAssetsData: () => ({ imageData: {} }),
}));

// Mock file download util
jest.mock('../../lib/fileDownload', () => ({ downloadAndSaveFile: jest.fn() }));

describe('WorkflowListItem', () => {
  const baseWorkflow = {
    workflow_id: 'wf-123',
    name: 'My Test Workflow',
  } as any;

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('matches snapshot for Draft card', () => {
    const editSpy = jest.fn();
    const deleteSpy = jest.fn();
    const { container } = render(
      <Component
        workflow={baseWorkflow}
        sectionType="Draft"
        editWorkflow={editSpy}
        deleteWorkflow={deleteSpy}
        deployments={[]}
      />,
    );

    expect(container).toMatchSnapshot();
  });

  it('clicking the card name navigates to the workflow view', () => {
    render(<Component workflow={baseWorkflow} sectionType="Draft" deployments={[]} />);

    const title = screen.getByText('My Test Workflow');
    fireEvent.click(title);

    expect(mockPush).toHaveBeenCalledWith('/workflows/view/wf-123');
  });

  it('calls editWorkflow and deleteWorkflow when corresponding buttons are clicked', () => {
    const editSpy = jest.fn();
    const deleteSpy = jest.fn();

    const { container } = render(
      <Component
        workflow={baseWorkflow}
        sectionType="Draft"
        editWorkflow={editSpy}
        deleteWorkflow={deleteSpy}
        deployments={[]}
      />,
    );

    const buttons = container.querySelectorAll('button');
    // Basic sanity: ensure buttons rendered
    expect(buttons.length).toBeGreaterThan(0);

    // For Draft section the first action button is Edit, second is Delete
    fireEvent.click(buttons[0]);
    expect(editSpy).toHaveBeenCalledWith('wf-123');

    // Delete button click
    // Depending on DOM structure the index may be 1 or 2; try to find a button that triggers deleteSpy
    // We'll click subsequent buttons until deleteSpy is called or run out
    let clicked = false;
    for (let i = 1; i < buttons.length; i++) {
      fireEvent.click(buttons[i]);
      if (deleteSpy.mock.calls.length > 0) {
        clicked = true;
        break;
      }
    }

    expect(clicked).toBe(true);
    expect(deleteSpy).toHaveBeenCalled();
  });
});
