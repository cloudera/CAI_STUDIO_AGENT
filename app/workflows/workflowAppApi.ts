import { apiSlice } from '../api/apiSlice';

import type {
  WorkflowData,
  WorkflowKickoffRequest,
  WorkflowKickoffResponse,
  GetOpsEventsRequest,
  GetOpsEventsResponse,
} from '@/app/lib/types';
export type { WorkflowData };

export const workflowAppApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getWorkflowData: builder.query<WorkflowData, void>({
      query: () => '/workflow',
    }),
    kickoff: builder.mutation<WorkflowKickoffResponse, WorkflowKickoffRequest>({
      query: (request) => ({
        url: '/workflow/kickoff',
        method: 'POST',
        body: request,
      }),
    }),
    getEvents: builder.mutation<GetOpsEventsResponse, GetOpsEventsRequest>({
      query: (request) => ({
        url: `/workflow/events?trace_id=${request.trace_id}`,
        method: 'GET',
      }),
    }),
  }),
  overrideExisting: true,
});

export const { useGetWorkflowDataQuery, useKickoffMutation, useGetEventsMutation } = workflowAppApi;
