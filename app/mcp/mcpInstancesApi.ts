import {
  McpInstance,
  ListMcpInstancesResponse,
  GetMcpInstanceRequest,
  GetMcpInstanceResponse,
  CreateMcpInstanceRequest,
  CreateMcpInstanceResponse,
  RemoveMcpInstanceRequest,
  ListMcpInstancesRequest,
  UpdateMcpInstanceRequest,
  UpdateMcpInstanceResponse,
} from '@/studio/proto/agent_studio';

import { apiSlice } from '../api/apiSlice';

export const mcpInstancesApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    listMcpInstances: builder.query<McpInstance[], ListMcpInstancesRequest>({
      query: (request) => ({
        url: '/grpc/listMcpInstances',
        method: 'POST',
        body: request,
      }),
      transformResponse: (response: ListMcpInstancesResponse) => {
        return response.mcp_instances;
      },
      providesTags: [{ type: 'MCPInstance', id: 'LIST' }],
    }),

    getMcpInstance: builder.mutation<McpInstance, GetMcpInstanceRequest>({
      query: (request) => ({
        url: '/grpc/getMcpInstance',
        method: 'POST',
        body: request,
      }),
      transformResponse: (response: GetMcpInstanceResponse) => {
        return response.mcp_instance!;
      },
    }),

    createMcpInstance: builder.mutation<string, CreateMcpInstanceRequest>({
      query: (request) => ({
        url: '/grpc/createMcpInstance',
        method: 'POST',
        body: request,
      }),
      transformResponse: (response: CreateMcpInstanceResponse) => {
        return response.mcp_instance_id;
      },
      invalidatesTags: (result, error, { workflow_id }) => [
        { type: 'MCPInstance', id: 'LIST' },
        { type: 'Workflow', id: workflow_id },
      ],
    }),

    updateMcpInstance: builder.mutation<string, UpdateMcpInstanceRequest>({
      query: (request) => ({
        url: '/grpc/updateMcpInstance',
        method: 'POST',
        body: request,
      }),
      transformResponse: (response: UpdateMcpInstanceResponse) => {
        return response.mcp_instance_id;
      },
      invalidatesTags: (result, error, { mcp_instance_id }) => [
        { type: 'MCPInstance', id: mcp_instance_id },
        { type: 'MCPInstance', id: 'LIST' },
      ],
    }),

    removeMcpInstance: builder.mutation<void, RemoveMcpInstanceRequest>({
      query: (request) => ({
        url: '/grpc/removeMcpInstance',
        method: 'POST',
        body: request,
      }),
      invalidatesTags: [{ type: 'MCPInstance', id: 'LIST' }],
    }),
  }),
});

export const {
  useListMcpInstancesQuery,
  useGetMcpInstanceMutation,
  useCreateMcpInstanceMutation,
  useUpdateMcpInstanceMutation,
  useRemoveMcpInstanceMutation,
} = mcpInstancesApi;
