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

// Mock RTK Query hook to avoid needing a Redux Provider in unit tests
jest.mock('@/app/workflows/deployedWorkflowsApi', () => ({
  useListDeployedWorkflowsQuery: jest.fn(() => ({ data: [] })),
}));

import DeleteWorkflowModal from './DeleteWorkflowModal';

describe('DeleteWorkflowModal', () => {
  afterAll(() => {
    // Restore console.error after tests
    console.error = originalConsoleError;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('exports the component', () => {
    expect(DeleteWorkflowModal).toBeDefined();
  });

  it('renders modal content when visible', () => {
    render(
      <DeleteWorkflowModal
        resourceType="workflow"
        visible={true}
        onCancel={jest.fn()}
        onDelete={jest.fn().mockResolvedValue(undefined)}
        workflowId="w-1"
      />,
    );

    expect(screen.getByText(/Are you sure you want to delete this workflow/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Delete/i })).toBeInTheDocument();
  });

  it('calls onCancel when Cancel button is clicked', () => {
    const onCancel = jest.fn();
    render(
      <DeleteWorkflowModal
        resourceType="workflow"
        visible={true}
        onCancel={onCancel}
        onDelete={jest.fn()}
        workflowId="w-1"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onDelete and then onCancel on successful delete', async () => {
    const onCancel = jest.fn();
    const onDelete = jest.fn().mockResolvedValue(undefined);

    render(
      <DeleteWorkflowModal
        resourceType="workflow"
        visible={true}
        onCancel={onCancel}
        onDelete={onDelete}
        workflowId="w-1"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Delete/i }));

    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1));
  });

  it('stops loading and does not call onCancel when delete fails', async () => {
    const onCancel = jest.fn();
    const onDelete = jest.fn().mockRejectedValue(new Error('delete failed'));

    render(
      <DeleteWorkflowModal
        resourceType="workflow"
        visible={true}
        onCancel={onCancel}
        onDelete={onDelete}
        workflowId="w-1"
      />,
    );

    const deleteButton = screen.getByRole('button', { name: /Delete/i });
    fireEvent.click(deleteButton);

    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
    // onCancel should not be called on failure
    expect(onCancel).not.toHaveBeenCalled();
    // ensure the button is no longer in loading state by checking it's enabled
    await waitFor(() => expect(deleteButton).not.toHaveAttribute('disabled'));
  });
});
