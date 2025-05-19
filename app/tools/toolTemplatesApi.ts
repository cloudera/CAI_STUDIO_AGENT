import {
  ToolTemplate,
  ListToolTemplatesResponse,
  GetToolTemplateRequest,
  GetToolTemplateResponse,
  AddToolTemplateRequest,
  AddToolTemplateResponse,
  UpdateToolTemplateRequest,
  UpdateToolTemplateResponse,
  RemoveToolTemplateRequest,
  ListToolTemplatesRequest,
} from '@/studio/proto/agent_studio';

import { apiSlice } from '../api/apiSlice';

export const toolsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    // List Tool Templates
    listGlobalToolTemplates: builder.query<ToolTemplate[], ListToolTemplatesRequest>({
      query: (request) => ({
        url: '/grpc/listToolTemplates',
        method: 'POST',
        body: request,
      }),
      transformResponse: (response: ListToolTemplatesResponse) => {
        return response.templates.filter((template) => !template.workflow_template_id);
      },
      providesTags: [{ type: 'ToolTemplate', id: 'LIST' }],
    }),

    listToolTemplates: builder.query<ToolTemplate[], ListToolTemplatesRequest>({
      query: (request) => ({
        url: '/grpc/listToolTemplates',
        method: 'POST',
        body: request,
      }),
      transformResponse: (response: ListToolTemplatesResponse) => {
        return response.templates;
      },
      providesTags: (result, error, request) =>
        result && request.workflow_template_id
          ? [{ type: 'WorkflowTemplate', id: request.workflow_template_id }]
          : [{ type: 'ToolTemplate', id: 'LIST' }],
    }),

    // Get Tool Template
    getToolTemplate: builder.mutation<ToolTemplate, GetToolTemplateRequest>({
      query: (request) => ({
        url: '/grpc/getToolTemplate',
        method: 'POST',
        body: request,
      }),
      transformResponse: (response: GetToolTemplateResponse) => {
        return response.template!;
      },
    }),

    // Add Tool Template
    addToolTemplate: builder.mutation<string, AddToolTemplateRequest>({
      query: (request) => ({
        url: '/grpc/addToolTemplate',
        method: 'POST',
        body: request,
      }),
      transformResponse: (response: AddToolTemplateResponse) => {
        return response.tool_template_id;
      },
      invalidatesTags: (result, error, request) =>
        result && request.workflow_template_id
          ? [
              { type: 'ToolTemplate', id: 'LIST' },
              { type: 'WorkflowTemplate', id: request.workflow_template_id },
            ]
          : [{ type: 'ToolTemplate', id: 'LIST' }],
    }),

    // Update Tool Template
    updateToolTemplate: builder.mutation<string, UpdateToolTemplateRequest>({
      query: (request) => ({
        url: '/grpc/updateToolTemplate',
        method: 'POST',
        body: request,
      }),
      transformResponse: (response: UpdateToolTemplateResponse) => {
        return response.tool_template_id;
      },
      invalidatesTags: (result, error, request) => [
        { type: 'ToolTemplate', id: request.tool_template_id },
      ],
    }),

    // Remove Tool Template
    removeToolTemplate: builder.mutation<void, RemoveToolTemplateRequest>({
      query: (request) => ({
        url: '/grpc/removeToolTemplate',
        method: 'POST',
        body: request,
      }),
      invalidatesTags: [{ type: 'ToolTemplate', id: 'LIST' }],
    }),
  }),
});

export const {
  useListGlobalToolTemplatesQuery,
  useListToolTemplatesQuery,
  useGetToolTemplateMutation, // Changed back to mutation
  useAddToolTemplateMutation,
  useUpdateToolTemplateMutation,
  useRemoveToolTemplateMutation,
} = toolsApi;
