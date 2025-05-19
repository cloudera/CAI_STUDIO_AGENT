import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

export const TagTypes = [
  'Model',
  'Ops',
  'Workflow',
  'Agent',
  'ToolInstance',
  'Task',
  'WorkflowTemplate',
  'AgentTemplate',
  'TaskTemplate',
  'ToolTemplate',
  'DeployedWorkflow',
  'WorkflowApp',
  'MCPTemplate',
  'MCPInstance',
];

export const apiSlice = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({ baseUrl: '/api' }),
  tagTypes: TagTypes.slice(),
  endpoints: () => ({}),
});
