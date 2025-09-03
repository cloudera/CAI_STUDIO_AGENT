import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ExtraHeadersComponent from './ExtraHeadersComponent';

// Mock window.matchMedia function required by Ant Design
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

// Mock the Redux hooks and actions
const mockDispatch = jest.fn();
const mockExtraHeaders = { 'X-API-Key': 'test-api-key', Authorization: 'Bearer token123' };

jest.mock('@/app/lib/hooks/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: any) => {
    if (selector === selectModelRegisterExtraHeaders) {
      return mockExtraHeaders;
    }
    return null;
  },
}));

jest.mock('@/app/models/modelsSlice', () => ({
  selectModelRegisterExtraHeaders: jest.fn(),
  setModelRegisterExtraHeaders: jest.fn((payload) => ({
    type: 'setModelRegisterExtraHeaders',
    payload,
  })),
}));

// Import the actual selectors to use in our mocks
import { selectModelRegisterExtraHeaders } from '@/app/models/modelsSlice';

describe('ExtraHeadersComponent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders the extra headers from Redux state', () => {
    render(<ExtraHeadersComponent />);

    // Check for header key inputs
    const keyInputs = screen.getAllByPlaceholderText('Header key');
    expect(keyInputs).toHaveLength(2);
    expect(keyInputs[0]).toHaveValue('X-API-Key');
    expect(keyInputs[1]).toHaveValue('Authorization');

    // Check for header value inputs (they are password fields)
    const valueInputs = screen.getAllByPlaceholderText('Header value');
    expect(valueInputs).toHaveLength(2);
    // Due to security masking in password fields, we can't check the exact value
    // but we can check they exist
    expect(valueInputs[0]).toBeInTheDocument();
    expect(valueInputs[1]).toBeInTheDocument();
  });

  test('renders the add header button', () => {
    render(<ExtraHeadersComponent />);

    const addButton = screen.getByText('Add Header');
    expect(addButton).toBeInTheDocument();
  });

  test('calls dispatch with updated headers when adding a new header', () => {
    render(<ExtraHeadersComponent />);

    // Find and click the add header button
    const addButton = screen.getByText('Add Header');
    fireEvent.click(addButton);

    // Check that dispatch was called with the right action
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'setModelRegisterExtraHeaders',
      payload: {
        'X-API-Key': 'test-api-key',
        Authorization: 'Bearer token123',
        '': '',
      },
    });
  });

  test('calls dispatch with updated headers when removing a header', () => {
    render(<ExtraHeadersComponent />);

    // Find and click the remove button for the first header
    const removeButtons = screen.getAllByRole('img', { name: /minus-circle/ });
    fireEvent.click(removeButtons[0]);

    // Check that dispatch was called with the right action (without the first header)
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'setModelRegisterExtraHeaders',
      payload: {
        Authorization: 'Bearer token123',
      },
    });
  });

  test('calls dispatch with updated headers when changing a header key', () => {
    render(<ExtraHeadersComponent />);

    // Find the key input for the first header and change its value
    const keyInputs = screen.getAllByPlaceholderText('Header key');
    fireEvent.change(keyInputs[0], { target: { value: 'New-API-Key' } });

    // Check that dispatch was called with the right action
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'setModelRegisterExtraHeaders',
      payload: {
        'New-API-Key': 'test-api-key',
        Authorization: 'Bearer token123',
      },
    });
  });

  test('calls dispatch with updated headers when changing a header value', () => {
    render(<ExtraHeadersComponent />);

    // Find the value input for the first header and change its value
    const valueInputs = screen.getAllByPlaceholderText('Header value');
    fireEvent.change(valueInputs[0], { target: { value: 'new-api-key-value' } });

    // Check that dispatch was called with the right action
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'setModelRegisterExtraHeaders',
      payload: {
        'X-API-Key': 'new-api-key-value',
        Authorization: 'Bearer token123',
      },
    });
  });

  test('handles empty key when updating header key', () => {
    render(<ExtraHeadersComponent />);

    // Find the key input for the first header and change to empty string
    const keyInputs = screen.getAllByPlaceholderText('Header key');
    fireEvent.change(keyInputs[0], { target: { value: '' } });

    // Check that dispatch was called with the right action (key removed)
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'setModelRegisterExtraHeaders',
      payload: {
        Authorization: 'Bearer token123',
      },
    });
  });

  test('preserves whitespace in header keys', () => {
    render(<ExtraHeadersComponent />);

    // Find the key input for the first header and change to a value with whitespace
    const keyInputs = screen.getAllByPlaceholderText('Header key');
    fireEvent.change(keyInputs[0], { target: { value: '  Whitespace-Key  ' } });

    // Check that dispatch was called with the right action (with whitespace preserved)
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'setModelRegisterExtraHeaders',
      payload: {
        '  Whitespace-Key  ': 'test-api-key',
        Authorization: 'Bearer token123',
      },
    });
  });

  test('renders correctly with empty headers object', () => {
    // Override the mock for this specific test
    jest.spyOn(require('@/app/lib/hooks/hooks'), 'useAppSelector').mockReturnValueOnce({});

    render(<ExtraHeadersComponent />);

    // Should only show the Add Header button
    const addButton = screen.getByText('Add Header');
    expect(addButton).toBeInTheDocument();

    // No header inputs should be rendered
    const keyInputs = screen.queryAllByPlaceholderText('Header key');
    expect(keyInputs).toHaveLength(0);
  });

  test('handles null headers gracefully', () => {
    // Override the mock for this specific test
    jest.spyOn(require('@/app/lib/hooks/hooks'), 'useAppSelector').mockReturnValueOnce(null);

    render(<ExtraHeadersComponent />);

    // Should still render without errors
    const addButton = screen.getByText('Add Header');
    expect(addButton).toBeInTheDocument();
  });
});
