import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'

export interface OffboardingMember {
  userId: string
  name: string
  email: string
  memberSource: string
}

export interface OffboardingRecord {
  id: string
  type: 'company' | 'user'
  companyId: string | null
  userId: string | null
  name: string
  email: string
  peopleVineId: string | null
  via: 'admin' | 'member'
  members: OffboardingMember[]
  accessRemovedAt: string | null
  pvRemovedAt: string | null
  externalRemovedAt: string | null
  externalRemovedByName: string | null
  completedAt: string | null
  completedByName: string | null
  createdAt: string
}

interface GetOffboardingsResponse {
  success: boolean
  message: string
  data: { inProcess: OffboardingRecord[]; completed: OffboardingRecord[] }
}

interface OffboardingRecordResponse {
  success: boolean
  message: string
  data: { record: OffboardingRecord }
}

interface GetCompanyOffboardingMembersResponse {
  success: boolean
  message: string
  data: { members: OffboardingMember[] }
}

const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:8787'
const basePath = import.meta.env.VITE_API_BASE_PATH ?? '/api'

export const offboardingApi = createApi({
  reducerPath: 'offboardingApi',
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
  tagTypes: ['Offboardings', 'CompanyOffboardingMembers'],
  endpoints: (builder) => ({
    getOffboardings: builder.query<GetOffboardingsResponse, void>({
      query: () => '/offboarding',
      providesTags: ['Offboardings'],
    }),
    getCompanyOffboardingMembers: builder.query<GetCompanyOffboardingMembersResponse, string>({
      query: (companyId) => `/offboarding/company/${companyId}/members`,
      providesTags: ['CompanyOffboardingMembers'],
    }),
    offboardUser: builder.mutation<OffboardingRecordResponse, string>({
      query: (userId) => ({ url: `/offboarding/user/${userId}`, method: 'POST' }),
      invalidatesTags: ['Offboardings', 'CompanyOffboardingMembers'],
    }),
    offboardCompany: builder.mutation<OffboardingRecordResponse, { companyId: string; userIds: string[] }>({
      query: ({ companyId, userIds }) => ({ url: `/offboarding/company/${companyId}`, method: 'POST', body: { userIds } }),
      invalidatesTags: ['Offboardings', 'CompanyOffboardingMembers'],
    }),
    removeOffboardingAccess: builder.mutation<OffboardingRecordResponse, string>({
      query: (id) => ({ url: `/offboarding/${id}/remove-access`, method: 'POST' }),
      invalidatesTags: ['Offboardings', 'CompanyOffboardingMembers'],
    }),
    markExternalAccountsRemoved: builder.mutation<OffboardingRecordResponse, string>({
      query: (id) => ({ url: `/offboarding/${id}/external-removed`, method: 'POST' }),
      invalidatesTags: ['Offboardings'],
    }),
    completeOffboarding: builder.mutation<OffboardingRecordResponse, string>({
      query: (id) => ({ url: `/offboarding/${id}/complete`, method: 'POST' }),
      invalidatesTags: ['Offboardings'],
    }),
  }),
})

export const {
  useGetOffboardingsQuery,
  useGetCompanyOffboardingMembersQuery,
  useOffboardUserMutation,
  useOffboardCompanyMutation,
  useRemoveOffboardingAccessMutation,
  useMarkExternalAccountsRemovedMutation,
  useCompleteOffboardingMutation,
} = offboardingApi
