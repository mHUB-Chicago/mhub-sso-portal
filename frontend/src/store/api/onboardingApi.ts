import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'

export interface OnboardingAddress {
  street: string
  city: string
  state: string
  zip: string
  country: string
}

export interface OnboardingCompany {
  name?: string
  email?: string
  website?: string
  size?: string
  founded?: string
  industry?: string
  incorporation?: string
  fundingStage?: string
  problem?: string
  targetMarket?: string
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
  ethnicity: string[]
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
  scenario: 'new_company' | 'existing_company'
  companyId?: string
  company: OnboardingCompany
  user: OnboardingUser
  membershipPackage: string
  // existing_company only — the primary membership is inherited from the company, this
  // is optional add-ons the new person might also want.
  addonMemberships: string[]
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
  completedBy: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface OnboardingMembershipPackage {
  id: string
  name: string
}

// Default (in-process) tab row — a live Company/User record still awaiting a
// membership, not an OnboardingSubmission.
export interface OnboardingInProcessRecord {
  id: string
  type: 'company' | 'user'
  name: string
  email: string
  peopleVineId: string | null
  createdAt: string
}

// One PV "Attribute" that offers a fixed set of choices — matched by exact `name`
// against PV's own configured attribute (e.g. "Shop Skills", "Pronoun").
export interface OnboardingAttributeOption {
  id: number
  name: string
  values: string[]
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

interface InProcessResponse {
  success: boolean
  message: string
  data: { records: OnboardingInProcessRecord[] }
}

interface MembershipPackagesResponse {
  success: boolean
  message: string
  data: { packages: OnboardingMembershipPackage[] }
}

interface AddonPackagesResponse {
  success: boolean
  message: string
  data: { packages: OnboardingMembershipPackage[] }
}

interface AttributeOptionsResponse {
  success: boolean
  message: string
  data: { options: OnboardingAttributeOption[] }
}

interface CreateOnboardingLinkResponse {
  success: boolean
  message: string
  data: { url: string; token: string }
}

interface SendOnboardingLinkEmailResponse {
  success: boolean
  message: string
  data: Record<string, never>
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

    updateOnboardingSubmission: builder.mutation<SubmissionResponse, { id: string; formData: OnboardingFormData }>({
      query: ({ id, formData }) => ({ url: `/onboarding/${id}`, method: 'PATCH', body: { formData } }),
      invalidatesTags: ['OnboardingSubmissions'],
    }),

    approveOnboardingSubmission: builder.mutation<SubmissionResponse, string>({
      query: (id) => ({ url: `/onboarding/${id}/approve`, method: 'POST' }),
      invalidatesTags: ['OnboardingSubmissions'],
    }),

    reactivateOnboardingSubmission: builder.mutation<SubmissionResponse, string>({
      query: (id) => ({ url: `/onboarding/${id}/reactivate`, method: 'POST' }),
      invalidatesTags: ['OnboardingSubmissions'],
    }),

    completeOnboardingSubmission: builder.mutation<SubmissionResponse, string>({
      query: (id) => ({ url: `/onboarding/${id}/complete`, method: 'POST' }),
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

    disapproveOnboardingSubmission: builder.mutation<SubmissionResponse, { id: string; resolutionNote?: string }>({
      query: ({ id, resolutionNote }) => ({
        url: `/onboarding/${id}/disapprove`,
        method: 'POST',
        body: { resolutionNote },
      }),
      invalidatesTags: ['OnboardingSubmissions'],
    }),

    getOnboardingInProcess: builder.query<InProcessResponse, void>({
      query: () => '/onboarding/in-process',
      providesTags: ['OnboardingSubmissions'],
    }),

    getOnboardingMembershipPackages: builder.query<MembershipPackagesResponse, void>({
      query: () => '/onboarding/membership-packages',
      providesTags: ['OnboardingMembershipPackages'],
    }),

    getOnboardingAddonPackages: builder.query<AddonPackagesResponse, void>({
      query: () => '/onboarding/addon-packages',
      providesTags: ['OnboardingMembershipPackages'],
    }),

    getOnboardingAttributeOptions: builder.query<AttributeOptionsResponse, void>({
      query: () => '/onboarding/attribute-options',
    }),

    createOnboardingLink: builder.mutation<CreateOnboardingLinkResponse, { scenario: 'new_company' | 'existing_company' }>({
      query: (body) => ({ url: '/onboarding/links', method: 'POST', body }),
    }),

    sendOnboardingLinkEmail: builder.mutation<
      SendOnboardingLinkEmailResponse,
      { token: string; to: string; toName?: string; subject: string; html: string }
    >({
      query: ({ token, ...body }) => ({ url: `/onboarding/links/${token}/send`, method: 'POST', body }),
    }),
  }),
})

export const {
  useCreateOnboardingSubmissionMutation,
  useGetOnboardingSubmissionsQuery,
  useGetOnboardingSubmissionByIdQuery,
  useUpdateOnboardingSubmissionMutation,
  useApproveOnboardingSubmissionMutation,
  useReactivateOnboardingSubmissionMutation,
  useCompleteOnboardingSubmissionMutation,
  useTreatOnboardingSubmissionAsNewMutation,
  useFlagOnboardingSubmissionMutation,
  useDisapproveOnboardingSubmissionMutation,
  useGetOnboardingInProcessQuery,
  useGetOnboardingMembershipPackagesQuery,
  useGetOnboardingAddonPackagesQuery,
  useGetOnboardingAttributeOptionsQuery,
  useCreateOnboardingLinkMutation,
  useSendOnboardingLinkEmailMutation,
} = onboardingApi
