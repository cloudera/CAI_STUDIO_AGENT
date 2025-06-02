import { DEFAULT_GENERATION_CONFIG, INITIAL_LOCAL_STORAGE_STAGE } from './constants';
import { LocalStorageState, ViewSettings, WorkflowConfiguration } from './types';

/**
 * Get the full local storage state for Agent Studio. We store
 * app state information in the 'state' key as serialized JSON.
 * If a local storage app state does not exist yet for this client's
 * browser, we create and return an initial local storage state here but we do NOT
 * yet write it back to local storage.
 */
export const readLocalStorageState = () => {
  const rawState = localStorage.getItem('state');
  const storageState: LocalStorageState = rawState
    ? JSON.parse(rawState)
    : INITIAL_LOCAL_STORAGE_STAGE;
  return storageState;
};

/**
 * Retrieve view settings from local storage.
 */
export const readViewSettingsFromLocalStorage = () => {
  const storageState: LocalStorageState = readLocalStorageState();
  return storageState.viewSettings || INITIAL_LOCAL_STORAGE_STAGE.viewSettings;
};

/**
 * Set view settings in local storage.
 */
export const writeViewSettingsToLocalStorage = (viewSettings: ViewSettings) => {
  const storageState: LocalStorageState = readLocalStorageState();

  if (!storageState.viewSettings) {
    storageState.viewSettings = INITIAL_LOCAL_STORAGE_STAGE.viewSettings;
  }

  storageState.viewSettings = {
    ...storageState.viewSettings,
    ...viewSettings,
  };

  localStorage.setItem('state', JSON.stringify(storageState));
};

/**
 * Get the workflow configuration for this workflow. If the client's browser
 * hasn't initialied a default configuration for this workflow, we do that here.
 */
export const readWorkflowConfigurationFromLocalStorage = (workflowId: string) => {
  const storageState: LocalStorageState = readLocalStorageState();

  if (!storageState.workflowConfigurations) {
    storageState.workflowConfigurations = {};
  }

  if (!storageState.workflowConfigurations[workflowId]) {
    storageState.workflowConfigurations[workflowId] = {
      generationConfig: {
        ...DEFAULT_GENERATION_CONFIG,
      },
      toolConfigurations: {},
      mcpInstanceConfigurations: {},
    };
  }

  return storageState.workflowConfigurations[workflowId];
};

/**
 * Set a workflow's configuration. If the client's browser
 * hasn't initialied a default configuration for this workflow, we do that here.
 */
export const writeWorkflowConfigurationToLocalStorage = (
  workflowId: string,
  configuration: WorkflowConfiguration,
) => {
  const storageState: LocalStorageState = readLocalStorageState();

  if (!storageState.workflowConfigurations) {
    storageState.workflowConfigurations = {};
  }

  if (!storageState.workflowConfigurations[workflowId]) {
    storageState.workflowConfigurations[workflowId] = {
      generationConfig: {},
      toolConfigurations: {},
      mcpInstanceConfigurations: {},
    };
  }

  storageState.workflowConfigurations[workflowId] = {
    ...storageState.workflowConfigurations[workflowId],
    generationConfig: configuration.generationConfig,
    toolConfigurations: configuration.toolConfigurations,
    mcpInstanceConfigurations: configuration.mcpInstanceConfigurations,
  };

  localStorage.setItem('state', JSON.stringify(storageState));
};
