import {
  Workflow,
  ListWorkflowsRequest,
  ListWorkflowsResponse,
  GetWorkflowRequest,
  GetWorkflowResponse,
  RemoveWorkflowRequest,
  TestWorkflowRequest,
  TestWorkflowResponse,
  UpdateWorkflowRequest,
  UpdateWorkflowResponse,
  AddWorkflowRequest,
  DeployWorkflowRequest,
  AddWorkflowResponse,
  WorkflowTemplateMetadata,
  ListWorkflowTemplatesRequest,
  ListWorkflowTemplatesResponse,
  GetWorkflowTemplateRequest,
  GetWorkflowTemplateResponse,
  AddWorkflowTemplateRequest,
  AddWorkflowTemplateResponse,
  RemoveWorkflowTemplateRequest,
  ExportWorkflowTemplateRequest,
  ExportWorkflowTemplateResponse,
  ImportWorkflowTemplateRequest,
  ImportWorkflowTemplateResponse,
} from '@/studio/proto/agent_studio';

import { apiSlice } from '../api/apiSlice';

export const workflowsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    listWorkflows: builder.query<Workflow[], ListWorkflowsRequest>({
      query: (request) => ({
        url: '/grpc/listWorkflows',
        method: 'POST',
        body: request,
      }),
      transformResponse: (response: ListWorkflowsResponse) => {
        return response.workflows;
      },
      providesTags: [{ type: 'Workflow', id: 'LIST' }],
    }),
    getWorkflow: builder.mutation<Workflow, GetWorkflowRequest>({
      query: (request) => ({
        url: '/grpc/getWorkflow',
        method: 'POST',
        body: request,
      }),
      transformResponse: (response: GetWorkflowResponse) => {
        return response.workflow!;
      },
    }),
    getWorkflowById: builder.query<Workflow | undefined, string>({
      query: (request) => ({
        url: '/grpc/getWorkflow',
        method: 'POST',
        body: { workflow_id: request },
      }),
      transformResponse: (response: GetWorkflowResponse) => {
        return response.workflow;
      },
      providesTags: (result, error, workflow_id) => [{ type: 'Workflow', id: workflow_id }],
    }),
    addWorkflow: builder.mutation<string, AddWorkflowRequest>({
      query: (request) => ({
        url: '/grpc/addWorkflow',
        method: 'POST',
        body: request,
      }),
      transformResponse: (response: AddWorkflowResponse) => {
        return response.workflow_id;
      },
      invalidatesTags: [{ type: 'Workflow', id: 'LIST' }],
    }),
    updateWorkflow: builder.mutation<void, UpdateWorkflowRequest>({
      query: (request) => ({
        url: '/grpc/updateWorkflow',
        method: 'POST',
        body: request,
      }),
      invalidatesTags: (result, error, request) => [
        { type: 'Workflow', id: request.workflow_id },
        // { type: 'Workflow', id: 'LIST' }
      ],
    }),
    removeWorkflow: builder.mutation<void, RemoveWorkflowRequest>({
      query: (request) => ({
        url: '/grpc/removeWorkflow',
        method: 'POST',
        body: request,
      }),
      invalidatesTags: (result, error, request) => [
        { type: 'Workflow', id: request.workflow_id },
        { type: 'Workflow', id: 'LIST' },
        { type: 'DeployedWorkflow', id: 'LIST' },
      ],
    }),
    testWorkflow: builder.mutation<TestWorkflowResponse, TestWorkflowRequest>({
      query: (request) => ({
        url: '/grpc/testWorkflow',
        method: 'POST',
        body: request,
      }),
      transformResponse: (response: TestWorkflowResponse) => {
        return response;
      },
    }),
    deployWorkflow: builder.mutation<void, DeployWorkflowRequest>({
      query: (request) => ({
        url: '/grpc/deployWorkflow',
        method: 'POST',
        body: request,
      }),
      invalidatesTags: (result, error, request) => [
        { type: 'Workflow', id: request.workflow_id },
        { type: 'Workflow', id: 'LIST' },
        { type: 'DeployedWorkflow', id: 'LIST' },
      ],
    }),
    listWorkflowTemplates: builder.query<WorkflowTemplateMetadata[], ListWorkflowTemplatesRequest>({
      query: (request) => ({
        url: '/grpc/listWorkflowTemplates',
        method: 'POST',
        body: request,
      }),
      transformResponse: (response: ListWorkflowTemplatesResponse) => {
        return response.workflow_templates;
      },
      providesTags: [{ type: 'WorkflowTemplate', id: 'LIST' }],
    }),
    getWorkflowTemplate: builder.mutation<WorkflowTemplateMetadata, GetWorkflowTemplateRequest>({
      query: (request) => ({
        url: '/grpc/getWorkflowTemplate',
        method: 'POST',
        body: request,
      }),
      transformResponse: (response: GetWorkflowTemplateResponse) => {
        return response.workflow_template!;
      },
    }),
    getWorkflowTemplateById: builder.query<WorkflowTemplateMetadata, string>({
      query: (request) => ({
        url: '/grpc/getWorkflowTemplate',
        method: 'POST',
        body: { id: request },
      }),
      transformResponse: (response: GetWorkflowTemplateResponse) => {
        return response.workflow_template!;
      },
      providesTags: (result, error, id) => [{ type: 'WorkflowTemplate', id }],
    }),
    addWorkflowTemplate: builder.mutation<string, AddWorkflowTemplateRequest>({
      query: (request) => ({
        url: '/grpc/addWorkflowTemplate',
        method: 'POST',
        body: request,
      }),
      transformResponse: (response: AddWorkflowTemplateResponse) => {
        return response.id;
      },
      invalidatesTags: [{ type: 'WorkflowTemplate', id: 'LIST' }],
    }),
    removeWorkflowTemplate: builder.mutation<void, RemoveWorkflowTemplateRequest>({
      query: (request) => ({
        url: '/grpc/removeWorkflowTemplate',
        method: 'POST',
        body: request,
      }),
      invalidatesTags: (result, error, request) => [
        { type: 'WorkflowTemplate', id: request.id },
        { type: 'WorkflowTemplate', id: 'LIST' },
      ],
    }),
    exportWorkflowTemplate: builder.mutation<string, ExportWorkflowTemplateRequest>({
      query: (request) => ({
        url: '/grpc/exportWorkflowTemplate',
        method: 'POST',
        body: request,
      }),
      transformResponse: (response: ExportWorkflowTemplateResponse) => {
        return response.file_path;
      },
    }),
    importWorkflowTemplate: builder.mutation<string, ImportWorkflowTemplateRequest>({
      query: (request) => ({
        url: '/grpc/importWorkflowTemplate',
        method: 'POST',
        body: request,
      }),
      transformResponse: (response: ImportWorkflowTemplateResponse) => {
        return response.id;
      },
      invalidatesTags: [{ type: 'WorkflowTemplate', id: 'LIST' }],
    }),
  }),
});

export const {
  useListWorkflowsQuery,
  useGetWorkflowMutation,
  useGetWorkflowByIdQuery,
  useRemoveWorkflowMutation,
  useTestWorkflowMutation,
  useUpdateWorkflowMutation,
  useDeployWorkflowMutation,
  useAddWorkflowMutation,
  useListWorkflowTemplatesQuery,
  useGetWorkflowTemplateMutation,
  useGetWorkflowTemplateByIdQuery,
  useAddWorkflowTemplateMutation,
  useRemoveWorkflowTemplateMutation,
  useExportWorkflowTemplateMutation,
  useImportWorkflowTemplateMutation,
} = workflowsApi;
