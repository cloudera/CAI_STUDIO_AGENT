import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { RootState } from '../lib/store';
import { Model } from '@/studio/proto/agent_studio';
import { DEFAULT_MODEL_TEST_MESSAGE } from '@/app/lib/constants';

export interface ModelRegisterState {
  modelId?: string;
  modelName?: string;
  modelType?: string;
  providerModel?: string;
  apiBase?: string;
  apiKey?: string;
  extraHeaders?: Record<string, string>;
  setAsDefault?: boolean;
  // Bedrock-specific fields
  awsRegionName?: string;
  awsAccessKeyId?: string;
  awsSecretAccessKey?: string;
  awsSessionToken?: string;
}

export interface ModelTestState {
  modelId?: string;
  testMessage?: string;
  testResponse?: string;
}

export interface ModelsState {
  isTestDrawerOpen: boolean;
  isRegisterDrawerOpen: boolean;
  modelRegisterDetails: ModelRegisterState;
  modelTestDetails: ModelTestState;
  modelsStatus: Record<string, 'success' | 'failure' | 'pending'>;
}

export const initialModelRegisterDetails: ModelRegisterState = {
  modelType: 'CAII',
};

export const initialModelTestDetails: ModelTestState = {
  testMessage: DEFAULT_MODEL_TEST_MESSAGE,
};

export const initialState: ModelsState = {
  isTestDrawerOpen: false,
  isRegisterDrawerOpen: false,
  modelRegisterDetails: initialModelRegisterDetails,
  modelTestDetails: initialModelTestDetails,
  modelsStatus: {},
};

export const modelsSlice = createSlice({
  name: 'models',
  initialState,
  reducers: {
    setIsTestDrawerOpen: (state, action: PayloadAction<boolean>) => {
      state.isTestDrawerOpen = action.payload;
    },
    setIsRegisterDrawerOpen: (state, action: PayloadAction<boolean>) => {
      state.isRegisterDrawerOpen = action.payload;
    },
    setModelRegisterDetails: (state, action: PayloadAction<ModelRegisterState>) => {
      state.modelRegisterDetails = action.payload;
    },
    setModelsStatus: (
      state,
      action: PayloadAction<Record<string, 'success' | 'failure' | 'pending'>>,
    ) => {
      state.modelsStatus = action.payload;
    },
    updateModelStatus: (
      state,
      action: PayloadAction<{ modelId: string; status: 'success' | 'failure' | 'pending' }>,
    ) => {
      state.modelsStatus[action.payload.modelId] = action.payload.status;
    },
    populateModelRegisterDetails: (state, action: PayloadAction<Model>) => {
      state.modelRegisterDetails = {
        modelId: action.payload.model_id,
        modelName: action.payload.model_name,
        modelType: action.payload.model_type,
        providerModel: action.payload.provider_model,
        apiBase: action.payload.api_base,
        apiKey: '', // NOTE: we don't pass the API key when freshly populating details from a model.
        extraHeaders: action.payload.extra_headers ? JSON.parse(action.payload.extra_headers) : {},
        // Only Bedrock exposes region (keys are never exposed)
        awsRegionName: action.payload.aws_region_name || '',
        awsAccessKeyId: '',
        awsSecretAccessKey: '',
        awsSessionToken: '',
      };
    },
    resetModelRegisterDetails: (state) => {
      state.modelRegisterDetails = initialModelRegisterDetails;
    },
    setModelRegisterId: (state, action: PayloadAction<string>) => {
      state.modelRegisterDetails.modelId = action.payload;
    },
    setModelRegisterName: (state, action: PayloadAction<string>) => {
      state.modelRegisterDetails.modelName = action.payload;
    },
    setModelRegisterType: (state, action: PayloadAction<string>) => {
      state.modelRegisterDetails.modelType = action.payload;
    },
    setModelRegisterApiBase: (state, action: PayloadAction<string>) => {
      state.modelRegisterDetails.apiBase = action.payload;
    },
    setModelRegisterApiKey: (state, action: PayloadAction<string>) => {
      state.modelRegisterDetails.apiKey = action.payload;
    },
    setModelRegisterProviderModel: (state, action: PayloadAction<string>) => {
      state.modelRegisterDetails.providerModel = action.payload;
    },
    setModelRegisterExtraHeaders: (state, action: PayloadAction<Record<string, string>>) => {
      state.modelRegisterDetails.extraHeaders = action.payload;
    },
    // Bedrock-specific setters
    setModelRegisterAwsRegionName: (state, action: PayloadAction<string>) => {
      state.modelRegisterDetails.awsRegionName = action.payload;
    },
    setModelRegisterAwsAccessKeyId: (state, action: PayloadAction<string>) => {
      state.modelRegisterDetails.awsAccessKeyId = action.payload;
    },
    setModelRegisterAwsSecretAccessKey: (state, action: PayloadAction<string>) => {
      state.modelRegisterDetails.awsSecretAccessKey = action.payload;
    },
    setModelRegisterAwsSessionToken: (state, action: PayloadAction<string>) => {
      state.modelRegisterDetails.awsSessionToken = action.payload;
    },
    setModelRegisterSetAsDefault: (state, action: PayloadAction<boolean>) => {
      state.modelRegisterDetails.setAsDefault = action.payload;
    },
    setModelTestDetails: (state, action: PayloadAction<ModelTestState>) => {
      state.modelTestDetails = action.payload;
    },
    resetModelTestDetails: (state) => {
      state.modelTestDetails = initialModelTestDetails;
    },
    setModelTestId: (state, action: PayloadAction<string>) => {
      state.modelTestDetails.modelId = action.payload;
    },
    setModelTestMessage: (state, action: PayloadAction<string>) => {
      state.modelTestDetails.testMessage = action.payload;
    },
    setModelTestResponse: (state, action: PayloadAction<string>) => {
      state.modelTestDetails.testResponse = action.payload;
    },
  },
});

export const {
  setIsTestDrawerOpen,
  setIsRegisterDrawerOpen,
  setModelRegisterDetails,
  resetModelRegisterDetails,
  setModelRegisterId,
  setModelRegisterName,
  setModelRegisterType,
  setModelRegisterApiBase,
  setModelRegisterApiKey,
  setModelRegisterProviderModel,
  setModelRegisterExtraHeaders,
  setModelRegisterSetAsDefault,
  setModelTestDetails,
  resetModelTestDetails,
  setModelTestId,
  setModelTestMessage,
  setModelTestResponse,
  populateModelRegisterDetails,
  setModelsStatus,
  updateModelStatus,
  setModelRegisterAwsRegionName,
  setModelRegisterAwsAccessKeyId,
  setModelRegisterAwsSecretAccessKey,
  setModelRegisterAwsSessionToken,
} = modelsSlice.actions;

export const selectIsTestDrawerOpen = (state: RootState) => state.models.isTestDrawerOpen;
export const selectIsRegisterDrawerOpen = (state: RootState) => state.models.isRegisterDrawerOpen;
export const selectModelRegister = (state: RootState) => state.models.modelRegisterDetails;
export const selectModelRegisterId = (state: RootState) =>
  state.models.modelRegisterDetails.modelId;
export const selectModelRegisterName = (state: RootState) =>
  state.models.modelRegisterDetails.modelName;
export const selectModelRegisterType = (state: RootState) =>
  state.models.modelRegisterDetails.modelType;
export const selectModelRegisterProviderModel = (state: RootState) =>
  state.models.modelRegisterDetails.providerModel;
export const selectModelRegisterApiBase = (state: RootState) =>
  state.models.modelRegisterDetails.apiBase;
export const selectModelRegisterApiKey = (state: RootState) =>
  state.models.modelRegisterDetails.apiKey;
export const selectModelRegisterExtraHeaders = (state: RootState) =>
  state.models.modelRegisterDetails.extraHeaders;
export const selectModelRegisterSetAsDefault = (state: RootState) =>
  state.models.modelRegisterDetails.setAsDefault;
export const selectModelRegisterAwsRegionName = (state: RootState) =>
  state.models.modelRegisterDetails.awsRegionName;
export const selectModelRegisterAwsAccessKeyId = (state: RootState) =>
  state.models.modelRegisterDetails.awsAccessKeyId;
export const selectModelRegisterAwsSecretAccessKey = (state: RootState) =>
  state.models.modelRegisterDetails.awsSecretAccessKey;
export const selectModelRegisterAwsSessionToken = (state: RootState) =>
  state.models.modelRegisterDetails.awsSessionToken;
export const selectModelTestId = (state: RootState) => state.models.modelTestDetails.modelId;
export const selectModelTestMessage = (state: RootState) =>
  state.models.modelTestDetails.testMessage;
export const selectModelTestResponse = (state: RootState) =>
  state.models.modelTestDetails.testResponse;
export const selectModelsStatus = (state: RootState) => state.models.modelsStatus;

export default modelsSlice.reducer;
