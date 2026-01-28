import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'

// Types matching backend schemas
export interface User {
  id: string
  companyId: string
  email: string
  name: string
  peopleVineId: string | null
  role: 'USER' | 'ADMIN'
  emailVerified: boolean
  mustResetPassword: boolean
  createdAt: string
  updatedAt: string
}

export interface Company {
  id: string
  peopleVineId: string | null
  name: string
  email: string
  createdAt: string
  updatedAt: string
}

export interface ServiceProvider {
  id: string
  name: string
  active: boolean
  logo: string
  entityId: string
  acsUrl: string
  loginUrl: string
  signTarget: 'ASSERTION' | 'RESPONSE' | 'BOTH'
  createdAt: string
  updatedAt: string
}

// Request/Response types
interface GetUsersRequest {
  limit?: number
  offset?: number
  role?: 'USER' | 'ADMIN'
}

interface GetUsersResponse {
  success: boolean
  message: string
  data: {
    users: User[]
    total: number
    limit: number
    offset: number
  }
}

interface GetUserResponse {
  success: boolean
  message: string
  data: {
    user: User
    company: Company
    allowedServiceProviders: ServiceProvider[]
    enabledServiceProviders: ServiceProvider[]
  }
}

interface UpdateUserRequest {
  id: string
  role?: 'USER' | 'ADMIN'
  enabledServiceProviderIds?: string[]
}

interface UpdateUserResponse {
  success: boolean
  message: string
  data: {
    user: User
    allowedServiceProviders: ServiceProvider[]
    enabledServiceProviders: ServiceProvider[]
  }
}

const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:8787'
const basePath = import.meta.env.VITE_API_BASE_PATH ?? '/api'

export const userApi = createApi({
  reducerPath: 'userApi',
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
  tagTypes: ['User', 'Users'],
  endpoints: (builder) => ({
    getUsers: builder.query<GetUsersResponse, GetUsersRequest>({
      query: ({ limit = 20, offset = 0, role }) => ({
        url: '/user',
        params: { limit, offset, ...(role && { role }) },
      }),
      providesTags: ['Users'],
    }),

    getUserById: builder.query<GetUserResponse, string>({
      query: (id) => `/user/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'User', id }],
    }),

    updateUser: builder.mutation<UpdateUserResponse, UpdateUserRequest>({
      query: ({ id, ...body }) => ({
        url: `/user/${id}`,
        method: 'PUT',
        body,
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'User', id },
        'Users',
      ],
    }),
  }),
})

export const {
  useGetUsersQuery,
  useGetUserByIdQuery,
  useUpdateUserMutation,
} = userApi
