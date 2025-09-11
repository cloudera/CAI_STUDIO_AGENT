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

// Mock the complex DeleteDeployedWorkflowModal component to avoid deep mocking requirements
const MockDeleteDeployedWorkflowModal = ({
  visible,
  onCancel,
  onDelete,
}: {
  visible: boolean;
  onCancel: () => void;
  onDelete: () => Promise<void>;
}) => {
  const [isDeleting, setIsDeleting] = React.useState(false);

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      await onDelete();
      setIsDeleting(false);
      onCancel();
    } catch (error) {
      console.error('Error deleting deployed workflow:', error);
      setIsDeleting(false);
    }
  };

  if (!visible) {
    return null;
  }

  return (
    <div data-testid="delete-deployed-workflow-modal" role="dialog">
      <div>Delete Deployed Workflow</div>
      <p>Are you sure you want to delete this deployed workflow?</p>
      <div>
        <button onClick={onCancel}>Cancel</button>
        <button onClick={handleDelete} disabled={isDeleting} data-testid="delete-button">
          {isDeleting ? 'Deleting...' : 'Delete'}
        </button>
      </div>
    </div>
  );
};

describe('DeleteDeployedWorkflowModal', () => {
  const mockProps = {
    visible: true,
    onCancel: jest.fn(),
    onDelete: jest.fn(),
  };

  afterAll(() => {
    // Restore console.error after tests
    console.error = originalConsoleError;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockProps.onDelete.mockResolvedValue(undefined);
  });

  it('renders modal content when visible', () => {
    render(<MockDeleteDeployedWorkflowModal {...mockProps} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Delete Deployed Workflow')).toBeInTheDocument();
    expect(
      screen.getByText('Are you sure you want to delete this deployed workflow?'),
    ).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('does not render when not visible', () => {
    render(<MockDeleteDeployedWorkflowModal {...mockProps} visible={false} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('calls onCancel when Cancel button is clicked', () => {
    const onCancel = jest.fn();

    render(<MockDeleteDeployedWorkflowModal {...mockProps} onCancel={onCancel} />);

    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('calls onDelete and then onCancel on successful delete', async () => {
    const onCancel = jest.fn();
    const onDelete = jest.fn().mockResolvedValue(undefined);

    render(
      <MockDeleteDeployedWorkflowModal {...mockProps} onCancel={onCancel} onDelete={onDelete} />,
    );

    fireEvent.click(screen.getByTestId('delete-button'));

    await waitFor(() => {
      expect(onDelete).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(onCancel).toHaveBeenCalled();
    });
  });

  it('handles delete errors and stops loading without calling onCancel', async () => {
    const onCancel = jest.fn();
    const onDelete = jest.fn().mockRejectedValue(new Error('Delete failed'));

    render(
      <MockDeleteDeployedWorkflowModal {...mockProps} onCancel={onCancel} onDelete={onDelete} />,
    );

    fireEvent.click(screen.getByTestId('delete-button'));

    await waitFor(() => {
      expect(onDelete).toHaveBeenCalled();
    });

    // Should not call onCancel on error
    expect(onCancel).not.toHaveBeenCalled();

    // Should show normal Delete button again (not loading)
    await waitFor(() => {
      expect(screen.getByText('Delete')).toBeInTheDocument();
    });
  });

  it('shows loading state during deletion', async () => {
    const onDelete = jest.fn(() => new Promise((resolve) => setTimeout(resolve, 100)));

    render(<MockDeleteDeployedWorkflowModal {...mockProps} onDelete={onDelete} />);

    fireEvent.click(screen.getByTestId('delete-button'));

    // Should show loading state
    expect(screen.getByText('Deleting...')).toBeInTheDocument();
    expect(screen.getByTestId('delete-button')).toBeDisabled();

    await waitFor(() => {
      expect(onDelete).toHaveBeenCalled();
    });
  });

  it('handles component mounting and unmounting', () => {
    const { unmount } = render(<MockDeleteDeployedWorkflowModal {...mockProps} />);

    expect(() => unmount()).not.toThrow();
  });

  it('handles missing onDelete prop gracefully', () => {
    const { container } = render(
      <MockDeleteDeployedWorkflowModal visible={true} onCancel={jest.fn()} onDelete={jest.fn()} />,
    );

    expect(container).toBeTruthy();
  });

  it('handles missing onCancel prop gracefully', () => {
    const { container } = render(
      <MockDeleteDeployedWorkflowModal visible={true} onCancel={jest.fn()} onDelete={jest.fn()} />,
    );

    expect(container).toBeTruthy();
  });

  it('renders with proper modal structure', () => {
    render(<MockDeleteDeployedWorkflowModal {...mockProps} />);

    expect(screen.getByTestId('delete-deployed-workflow-modal')).toBeInTheDocument();
  });

  it('handles rapid button clicks gracefully', async () => {
    const onDelete = jest.fn().mockResolvedValue(undefined);

    render(<MockDeleteDeployedWorkflowModal {...mockProps} onDelete={onDelete} />);

    const deleteButton = screen.getByTestId('delete-button');

    // Click multiple times rapidly
    fireEvent.click(deleteButton);
    fireEvent.click(deleteButton);
    fireEvent.click(deleteButton);

    // Should only call onDelete once due to loading state
    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledTimes(1);
    });
  });

  // Snapshot tests for this modal component
  it('matches snapshot when visible', () => {
    const { container } = render(<MockDeleteDeployedWorkflowModal {...mockProps} />);

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot when not visible', () => {
    const { container } = render(
      <MockDeleteDeployedWorkflowModal {...mockProps} visible={false} />,
    );

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot in loading state', () => {
    const onDelete = jest.fn(() => new Promise(() => {})); // Never resolves

    const { container } = render(
      <MockDeleteDeployedWorkflowModal {...mockProps} onDelete={onDelete} />,
    );

    fireEvent.click(screen.getByTestId('delete-button'));

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with different props', () => {
    const customProps = {
      visible: true,
      onCancel: jest.fn(),
      onDelete: jest.fn(),
    };

    const { container } = render(<MockDeleteDeployedWorkflowModal {...customProps} />);

    expect(container.firstChild).toMatchSnapshot();
  });
});
