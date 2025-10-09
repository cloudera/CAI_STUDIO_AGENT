/**
 * @jest-environment jsdom
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import ModelRegisterDrawer from './ModelRegisterDrawer';
import { Model } from '@/studio/proto/agent_studio';

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

// Mock data
const mockModels: Model[] = [
  {
    model_id: 'model1',
    model_name: 'Test Model 1',
    model_type: 'OPENAI',
    provider_model: 'gpt-4',
    is_studio_default: true,
    api_base: 'https://api.openai.com',
    extra_headers: '{}',
  },
  {
    model_id: 'model2',
    model_name: 'Test Model 2',
    model_type: 'AZURE_OPENAI',
    provider_model: 'gpt-35-turbo',
    is_studio_default: false,
    api_base: 'https://azure-openai.com',
    extra_headers: '{}',
  },
];

// Mock all required hooks and methods
const mockDispatch = jest.fn();
const mockAddModel = jest
  .fn()
  .mockReturnValue({ unwrap: jest.fn().mockResolvedValue('model-id-123') });
const mockGetModel = jest.fn().mockReturnValue({
  unwrap: jest.fn().mockResolvedValue({
    model_id: 'model1',
    model_name: 'Test Model 1',
    model_type: 'OPENAI',
    provider_model: 'gpt-4',
    api_base: 'https://api.openai.com',
    extra_headers: '{}',
  }),
});
const mockUpdateModel = jest.fn().mockReturnValue({ unwrap: jest.fn().mockResolvedValue({}) });
const mockSetDefaultModel = jest.fn().mockResolvedValue({});
const mockTestModel = jest.fn().mockReturnValue({ unwrap: jest.fn().mockResolvedValue('Success') });

// Mock Redux hooks
jest.mock('@/app/lib/hooks/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: any) => {
    // Return different values based on the selector function
    if (selector && selector.name === 'selectIsRegisterDrawerOpen') {
      return true;
    }
    if (selector && selector.name === 'selectModelRegisterId') {
      return 'model1';
    }
    if (selector && selector.name === 'selectModelRegisterName') {
      return 'Test Model 1';
    }
    if (selector && selector.name === 'selectModelRegisterType') {
      return 'OPENAI';
    }
    if (selector && selector.name === 'selectModelRegisterProviderModel') {
      return 'gpt-4';
    }
    if (selector && selector.name === 'selectModelRegisterApiBase') {
      return 'https://api.openai.com';
    }
    if (selector && selector.name === 'selectModelRegisterApiKey') {
      return 'api-key-123';
    }
    if (selector && selector.name === 'selectModelRegisterExtraHeaders') {
      return { 'X-API-Key': 'test-api-key' };
    }
    if (selector && selector.name === 'selectModelRegisterSetAsDefault') {
      return false;
    }
    // Bedrock-specific selectors used by the component should be safely handled in tests
    if (selector && selector.name === 'selectModelRegisterAwsRegionName') {
      return 'us-east-1';
    }
    if (selector && selector.name === 'selectModelRegisterAwsAccessKeyId') {
      return '';
    }
    if (selector && selector.name === 'selectModelRegisterAwsSecretAccessKey') {
      return '';
    }
    if (selector && selector.name === 'selectModelRegisterAwsSessionToken') {
      return '';
    }
    return undefined;
  },
}));

// Mock API hooks
jest.mock('@/app/models/modelsApi', () => ({
  useListModelsQuery: () => ({
    data: mockModels,
  }),
  useGetModelMutation: () => [mockGetModel],
  useUpdateModelMutation: () => [mockUpdateModel],
  useAddModelMutation: () => [mockAddModel],
  useSetDefaultModelMutation: () => [mockSetDefaultModel],
  useTestModelMutation: () => [mockTestModel],
}));

// Mock Redux actions with inline function declarations
jest.mock('@/app/models/modelsSlice', () => {
  const populateModelRegisterDetails = jest.fn();
  const resetModelRegisterDetails = jest.fn();
  const setIsRegisterDrawerOpen = jest.fn();

  return {
    populateModelRegisterDetails,
    selectModelRegisterId: { name: 'selectModelRegisterId' },
    resetModelRegisterDetails,
    selectModelRegisterName: { name: 'selectModelRegisterName' },
    selectModelRegisterType: { name: 'selectModelRegisterType' },
    selectModelRegisterProviderModel: { name: 'selectModelRegisterProviderModel' },
    selectModelRegisterApiBase: { name: 'selectModelRegisterApiBase' },
    selectModelRegisterApiKey: { name: 'selectModelRegisterApiKey' },
    selectModelRegisterExtraHeaders: { name: 'selectModelRegisterExtraHeaders' },
    setIsRegisterDrawerOpen,
    selectModelRegisterSetAsDefault: { name: 'selectModelRegisterSetAsDefault' },
    selectIsRegisterDrawerOpen: { name: 'selectIsRegisterDrawerOpen' },
    setModelRegisterProviderModel: jest.fn(),
    setModelRegisterType: jest.fn(),
    setModelRegisterName: jest.fn(),
    setModelRegisterApiBase: jest.fn(),
    setModelRegisterApiKey: jest.fn(),
    setModelRegisterSetAsDefault: jest.fn(),
    updateModelStatus: jest.fn(),
    // Bedrock-specific selectors and actions required by the component
    selectModelRegisterAwsRegionName: { name: 'selectModelRegisterAwsRegionName' },
    selectModelRegisterAwsAccessKeyId: { name: 'selectModelRegisterAwsAccessKeyId' },
    selectModelRegisterAwsSecretAccessKey: { name: 'selectModelRegisterAwsSecretAccessKey' },
    selectModelRegisterAwsSessionToken: { name: 'selectModelRegisterAwsSessionToken' },
    setModelRegisterAwsRegionName: jest.fn(),
    setModelRegisterAwsAccessKeyId: jest.fn(),
    setModelRegisterAwsSecretAccessKey: jest.fn(),
    setModelRegisterAwsSessionToken: jest.fn(),
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

// Mock ExtraHeadersComponent
jest.mock('./ExtraHeadersComponent', () => {
  return {
    __esModule: true,
    default: () => <div data-testid="extra-headers-component">Extra Headers Mock</div>,
  };
});

// Mock asyncTestModelWithRetry utility
jest.mock('@/app/models/utils', () => ({
  asyncTestModelWithRetry: jest.fn(),
}));

describe('ModelRegisterDrawer', () => {
  // Cleanup after each test
  afterEach(() => {
    jest.clearAllMocks();
  });

  // Restore console.error after all tests
  afterAll(() => {
    console.error = originalConsoleError;
  });

  it('renders the drawer when open', () => {
    render(<ModelRegisterDrawer />);

    // Check if the drawer is rendered with the correct title
    expect(screen.getByText('Edit Model')).toBeInTheDocument();
  });

  it('shows model provider dropdown', () => {
    render(<ModelRegisterDrawer />);

    // Check if model provider section is displayed
    expect(screen.getByText('Model Provider')).toBeInTheDocument();
  });

  it('shows "Save Changes" button in header', () => {
    render(<ModelRegisterDrawer />);

    // Check if the save button is present
    expect(screen.getByText('Save Changes')).toBeInTheDocument();
  });

  it('displays extra headers component in advanced options', async () => {
    render(<ModelRegisterDrawer />);

    // Open advanced options
    const advancedOptions = screen.getByText('Advanced Options');
    advancedOptions.click();

    // Check if extra headers component is rendered
    await waitFor(() => {
      expect(screen.getByTestId('extra-headers-component')).toBeInTheDocument();
    });
  });
});
