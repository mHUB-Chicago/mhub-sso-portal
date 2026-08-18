import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'
import type { OnboardingAttributeOption, OnboardingFormData, OnboardingMembershipPackage } from './onboardingApi'

export interface PublicOnboardingCompanyOption {
  id: string
  name: string
}

interface GetOnboardingLinkResponse {
  success: boolean
  message: string
  data: {
    scenario: 'new_company' | 'existing_company'
    packages: OnboardingMembershipPackage[]
    companies?: PublicOnboardingCompanyOption[]
  }
}

interface SubmitOnboardingLinkResponse {
  success: boolean
  message: string
  data: Record<string, never>
}

interface AttributeOptionsResponse {
  success: boolean
  message: string
  data: { options: OnboardingAttributeOption[] }
}

const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:8787'
const basePath = import.meta.env.VITE_API_BASE_PATH ?? '/api'

export const publicOnboardingApi = createApi({
  reducerPath: 'publicOnboardingApi',
  baseQuery: fetchBaseQuery({ baseUrl: `${baseUrl}${basePath}/public-onboarding` }),
  endpoints: (builder) => ({
    getOnboardingLink: builder.query<GetOnboardingLinkResponse, string>({
      query: (token) => `/links/${token}`,
    }),

    getOnboardingAttributeOptions: builder.query<AttributeOptionsResponse, void>({
      query: () => '/attribute-options',
    }),

    submitOnboardingLink: builder.mutation<SubmitOnboardingLinkResponse, { token: string; formData: OnboardingFormData }>({
      query: ({ token, formData }) => ({
        url: `/links/${token}/submit`,
        method: 'POST',
        body: { formData },
      }),
    }),
  }),
})

export const {
  useGetOnboardingLinkQuery,
  useSubmitOnboardingLinkMutation,
  useGetOnboardingAttributeOptionsQuery,
} = publicOnboardingApi
