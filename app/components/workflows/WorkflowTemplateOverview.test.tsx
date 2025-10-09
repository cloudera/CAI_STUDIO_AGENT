import React from 'react';
import { render, screen } from '@testing-library/react';
import Component from './WorkflowTemplateOverview';

// Mock the query hooks
jest.mock('@/app/workflows/workflowsApi', () => ({
  useGetWorkflowTemplateByIdQuery: (id: string) => ({
    data: id === 'tpl-1' ? { id: 'tpl-1', name: 'Template 1' } : null,
    isLoading: id === 'loading',
    error: id === 'err' ? { message: 'oops' } : null,
  }),
}));

jest.mock('../../agents/agentApi', () => ({
  useListAgentTemplatesQuery: () => ({ data: [] }),
}));
jest.mock('../../tasks/tasksApi', () => ({
  useListTaskTemplatesQuery: () => ({ data: [] }),
}));
jest.mock('../../tools/toolTemplatesApi', () => ({
  useListToolTemplatesQuery: () => ({ data: [] }),
}));
jest.mock('../../mcp/mcpTemplatesApi', () => ({
  useListMcpTemplatesQuery: () => ({ data: [] }),
}));

// Mock heavy children
jest.mock('./WorkflowSubOverview', () => {
  const MockWorkflowSubOverview = (props: any) => (
    <div data-testid="template-details">
      Details for {props.workflowTemplateInfo?.workflowTemplate?.name}
    </div>
  );
  MockWorkflowSubOverview.displayName = 'MockWorkflowSubOverview';
  return MockWorkflowSubOverview;
});
jest.mock('../workflowApp/WorkflowTemplateDiagramView', () => {
  const MockWorkflowTemplateDiagramView = (props: any) => (
    <div data-testid="template-diagram">Diagram for {props.template?.name}</div>
  );
  MockWorkflowTemplateDiagramView.displayName = 'MockWorkflowTemplateDiagramView';
  return MockWorkflowTemplateDiagramView;
});

describe('WorkflowTemplateOverview', () => {
  it('renders loading state', () => {
    const { container } = render(<Component workflowTemplateId="loading" />);
    // AntD Spin sets aria-busy on its container
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
  });

  it('renders error state', () => {
    render(<Component workflowTemplateId="err" />);
    expect(screen.getByText(/oops/)).toBeInTheDocument();
  });

  it('renders details and diagram when data is present', () => {
    render(<Component workflowTemplateId="tpl-1" />);
    expect(screen.getByTestId('template-details')).toBeInTheDocument();
    expect(screen.getByTestId('template-diagram')).toBeInTheDocument();
  });
});
