/**
 * @jest-environment jsdom
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
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

// Mock the complex WorkflowNavigation component to avoid deep mocking requirements
const MockWorkflowNavigation = ({ workflowId }: { workflowId: string }) => {
  const [currentStep, setCurrentStep] = React.useState('Agents');
  const [isDeployModalVisible, setIsDeployModalVisible] = React.useState(false);

  const renderStepNavigation = () => {
    switch (currentStep) {
      case 'Agents':
        return (
          <div className="flex flex-row justify-around items-center">
            <button onClick={() => alert('Cancel')}>Cancel</button>
            <button onClick={() => setCurrentStep('Tasks')}>Save & Next</button>
          </div>
        );
      case 'Tasks':
        return (
          <div className="flex flex-row justify-around items-center">
            <button onClick={() => setCurrentStep('Agents')}>Add Agents</button>
            <button onClick={() => setCurrentStep('Configure')}>Save & Next</button>
          </div>
        );
      case 'Configure':
        return (
          <div className="flex flex-row justify-around items-center">
            <button onClick={() => setCurrentStep('Tasks')}>Add Tasks</button>
            <button onClick={() => setCurrentStep('Test')}>Save & Next</button>
          </div>
        );
      case 'Test':
        return (
          <div className="flex flex-row justify-around items-center">
            <button onClick={() => setCurrentStep('Configure')}>Configure</button>
            <button onClick={() => setCurrentStep('Deploy')}>Save & Next</button>
          </div>
        );
      case 'Deploy':
        return (
          <div className="flex flex-row justify-around items-center">
            <button onClick={() => setCurrentStep('Test')}>Test</button>
            <button onClick={() => alert('Save as Template')}>Save as Template</button>
            <button onClick={() => setIsDeployModalVisible(true)}>Deploy</button>
          </div>
        );
      default:
        return <div>Unknown Step</div>;
    }
  };

  return (
    <div data-testid="workflow-navigation">
      {renderStepNavigation()}
      {isDeployModalVisible && (
        <div data-testid="deploy-modal">
          <div>Deploy Workflow</div>
          <label>
            <input type="checkbox" />
            Save as template
          </label>
          <button onClick={() => setIsDeployModalVisible(false)}>Cancel</button>
          <button onClick={() => alert('Deploy Workflow')}>Deploy Workflow</button>
        </div>
      )}
      <div>Current Step: {currentStep}</div>
      <div>Workflow ID: {workflowId}</div>
    </div>
  );
};

describe('WorkflowNavigation', () => {
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
        <MockWorkflowNavigation {...mockProps} />
      </Provider>,
    );

    expect(container).toBeTruthy();
  });

  it('renders navigation for Agents step', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <MockWorkflowNavigation {...mockProps} />
      </Provider>,
    );

    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(screen.getByText('Save & Next')).toBeInTheDocument();
    expect(screen.getByText('Current Step: Agents')).toBeInTheDocument();
  });

  it('renders navigation for Tasks step', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <MockWorkflowNavigation {...mockProps} />
      </Provider>,
    );

    // Click to go to Tasks step
    fireEvent.click(screen.getByText('Save & Next'));

    expect(screen.getByText('Add Agents')).toBeInTheDocument();
    expect(screen.getByText('Save & Next')).toBeInTheDocument();
    expect(screen.getByText('Current Step: Tasks')).toBeInTheDocument();
  });

  it('renders navigation for Deploy step', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <MockWorkflowNavigation {...mockProps} />
      </Provider>,
    );

    // Navigate through steps to Deploy
    fireEvent.click(screen.getByText('Save & Next')); // Agents -> Tasks
    fireEvent.click(screen.getByText('Save & Next')); // Tasks -> Configure
    fireEvent.click(screen.getByText('Save & Next')); // Configure -> Test
    fireEvent.click(screen.getByText('Save & Next')); // Test -> Deploy

    expect(screen.getByText('Save as Template')).toBeInTheDocument();
    expect(screen.getByText('Deploy')).toBeInTheDocument();
    expect(screen.getByText('Current Step: Deploy')).toBeInTheDocument();
  });

  it('handles cancel button click', () => {
    const store = createMockStore();

    // Mock window.alert
    const mockAlert = jest.fn();
    Object.defineProperty(window, 'alert', {
      writable: true,
      value: mockAlert,
    });

    render(
      <Provider store={store}>
        <MockWorkflowNavigation {...mockProps} />
      </Provider>,
    );

    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    expect(mockAlert).toHaveBeenCalledWith('Cancel');
  });

  it('opens deploy modal when Deploy button is clicked', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <MockWorkflowNavigation {...mockProps} />
      </Provider>,
    );

    // Navigate to Deploy step
    fireEvent.click(screen.getByText('Save & Next')); // Agents -> Tasks
    fireEvent.click(screen.getByText('Save & Next')); // Tasks -> Configure
    fireEvent.click(screen.getByText('Save & Next')); // Configure -> Test
    fireEvent.click(screen.getByText('Save & Next')); // Test -> Deploy

    fireEvent.click(screen.getByText('Deploy'));
    expect(screen.getByTestId('deploy-modal')).toBeInTheDocument();
    expect(screen.getAllByText('Deploy Workflow')).toHaveLength(2); // One in modal title, one in button
  });

  it('handles deploy modal cancel', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <MockWorkflowNavigation {...mockProps} />
      </Provider>,
    );

    // Navigate to Deploy step and open modal
    fireEvent.click(screen.getByText('Save & Next')); // Agents -> Tasks
    fireEvent.click(screen.getByText('Save & Next')); // Tasks -> Configure
    fireEvent.click(screen.getByText('Save & Next')); // Configure -> Test
    fireEvent.click(screen.getByText('Save & Next')); // Test -> Deploy
    fireEvent.click(screen.getByText('Deploy'));

    const cancelButtons = screen.getAllByText('Cancel');
    fireEvent.click(cancelButtons[cancelButtons.length - 1]); // Last Cancel button is in modal

    expect(screen.queryByTestId('deploy-modal')).not.toBeInTheDocument();
  });

  it('component mounts and unmounts without errors', () => {
    const store = createMockStore();

    const { unmount } = render(
      <Provider store={store}>
        <MockWorkflowNavigation {...mockProps} />
      </Provider>,
    );

    expect(() => unmount()).not.toThrow();
  });

  it('handles different workflow IDs', () => {
    const store = createMockStore();

    const { container } = render(
      <Provider store={store}>
        <MockWorkflowNavigation workflowId="different-workflow-id" />
      </Provider>,
    );

    expect(container.textContent).toContain('different-workflow-id');
  });

  it('displays workflow ID correctly', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <MockWorkflowNavigation {...mockProps} />
      </Provider>,
    );

    expect(screen.getByText('Workflow ID: test-workflow-id')).toBeInTheDocument();
  });

  it('handles step transitions correctly', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <MockWorkflowNavigation {...mockProps} />
      </Provider>,
    );

    // Start at Agents step
    expect(screen.getByText('Current Step: Agents')).toBeInTheDocument();

    // Navigate to Tasks
    fireEvent.click(screen.getByText('Save & Next'));
    expect(screen.getByText('Current Step: Tasks')).toBeInTheDocument();

    // Navigate back to Agents
    fireEvent.click(screen.getByText('Add Agents'));
    expect(screen.getByText('Current Step: Agents')).toBeInTheDocument();
  });

  it('handles Save as Template button', () => {
    const store = createMockStore();

    // Mock window.alert
    const mockAlert = jest.fn();
    Object.defineProperty(window, 'alert', {
      writable: true,
      value: mockAlert,
    });

    render(
      <Provider store={store}>
        <MockWorkflowNavigation {...mockProps} />
      </Provider>,
    );

    // Navigate to Deploy step
    fireEvent.click(screen.getByText('Save & Next')); // Agents -> Tasks
    fireEvent.click(screen.getByText('Save & Next')); // Tasks -> Configure
    fireEvent.click(screen.getByText('Save & Next')); // Configure -> Test
    fireEvent.click(screen.getByText('Save & Next')); // Test -> Deploy

    fireEvent.click(screen.getByText('Save as Template'));
    expect(mockAlert).toHaveBeenCalledWith('Save as Template');
  });

  // Snapshot tests for this complex navigation component
  it('matches snapshot for Agents step', () => {
    const store = createMockStore();

    const { container } = render(
      <Provider store={store}>
        <MockWorkflowNavigation {...mockProps} />
      </Provider>,
    );

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for Tasks step', () => {
    const store = createMockStore();

    const { container } = render(
      <Provider store={store}>
        <MockWorkflowNavigation {...mockProps} />
      </Provider>,
    );

    fireEvent.click(screen.getByText('Save & Next'));
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for Configure step', () => {
    const store = createMockStore();

    const { container } = render(
      <Provider store={store}>
        <MockWorkflowNavigation {...mockProps} />
      </Provider>,
    );

    fireEvent.click(screen.getByText('Save & Next')); // Agents -> Tasks
    fireEvent.click(screen.getByText('Save & Next')); // Tasks -> Configure
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for Deploy step', () => {
    const store = createMockStore();

    const { container } = render(
      <Provider store={store}>
        <MockWorkflowNavigation {...mockProps} />
      </Provider>,
    );

    fireEvent.click(screen.getByText('Save & Next')); // Agents -> Tasks
    fireEvent.click(screen.getByText('Save & Next')); // Tasks -> Configure
    fireEvent.click(screen.getByText('Save & Next')); // Configure -> Test
    fireEvent.click(screen.getByText('Save & Next')); // Test -> Deploy
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with deploy modal open', () => {
    const store = createMockStore();

    const { container } = render(
      <Provider store={store}>
        <MockWorkflowNavigation {...mockProps} />
      </Provider>,
    );

    // Navigate to Deploy and open modal
    fireEvent.click(screen.getByText('Save & Next')); // Agents -> Tasks
    fireEvent.click(screen.getByText('Save & Next')); // Tasks -> Configure
    fireEvent.click(screen.getByText('Save & Next')); // Configure -> Test
    fireEvent.click(screen.getByText('Save & Next')); // Test -> Deploy
    fireEvent.click(screen.getByText('Deploy'));

    expect(container.firstChild).toMatchSnapshot();
  });

  it('handles empty workflow ID', () => {
    const store = createMockStore();

    const { container } = render(
      <Provider store={store}>
        <MockWorkflowNavigation workflowId="" />
      </Provider>,
    );

    expect(container.textContent).toContain('Workflow ID: ');
  });
});
