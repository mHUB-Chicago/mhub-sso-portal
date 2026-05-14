import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'

export interface WebhookLog {
  id: string
  source: string
  customerNo: number | null
  eventType: string | null
  payload: string | null
  status: string
  diff: string | null
  receivedAt: string
}

interface GetWebhookLogsRequest {
  limit?: number
  offset?: number
}

interface GetWebhookLogsResponse {
  success: boolean
  data: {
    logs: WebhookLog[]
    total: number
    limit: number
    offset: number
  }
}

const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:8787'
const basePath = import.meta.env.VITE_API_BASE_PATH ?? '/api'

export const webhookApi = createApi({
  reducerPath: 'webhookApi',
  baseQuery: fetchBaseQuery({
    baseUrl: `${baseUrl}${basePath}`,
    credentials: 'include',
    prepareHeaders: (headers) => {
      const token = localStorage.getItem('authToken')
      if (token) headers.set('Authorization', `Bearer ${token}`)
      return headers
    },
  }),
  tagTypes: ['WebhookLogs'],
  endpoints: (builder) => ({
    getWebhookLogs: builder.query<GetWebhookLogsResponse, GetWebhookLogsRequest>({
      query: ({ limit = 50, offset = 0 } = {}) =>
        `/webhook/logs?limit=${limit}&offset=${offset}`,
      providesTags: ['WebhookLogs'],
    }),
  }),
})

export const { useGetWebhookLogsQuery } = webhookApi
