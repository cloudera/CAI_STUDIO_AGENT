import { configureStore } from '@reduxjs/toolkit';

import { apiSlice } from '../api/apiSlice';
import { modelsApi } from '../models/modelsApi';
import { workflowAppApi } from '../workflows/workflowAppApi';
import { opsApi } from '../ops/opsApi';
import { toolsApi } from '../tools/toolTemplatesApi';
import { workflowsApi } from '../workflows/workflowsApi';
import { agentsApi } from '../agents/agentApi';
import { tasksApi } from '../tasks/tasksApi';
import { toolInstancesApi } from '../tools/toolInstancesApi';
import { mcpTemplatesApi } from '../mcp/mcpTemplatesApi';
import { mcpInstancesApi } from '../mcp/mcpInstancesApi';
import editorReducer from '../workflows/editorSlice';
import workflowAppReducer from '../workflows/workflowAppSlice';
import modelsReducer from '../models/modelsSlice';

export const makeStore = () => {
  return configureStore({
    reducer: {
      [apiSlice.reducerPath]: apiSlice.reducer,
      editor: editorReducer,
      workflowApp: workflowAppReducer,
      models: modelsReducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware()
        .concat(apiSlice.middleware)
        .concat(workflowAppApi.middleware)
        .concat(opsApi.middleware)
        .concat(modelsApi.middleware)
        .concat(toolsApi.middleware)
        .concat(toolInstancesApi.middleware)
        .concat(mcpTemplatesApi.middleware)
        .concat(mcpInstancesApi.middleware)
        .concat(workflowsApi.middleware)
        .concat(agentsApi.middleware)
        .concat(tasksApi.middleware),
    devTools: {
      name: 'agent-studio-redux-store',
    },
  });
};

// Infer the type of makeStore
export type AppStore = ReturnType<typeof makeStore>;
// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];
