import {
  ToolInstance,
  ListToolInstancesResponse,
  GetToolInstanceRequest,
  GetToolInstanceResponse,
  ListToolInstancesRequest,
  CreateToolInstanceRequest,
  CreateToolInstanceResponse,
  RemoveToolInstanceRequest,
  UpdateToolInstanceRequest,
  UpdateToolInstanceResponse,
} from '@/studio/proto/agent_studio';

import { apiSlice } from '../api/apiSlice';

export const toolInstancesApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    // List Tool Instances
    listToolInstances: builder.query<ToolInstance[], ListToolInstancesRequest>({
      query: (request) => ({
        url: '/grpc/listToolInstances',
        method: 'POST',
        body: request,
      }),
      transformResponse: (response: ListToolInstancesResponse) => {
        return response.tool_instances;
      },
      providesTags: [{ type: 'ToolInstance', id: 'LIST' }],
    }),

    // Get Tool Instance
    getToolInstance: builder.mutation<GetToolInstanceResponse, GetToolInstanceRequest>({
      query: (request) => ({
        url: '/grpc/getToolInstance',
        method: 'POST',
        body: request,
      }),
      transformResponse: (response: GetToolInstanceResponse) => {
        return response;
      },
    }),

    // Create Tool Instance
    createToolInstance: builder.mutation<string, CreateToolInstanceRequest>({
      query: (request) => ({
        url: '/grpc/createToolInstance',
        method: 'POST',
        body: request,
      }),
      transformResponse: (response: CreateToolInstanceResponse) => {
        return response.tool_instance_id;
      },
      invalidatesTags: (result, error, { workflow_id }) => [
        { type: 'ToolInstance', id: 'LIST' },
        { type: 'Workflow', id: workflow_id },
      ],
    }),

    // Remove Tool Instance
    removeToolInstance: builder.mutation<void, RemoveToolInstanceRequest>({
      query: (request) => ({
        url: '/grpc/removeToolInstance',
        method: 'POST',
        body: request,
      }),
      invalidatesTags: [{ type: 'ToolInstance', id: 'LIST' }],
    }),

    // Update Tool Instance
    updateToolInstance: builder.mutation<string, UpdateToolInstanceRequest>({
      query: (request) => ({
        url: '/grpc/updateToolInstance',
        method: 'POST',
        body: request,
      }),
      transformResponse: (response: UpdateToolInstanceResponse) => {
        return response.tool_instance_id;
      },
      invalidatesTags: (result, error, { tool_instance_id }) => [
        { type: 'ToolInstance', id: tool_instance_id },
      ],
    }),
  }),
});

export const {
  useListToolInstancesQuery,
  useGetToolInstanceMutation,
  useCreateToolInstanceMutation,
  useRemoveToolInstanceMutation,
  useUpdateToolInstanceMutation,
} = toolInstancesApi;
