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
// No previous-period comparison in the 30-day summary view (unlike PlatformEngagement,
// used by the weekly/monthly reports, which do compare against the prior period).
export interface PlatformEngagementSummary { name: string; launches: number; uniqueUsers: number }

export interface ReportsDateRange {
  from: string | null
  to: string | null
}

export interface ReportsData {
  dateRange: ReportsDateRange | null
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
    byPlatform: PlatformEngagementSummary[]
    recentSessions: RecentSession[]
  }
}

export interface MembershipChange {
  member: string
  membership: string
  changeType: 'Cancelled' | 'Inactive'
  affiliatedCompany: string
  sponsoringCompany: string
  mrr: number | null
}

export interface PlatformEngagement {
  name: string
  launches: number
  uniqueUsers: number
  changePct: number
}

export interface DailyLogins {
  day: string
  count: number
}

export interface WeeklyReportData {
  offset: number
  weekLabel: string
  prevWeekLabel: string
  canGoForward: boolean
  movement: {
    newMembers: number
    newMembersDelta: number
    cancelled: number
    cancelledDelta: number
    inactive: number
    inactiveDelta: number
    netChange: number
    netChangeDelta: number
  }
  income: {
    netChange: number
    lostFromCancellations: number
    gainedFromNew: number
  }
  changes: MembershipChange[]
  engagement: {
    logins: number
    loginsChangePct: number
    ssoLaunches: number
    ssoLaunchesChangePct: number
    activeUsers: number
    activeUsersChangePct: number
    sessionsPerUser: number
    byPlatform: PlatformEngagement[]
    dailyLogins: DailyLogins[]
  }
}

export interface MonthlyReportData {
  offset: number
  monthLabel: string
  prevMonthLabel: string
  canGoForward: boolean
  movement: {
    newMembers: number
    newMembersDelta: number
    cancelled: number
    cancelledDelta: number
    inactive: number
    inactiveDelta: number
    netChange: number
    netChangeDelta: number
  }
  income: {
    netChange: number
    lostFromCancellations: number
    gainedFromNew: number
  }
  changes: MembershipChange[]
  engagement: {
    logins: number
    loginsChangePct: number
    ssoLaunches: number
    ssoLaunchesChangePct: number
    activeUsers: number
    activeUsersChangePct: number
    sessionsPerUser: number
    byPlatform: PlatformEngagement[]
    dailyLogins: DailyLogins[]
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
    getReports: builder.query<{ success: boolean; data: ReportsData }, { from?: string; to?: string } | void>({
      query: (range) => {
        const params = new URLSearchParams()
        if (range?.from) params.set('from', range.from)
        if (range?.to) params.set('to', range.to)
        const qs = params.toString()
        return qs ? `/reports?${qs}` : '/reports'
      },
    }),
    getWeeklyReport: builder.query<{ success: boolean; data: WeeklyReportData }, number>({
      query: (offset) => `/reports/weekly?offset=${encodeURIComponent(Math.trunc(offset))}`,
    }),
    getMonthlyReport: builder.query<{ success: boolean; data: MonthlyReportData }, number>({
      query: (offset) => `/reports/monthly?offset=${encodeURIComponent(Math.trunc(offset))}`,
    }),
  }),
})

export const { useGetReportsQuery, useGetWeeklyReportQuery, useGetMonthlyReportQuery } = reportsApi
