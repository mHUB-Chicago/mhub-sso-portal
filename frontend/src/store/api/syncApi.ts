import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'

export interface SyncLogEntry {
  time: string
  level: 'info' | 'warn' | 'error'
  message: string
}

export interface SubscriptionConflict {
  companyName: string
  chosen: { customerId: string; subscriptionType: string }
  alternatives: Array<{ customerId: string; subscriptionType: string }>
}

export interface SyncSession {
  id: string
  type: 'ALL' | 'CONTINUE' | 'FILTERED'
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  step: string
  progress: number
  logs: SyncLogEntry[]
  startedAt: string
  completedAt: string | null
  updatedAt: string
}

interface SyncStatusResponse {
  success: boolean
  data: SyncSession | null
}

interface StartSyncResponse {
  success: boolean
  data: { sessionId: string }
}

const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:8787'
const basePath = import.meta.env.VITE_API_BASE_PATH ?? '/api'

export const syncApi = createApi({
  reducerPath: 'syncApi',
  baseQuery: fetchBaseQuery({
    baseUrl: `${baseUrl}${basePath}`,
    credentials: 'include',
    prepareHeaders: (headers) => {
      const token = localStorage.getItem('authToken')
      if (token) headers.set('Authorization', `Bearer ${token}`)
      return headers
    },
  }),
  tagTypes: ['SyncStatus', 'MembershipTypes', 'PortalAccessTypes'],
  endpoints: (builder) => ({
    getSyncStatus: builder.query<SyncStatusResponse, void>({
      query: () => '/sync/status',
      providesTags: ['SyncStatus'],
    }),
    startSync: builder.mutation<StartSyncResponse, { type: 'ALL' | 'CONTINUE'; includeFreeMembers?: boolean }>({
      query: (body) => ({ url: '/sync/start', method: 'POST', body }),
      invalidatesTags: ['SyncStatus'],
    }),
    cancelSync: builder.mutation<{ success: boolean }, void>({
      query: () => ({ url: '/sync/cancel', method: 'POST' }),
      invalidatesTags: ['SyncStatus'],
    }),
    getFreshStats: builder.query<{ success: boolean; data: { companies: number; users: number } }, void>({
      query: () => '/sync/fresh/stats',
    }),
    freshSync: builder.mutation<{
      success: boolean
      data: { usersDeleted: number; companiesDeleted: number }
    }, Record<string, never>>({
      query: () => ({ url: '/sync/fresh', method: 'POST', body: {} }),
    }),
    importFiltered: builder.mutation<{ success: boolean; data: { sessionId: string } }, {
      companies: { subscriptionNo: string; companyName: string; membershipType: string | null }[]
      members: { customerNo: string; email: string; firstName: string; lastName: string; companyName: string; username: string | null }[]
    }>({
      query: (body) => ({ url: '/sync/import-filtered', method: 'POST', body }),
      invalidatesTags: ['SyncStatus'],
    }),
    getSubscriptionConflicts: builder.query<{ success: boolean; data: SubscriptionConflict[] }, void>({
      query: () => '/sync/conflicts',
    }),
    getSyncHistory: builder.query<{
      success: boolean
      data: { sessions: SyncSession[]; total: number; limit: number; offset: number }
    }, { limit?: number; offset?: number }>({
      query: ({ limit = 50, offset = 0 } = {}) => `/sync/history?limit=${limit}&offset=${offset}`,
    }),
    getMembershipTypes: builder.query<{ success: boolean; data: string[] }, void>({
      query: () => '/config/membership-types',
      providesTags: ['MembershipTypes'],
    }),
    addMembershipType: builder.mutation<{ success: boolean }, { name: string }>({
      query: (body) => ({ url: '/config/membership-types', method: 'POST', body }),
      invalidatesTags: ['MembershipTypes'],
    }),
    removeMembershipType: builder.mutation<{ success: boolean }, string>({
      query: (name) => ({ url: `/config/membership-types/${encodeURIComponent(name)}`, method: 'DELETE' }),
      invalidatesTags: ['MembershipTypes'],
    }),
    getPortalAccessTypes: builder.query<{ success: boolean; data: string[] }, void>({
      query: () => '/config/portal-access-types',
      providesTags: ['PortalAccessTypes'],
    }),
    addPortalAccessType: builder.mutation<{ success: boolean }, { name: string }>({
      query: (body) => ({ url: '/config/portal-access-types', method: 'POST', body }),
      invalidatesTags: ['PortalAccessTypes'],
    }),
    removePortalAccessType: builder.mutation<{ success: boolean }, string>({
      query: (name) => ({ url: `/config/portal-access-types/${encodeURIComponent(name)}`, method: 'DELETE' }),
      invalidatesTags: ['PortalAccessTypes'],
    }),
  }),
})

export const { useGetSyncStatusQuery, useStartSyncMutation, useCancelSyncMutation, useFreshSyncMutation, useLazyGetFreshStatsQuery, useImportFilteredMutation, useGetMembershipTypesQuery, useAddMembershipTypeMutation, useRemoveMembershipTypeMutation, useGetSyncHistoryQuery, useGetSubscriptionConflictsQuery, useGetPortalAccessTypesQuery, useAddPortalAccessTypeMutation, useRemovePortalAccessTypeMutation } = syncApi
