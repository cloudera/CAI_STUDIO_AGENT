import {
  CheckStudioUpgradeStatusResponse,
  GetAssetDataRequest,
  GetAssetDataResponse,
  GetParentProjectDetailsRequest,
  GetParentProjectDetailsResponse,
  DownloadTemporaryFileRequest,
  HealthCheckResponse,
  CmlApiCheckResponse,
} from '@/studio/proto/agent_studio';

import { apiSlice } from '../api/apiSlice';

export const crossCuttingApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getAssetData: builder.query<GetAssetDataResponse, GetAssetDataRequest>({
      query: (request) => ({
        url: '/grpc/getAssetData',
        method: 'POST',
        body: request,
      }),
    }),
    getParentProjectDetails: builder.query<
      GetParentProjectDetailsResponse,
      GetParentProjectDetailsRequest
    >({
      query: (request) => ({
        url: '/grpc/getParentProjectDetails',
        method: 'POST',
        body: request,
      }),
    }),
    checkStudioUpgradeStatus: builder.query<CheckStudioUpgradeStatusResponse, void>({
      query: (request) => ({
        url: '/grpc/checkStudioUpgradeStatus',
        method: 'POST',
        body: {},
      }),
    }),
    upgradeStudio: builder.mutation<void, void>({
      query: (request) => ({
        url: '/grpc/upgradeStudio',
        method: 'POST',
        body: {},
      }),
    }),
    healthCheck: builder.query<boolean, void>({
      query: () => ({
        url: '/grpc/healthCheck',
        method: 'POST',
        body: {},
        timeout: 5000,
      }),
      transformResponse: (response: HealthCheckResponse) => {
        return response.message?.length > 0;
      },
      transformErrorResponse: () => {
        return false;
      },
    }),
    workbenchDetails: builder.query<any, void>({
      query: () => ({
        url: '/workbench',
        method: 'GET',
      }),
    }),
    rotateApiKey: builder.mutation<void, void>({
      query: () => ({
        url: '/grpc/rotateCmlApi',
        method: 'POST',
        body: {},
      }),
    }),
    cmlApiCheck: builder.query<CmlApiCheckResponse, void>({
      query: () => ({
        url: '/grpc/cmlApiCheck',
        method: 'POST',
        body: {},
      }),
    }),
  }),
});

export const {
  useGetAssetDataQuery,
  useGetParentProjectDetailsQuery,
  useCheckStudioUpgradeStatusQuery,
  useUpgradeStudioMutation,
  useHealthCheckQuery,
  useWorkbenchDetailsQuery,
  useRotateApiKeyMutation,
  useCmlApiCheckQuery,
} = crossCuttingApi;
