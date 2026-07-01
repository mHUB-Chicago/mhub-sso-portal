import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'

export interface RevenueByTitle { title: string; count: number; mrr: number }
export interface RevenueByFrequency { frequency: string; count: number }
export interface MembershipByPrimary { type: string; count: number }
export interface MembershipByAddOn { addon: string; count: number }
export interface CompanyBySize { label: string; count: number }
export interface CompanyByMembers { name: string; affiliated: number; sponsored: number }
export interface CompanyByRevenue { name: string; subCount: number; mrr: number }
export interface RecentSession { userId: string; userName: string; createdAt: string }
export interface ReportServiceProvider { id: string; name: string; logo: string }
export interface GrowthPoint {
  period: string
  totalMembers: number
  totalCompanies: number
  mrr: number
  memberChange: number
  companyChange: number
  mrrChange: number
}

export interface ReportsData {
  revenue: {
    mrr: number
    arr: number
    totalSubs: number
    payingSubs: number
    avgPerSub: number
    byTitle: RevenueByTitle[]
    byFrequency: RevenueByFrequency[]
  }
  membership: {
    totalUsers: number
    activeUsers: number
    inactiveUsers: number
    byPrimaryMembership: MembershipByPrimary[]
    byAddOn: MembershipByAddOn[]
    companies: {
      total: number
      withSubs: number
      avgMembersPerCo: number
      avgMrrPerCo: number
      crossCompanyCount: number
      topByMembers: CompanyByMembers[]
      topByRevenue: CompanyByRevenue[]
      bySize: CompanyBySize[]
    }
  }
  engagement: {
    loginsLast30d: number
    ssoLast30d: number
    activeUsersLast30d: number
    serviceProviders: ReportServiceProvider[]
    recentSessions: RecentSession[]
  }
  growth: {
    weekly: GrowthPoint[]
    monthly: GrowthPoint[]
  }
}

const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:8787'
const basePath = import.meta.env.VITE_API_BASE_PATH ?? '/api'

export const reportsApi = createApi({
  reducerPath: 'reportsApi',
  baseQuery: fetchBaseQuery({
    baseUrl: `${baseUrl}${basePath}`,
    credentials: 'include',
    prepareHeaders: (headers) => {
      const token = localStorage.getItem('authToken')
      if (token) headers.set('Authorization', `Bearer ${token}`)
      return headers
    },
  }),
  endpoints: (builder) => ({
    getReports: builder.query<{ success: boolean; data: ReportsData }, void>({
      query: () => '/reports',
    }),
  }),
})

export const { useGetReportsQuery } = reportsApi
