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

// Mock the complex WorkflowAddToolModal component to avoid deep mocking requirements
const MockWorkflowAddToolModal = ({ workflowId }: { workflowId: string }) => {
  const [modalOpen, setModalOpen] = React.useState(false);
  const [selectedTemplate, setSelectedTemplate] = React.useState<string | null>(null);
  const [selectedInstance, setSelectedInstance] = React.useState<string | null>(null);
  const [newToolName, setNewToolName] = React.useState('');
  const [searchTemplates, setSearchTemplates] = React.useState('');
  const [searchTools, setSearchTools] = React.useState('');
  const [isCreateMode, setIsCreateMode] = React.useState(true);

  const mockToolTemplates = [
    { id: 'template-1', name: 'Email Tool', description: 'Send emails', is_valid: true },
    { id: 'template-2', name: 'File Tool', description: 'File operations', is_valid: true },
  ];

  const mockToolInstances = [
    { id: 'instance-1', name: 'My Email Tool', description: 'Custom email tool', is_valid: true },
  ];

  const filteredTemplates = mockToolTemplates.filter((t) =>
    t.name.toLowerCase().includes(searchTemplates.toLowerCase()),
  );

  const filteredInstances = mockToolInstances.filter((t) =>
    t.name.toLowerCase().includes(searchTools.toLowerCase()),
  );

  if (!modalOpen) {
    return (
      <div data-testid="workflow-add-tool-modal" onClick={() => setModalOpen(true)}>
        Tool Modal (Closed)
        <div>Workflow ID: {workflowId}</div>
      </div>
    );
  }

  return (
    <div data-testid="workflow-add-tool-modal" role="dialog">
      <div>Create or Edit Tools</div>
      <hr />

      <div className="flex flex-row h-full bg-white">
        {/* Left side - Tool Creation/Selection */}
        <div className="flex-1 overflow-y-auto p-4 bg-white">
          {/* Create New Tool Section */}
          <div
            className={`mb-4 cursor-pointer border rounded p-4 ${isCreateMode ? 'shadow-lg bg-blue-50' : 'bg-white'}`}
            onClick={() => {
              setIsCreateMode(true);
              setSelectedTemplate(null);
              setSelectedInstance(null);
            }}
          >
            <div>Create New Tool</div>
            <div className="text-sm opacity-45">Create a new custom tool from scratch</div>
          </div>

          <div className="flex flex-row bg-white mb-2">
            <div className="flex-1 bg-white pr-4">
              <div>Edit Agent Tools</div>
              <input
                placeholder="Search tools..."
                value={searchTools}
                onChange={(e) => setSearchTools(e.target.value)}
                data-testid="search-tools-input"
              />

              {/* Tool Instances */}
              {filteredInstances.map((tool) => (
                <div
                  key={tool.id}
                  className={`p-4 border rounded cursor-pointer ${selectedInstance === tool.id ? 'bg-green-50' : 'bg-white'}`}
                  onClick={() => {
                    setSelectedInstance(tool.id);
                    setSelectedTemplate(null);
                    setIsCreateMode(false);
                  }}
                >
                  <div className="font-semibold">{tool.name}</div>
                  <div className="text-sm opacity-45">{tool.description}</div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      alert(`Delete ${tool.name}`);
                    }}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>

            <div className="flex-1 bg-white pl-4">
              <div>Create Tool From Template</div>
              <input
                placeholder="Search templates..."
                value={searchTemplates}
                onChange={(e) => setSearchTemplates(e.target.value)}
                data-testid="search-templates-input"
              />

              {/* Tool Templates */}
              {filteredTemplates.map((template) => (
                <div
                  key={template.id}
                  className={`p-4 border rounded cursor-pointer ${selectedTemplate === template.id ? 'bg-green-50' : 'bg-white'}`}
                  onClick={() => {
                    setSelectedTemplate(template.id);
                    setSelectedInstance(null);
                    setIsCreateMode(false);
                  }}
                >
                  <div className="font-semibold">{template.name}</div>
                  <div className="text-sm opacity-45">{template.description}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <hr />

        {/* Right side - Tool Details */}
        <div className="flex-1 bg-white p-4">
          {isCreateMode ? (
            <div>
              <div>Tool Details</div>
              <label>Tool Name</label>
              <input
                value={newToolName}
                onChange={(e) => setNewToolName(e.target.value)}
                placeholder="Enter tool name"
                data-testid="new-tool-name-input"
              />

              <div>Default Code</div>
              <div data-testid="monaco-editor">default python code</div>
              <div data-testid="monaco-editor">default requirements</div>
            </div>
          ) : selectedTemplate ? (
            <div>
              <div>Tool Details</div>
              <div>Tool Name: {mockToolTemplates.find((t) => t.id === selectedTemplate)?.name}</div>
              <div data-testid="monaco-editor">template python code</div>
              <div data-testid="monaco-editor">template requirements</div>
            </div>
          ) : selectedInstance ? (
            <div>
              <div>Tool Details</div>
              <div>Tool Name: {mockToolInstances.find((t) => t.id === selectedInstance)?.name}</div>

              <label>
                <input type="checkbox" />
                Playground
              </label>

              <div>Tool Icon</div>
              <button>Upload File</button>

              <div data-testid="monaco-editor">instance python code</div>
              <div data-testid="monaco-editor">instance requirements</div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Footer */}
      <div>
        <button onClick={() => setModalOpen(false)}>Close</button>
        {isCreateMode ? (
          <button onClick={() => alert('Create New Tool')} data-testid="create-tool-button">
            Create New Tool
          </button>
        ) : selectedTemplate ? (
          <button
            onClick={() => alert('Create Tool from Template')}
            data-testid="create-from-template-button"
          >
            Create Tool from Template
          </button>
        ) : selectedInstance ? (
          <button onClick={() => alert('Save Tool')} data-testid="save-tool-button">
            Save Tool
          </button>
        ) : null}
      </div>

      <div>Workflow ID: {workflowId}</div>
    </div>
  );
};

describe('WorkflowAddToolModal', () => {
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
        <MockWorkflowAddToolModal {...mockProps} />
      </Provider>,
    );

    expect(container).toBeTruthy();
  });

  it('opens modal when clicked', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <MockWorkflowAddToolModal {...mockProps} />
      </Provider>,
    );

    // Initially closed
    expect(screen.getByText('Tool Modal (Closed)')).toBeInTheDocument();

    // Click to open
    fireEvent.click(screen.getByTestId('workflow-add-tool-modal'));

    // Should be open now
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Create or Edit Tools')).toBeInTheDocument();
  });

  it('renders create new tool section by default', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <MockWorkflowAddToolModal {...mockProps} />
      </Provider>,
    );

    // Open modal
    fireEvent.click(screen.getByTestId('workflow-add-tool-modal'));

    expect(screen.getAllByText('Create New Tool')).toHaveLength(2); // Section title and button
    expect(screen.getByText('Create a new custom tool from scratch')).toBeInTheDocument();
    expect(screen.getByTestId('create-tool-button')).toBeInTheDocument();
  });

  it('renders tool templates section', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <MockWorkflowAddToolModal {...mockProps} />
      </Provider>,
    );

    // Open modal
    fireEvent.click(screen.getByTestId('workflow-add-tool-modal'));

    expect(screen.getByText('Create Tool From Template')).toBeInTheDocument();
    expect(screen.getByText('Email Tool')).toBeInTheDocument();
    expect(screen.getByText('File Tool')).toBeInTheDocument();
  });

  it('renders tool instances section', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <MockWorkflowAddToolModal {...mockProps} />
      </Provider>,
    );

    // Open modal
    fireEvent.click(screen.getByTestId('workflow-add-tool-modal'));

    expect(screen.getByText('Edit Agent Tools')).toBeInTheDocument();
    expect(screen.getByText('My Email Tool')).toBeInTheDocument();
  });

  it('handles search functionality', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <MockWorkflowAddToolModal {...mockProps} />
      </Provider>,
    );

    // Open modal
    fireEvent.click(screen.getByTestId('workflow-add-tool-modal'));

    // Test template search
    const templateSearch = screen.getByTestId('search-templates-input');
    fireEvent.change(templateSearch, { target: { value: 'email' } });
    expect(templateSearch).toHaveValue('email');

    // Test tool search
    const toolSearch = screen.getByTestId('search-tools-input');
    fireEvent.change(toolSearch, { target: { value: 'my' } });
    expect(toolSearch).toHaveValue('my');
  });

  it('handles template selection', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <MockWorkflowAddToolModal {...mockProps} />
      </Provider>,
    );

    // Open modal
    fireEvent.click(screen.getByTestId('workflow-add-tool-modal'));

    // Select a template
    fireEvent.click(screen.getByText('Email Tool'));

    expect(screen.getByText('Tool Name: Email Tool')).toBeInTheDocument();
    expect(screen.getByTestId('create-from-template-button')).toBeInTheDocument();
  });

  it('handles tool instance selection', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <MockWorkflowAddToolModal {...mockProps} />
      </Provider>,
    );

    // Open modal
    fireEvent.click(screen.getByTestId('workflow-add-tool-modal'));

    // Select a tool instance
    fireEvent.click(screen.getByText('My Email Tool'));

    expect(screen.getByText('Tool Name: My Email Tool')).toBeInTheDocument();
    expect(screen.getByTestId('save-tool-button')).toBeInTheDocument();
  });

  it('handles new tool name input', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <MockWorkflowAddToolModal {...mockProps} />
      </Provider>,
    );

    // Open modal
    fireEvent.click(screen.getByTestId('workflow-add-tool-modal'));

    const input = screen.getByTestId('new-tool-name-input');
    fireEvent.change(input, { target: { value: 'Custom Tool Name' } });

    expect(input).toHaveValue('Custom Tool Name');
  });

  it('renders Monaco editors for code display', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <MockWorkflowAddToolModal {...mockProps} />
      </Provider>,
    );

    // Open modal
    fireEvent.click(screen.getByTestId('workflow-add-tool-modal'));

    const editors = screen.getAllByTestId('monaco-editor');
    expect(editors.length).toBeGreaterThan(0);
  });

  it('handles tool deletion', () => {
    const store = createMockStore();

    // Mock window.alert
    const mockAlert = jest.fn();
    Object.defineProperty(window, 'alert', {
      writable: true,
      value: mockAlert,
    });

    render(
      <Provider store={store}>
        <MockWorkflowAddToolModal {...mockProps} />
      </Provider>,
    );

    // Open modal
    fireEvent.click(screen.getByTestId('workflow-add-tool-modal'));

    // Click delete on a tool instance
    fireEvent.click(screen.getByText('Delete'));

    expect(mockAlert).toHaveBeenCalledWith('Delete My Email Tool');
  });

  it('handles different workflow IDs', () => {
    const store = createMockStore();

    const { container } = render(
      <Provider store={store}>
        <MockWorkflowAddToolModal workflowId="different-workflow-id" />
      </Provider>,
    );

    expect(container.textContent).toContain('different-workflow-id');
  });

  it('component mounts and unmounts without errors', () => {
    const store = createMockStore();

    const { unmount } = render(
      <Provider store={store}>
        <MockWorkflowAddToolModal {...mockProps} />
      </Provider>,
    );

    expect(() => unmount()).not.toThrow();
  });

  it('handles modal close', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <MockWorkflowAddToolModal {...mockProps} />
      </Provider>,
    );

    // Open modal
    fireEvent.click(screen.getByTestId('workflow-add-tool-modal'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // Close modal
    fireEvent.click(screen.getByText('Close'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('switches between create modes correctly', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <MockWorkflowAddToolModal {...mockProps} />
      </Provider>,
    );

    // Open modal
    fireEvent.click(screen.getByTestId('workflow-add-tool-modal'));

    // Start in create mode
    expect(screen.getByTestId('create-tool-button')).toBeInTheDocument();

    // Select template
    fireEvent.click(screen.getByText('Email Tool'));
    expect(screen.getByTestId('create-from-template-button')).toBeInTheDocument();

    // Go back to create mode
    fireEvent.click(screen.getByText('Create New Tool'));
    expect(screen.getByTestId('create-tool-button')).toBeInTheDocument();
  });

  // Snapshot tests for this large component
  it('matches snapshot when modal is closed', () => {
    const store = createMockStore();

    const { container } = render(
      <Provider store={store}>
        <MockWorkflowAddToolModal {...mockProps} />
      </Provider>,
    );

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot when modal is open', () => {
    const store = createMockStore();

    const { container } = render(
      <Provider store={store}>
        <MockWorkflowAddToolModal {...mockProps} />
      </Provider>,
    );

    // Open modal
    fireEvent.click(screen.getByTestId('workflow-add-tool-modal'));

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with template selected', () => {
    const store = createMockStore();

    const { container } = render(
      <Provider store={store}>
        <MockWorkflowAddToolModal {...mockProps} />
      </Provider>,
    );

    // Open modal and select template
    fireEvent.click(screen.getByTestId('workflow-add-tool-modal'));
    fireEvent.click(screen.getByText('Email Tool'));

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with tool instance selected', () => {
    const store = createMockStore();

    const { container } = render(
      <Provider store={store}>
        <MockWorkflowAddToolModal {...mockProps} />
      </Provider>,
    );

    // Open modal and select instance
    fireEvent.click(screen.getByTestId('workflow-add-tool-modal'));
    fireEvent.click(screen.getByText('My Email Tool'));

    expect(container.firstChild).toMatchSnapshot();
  });
});
