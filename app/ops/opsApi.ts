import { apiSlice } from '../api/apiSlice';

import type { OpsData } from '@/app/lib/types';
export type { OpsData };

export const opsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getOpsData: builder.query<OpsData, void>({
      query: () => '/opsdata',
    }),
  }),
  overrideExisting: true,
});

export const { useGetOpsDataQuery } = opsApi;
