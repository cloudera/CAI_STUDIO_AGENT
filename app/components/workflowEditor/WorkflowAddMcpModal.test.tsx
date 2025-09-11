/**
 * @jest-environment jsdom
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
// Component will be required after mocks so mocks take effect before module loads

// Keep console.error suppressed locally in this file to avoid interacting with global setup
const originalConsoleError = console.error;
console.error = jest.fn();

// Mock window.matchMedia used by Ant Design
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

// Mock Ant Design Modal to avoid portal rendering in tests (keeps rendering inline)
jest.mock('antd', () => {
  const antd = jest.requireActual('antd');
  const Inline = ({ children, title, footer, ...props }: any) => (
    <div {...props}>
      {title ? <div>{title}</div> : null}
      {children}
      {footer ? (
        <div>
          {Array.isArray(footer) ? (
            footer.map((f: any, i: number) => <span key={i}>{f}</span>)
          ) : (
            <span>{footer}</span>
          )}
        </div>
      ) : null}
    </div>
  );
  const MockImage = ({ src, alt }: any) => <img src={src} alt={alt} />;
  const MockSpin = ({ children }: any) => <div>{children}</div>;
  const MockList = ({ children, dataSource, renderItem }: any) => (
    <div>
      {Array.isArray(dataSource) && typeof renderItem === 'function'
        ? dataSource.map((item: any, idx: number) => <div key={idx}>{renderItem(item)}</div>)
        : children}
    </div>
  );
  const MockListItem = ({ children }: any) => <div>{children}</div>;
  MockListItem.displayName = 'MockListItem';
  MockList.Item = MockListItem;
  const MockRadio = ({ children }: any) => <span>{children}</span>;
  const MockCheckbox = ({ children }: any) => <label>{children}</label>;
  const MockTooltip = ({ children }: any) => <span>{children}</span>;
  const MockDivider = ({ _children }: any) => <hr />;
  const MockLayout = ({ children }: any) => <div>{children}</div>;
  const MockTypography = {
    Title: ({ children }: any) => <div>{children}</div>,
    Text: ({ children }: any) => <span>{children}</span>,
  };
  const MockButton = ({ children, ...props }: any) => <button {...props}>{children}</button>;

  return {
    ...antd,
    Modal: Inline,
    Image: MockImage,
    Spin: MockSpin,
    List: MockList,
    Radio: MockRadio,
    Checkbox: MockCheckbox,
    Tooltip: MockTooltip,
    Divider: MockDivider,
    Layout: MockLayout,
    Typography: MockTypography,
    Button: MockButton,
  };
});

// Shared mutable mock data for hooks
let mockMcpTemplates: any[] = [];
let mockMcpInstances: any[] = [];
let mockAgents: any[] = [];

jest.mock('@/app/mcp/mcpTemplatesApi', () => ({
  useListGlobalMcpTemplatesQuery: () => ({ data: mockMcpTemplates }),
}));

jest.mock('@/app/mcp/mcpInstancesApi', () => ({
  useListMcpInstancesQuery: (_opts: any) => ({ data: mockMcpInstances, refetch: jest.fn() }),
  useCreateMcpInstanceMutation: () => [jest.fn()],
  useUpdateMcpInstanceMutation: () => [jest.fn()],
  useGetMcpInstanceMutation: () => [jest.fn()],
}));

jest.mock('@/app/agents/agentApi', () => ({
  useListAgentsQuery: () => ({ data: mockAgents }),
  useUpdateAgentMutation: () => [jest.fn()],
}));

jest.mock('@/app/lib/hooks/useAssetData', () => ({
  useImageAssetsData: () => ({ imageData: {} }),
}));

jest.mock('../McpTemplateView', () => {
  return function MockMcpTemplateView() {
    return <div data-testid="mcp-template-view">McpTemplateView</div>;
  };
});

jest.mock('../Notifications', () => ({
  useGlobalNotification: () => ({ success: jest.fn(), error: jest.fn(), info: jest.fn() }),
}));

// Mock redux hooks: provide an app-shaped default for selectors used by the component
jest.mock('react-redux', () => ({
  ...jest.requireActual('react-redux'),
  useDispatch: () => jest.fn(),
  useSelector: jest.fn((selector: any) => {
    // If selector looks like selectEditorAgentViewCreateAgentState, return a minimal createAgentState
    if (
      selector &&
      selector.toString &&
      selector.toString().includes('selectEditorAgentViewCreateAgentState')
    ) {
      return { mcpInstances: [] };
    }
    return undefined;
  }),
}));

// Create a mock store; keep reducer shape minimal
const createMockStore = () => {
  return configureStore({
    reducer: {
      editor: (state = { agentViewCreateAgent: { mcpInstances: [] } }) => state,
    },
  });
};

// Require the component after mocks so Ant Design and other mocks are effective
const WorkflowAddMcpModal = require('./WorkflowAddMcpModal').default;

describe('WorkflowAddMcpModal', () => {
  const mockProps = {
    workflowId: 'test-workflow-id',
    preSelectedMcpInstance: undefined,
    open: false,
    onCancel: jest.fn(),
  };

  afterAll(() => {
    console.error = originalConsoleError;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // reset shared mocks
    mockMcpTemplates = [];
    mockMcpInstances = [];
    mockAgents = [];
  });

  it('renders without crashing when closed', () => {
    const store = createMockStore();
    const { container } = render(
      <Provider store={store}>
        <WorkflowAddMcpModal {...mockProps} />
      </Provider>,
    );
    expect(container).toBeTruthy();
  });

  it('renders without crashing when open', () => {
    const store = createMockStore();
    const { container } = render(
      <Provider store={store}>
        <WorkflowAddMcpModal {...mockProps} open={true} />
      </Provider>,
    );
    expect(container).toBeTruthy();
  });

  it('renders MCP template view when a template exists', () => {
    mockMcpTemplates = [{ id: 'tpl-1', name: 'Template 1', image_uri: 'img1.png' }];
    const store = createMockStore();
    render(
      <Provider store={store}>
        <WorkflowAddMcpModal {...mockProps} open={true} />
      </Provider>,
    );
    // The template list should render the template name (may be split across nodes)
    expect(
      screen.getByText((content, _node) => content.includes('Template 1')),
    ).toBeInTheDocument();
  });
  it('renders expected sections when closed', () => {
    const store = createMockStore();
    const { container } = render(
      <Provider store={store}>
        <WorkflowAddMcpModal {...mockProps} />
      </Provider>,
    );
    expect(container.firstChild).toBeTruthy();
    expect(container.firstChild).toHaveTextContent('Add or Edit MCPs');
  });

  it('renders modal title when open', () => {
    const store = createMockStore();
    render(
      <Provider store={store}>
        <WorkflowAddMcpModal {...mockProps} open={true} />
      </Provider>,
    );
    expect(screen.getByText((c) => c.includes('Add or Edit MCPs'))).toBeInTheDocument();
  });

  it('renders edit server view for pre-selected instance', () => {
    const store = createMockStore();
    const preSelectedInstance = {
      id: 'instance-1',
      name: 'Test Instance',
      image_uri: 'test-image.png',
      status: 'VALID',
      activated_tools: ['tool1'],
      tools: JSON.stringify([{ name: 'tool1', description: 'desc' }]),
      env_names: [],
      // minimal additional fields to satisfy McpInstance shape in TypeScript
      type: '',
      args: [],
      workflow_id: 'test-workflow-id',
    };

    render(
      <Provider store={store}>
        <WorkflowAddMcpModal
          {...mockProps}
          open={true}
          preSelectedMcpInstance={preSelectedInstance}
        />
      </Provider>,
    );

    expect(screen.getByText((c) => c.includes('Edit Server'))).toBeInTheDocument();
  });

  it('full modal snapshot when open', () => {
    const store = createMockStore();
    const { container } = render(
      <Provider store={store}>
        <WorkflowAddMcpModal {...mockProps} open={true} />
      </Provider>,
    );

    expect(container.firstChild).toMatchSnapshot();
  });
});
