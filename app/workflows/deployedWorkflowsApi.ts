import {
  ListDeployedWorkflowsRequest,
  ListDeployedWorkflowsResponse,
  DeployedWorkflow,
  UndeployWorkflowRequest,
  SuspendDeployedWorkflowRequest,
  ResumeDeployedWorkflowRequest,
} from '@/studio/proto/agent_studio';

import { apiSlice } from '../api/apiSlice';

export const deployedWorkflowsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    listDeployedWorkflows: builder.query<DeployedWorkflow[], ListDeployedWorkflowsRequest>({
      query: (request) => ({
        url: '/grpc/listDeployedWorkflows',
        method: 'POST',
        body: request,
      }),
      transformResponse: (response: ListDeployedWorkflowsResponse) => {
        return response.deployed_workflows;
      },
      providesTags: [{ type: 'DeployedWorkflow', id: 'LIST' }],
    }),
    undeployWorkflow: builder.mutation<void, UndeployWorkflowRequest>({
      query: (request) => ({
        url: '/grpc/undeployWorkflow',
        method: 'POST',
        body: request,
      }),
      invalidatesTags: [{ type: 'DeployedWorkflow', id: 'LIST' }],
    }),
    suspendDeployedWorkflow: builder.mutation<void, SuspendDeployedWorkflowRequest>({
      query: (request) => ({
        url: '/grpc/suspendDeployedWorkflow',
        method: 'POST',
        body: request,
      }),
      invalidatesTags: [{ type: 'DeployedWorkflow', id: 'LIST' }],
    }),
    resumeDeployedWorkflow: builder.mutation<void, ResumeDeployedWorkflowRequest>({
      query: (request) => ({
        url: '/grpc/resumeDeployedWorkflow',
        method: 'POST',
        body: request,
      }),
      invalidatesTags: [{ type: 'DeployedWorkflow', id: 'LIST' }],
    }),
  }),
});

export const {
  useListDeployedWorkflowsQuery,
  useUndeployWorkflowMutation,
  useSuspendDeployedWorkflowMutation,
  useResumeDeployedWorkflowMutation,
} = deployedWorkflowsApi;
