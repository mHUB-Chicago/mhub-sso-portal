import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'

export interface OnboardingAddress {
  street: string
  city: string
  state: string
  zip: string
  country: string
}

export interface OnboardingCompany {
  name: string
  website: string
  size: string
  founded: string
  industry: string
  incorporation: string
  fundingStage: string
  problem: string
  targetMarket: string
}

export interface OnboardingUser {
  firstName: string
  lastName: string
  title: string
  email: string
  birthday: string
  phoneCountryCode: string
  phone: string
  linkedin: string
  bio: string
  gender: string
  pronouns: string
  ethnicity: string
  address: OnboardingAddress
}

export interface OnboardingSkills {
  undergradSchool: string
  undergradDegree: string
  gradSchool: string
  gradDegree: string
  industryExperience: string
  skills: string[]
  shopSkills: string[]
}

export interface OnboardingBilling {
  paymentType: 'card' | 'bank'
  nameOnCard: string
  cardLast4?: string
  expiration: string
  address: OnboardingAddress
}

export interface OnboardingFormData {
  mode: 'admin' | 'link'
  company: OnboardingCompany
  user: OnboardingUser
  membershipPackage: string
  skills: OnboardingSkills
  billing: OnboardingBilling
}

export interface OnboardingSubmission {
  id: string
  mode: string
  status: string
  formData: OnboardingFormData
  submittedBy: string | null
  reviewedBy: string | null
  reviewedAt: string | null
  reviewNote: string | null
  duplicateMatchType: string | null
  matchedCompanyId: string | null
  matchedUserId: string | null
  resolutionNote: string | null
  pvCustomerId: string | null
  pvMembershipCardId: string | null
  createdAt: string
  updatedAt: string
}

export interface OnboardingMembershipPackage {
  id: string
  name: string
}

interface SubmissionResponse {
  success: boolean
  message: string
  data: { submission: OnboardingSubmission }
}

interface SubmissionsResponse {
  success: boolean
  message: string
  data: { submissions: OnboardingSubmission[] }
}

interface MembershipPackagesResponse {
  success: boolean
  message: string
  data: { packages: OnboardingMembershipPackage[] }
}

const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:8787'
const basePath = import.meta.env.VITE_API_BASE_PATH ?? '/api'

export const onboardingApi = createApi({
  reducerPath: 'onboardingApi',
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
  tagTypes: ['OnboardingSubmissions', 'OnboardingMembershipPackages'],
  endpoints: (builder) => ({
    createOnboardingSubmission: builder.mutation<SubmissionResponse, OnboardingFormData>({
      query: (formData) => ({ url: '/onboarding', method: 'POST', body: { formData } }),
      invalidatesTags: ['OnboardingSubmissions'],
    }),

    getOnboardingSubmissions: builder.query<SubmissionsResponse, { status?: string } | void>({
      query: (params) => ({ url: '/onboarding', params: params?.status ? { status: params.status } : undefined }),
      providesTags: ['OnboardingSubmissions'],
    }),

    getOnboardingSubmissionById: builder.query<SubmissionResponse, string>({
      query: (id) => `/onboarding/${id}`,
    }),

    approveOnboardingSubmission: builder.mutation<SubmissionResponse, string>({
      query: (id) => ({ url: `/onboarding/${id}/approve`, method: 'POST' }),
      invalidatesTags: ['OnboardingSubmissions'],
    }),

    reactivateOnboardingSubmission: builder.mutation<SubmissionResponse, string>({
      query: (id) => ({ url: `/onboarding/${id}/reactivate`, method: 'POST' }),
      invalidatesTags: ['OnboardingSubmissions'],
    }),

    treatOnboardingSubmissionAsNew: builder.mutation<SubmissionResponse, string>({
      query: (id) => ({ url: `/onboarding/${id}/treat-as-new`, method: 'POST' }),
      invalidatesTags: ['OnboardingSubmissions'],
    }),

    flagOnboardingSubmission: builder.mutation<SubmissionResponse, { id: string; resolutionNote?: string }>({
      query: ({ id, resolutionNote }) => ({
        url: `/onboarding/${id}/flag`,
        method: 'POST',
        body: { resolutionNote },
      }),
      invalidatesTags: ['OnboardingSubmissions'],
    }),

    getOnboardingMembershipPackages: builder.query<MembershipPackagesResponse, void>({
      query: () => '/onboarding/membership-packages',
      providesTags: ['OnboardingMembershipPackages'],
    }),
  }),
})

export const {
  useCreateOnboardingSubmissionMutation,
  useGetOnboardingSubmissionsQuery,
  useGetOnboardingSubmissionByIdQuery,
  useApproveOnboardingSubmissionMutation,
  useReactivateOnboardingSubmissionMutation,
  useTreatOnboardingSubmissionAsNewMutation,
  useFlagOnboardingSubmissionMutation,
  useGetOnboardingMembershipPackagesQuery,
} = onboardingApi
