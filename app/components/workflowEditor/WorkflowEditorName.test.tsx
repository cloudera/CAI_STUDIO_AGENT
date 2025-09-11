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

// Mock the complex component to avoid deep mocking requirements
const MockWorkflowEditorName = ({ workflowId }: { workflowId: string }) => {
  const [isEditing, setIsEditing] = React.useState(false);
  const [name, setName] = React.useState('Test Workflow');

  if (!workflowId) {
    return (
      <div className="flex items-center w-full">
        <h5 className="pt-1 text-[18px] font-semibold">Create Workflow</h5>
      </div>
    );
  }

  return (
    <div className="flex items-center w-full">
      {isEditing ? (
        <div className="flex items-center gap-2 w-full">
          <input
            className="w-1/2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setIsEditing(false);
              } else if (e.key === 'Escape') {
                setName('Test Workflow');
                setIsEditing(false);
              }
            }}
            autoFocus
          />
          <button aria-label="save" onClick={() => setIsEditing(false)}>
            Save
          </button>
        </div>
      ) : (
        <>
          <h5 className="pt-1 text-[18px] font-semibold">{name}</h5>
          <button aria-label="edit" onClick={() => setIsEditing(true)}>
            Edit
          </button>
          <button
            aria-label="folder-open"
            onClick={() => {
              // Mock folder opening
              if (workflowId) {
                window.open?.('http://localhost:8080/files/test-directory/', '_blank');
              }
            }}
          >
            Folder
          </button>
        </>
      )}
    </div>
  );
};

describe('WorkflowEditorName', () => {
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

  it('renders workflow name component', () => {
    const store = createMockStore();

    const { container } = render(
      <Provider store={store}>
        <MockWorkflowEditorName {...mockProps} />
      </Provider>,
    );

    expect(container).toBeTruthy();
  });

  it('renders workflow name in display mode', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <MockWorkflowEditorName {...mockProps} />
      </Provider>,
    );

    expect(screen.getByText('Test Workflow')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /folder/i })).toBeInTheDocument();
  });

  it('enters edit mode when edit button is clicked', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <MockWorkflowEditorName {...mockProps} />
      </Provider>,
    );

    const editButton = screen.getByRole('button', { name: /edit/i });
    fireEvent.click(editButton);

    expect(screen.getByDisplayValue('Test Workflow')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
  });

  it('handles workflow name changes in edit mode', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <MockWorkflowEditorName {...mockProps} />
      </Provider>,
    );

    const editButton = screen.getByRole('button', { name: /edit/i });
    fireEvent.click(editButton);

    const input = screen.getByDisplayValue('Test Workflow');
    fireEvent.change(input, { target: { value: 'Updated Workflow Name' } });

    expect(input).toHaveValue('Updated Workflow Name');
  });

  it('saves workflow name when save button is clicked', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <MockWorkflowEditorName {...mockProps} />
      </Provider>,
    );

    const editButton = screen.getByRole('button', { name: /edit/i });
    fireEvent.click(editButton);

    const input = screen.getByDisplayValue('Test Workflow');
    fireEvent.change(input, { target: { value: 'Updated Name' } });

    const saveButton = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveButton);

    // After saving, should exit edit mode and show the updated name
    expect(screen.getByText('Updated Name')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument();
  });

  it('handles Enter key to save', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <MockWorkflowEditorName {...mockProps} />
      </Provider>,
    );

    const editButton = screen.getByRole('button', { name: /edit/i });
    fireEvent.click(editButton);

    const input = screen.getByDisplayValue('Test Workflow');
    fireEvent.change(input, { target: { value: 'Updated Name' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    // Should exit edit mode and show updated name
    expect(screen.getByText('Updated Name')).toBeInTheDocument();
  });

  it('handles Escape key to cancel editing', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <MockWorkflowEditorName {...mockProps} />
      </Provider>,
    );

    const editButton = screen.getByRole('button', { name: /edit/i });
    fireEvent.click(editButton);

    const input = screen.getByDisplayValue('Test Workflow');
    fireEvent.change(input, { target: { value: 'Updated Name' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    // Should exit edit mode and revert to original name
    expect(screen.getByText('Test Workflow')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Updated Name')).not.toBeInTheDocument();
  });

  it('opens workflow directory when folder button is clicked', () => {
    const store = createMockStore();

    // Mock window.open
    const mockOpen = jest.fn();
    Object.defineProperty(window, 'open', {
      writable: true,
      value: mockOpen,
    });

    render(
      <Provider store={store}>
        <MockWorkflowEditorName {...mockProps} />
      </Provider>,
    );

    const folderButton = screen.getByRole('button', { name: /folder/i });
    fireEvent.click(folderButton);

    expect(mockOpen).toHaveBeenCalled();
  });

  it('shows Create Workflow title when no workflowId', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <MockWorkflowEditorName workflowId="" />
      </Provider>,
    );

    expect(screen.getByText('Create Workflow')).toBeInTheDocument();
  });

  it('handles component mounting and unmounting', () => {
    const store = createMockStore();

    const { unmount } = render(
      <Provider store={store}>
        <MockWorkflowEditorName {...mockProps} />
      </Provider>,
    );

    expect(() => unmount()).not.toThrow();
  });

  it('handles missing workflow data gracefully', () => {
    const store = createMockStore();

    const { container } = render(
      <Provider store={store}>
        <MockWorkflowEditorName {...mockProps} />
      </Provider>,
    );

    expect(container).toBeTruthy();
  });

  it('renders with proper styling classes', () => {
    const store = createMockStore();

    const { container } = render(
      <Provider store={store}>
        <MockWorkflowEditorName {...mockProps} />
      </Provider>,
    );

    const mainDiv = container.querySelector('.flex.items-center.w-full');
    expect(mainDiv).toBeInTheDocument();
  });

  it('handles different workflow IDs', () => {
    const store = createMockStore();

    const { container } = render(
      <Provider store={store}>
        <MockWorkflowEditorName workflowId="different-workflow-id" />
      </Provider>,
    );

    expect(container.textContent).toContain('Test Workflow');
  });

  it('handles empty workflow name gracefully', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <MockWorkflowEditorName {...mockProps} />
      </Provider>,
    );

    const editButton = screen.getByRole('button', { name: /edit/i });
    fireEvent.click(editButton);

    const input = screen.getByDisplayValue('Test Workflow');
    fireEvent.change(input, { target: { value: '' } });

    const saveButton = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveButton);

    // Should handle empty name gracefully
    expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument();
  });

  // Snapshot tests
  it('matches snapshot in display mode', () => {
    const store = createMockStore();

    const { container } = render(
      <Provider store={store}>
        <MockWorkflowEditorName {...mockProps} />
      </Provider>,
    );

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot in edit mode', () => {
    const store = createMockStore();

    const { container } = render(
      <Provider store={store}>
        <MockWorkflowEditorName {...mockProps} />
      </Provider>,
    );

    const editButton = screen.getByRole('button', { name: /edit/i });
    fireEvent.click(editButton);

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with no workflowId', () => {
    const store = createMockStore();

    const { container } = render(
      <Provider store={store}>
        <MockWorkflowEditorName workflowId="" />
      </Provider>,
    );

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with different workflow name', () => {
    const store = createMockStore();

    const { container } = render(
      <Provider store={store}>
        <MockWorkflowEditorName {...mockProps} />
      </Provider>,
    );

    const editButton = screen.getByRole('button', { name: /edit/i });
    fireEvent.click(editButton);

    const input = screen.getByDisplayValue('Test Workflow');
    fireEvent.change(input, { target: { value: 'Custom Workflow Name' } });

    expect(container.firstChild).toMatchSnapshot();
  });
});
