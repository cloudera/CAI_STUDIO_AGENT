import { apiSlice } from '../api/apiSlice';

import type { OpsData } from '@/app/lib/types';
export type { OpsData };

export interface KickoffCrewReponse {
  response: { trace_id: string };
}

export interface KickoffCrewRequest {
  workflowUrl: string;
  workflowInputs: Record<string, string>;
}

export interface GetOpsEventsRequest {
  traceId: string;
}

export interface GetOpsEventsResponse {
  projectId: string;
  events: any[];
}

export const opsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getOpsData: builder.query<OpsData, void>({
      query: () => '/ops',
    }),
    getEvents: builder.mutation<GetOpsEventsResponse, GetOpsEventsRequest>({
      query: (request) => ({
        url: `/ops/events?traceId=${request.traceId}`,
        method: 'GET',
      }),
    })
  }),
  overrideExisting: true,
});

export const { 
  useGetOpsDataQuery,
  useGetEventsMutation,
} = opsApi;
