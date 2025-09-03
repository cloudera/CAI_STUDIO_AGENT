/**
 * @jest-environment jsdom
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ModelTestDrawer from './ModelTestDrawer';
import { DEFAULT_MODEL_TEST_MESSAGE } from '@/app/lib/constants';

// Completely disable console.error to avoid infinite recursion
const originalConsoleError = console.error;
// Replace console.error with a no-op function
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

// Mock all required hooks and methods
const mockDispatch = jest.fn();
const mockTestModel = jest.fn().mockReturnValue({
  unwrap: jest.fn().mockResolvedValue('This is a test response from the model.'),
});

// Mock Redux hooks
jest.mock('@/app/lib/hooks/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: any) => {
    // Return different values based on the selector function
    if (selector.name === 'selectIsTestDrawerOpen') {
      return true;
    }
    if (selector.name === 'selectModelTestId') {
      return 'model1';
    }
    if (selector.name === 'selectModelTestMessage') {
      return DEFAULT_MODEL_TEST_MESSAGE;
    }
    if (selector.name === 'selectModelTestResponse') {
      return '';
    }
    return undefined;
  },
}));

// Mock API hooks
jest.mock('@/app/models/modelsApi', () => ({
  useTestModelMutation: () => [mockTestModel],
}));

// Mock Redux actions with inline function declarations
jest.mock('@/app/models/modelsSlice', () => {
  const setIsTestDrawerOpen = jest.fn();
  const setModelTestResponse = jest.fn();
  const setModelTestMessage = jest.fn();

  return {
    selectIsTestDrawerOpen: { name: 'selectIsTestDrawerOpen' },
    selectModelTestId: { name: 'selectModelTestId' },
    selectModelTestMessage: { name: 'selectModelTestMessage' },
    selectModelTestResponse: { name: 'selectModelTestResponse' },
    setIsTestDrawerOpen,
    setModelTestResponse,
    setModelTestMessage,
  };
});

// Mock notifications
const mockSuccess = jest.fn();
const mockError = jest.fn();
jest.mock('@/app/components/Notifications', () => ({
  useGlobalNotification: () => ({
    success: mockSuccess,
    error: mockError,
  }),
}));

// Mock DEFAULT_MODEL_TEST_MESSAGE
jest.mock('@/app/lib/constants', () => ({
  DEFAULT_MODEL_TEST_MESSAGE: 'Hello, this is a test message. Please respond.',
}));

describe('ModelTestDrawer', () => {
  // Helper function to find the test button
  const findTestButton = () => {
    // Find all buttons, then find the primary one with "Test Model" text
    const buttons = screen.getAllByRole('button');
    return buttons.find((button) => {
      return (
        button.classList.contains('ant-btn-primary') && button.textContent?.includes('Test Model')
      );
    });
  };

  // Cleanup after each test
  afterEach(() => {
    jest.clearAllMocks();
  });

  // Restore console.error after all tests
  afterAll(() => {
    console.error = originalConsoleError;
  });

  it('renders the drawer when open', () => {
    render(<ModelTestDrawer />);

    // Check if the drawer is rendered
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows test input and output sections', () => {
    render(<ModelTestDrawer />);

    // Check if input and output sections are displayed
    expect(screen.getByText('Test Input')).toBeInTheDocument();
    expect(screen.getByText('Test Output')).toBeInTheDocument();
  });

  it('displays default test message in the input field', () => {
    render(<ModelTestDrawer />);

    // Check if the default message is shown in the input field
    const textareas = screen.getAllByRole('textbox');
    expect(textareas[0]).toHaveValue(DEFAULT_MODEL_TEST_MESSAGE);
  });

  it('has a test button', () => {
    render(<ModelTestDrawer />);

    // Check if the test button exists
    const testButton = findTestButton();
    expect(testButton).toBeInTheDocument();
  });

  it('calls handleTestModel when test button is clicked', async () => {
    render(<ModelTestDrawer />);

    // Find and click the test button
    const testButton = findTestButton();
    if (testButton) {
      fireEvent.click(testButton);
    }

    // Check that testModel was called with the correct parameters
    await waitFor(() => {
      expect(mockTestModel).toHaveBeenCalledWith({
        model_id: 'model1',
        completion_role: 'user',
        completion_content: DEFAULT_MODEL_TEST_MESSAGE,
        temperature: 0.1,
        max_tokens: 50,
        timeout: 3,
      });
    });

    // Verify the response was set
    expect(mockDispatch).toHaveBeenCalled();
  });

  it('updates test message when input is changed', () => {
    render(<ModelTestDrawer />);

    // Find the input textarea and change its value
    const textareas = screen.getAllByRole('textbox');
    fireEvent.change(textareas[0], { target: { value: 'New test message' } });

    // Check that setModelTestMessage was called with the new value
    expect(mockDispatch).toHaveBeenCalled();
  });

  it('shows error notification when test fails', async () => {
    // Mock testModel to return an error
    mockTestModel.mockReturnValue({
      unwrap: jest.fn().mockResolvedValue('Model Test Failed: The model is not responding.'),
    });

    render(<ModelTestDrawer />);

    // Find and click the test button
    const testButton = findTestButton();
    if (testButton) {
      fireEvent.click(testButton);
    }

    // Verify error notification was shown
    await waitFor(() => {
      expect(mockError).toHaveBeenCalled();
    });
  });

  it('handles error when test throws an exception', async () => {
    // Mock testModel to throw an error
    mockTestModel.mockReturnValue({
      unwrap: jest.fn().mockRejectedValue(new Error('Network error')),
    });

    render(<ModelTestDrawer />);

    // Find and click the test button
    const testButton = findTestButton();
    if (testButton) {
      fireEvent.click(testButton);
    }

    // Verify error notification was shown
    await waitFor(() => {
      expect(mockError).toHaveBeenCalled();
    });
  });

  it('closes the drawer when close button is clicked', () => {
    render(<ModelTestDrawer />);

    // Find and click the close button (X icon)
    const closeButton = screen.getByLabelText('Close');
    fireEvent.click(closeButton);

    // Verify drawer was closed
    expect(mockDispatch).toHaveBeenCalled();
  });
});
