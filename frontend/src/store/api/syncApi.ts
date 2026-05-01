import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'

export interface SyncLogEntry {
  time: string
  level: 'info' | 'warn' | 'error'
  message: string
}

export interface SyncSession {
  id: string
  type: 'ALL' | 'CONTINUE'
  status: 'pending' | 'running' | 'completed' | 'failed'
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
  tagTypes: ['SyncStatus'],
  endpoints: (builder) => ({
    getSyncStatus: builder.query<SyncStatusResponse, void>({
      query: () => '/sync/status',
      providesTags: ['SyncStatus'],
    }),
    startSync: builder.mutation<StartSyncResponse, { type: 'ALL' | 'CONTINUE' }>({
      query: (body) => ({ url: '/sync/start', method: 'POST', body }),
      invalidatesTags: ['SyncStatus'],
    }),
  }),
})

export const { useGetSyncStatusQuery, useStartSyncMutation } = syncApi
