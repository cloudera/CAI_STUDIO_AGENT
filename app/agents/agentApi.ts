import {
  ListAgentsRequest,
  ListAgentsResponse,
  GetAgentRequest,
  GetAgentResponse,
  AddAgentRequest,
  AddAgentResponse,
  AgentMetadata,
  RemoveAgentRequest,
  UpdateAgentRequest,
  TestAgentRequest,
  TestAgentResponse,
  GetAgentTemplateRequest,
  AddAgentTemplateRequest,
  ListAgentTemplatesResponse,
  AgentTemplateMetadata,
  GetAgentTemplateResponse,
  AddAgentTemplateResponse,
  RemoveAgentTemplateRequest,
  UpdateAgentTemplateRequest,
  ListAgentTemplatesRequest,
} from '@/studio/proto/agent_studio';

import { apiSlice } from '../api/apiSlice';

export const agentsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    listAgents: builder.query<AgentMetadata[], ListAgentsRequest>({
      query: (request) => ({
        url: '/grpc/listAgents',
        method: 'POST',
        body: request,
      }),
      transformResponse: (response: ListAgentsResponse) => {
        return response.agents;
      },
      providesTags: [{type: 'Agent', id: 'LIST'}],
    }),
    getAgent: builder.query<AgentMetadata, GetAgentRequest>({
      query: (request) => ({
        url: '/grpc/getAgent',
        method: 'POST',
        body: request,
      }),
      transformResponse: (response: GetAgentResponse) => {
        if (!response.agent) {
          throw new Error('Agent not found.'); // Throw an error if agent is undefined
        }
        return response.agent;
      },
      providesTags: (result, error, { agent_id }) => [{ type: 'Agent', id: agent_id }],
    }),
    addAgent: builder.mutation<string, AddAgentRequest>({
      query: (request) => ({
        url: '/grpc/addAgent',
        method: 'POST',
        body: request,
      }),
      transformResponse: (response: AddAgentResponse) => {
        return response.agent_id;
      },
      invalidatesTags: (result, error, request) => [
        {type: 'Agent', id: 'LIST'},
        {type: 'Workflow', id: request.workflow_id}
      ],
    }),
    updateAgent: builder.mutation<void, UpdateAgentRequest>({
      query: (request) => ({
        url: '/grpc/updateAgent',
        method: 'POST',
        body: request,
      }),
      transformResponse: () => {
        // No transformation needed as the API doesn't return a response body
        return;
      },
      invalidatesTags: (result, error, request) => [
        {type: 'Agent', id: 'LIST'},
        {type: 'Agent', id: request.agent_id}, // TODO: add middleware to update the workflow too?
      ],
    }),
    removeAgent: builder.mutation<void, RemoveAgentRequest>({
      query: (request) => ({
        url: '/grpc/removeAgent',
        method: 'POST',
        body: request,
      }),
      invalidatesTags: (result, error, request) => [
        {type: 'Agent', id: 'LIST'},
      ],
    }),
    testAgent: builder.mutation<TestAgentResponse, TestAgentRequest>({
      query: (request) => ({
        url: '/grpc/testAgent',
        method: 'POST',
        body: request,
      }),
      transformResponse: (response: TestAgentResponse) => {
        return response;
      },
    }),
    listGlobalAgentTemplates: builder.query<AgentTemplateMetadata[], void>({
      query: (request) => ({
        url: '/grpc/listAgentTemplates',
        method: 'POST',
        body: {},
      }),
      transformResponse: (response: ListAgentTemplatesResponse) => {
        return response.agent_templates.filter((template) => !template.workflow_template_id);
      },
      providesTags: [{type: 'AgentTemplate', id: 'GLOBAL'}],
    }),
    listAgentTemplates: builder.query<AgentTemplateMetadata[], ListAgentTemplatesRequest>({
      query: (request) => ({
        url: '/grpc/listAgentTemplates',
        method: 'POST',
        body: request,
      }),
      transformResponse: (response: ListAgentTemplatesResponse) => {
        return response.agent_templates;
      },
      providesTags: (result, error, { workflow_template_id }) =>
        workflow_template_id 
          ? [{ type: 'AgentTemplate', id: workflow_template_id }] 
          : [{ type: 'AgentTemplate', id: 'GLOBAL' }],
    }),
    getAgentTemplate: builder.query<AgentTemplateMetadata, GetAgentTemplateRequest>({
      query: (request) => ({
        url: '/grpc/getAgentTemplate',
        method: 'POST',
        body: request,
      }),
      transformResponse: (response: GetAgentTemplateResponse) => {
        if (!response.agent_template) {
          throw new Error('Agent not found.'); // Throw an error if agent is undefined
        }
        return response.agent_template;
      },
      providesTags: (result, error, { id }) => [{type: 'AgentTemplate', id}],
    }),
    addAgentTemplate: builder.mutation<string, AddAgentTemplateRequest>({
      query: (request) => ({
        url: '/grpc/addAgentTemplate',
        method: 'POST',
        body: request,
      }),
      transformResponse: (response: AddAgentTemplateResponse) => {
        return response.id;
      },
      invalidatesTags: (result, error, { workflow_template_id }) =>
        workflow_template_id 
          ? [{ type: 'AgentTemplate', id: workflow_template_id }] 
          : [{ type: 'AgentTemplate', id: 'GLOBAL' }], // TODO: middleware to update workflow?
    }),
    removeAgentTemplate: builder.mutation<void, RemoveAgentTemplateRequest>({
      query: (request) => ({
        url: '/grpc/removeAgentTemplate',
        method: 'POST',
        body: request,
      }),
      invalidatesTags: [
        {type: 'AgentTemplate', id: 'GLOBAL'} // TODO: not necessarily the case, need to invalidate middleware
      ],
    }),
    updateAgentTemplate: builder.mutation<void, UpdateAgentTemplateRequest>({
      query: (request) => ({
        url: '/grpc/updateAgentTemplate',
        method: 'POST',
        body: request,
      }),
      invalidatesTags: (result, error, { agent_template_id }) => [{type: 'AgentTemplate', id: agent_template_id}],
    }),
  }),
});

export const {
  useListAgentsQuery,
  useGetAgentQuery, // Updated to use `useGetAgentQuery`
  useAddAgentMutation,
  useUpdateAgentMutation,
  useRemoveAgentMutation,
  useTestAgentMutation,
  useListGlobalAgentTemplatesQuery,
  useListAgentTemplatesQuery,
  useGetAgentTemplateQuery,
  useAddAgentTemplateMutation,
  useRemoveAgentTemplateMutation,
  useUpdateAgentTemplateMutation,
} = agentsApi;
