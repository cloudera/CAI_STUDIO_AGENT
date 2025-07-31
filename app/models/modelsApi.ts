import {
  ListModelsRequest,
  ListModelsResponse,
  GetModelRequest,
  GetModelResponse,
  AddModelRequest,
  AddModelResponse,
  Model,
  RemoveModelRequest,
  UpdateModelRequest,
  UpdateModelResponse,
  TestModelRequest,
  TestModelResponse,
  SetStudioDefaultModelRequest,
} from '@/studio/proto/agent_studio';

import { apiSlice } from '../api/apiSlice';

export const modelsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    listModels: builder.query<Model[], ListModelsRequest>({
      query: (request) => ({
        url: '/grpc/listModels',
        method: 'POST',
        body: request,
      }),
      transformResponse: (response: ListModelsResponse) => {
        return response.model_details;
      },
      providesTags: [{ type: 'Model', id: 'LIST' }],
    }),
    getModel: builder.mutation<Model, GetModelRequest>({
      query: (request) => ({
        url: '/grpc/getModel',
        method: 'POST',
        body: request,
      }),
      transformResponse: (response: GetModelResponse) => {
        return response.model_details!;
      },
    }),
    getDefaultModel: builder.query<Model | undefined, void>({
      query: (request) => ({
        url: '/grpc/listModels',
        method: 'POST',
        body: {},
      }),
      transformResponse: (response: ListModelsResponse) => {
        return response.model_details.find((model) => model.is_studio_default);
      },
      providesTags: [{ type: 'Model', id: 'LIST' }],
    }),
    setDefaultModel: builder.mutation<void, SetStudioDefaultModelRequest>({
      query: (request) => ({
        url: '/grpc/setStudioDefaultModel',
        method: 'POST',
        body: request,
      }),
      invalidatesTags: [{ type: 'Model', id: 'LIST' }],
    }),
    addModel: builder.mutation<string, AddModelRequest>({
      query: (request) => ({
        url: '/grpc/addModel',
        method: 'POST',
        body: request,
      }),
      transformResponse: (response: AddModelResponse) => {
        return response.model_id;
      },
      invalidatesTags: [{ type: 'Model', id: 'LIST' }],
    }),
    updateModel: builder.mutation<string, UpdateModelRequest>({
      query: (request) => ({
        url: '/grpc/updateModel',
        method: 'POST',
        body: request,
      }),
      transformResponse: (response: UpdateModelResponse) => {
        return response.model_id;
      },
      invalidatesTags: (result, error, { model_id }) => [
        { type: 'Model', id: 'LIST' },
        { type: 'Model', id: model_id },
      ],
    }),
    testModel: builder.mutation<string, TestModelRequest>({
      query: (request) => ({
        url: '/grpc/testModel',
        method: 'POST',
        body: request,
      }),
      transformResponse: (response: TestModelResponse) => {
        return response.response;
      },
    }),
    removeModel: builder.mutation<void, RemoveModelRequest>({
      query: (request) => ({
        url: '/grpc/removeModel',
        method: 'POST',
        body: request,
      }),
      invalidatesTags: (result, error, { model_id }) => [
        { type: 'Model', id: 'LIST' },
        { type: 'Model', id: model_id },
      ],
    }),
  }),
});
export const {
  useListModelsQuery,
  useGetModelMutation,
  useGetDefaultModelQuery,
  useSetDefaultModelMutation,
  useAddModelMutation,
  useUpdateModelMutation,
  useTestModelMutation,
  useRemoveModelMutation,
} = modelsApi;
