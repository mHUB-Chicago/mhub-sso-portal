import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'

export interface ServiceProvider {
  id: string
  name: string
  active: boolean
  logo: string
  entityId: string
  acsUrl: string
  loginUrl: string
  autoRedirect: boolean
  signTarget: 'ASSERTION' | 'RESPONSE' | 'BOTH'
  createdAt: string
  updatedAt: string
}

interface GetServiceProvidersResponse {
  success: boolean
  message: string
  data: {
    serviceProviders: ServiceProvider[]
  }
}

interface GetServiceProviderResponse {
  success: boolean
  message: string
  data: {
    serviceProvider: ServiceProvider
  }
}

interface UpdateServiceProviderResponse {
  success: boolean
  message: string
  data: {
    serviceProvider: ServiceProvider
  }
}

const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:8787'
const basePath = import.meta.env.VITE_API_BASE_PATH ?? '/api'

export const serviceProviderApi = createApi({
  reducerPath: 'serviceProviderApi',
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
  tagTypes: ['ServiceProvider', 'ServiceProviders', 'Users', 'Companies', 'User', 'Company'],
  endpoints: (builder) => ({
    getServiceProviders: builder.query<GetServiceProvidersResponse, void>({
      query: () => '/provider',
      providesTags: ['ServiceProviders'],
    }),

    getServiceProviderById: builder.query<GetServiceProviderResponse, string>({
      query: (id) => `/provider/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'ServiceProvider', id }],
    }),

    updateServiceProvider: builder.mutation<UpdateServiceProviderResponse, { id: string; data: FormData }>({
      query: ({ id, data }) => ({
        url: `/provider/${id}`,
        method: 'PUT',
        body: data,
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'ServiceProvider', id },
        'ServiceProviders',
        'Users',
        'Companies',
      ],
    }),

    deleteServiceProvider: builder.mutation<{ success: boolean }, string>({
      query: (id) => ({
        url: `/provider/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['ServiceProviders', 'Users', 'Companies', 'User', 'Company'],
    }),

    createServiceProvider: builder.mutation<GetServiceProviderResponse, FormData>({
      query: (data) => ({
        url: '/provider',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['ServiceProviders'],
    }),
  }),
})

export const {
  useGetServiceProvidersQuery,
  useGetServiceProviderByIdQuery,
  useUpdateServiceProviderMutation,
  useDeleteServiceProviderMutation,
  useCreateServiceProviderMutation,
} = serviceProviderApi
