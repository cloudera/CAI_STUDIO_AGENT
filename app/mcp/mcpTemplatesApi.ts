import {
  MCPTemplate,
  ListMcpTemplatesResponse,
  GetMcpTemplateRequest,
  GetMcpTemplateResponse,
  AddMcpTemplateRequest,
  AddMcpTemplateResponse,
  RemoveMcpTemplateRequest,
  ListMcpTemplatesRequest,
  UpdateMcpTemplateRequest,
  UpdateMcpTemplateResponse,
} from '@/studio/proto/agent_studio';

import { apiSlice } from '../api/apiSlice';

export const mcpTemplatesApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    listGlobalMcpTemplates: builder.query<MCPTemplate[], ListMcpTemplatesRequest>({
      query: (request) => ({
        url: '/grpc/listMcpTemplates',
        method: 'POST',
        body: request,
      }),
      transformResponse: (response: ListMcpTemplatesResponse) => {
        return response.mcp_templates.filter((template) => !template.workflow_template_id);
      },
      providesTags: [{ type: 'MCPTemplate', id: 'LIST' }],
    }),
    listMcpTemplates: builder.query<MCPTemplate[], ListMcpTemplatesRequest>({
      query: (request) => ({
        url: '/grpc/listMcpTemplates',
        method: 'POST',
        body: request,
      }),
      transformResponse: (response: ListMcpTemplatesResponse) => {
        return response.mcp_templates;
      },
      providesTags: [{ type: 'MCPTemplate', id: 'LIST' }],
    }),
    getMcpTemplate: builder.query<MCPTemplate, GetMcpTemplateRequest>({
      query: (request) => ({
        url: '/grpc/getMcpTemplate',
        method: 'POST',
        body: request,
      }),
      transformResponse: (response: GetMcpTemplateResponse) => {
        return response.mcp_template!;
      },
    }),
    addMcpTemplate: builder.mutation<string, AddMcpTemplateRequest>({
      query: (request) => ({
        url: '/grpc/addMcpTemplate',
        method: 'POST',
        body: request,
      }),
      transformResponse: (response: AddMcpTemplateResponse) => {
        return response.mcp_template_id;
      },
      invalidatesTags: [{ type: 'MCPTemplate', id: 'LIST' }],
    }),
    updateMcpTemplate: builder.mutation<string, UpdateMcpTemplateRequest>({
      query: (request) => ({
        url: '/grpc/updateMcpTemplate',
        method: 'POST',
        body: request,
      }),
      transformResponse: (response: UpdateMcpTemplateResponse) => {
        return response.mcp_template_id;
      },
      invalidatesTags: (result, error, { mcp_template_id }) => [
        { type: 'MCPTemplate', id: mcp_template_id },
        { type: 'MCPTemplate', id: 'LIST' },
      ],
    }),
    removeMcpTemplate: builder.mutation<void, RemoveMcpTemplateRequest>({
      query: (request) => ({
        url: '/grpc/removeMcpTemplate',
        method: 'POST',
        body: request,
      }),
      invalidatesTags: [{ type: 'MCPTemplate', id: 'LIST' }],
    }),
  }),
});

export const {
  useListGlobalMcpTemplatesQuery,
  useListMcpTemplatesQuery,
  useGetMcpTemplateQuery,
  useAddMcpTemplateMutation,
  useUpdateMcpTemplateMutation,
  useRemoveMcpTemplateMutation,
} = mcpTemplatesApi;
