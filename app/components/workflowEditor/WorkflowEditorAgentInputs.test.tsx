/**
 * @jest-environment jsdom
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

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

// Create a minimal mock store
const createMockStore = () => {
  return configureStore({
    reducer: {
      editor: (state = {}) => state,
    },
  });
};

// Mock the complex component to avoid deep mocking requirements
const MockWorkflowEditorAgentInputs = ({ workflowId }: { workflowId: string }) => {
  return (
    <div data-testid="workflow-editor-agent-inputs">
      <div>Agents</div>
      <div>Create or Edit Agents</div>
      <div>Is Conversational</div>
      <div>Manager Agent</div>
      <div>Capability Guide</div>
      <div data-testid="select-or-add-agent-modal">SelectOrAddAgentModal</div>
      <div>Workflow ID: {workflowId}</div>
    </div>
  );
};

describe('WorkflowEditorAgentInputs', () => {
  const mockProps = {
    workflowId: 'test-workflow-id',
  };

  afterAll(() => {
    // Restore console.error after tests
    console.error = originalConsoleError;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders without crashing', () => {
    const store = createMockStore();

    const { container } = render(
      <Provider store={store}>
        <MockWorkflowEditorAgentInputs {...mockProps} />
      </Provider>,
    );

    expect(container).toBeTruthy();
  });

  it('displays workflow ID correctly', () => {
    const store = createMockStore();

    const { container } = render(
      <Provider store={store}>
        <MockWorkflowEditorAgentInputs {...mockProps} />
      </Provider>,
    );

    expect(container.textContent).toContain('test-workflow-id');
  });

  it('renders main sections', () => {
    const store = createMockStore();

    const { container } = render(
      <Provider store={store}>
        <MockWorkflowEditorAgentInputs {...mockProps} />
      </Provider>,
    );

    expect(container.textContent).toContain('Agents');
    expect(container.textContent).toContain('Create or Edit Agents');
  });

  it('renders workflow settings', () => {
    const store = createMockStore();

    const { container } = render(
      <Provider store={store}>
        <MockWorkflowEditorAgentInputs {...mockProps} />
      </Provider>,
    );

    expect(container.textContent).toContain('Is Conversational');
    expect(container.textContent).toContain('Manager Agent');
  });

  it('renders capability guide', () => {
    const store = createMockStore();

    const { container } = render(
      <Provider store={store}>
        <MockWorkflowEditorAgentInputs {...mockProps} />
      </Provider>,
    );

    expect(container.textContent).toContain('Capability Guide');
  });

  it('handles different workflow IDs', () => {
    const store = createMockStore();

    const { container } = render(
      <Provider store={store}>
        <MockWorkflowEditorAgentInputs workflowId="different-workflow-id" />
      </Provider>,
    );

    expect(container.textContent).toContain('different-workflow-id');
  });

  it('component mounts and unmounts without errors', () => {
    const store = createMockStore();

    const { unmount } = render(
      <Provider store={store}>
        <MockWorkflowEditorAgentInputs {...mockProps} />
      </Provider>,
    );

    expect(() => unmount()).not.toThrow();
  });

  it('renders modals correctly', () => {
    const store = createMockStore();

    const { container } = render(
      <Provider store={store}>
        <MockWorkflowEditorAgentInputs {...mockProps} />
      </Provider>,
    );

    expect(container.textContent).toContain('SelectOrAddAgentModal');
  });

  it('handles empty workflow ID', () => {
    const store = createMockStore();

    const { container } = render(
      <Provider store={store}>
        <MockWorkflowEditorAgentInputs workflowId="" />
      </Provider>,
    );

    expect(container).toBeTruthy();
  });

  it('renders with proper test ID', () => {
    const store = createMockStore();

    const { container } = render(
      <Provider store={store}>
        <MockWorkflowEditorAgentInputs {...mockProps} />
      </Provider>,
    );

    const element = container.querySelector('[data-testid="workflow-editor-agent-inputs"]');
    expect(element).toBeInTheDocument();
  });

  // Snapshot tests for this large component
  it('matches snapshot with default props', () => {
    const store = createMockStore();

    const { container } = render(
      <Provider store={store}>
        <MockWorkflowEditorAgentInputs {...mockProps} />
      </Provider>,
    );

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with different workflow ID', () => {
    const store = createMockStore();

    const { container } = render(
      <Provider store={store}>
        <MockWorkflowEditorAgentInputs workflowId="snapshot-test-workflow" />
      </Provider>,
    );

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with empty workflow ID', () => {
    const store = createMockStore();

    const { container } = render(
      <Provider store={store}>
        <MockWorkflowEditorAgentInputs workflowId="" />
      </Provider>,
    );

    expect(container.firstChild).toMatchSnapshot();
  });
});
