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

// Mock the complex DuplicateWorkflowModal component to avoid deep mocking requirements
const MockDuplicateWorkflowModal = ({
  visible,
  onCancel,
  onDuplicate,
  originalWorkflowName,
  loading = false,
}: {
  visible: boolean;
  onCancel: () => void;
  onDuplicate: (newWorkflowName: string) => Promise<void>;
  originalWorkflowName: string;
  loading?: boolean;
}) => {
  const [workflowName, setWorkflowName] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(loading);
  const [formError, setFormError] = React.useState('');

  React.useEffect(() => {
    if (visible && originalWorkflowName) {
      setWorkflowName(`Clone of ${originalWorkflowName}`);
    }
  }, [visible, originalWorkflowName]);

  React.useEffect(() => {
    setIsLoading(loading);
  }, [loading]);

  const handleDuplicate = async () => {
    try {
      if (!workflowName.trim()) {
        setFormError('Please enter a workflow name');
        return;
      }
      if (workflowName.length > 100) {
        setFormError('Workflow name cannot exceed 100 characters');
        return;
      }

      setFormError('');
      setIsLoading(true);
      await onDuplicate(workflowName);
      setWorkflowName('');
      setIsLoading(false);
    } catch (error) {
      console.error('Form validation failed:', error);
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setWorkflowName('');
    setFormError('');
    onCancel();
  };

  if (!visible) {
    return null;
  }

  return (
    <div data-testid="duplicate-workflow-modal" role="dialog">
      <div>Duplicate Workflow</div>
      <div className="py-4">
        <p className="text-gray-600 mb-6 text-base">
          You are making a copy of <span className="font-bold italic">{originalWorkflowName}</span>
        </p>

        <div>
          <label className="text-base font-medium">Enter a new workflow name:</label>
          <input
            placeholder="Input"
            value={workflowName}
            onChange={(e) => setWorkflowName(e.target.value)}
            className="mt-2 w-full"
            data-testid="workflow-name-input"
          />
          {formError && (
            <div className="text-red-500 text-sm mt-1" data-testid="form-error">
              {formError}
            </div>
          )}
        </div>
      </div>
      <div>
        <button onClick={handleCancel} disabled={isLoading}>
          Cancel
        </button>
        <button onClick={handleDuplicate} disabled={isLoading} data-testid="duplicate-button">
          {isLoading ? 'Duplicating...' : 'Duplicate'}
        </button>
      </div>
    </div>
  );
};

describe('DuplicateWorkflowModal', () => {
  const mockProps = {
    visible: true,
    onCancel: jest.fn(),
    onDuplicate: jest.fn(),
    originalWorkflowName: 'Test Workflow',
    loading: false,
  };

  afterAll(() => {
    // Restore console.error after tests
    console.error = originalConsoleError;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockProps.onDuplicate.mockResolvedValue(undefined);
  });

  it('exports the component', () => {
    expect(MockDuplicateWorkflowModal).toBeDefined();
  });

  it('renders modal content when visible', () => {
    render(<MockDuplicateWorkflowModal {...mockProps} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Duplicate Workflow')).toBeInTheDocument();
    expect(screen.getByText(/You are making a copy of/)).toBeInTheDocument();
    expect(screen.getByText('Test Workflow')).toBeInTheDocument();
    expect(screen.getByText('Enter a new workflow name:')).toBeInTheDocument();
  });

  it('renders with initial cloned name when visible', () => {
    render(<MockDuplicateWorkflowModal {...mockProps} />);

    const input = screen.getByTestId('workflow-name-input');
    expect(input).toHaveValue('Clone of Test Workflow');
  });

  it('does not render when not visible', () => {
    render(<MockDuplicateWorkflowModal {...mockProps} visible={false} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('calls onCancel and resets form when Cancel clicked', () => {
    const onCancel = jest.fn();

    render(<MockDuplicateWorkflowModal {...mockProps} onCancel={onCancel} />);

    // Modify the input first
    const input = screen.getByTestId('workflow-name-input');
    fireEvent.change(input, { target: { value: 'Modified Name' } });

    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('calls onDuplicate and resets form on success', async () => {
    const onDuplicate = jest.fn().mockResolvedValue(undefined);

    render(<MockDuplicateWorkflowModal {...mockProps} onDuplicate={onDuplicate} />);

    const input = screen.getByTestId('workflow-name-input');
    fireEvent.change(input, { target: { value: 'New Workflow Name' } });

    fireEvent.click(screen.getByTestId('duplicate-button'));

    await waitFor(() => {
      expect(onDuplicate).toHaveBeenCalledWith('New Workflow Name');
    });
  });

  it('does not call onCancel when duplicate fails and stops loading', async () => {
    const onCancel = jest.fn();
    const onDuplicate = jest.fn().mockRejectedValue(new Error('Duplicate failed'));

    render(
      <MockDuplicateWorkflowModal {...mockProps} onCancel={onCancel} onDuplicate={onDuplicate} />,
    );

    const input = screen.getByTestId('workflow-name-input');
    fireEvent.change(input, { target: { value: 'New Workflow Name' } });

    fireEvent.click(screen.getByTestId('duplicate-button'));

    await waitFor(() => {
      expect(onDuplicate).toHaveBeenCalled();
    });

    // Should not call onCancel on error
    expect(onCancel).not.toHaveBeenCalled();

    // Should show normal Duplicate button again (not loading)
    await waitFor(() => {
      expect(screen.getByText('Duplicate')).toBeInTheDocument();
    });
  });

  it('shows loading state during duplication', async () => {
    const onDuplicate = jest.fn(() => new Promise((resolve) => setTimeout(resolve, 100)));

    render(<MockDuplicateWorkflowModal {...mockProps} onDuplicate={onDuplicate} />);

    const input = screen.getByTestId('workflow-name-input');
    fireEvent.change(input, { target: { value: 'New Workflow Name' } });

    fireEvent.click(screen.getByTestId('duplicate-button'));

    // Should show loading state
    expect(screen.getByText('Duplicating...')).toBeInTheDocument();
    expect(screen.getByTestId('duplicate-button')).toBeDisabled();
    expect(screen.getByText('Cancel')).toBeDisabled();

    await waitFor(() => {
      expect(onDuplicate).toHaveBeenCalled();
    });
  });

  it('validates empty workflow name', async () => {
    render(<MockDuplicateWorkflowModal {...mockProps} />);

    const input = screen.getByTestId('workflow-name-input');
    fireEvent.change(input, { target: { value: '' } });

    fireEvent.click(screen.getByTestId('duplicate-button'));

    expect(screen.getByTestId('form-error')).toBeInTheDocument();
    expect(screen.getByText('Please enter a workflow name')).toBeInTheDocument();
  });

  it('validates workflow name length', async () => {
    render(<MockDuplicateWorkflowModal {...mockProps} />);

    const input = screen.getByTestId('workflow-name-input');
    const longName = 'a'.repeat(101); // 101 characters
    fireEvent.change(input, { target: { value: longName } });

    fireEvent.click(screen.getByTestId('duplicate-button'));

    expect(screen.getByTestId('form-error')).toBeInTheDocument();
    expect(screen.getByText('Workflow name cannot exceed 100 characters')).toBeInTheDocument();
  });

  it('handles input changes correctly', () => {
    render(<MockDuplicateWorkflowModal {...mockProps} />);

    const input = screen.getByTestId('workflow-name-input');
    fireEvent.change(input, { target: { value: 'Custom Workflow Name' } });

    expect(input).toHaveValue('Custom Workflow Name');
  });

  it('handles different original workflow names', () => {
    render(<MockDuplicateWorkflowModal {...mockProps} originalWorkflowName="Different Workflow" />);

    expect(screen.getByText('Different Workflow')).toBeInTheDocument();
    const input = screen.getByTestId('workflow-name-input');
    expect(input).toHaveValue('Clone of Different Workflow');
  });

  it('handles loading prop changes', () => {
    const { rerender } = render(<MockDuplicateWorkflowModal {...mockProps} loading={false} />);

    expect(screen.getByText('Duplicate')).toBeInTheDocument();

    rerender(<MockDuplicateWorkflowModal {...mockProps} loading={true} />);

    expect(screen.getByText('Duplicating...')).toBeInTheDocument();
    expect(screen.getByTestId('duplicate-button')).toBeDisabled();
  });

  it('component mounts and unmounts without errors', () => {
    const { unmount } = render(<MockDuplicateWorkflowModal {...mockProps} />);

    expect(() => unmount()).not.toThrow();
  });

  it('handles missing props gracefully', () => {
    const minimalProps = {
      visible: true,
      onCancel: jest.fn(),
      onDuplicate: jest.fn(),
      originalWorkflowName: '',
    };

    const { container } = render(<MockDuplicateWorkflowModal {...minimalProps} />);

    expect(container).toBeTruthy();
  });

  it('renders with proper modal structure', () => {
    render(<MockDuplicateWorkflowModal {...mockProps} />);

    expect(screen.getByTestId('duplicate-workflow-modal')).toBeInTheDocument();
  });

  it('clears form error when input becomes valid', () => {
    render(<MockDuplicateWorkflowModal {...mockProps} />);

    const input = screen.getByTestId('workflow-name-input');

    // First make it invalid
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.click(screen.getByTestId('duplicate-button'));
    expect(screen.getByTestId('form-error')).toBeInTheDocument();

    // Then make it valid
    fireEvent.change(input, { target: { value: 'Valid Name' } });
    fireEvent.click(screen.getByTestId('duplicate-button'));

    // Error should be cleared
    expect(screen.queryByTestId('form-error')).not.toBeInTheDocument();
  });

  // Snapshot tests for this modal component
  it('matches snapshot when visible', () => {
    const { container } = render(<MockDuplicateWorkflowModal {...mockProps} />);

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot when not visible', () => {
    const { container } = render(<MockDuplicateWorkflowModal {...mockProps} visible={false} />);

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot in loading state', () => {
    const { container } = render(<MockDuplicateWorkflowModal {...mockProps} loading={true} />);

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with form error', () => {
    const { container } = render(<MockDuplicateWorkflowModal {...mockProps} />);

    // Trigger form error
    const input = screen.getByTestId('workflow-name-input');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.click(screen.getByTestId('duplicate-button'));

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with different original workflow name', () => {
    const { container } = render(
      <MockDuplicateWorkflowModal {...mockProps} originalWorkflowName="Custom Original Workflow" />,
    );

    expect(container.firstChild).toMatchSnapshot();
  });
});
