/**
 * @jest-environment jsdom
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import WorkflowStepView from './WorkflowStepView';

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

// Mock the required hooks
jest.mock('../../lib/hooks/hooks', () => ({
  useAppSelector: jest.fn(),
}));

jest.mock('../../workflows/editorSlice', () => ({
  selectEditorCurrentStep: jest.fn(),
}));

// Create a mock store
const createMockStore = () => {
  return configureStore({
    reducer: {
      editor: (
        state = {
          currentStep: 'Agents',
        },
      ) => state,
    },
  });
};

describe('WorkflowStepView', () => {
  const { useAppSelector } = require('../../lib/hooks/hooks');

  afterAll(() => {
    // Restore console.error after tests
    console.error = originalConsoleError;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders all workflow steps', () => {
    const store = createMockStore();
    useAppSelector.mockReturnValue('Agents');

    render(
      <Provider store={store}>
        <WorkflowStepView />
      </Provider>,
    );

    expect(screen.getByText('Add Agents')).toBeInTheDocument();
    expect(screen.getByText('Add Tasks')).toBeInTheDocument();
    expect(screen.getByText('Configure')).toBeInTheDocument();
    expect(screen.getByText('Test')).toBeInTheDocument();
    expect(screen.getByText('Deploy')).toBeInTheDocument();
  });

  it('highlights the Agents step when active', () => {
    const store = createMockStore();
    useAppSelector.mockReturnValue('Agents');

    render(
      <Provider store={store}>
        <WorkflowStepView />
      </Provider>,
    );

    // The active step should have different styling (tested through class names)
    const agentsText = screen.getByText('Add Agents');
    expect(agentsText).toHaveClass('text-[#1890ff]');
  });

  it('highlights the Tasks step when active', () => {
    const store = createMockStore();
    useAppSelector.mockReturnValue('Tasks');

    render(
      <Provider store={store}>
        <WorkflowStepView />
      </Provider>,
    );

    const tasksText = screen.getByText('Add Tasks');
    expect(tasksText).toHaveClass('text-[#1890ff]');

    // Other steps should not be highlighted
    const agentsText = screen.getByText('Add Agents');
    expect(agentsText).toHaveClass('text-[#434343]');
  });

  it('highlights the Configure step when active', () => {
    const store = createMockStore();
    useAppSelector.mockReturnValue('Configure');

    render(
      <Provider store={store}>
        <WorkflowStepView />
      </Provider>,
    );

    const configureText = screen.getByText('Configure');
    expect(configureText).toHaveClass('text-[#1890ff]');
  });

  it('highlights the Test step when active', () => {
    const store = createMockStore();
    useAppSelector.mockReturnValue('Test');

    render(
      <Provider store={store}>
        <WorkflowStepView />
      </Provider>,
    );

    const testText = screen.getByText('Test');
    expect(testText).toHaveClass('text-[#1890ff]');
  });

  it('highlights the Deploy step when active', () => {
    const store = createMockStore();
    useAppSelector.mockReturnValue('Deploy');

    render(
      <Provider store={store}>
        <WorkflowStepView />
      </Provider>,
    );

    const deployText = screen.getByText('Deploy');
    expect(deployText).toHaveClass('text-[#1890ff]');
  });

  it('renders step numbers correctly', () => {
    const store = createMockStore();
    useAppSelector.mockReturnValue('Agents');

    render(
      <Provider store={store}>
        <WorkflowStepView />
      </Provider>,
    );

    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('applies correct avatar styling for active step', () => {
    const store = createMockStore();
    useAppSelector.mockReturnValue('Tasks');

    render(
      <Provider store={store}>
        <WorkflowStepView />
      </Provider>,
    );

    // Find the avatar containing "2" (Tasks step)
    const tasksAvatar = screen.getByText('2').closest('.ant-avatar');
    expect(tasksAvatar).toHaveClass('bg-[#1890ff]');

    // Find the avatar containing "1" (Agents step - inactive)
    const agentsAvatar = screen.getByText('1').closest('.ant-avatar');
    expect(agentsAvatar).toHaveClass('bg-[#d9d9d9]');
  });

  it('renders dividers between steps', () => {
    const store = createMockStore();
    useAppSelector.mockReturnValue('Agents');

    render(
      <Provider store={store}>
        <WorkflowStepView />
      </Provider>,
    );

    // Should have dividers between the steps
    const dividers = screen.getAllByRole('separator');
    expect(dividers).toHaveLength(4); // 4 dividers between 5 steps
  });

  it('handles undefined current step gracefully', () => {
    const store = createMockStore();
    useAppSelector.mockReturnValue(undefined);

    render(
      <Provider store={store}>
        <WorkflowStepView />
      </Provider>,
    );

    // Should render all steps without highlighting any
    expect(screen.getByText('Add Agents')).toBeInTheDocument();
    expect(screen.getByText('Add Tasks')).toBeInTheDocument();
    expect(screen.getByText('Configure')).toBeInTheDocument();
    expect(screen.getByText('Test')).toBeInTheDocument();
    expect(screen.getByText('Deploy')).toBeInTheDocument();
  });

  it('handles unknown current step gracefully', () => {
    const store = createMockStore();
    useAppSelector.mockReturnValue('UnknownStep');

    render(
      <Provider store={store}>
        <WorkflowStepView />
      </Provider>,
    );

    // Should render all steps without highlighting any
    expect(screen.getByText('Add Agents')).toBeInTheDocument();
    expect(screen.getByText('Add Tasks')).toBeInTheDocument();
    expect(screen.getByText('Configure')).toBeInTheDocument();
    expect(screen.getByText('Test')).toBeInTheDocument();
    expect(screen.getByText('Deploy')).toBeInTheDocument();

    // All text should be in inactive color
    expect(screen.getByText('Add Agents')).toHaveClass('text-[#434343]');
    expect(screen.getByText('Add Tasks')).toHaveClass('text-[#434343]');
    expect(screen.getByText('Configure')).toHaveClass('text-[#434343]');
    expect(screen.getByText('Test')).toHaveClass('text-[#434343]');
    expect(screen.getByText('Deploy')).toHaveClass('text-[#434343]');
  });

  it('renders with correct layout structure', () => {
    const store = createMockStore();
    useAppSelector.mockReturnValue('Agents');

    const { container } = render(
      <Provider store={store}>
        <WorkflowStepView />
      </Provider>,
    );

    // Should have the main layout container
    const mainLayout = container.querySelector('.flex.flex-row.items-center.justify-between');
    expect(mainLayout).toBeInTheDocument();
  });
});
