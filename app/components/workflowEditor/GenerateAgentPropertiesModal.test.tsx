/**
 * @jest-environment jsdom
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import GenerateAgentPropertiesModal from './GenerateAgentPropertiesModal';
import { Model, ToolInstance } from '@/studio/proto/agent_studio';

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

// Mock the hooks with minimal implementations
jest.mock('../../lib/hooks/hooks', () => ({
  useAppSelector: jest.fn(() => null),
}));

jest.mock('react-redux', () => ({
  ...jest.requireActual('react-redux'),
  useSelector: jest.fn(() => null),
}));

jest.mock('../../models/modelsApi', () => ({
  useTestModelMutation: () => [jest.fn()],
}));

jest.mock('../../workflows/editorSlice', () => ({}));

jest.mock('@/app/lib/constants', () => ({
  GENERATE_AGENT_BACKGROUND_PROMPT: jest.fn((description) => `Generate agent for: ${description}`),
}));

// Create a mock store
const createMockStore = () => {
  return configureStore({
    reducer: {
      editor: (state = {}) => state,
    },
  });
};

describe('GenerateAgentPropertiesModal', () => {
  const mockProps = {
    open: false,
    setOpen: jest.fn(),
    onCancel: jest.fn(),
    form: {
      getFieldsValue: jest.fn(() => ({ name: '', role: '', backstory: '', goal: '' })),
      setFieldsValue: jest.fn(),
    } as any,
    llmModel: {
      model_id: 'test-model',
      model_name: 'Test Model',
    } as Model,
    toolInstances: {} as Record<string, ToolInstance>,
  };

  afterAll(() => {
    // Restore console.error after tests
    console.error = originalConsoleError;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders without crashing when closed', () => {
    const store = createMockStore();

    const { container } = render(
      <Provider store={store}>
        <GenerateAgentPropertiesModal {...mockProps} />
      </Provider>,
    );

    expect(container).toBeTruthy();
  });

  it('renders modal when open', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <GenerateAgentPropertiesModal {...mockProps} open={true} />
      </Provider>,
    );

    expect(screen.getByText('Generate Agent Properties using AI')).toBeInTheDocument();
    expect(screen.getByText('Close')).toBeInTheDocument();
    expect(screen.getByText('Apply Suggestions')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <GenerateAgentPropertiesModal {...mockProps} open={false} />
      </Provider>,
    );

    expect(screen.queryByText('Generate Agent Properties using AI')).not.toBeInTheDocument();
  });

  it('handles user input in textarea', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <GenerateAgentPropertiesModal {...mockProps} open={true} />
      </Provider>,
    );

    const textarea = screen.getByPlaceholderText('Describe the agent you want to create...');
    fireEvent.change(textarea, { target: { value: 'Test agent description' } });

    expect(textarea).toHaveValue('Test agent description');
  });

  it('enables generate button when description is provided', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <GenerateAgentPropertiesModal {...mockProps} open={true} />
      </Provider>,
    );

    const textarea = screen.getByPlaceholderText('Describe the agent you want to create...');
    const generateButton = screen.getByRole('button', { name: /play/i });

    expect(generateButton).toBeDisabled();

    fireEvent.change(textarea, { target: { value: 'Test description' } });
    expect(generateButton).not.toBeDisabled();
  });

  it('calls onCancel when Close button is clicked', () => {
    const store = createMockStore();
    const onCancel = jest.fn();

    render(
      <Provider store={store}>
        <GenerateAgentPropertiesModal {...mockProps} open={true} onCancel={onCancel} />
      </Provider>,
    );

    fireEvent.click(screen.getByText('Close'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('handles keyboard shortcuts', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <GenerateAgentPropertiesModal {...mockProps} open={true} />
      </Provider>,
    );

    const textarea = screen.getByPlaceholderText('Describe the agent you want to create...');
    fireEvent.change(textarea, { target: { value: 'Test description' } });

    // Test Ctrl+Enter shortcut
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });

    expect(textarea).toHaveValue('Test description');
  });

  it('component mounts and unmounts without errors', () => {
    const store = createMockStore();

    const { unmount } = render(
      <Provider store={store}>
        <GenerateAgentPropertiesModal {...mockProps} />
      </Provider>,
    );

    expect(() => unmount()).not.toThrow();
  });

  // Snapshot tests for this modal component
  it('matches snapshot when closed', () => {
    const store = createMockStore();

    const { container } = render(
      <Provider store={store}>
        <GenerateAgentPropertiesModal {...mockProps} open={false} />
      </Provider>,
    );

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot when open', () => {
    const store = createMockStore();

    const { container } = render(
      <Provider store={store}>
        <GenerateAgentPropertiesModal {...mockProps} open={true} />
      </Provider>,
    );

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with user input', () => {
    const store = createMockStore();

    const { container } = render(
      <Provider store={store}>
        <GenerateAgentPropertiesModal {...mockProps} open={true} />
      </Provider>,
    );

    const textarea = screen.getByPlaceholderText('Describe the agent you want to create...');
    fireEvent.change(textarea, { target: { value: 'Test agent for customer support' } });

    expect(container.firstChild).toMatchSnapshot();
  });
});
