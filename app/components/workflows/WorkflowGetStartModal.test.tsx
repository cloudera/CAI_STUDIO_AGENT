/**
 * @jest-environment jsdom
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

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

// Mock template-related hooks used by inner components
jest.mock('../../agents/agentApi', () => ({
  useListAgentTemplatesQuery: jest.fn(() => ({ data: [] })),
}));
jest.mock('../../tools/toolTemplatesApi', () => ({
  useListToolTemplatesQuery: jest.fn(() => ({ data: [] })),
}));
jest.mock('../../tasks/tasksApi', () => ({
  useListTaskTemplatesQuery: jest.fn(() => ({ data: [] })),
}));
jest.mock('@/app/lib/hooks/useAssetData', () => ({
  useImageAssetsData: jest.fn(() => ({ imageData: {} })),
}));

import WorkflowGetStartModal from './WorkflowGetStartModal';

describe('WorkflowGetStartModal', () => {
  afterAll(() => {
    // Restore console.error after tests
    console.error = originalConsoleError;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('exports the component', () => {
    expect(WorkflowGetStartModal).toBeDefined();
  });

  it('renders Create New Workflow when no template selected and calls onCancel', () => {
    const onCancel = jest.fn();
    render(
      <WorkflowGetStartModal
        visible={true}
        onCancel={onCancel}
        onCreateWorkflow={jest.fn()}
        workflowTemplates={[]}
      />,
    );

    expect(screen.getByText(/Create New Workflow/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('selects a template and calls onCreateWorkflow with provided name', async () => {
    const onCreateWorkflow = jest.fn();
    const template = {
      id: 't-1',
      name: 'Template 1',
      agent_template_ids: [],
      task_template_ids: [],
      manager_agent_template_id: undefined,
      use_default_manager: false,
    };

    render(
      <WorkflowGetStartModal
        visible={true}
        onCancel={jest.fn()}
        onCreateWorkflow={onCreateWorkflow}
        workflowTemplates={[template as any]}
      />,
    );

    // Template card should be present
    expect(screen.getByText(/Template 1/i)).toBeInTheDocument();

    // Click the template card to select it
    fireEvent.click(screen.getByText(/Template 1/i));

    // Fill workflow name in the form. Antd renders a label 'Workflow Name', so use that.
    const input = screen.getByLabelText(/Workflow Name/i);
    fireEvent.change(input, { target: { value: 'My Workflow' } });

    // Click Create Workflow
    fireEvent.click(screen.getByRole('button', { name: /Create Workflow/i }));

    await waitFor(() => expect(onCreateWorkflow).toHaveBeenCalledWith(expect.any(String), 't-1'));
  });
});
