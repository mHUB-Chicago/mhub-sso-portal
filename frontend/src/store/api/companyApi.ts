import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'
import type { Company, ServiceProvider } from './userApi'

interface GetCompaniesRequest {
  limit?: number
  offset?: number
  search?: string
  membershipType?: string
  active?: 'true' | 'false'
}

interface GetCompaniesResponse {
  success: boolean
  message: string
  data: {
    companies: Company[]
    total: number
    limit: number
    offset: number
  }
}

interface GetCompanyResponse {
  success: boolean
  message: string
  data: {
    company: Company
    allowedServiceProviders: ServiceProvider[]
    enabledServiceProviders: ServiceProvider[]
  }
}

interface UpdateCompanyRequest {
  id: string
  enabledServiceProviderIds: string[]
}

interface UpdateCompanyResponse {
  success: boolean
  message: string
  data: {
    company: Company
    allowedServiceProviders: ServiceProvider[]
    enabledServiceProviders: ServiceProvider[]
  }
}

const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:8787'
const basePath = import.meta.env.VITE_API_BASE_PATH ?? '/api'

export const companyApi = createApi({
  reducerPath: 'companyApi',
  baseQuery: fetchBaseQuery({
    baseUrl: `${baseUrl}${basePath}`,
    credentials: 'include',
    prepareHeaders: (headers) => {
      const token = localStorage.getItem('authToken')
      if (token) {
        headers.set('Authorization', `Bearer ${token}`)
      }
      return headers
    },
  }),
  tagTypes: ['Company', 'Companies', 'Users'],
  endpoints: (builder) => ({
    getCompanies: builder.query<GetCompaniesResponse, GetCompaniesRequest>({
      query: ({ limit = 100, offset = 0, search, membershipType, active }) => ({
        url: '/company',
        params: {
          limit,
          offset,
          ...(search && { search }),
          ...(membershipType && { membershipType }),
          ...(active !== undefined && { active }),
        },
      }),
      providesTags: ['Companies'],
    }),

    getCompanyById: builder.query<GetCompanyResponse, string>({
      query: (id) => `/company/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'Company', id }],
    }),

    updateCompany: builder.mutation<UpdateCompanyResponse, UpdateCompanyRequest>({
      query: ({ id, ...body }) => ({
        url: `/company/${id}`,
        method: 'PUT',
        body,
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Company', id },
        'Companies',
        'Users',
      ],
    }),

    importCompanies: builder.mutation<
      { success: boolean; data: { created: number; updated: number; skipped: number; errors: string[] } },
      { name: string; email: string; membershipType?: string; active?: boolean }[]
    >({
      query: (body) => ({ url: '/company/import', method: 'POST', body }),
      invalidatesTags: ['Companies'],
    }),
  }),
})

export const {
  useGetCompaniesQuery,
  useLazyGetCompaniesQuery,
  useGetCompanyByIdQuery,
  useUpdateCompanyMutation,
  useImportCompaniesMutation,
} = companyApi
