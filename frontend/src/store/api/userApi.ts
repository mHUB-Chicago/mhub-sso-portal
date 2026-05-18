import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'

// Types matching backend schemas
export interface User {
  id: string
  companyId: string
  email: string
  name: string
  peopleVineId: string | null
  role: 'USER' | 'ADMIN'
  active: boolean
  emailVerified: boolean
  mustResetPassword: boolean
  membershipType: string | null
  profilePhoto: string | null
  phone: string | null
  address: string | null
  city: string | null
  state: string | null
  zipCode: string | null
  cardStatus: string | null
  memberSource: string
  createdAt: string
  updatedAt: string
}

export interface Company {
  id: string
  peopleVineId: string | null
  name: string
  email: string
  active: boolean
  membershipTypes: string[]
  isPersonal: boolean
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
  search?: string
  companyId?: string
  membershipType?: string
  active?: 'true' | 'false'
  emailVerified?: 'true' | 'false'
  portalAccess?: 'true' | 'false'
  noEmail?: 'true' | 'false'
  memberSource?: 'subscription' | 'membership'
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
      query: ({ limit = 20, offset = 0, role, search, companyId, membershipType, active, emailVerified, portalAccess, noEmail, memberSource }) => ({
        url: '/user',
        params: {
          limit,
          offset,
          ...(role && { role }),
          ...(search && { search }),
          ...(companyId && { companyId }),
          ...(membershipType && { membershipType }),
          ...(active !== undefined && { active }),
          ...(emailVerified !== undefined && { emailVerified }),
          ...(portalAccess !== undefined && { portalAccess }),
          ...(noEmail !== undefined && { noEmail }),
          ...(memberSource && { memberSource }),
        },
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

    importUsers: builder.mutation<
      { success: boolean; data: { created: number; updated: number; skipped: number; errors: string[] } },
      { name: string; email: string; companyName?: string; membershipType?: string; active?: boolean; emailVerified?: boolean }[]
    >({
      query: (body) => ({ url: '/user/import', method: 'POST', body }),
      invalidatesTags: ['Users'],
    }),
  }),
})

export const {
  useGetUsersQuery,
  useLazyGetUsersQuery,
  useGetUserByIdQuery,
  useUpdateUserMutation,
  useImportUsersMutation,
} = userApi
