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
  eventType?: string
  status?: string
  search?: string
  changedOnly?: boolean
  dateFrom?: string
  dateTo?: string
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
      query: ({ limit = 50, offset = 0, eventType, status, search, changedOnly, dateFrom, dateTo } = {}) => {
        const params = new URLSearchParams({ limit: String(limit), offset: String(offset) })
        if (eventType) params.set('eventType', eventType)
        if (status) params.set('status', status)
        if (search) params.set('search', search)
        if (changedOnly) params.set('changedOnly', 'true')
        if (dateFrom) params.set('dateFrom', dateFrom)
        if (dateTo) params.set('dateTo', dateTo)
        return `/webhook/logs?${params.toString()}`
      },
      providesTags: ['WebhookLogs'],
    }),
  }),
})

export const { useGetWebhookLogsQuery } = webhookApi
