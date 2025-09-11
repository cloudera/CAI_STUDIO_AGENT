import React from 'react';
import { render, screen } from '@testing-library/react';

// jsdom doesn't implement matchMedia; AntD's responsiveObserver expects it.
// Provide a minimal shim for tests that need breakpoints.
if (typeof window !== 'undefined' && !window.matchMedia) {
  // @ts-ignore
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}
import Component from './WorkflowTemplateDetails';

// Mock queries and image hook
jest.mock('../../agents/agentApi', () => ({
  useListAgentTemplatesQuery: () => ({
    data: [
      {
        id: 'a-1',
        name: 'Agent One',
        goal: 'Goal 1',
        backstory: 'Backstory 1',
        tool_template_ids: ['t-1'],
      },
      {
        id: 'mgr-1',
        name: 'Manager',
        goal: 'Manage',
        backstory: 'Mgr backstory',
        tool_template_ids: [],
      },
    ],
  }),
}));

jest.mock('../../tasks/tasksApi', () => ({
  useListTaskTemplatesQuery: () => ({
    data: [{ id: 'task-1', description: 'Do thing', assigned_agent_template_id: 'a-1' }],
  }),
}));

jest.mock('../../tools/toolTemplatesApi', () => ({
  useListToolTemplatesQuery: () => ({
    data: [{ id: 't-1', name: 'Tool One', tool_image_uri: 'img://t1' }],
  }),
}));

jest.mock('@/app/lib/hooks/useAssetData', () => ({
  useImageAssetsData: () => ({ imageData: { 'img://t1': '/img/t1.png' } }),
}));

describe('WorkflowTemplateDetails', () => {
  const baseTemplate = {
    id: 'tpl-1',
    name: 'Template One',
    agent_template_ids: ['a-1'],
    manager_agent_template_id: 'mgr-1',
    task_template_ids: ['task-1'],
    use_default_manager: false,
  } as any;

  it('renders manager agent, agent cards, tool images and task cards', () => {
    render(<Component template={baseTemplate} />);

    // Manager agent title
    expect(screen.getByText('Manager Agent')).toBeInTheDocument();

    // Agent names (may appear more than once due to labels/tags) - assert at least one
    expect(screen.getAllByText('Agent One').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Manager')).toBeInTheDocument();

    // Task description
    expect(screen.getByText(/Do thing/)).toBeInTheDocument();

    // Tool image should be rendered (img alt text matches tool name)
    expect(screen.getByAltText('Tool One')).toBeInTheDocument();
  });
});
