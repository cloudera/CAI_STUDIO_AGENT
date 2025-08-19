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
  trace_id: string;
}

export interface GetOpsEventsResponse {
  events: any[];
}

export const opsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getOpsData: builder.query<OpsData, void>({
      query: () => '/opsdata',
    }),
    getEvents: builder.mutation<GetOpsEventsResponse, GetOpsEventsRequest>({
      query: (request) => ({
        url: `/opsdata/events?trace_id=${request.trace_id}`,
        method: 'GET',
      }),
    }),
  }),
  overrideExisting: true,
});

export const { useGetOpsDataQuery, useGetEventsMutation } = opsApi;
