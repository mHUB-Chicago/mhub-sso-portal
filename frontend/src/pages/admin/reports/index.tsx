import { useState, useMemo } from 'react'
import { useGetReportsQuery, type GrowthPoint } from '@/store/api/reportsApi'
import { useGetSyncStatusQuery } from '@/store/api/syncApi'
import { Loader2, TrendingUp, Users, Activity, Building2, RefreshCw, CalendarDays, CalendarRange } from 'lucide-react'

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return 'never'
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function fmt$(n: number) {
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return '$' + (n / 1_000).toFixed(0) + 'K'
  return '$' + n.toLocaleString()
}

function BarRow({ label, value, max, formatVal }: { label: string; value: number; max: number; formatVal: (n: number) => string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="mb-3">
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-600 truncate max-w-[65%]">{label}</span>
        <span className="font-semibold text-gray-900 tabular-nums">{formatVal(value)}</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-brand rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function KpiCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`bg-white border rounded-lg p-4 border-l-4 ${accent ? 'border-l-brand' : 'border-l-gray-200'}`}>
      <div className="text-2xl font-bold tracking-tight">{value}</div>
      <div className="text-xs text-gray-500 uppercase tracking-wide mt-1">{label}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  )
}

type Tab = 'revenue' | 'membership' | 'engagement' | 'weekly' | 'monthly'
type MemberTab = 'users' | 'companies'

export function AdminReportsPage() {
  const [tab, setTab] = useState<Tab>('revenue')
  const [memberTab, setMemberTab] = useState<MemberTab>('users')
  const { data, isLoading, isError, refetch } = useGetReportsQuery()
  const { data: syncStatus } = useGetSyncStatusQuery()

  const lastSync = useMemo(() => {
    const session = syncStatus?.data
    if (!session) return null
    const errors = (session.logs ?? []).filter(l => l.level === 'error').length
    return { ago: timeAgo(session.completedAt ?? session.startedAt), errors, status: session.status }
  }, [syncStatus])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3 text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading reports…
      </div>
    )
  }

  if (isError || !data?.data) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-gray-500">
        <p>Failed to load reports.</p>
        <button onClick={() => refetch()} className="text-brand underline text-sm">Retry</button>
      </div>
    )
  }

  const { revenue, membership, engagement, growth } = data.data

  const ALL_TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'revenue', label: 'Revenue', icon: <TrendingUp className="h-4 w-4" /> },
    { key: 'membership', label: 'Membership', icon: <Users className="h-4 w-4" /> },
    { key: 'engagement', label: 'Engagement', icon: <Activity className="h-4 w-4" /> },
    { key: 'weekly', label: 'Weekly', icon: <CalendarDays className="h-4 w-4" /> },
    { key: 'monthly', label: 'Monthly', icon: <CalendarRange className="h-4 w-4" /> },
  ]
  // Weekly/Monthly tabs hidden for now — kept in ALL_TABS/logic so they can be re-enabled easily.
  const HIDDEN_TABS: Tab[] = ['weekly', 'monthly']
  const TABS = ALL_TABS.filter(t => !HIDDEN_TABS.includes(t.key))

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-sm text-gray-500 mt-1">Live data from the portal database</p>
        </div>
        {lastSync && (
          <div className="flex items-center gap-1.5 text-xs text-gray-400 mt-1 whitespace-nowrap">
            <RefreshCw className="h-3 w-3" />
            <span>Last sync {lastSync.ago}</span>
            <span>·</span>
            <span className={lastSync.errors > 0 ? 'text-red-500 font-medium' : 'text-green-600 font-medium'}>
              {lastSync.errors} {lastSync.errors === 1 ? 'error' : 'errors'}
            </span>
          </div>
        )}
      </div>

      {/* Main tabs */}
      <div className="flex gap-1 border-b">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? 'border-brand text-brand'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* ── REVENUE ── */}
      {tab === 'revenue' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard label="Monthly Recurring Rev" value={fmt$(revenue.mrr)} sub={`${revenue.payingSubs} paying subs`} accent />
            <KpiCard label="Annual Run Rate" value={fmt$(revenue.arr)} sub="MRR × 12" />
            <KpiCard label="Total Subscriptions" value={revenue.totalSubs.toLocaleString()} sub={`${revenue.payingSubs} with rate data`} />
            <KpiCard label="Avg per Subscription" value={fmt$(revenue.avgPerSub)} sub="paying subs only" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border rounded-lg p-5">
              <h3 className="font-semibold mb-1">MRR by Service</h3>
              <p className="text-xs text-gray-400 mb-4">Top 15 services by monthly revenue</p>
              {revenue.byTitle.map(r => (
                <BarRow
                  key={r.title}
                  label={r.title}
                  value={r.mrr}
                  max={revenue.byTitle[0]?.mrr ?? 1}
                  formatVal={fmt$}
                />
              ))}
            </div>

            <div className="bg-white border rounded-lg p-5">
              <h3 className="font-semibold mb-1">Billing Frequency</h3>
              <p className="text-xs text-gray-400 mb-4">How members are billed</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase text-gray-400 border-b">
                    <th className="text-left pb-2">Frequency</th>
                    <th className="text-right pb-2">Count</th>
                    <th className="text-right pb-2">%</th>
                  </tr>
                </thead>
                <tbody>
                  {revenue.byFrequency.map(f => (
                    <tr key={f.frequency} className="border-b last:border-0">
                      <td className="py-2 font-medium">{f.frequency}</td>
                      <td className="py-2 text-right tabular-nums">{f.count}</td>
                      <td className="py-2 text-right tabular-nums text-gray-500">
                        {revenue.totalSubs > 0 ? ((f.count / revenue.totalSubs) * 100).toFixed(0) : 0}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="mt-6">
                <h3 className="font-semibold mb-1">Currency</h3>
                <p className="text-xs text-gray-400 mb-3">All subscriptions billed in</p>
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-bold">USD</span>
                  <span className="text-xs bg-green-100 text-green-700 font-bold px-2.5 py-1 rounded-full">100%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Full MRR table */}
          <div className="bg-white border rounded-lg p-5">
            <h3 className="font-semibold mb-1">Full MRR Breakdown</h3>
            <p className="text-xs text-gray-400 mb-4">All services with revenue data</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase text-gray-400 border-b">
                  <th className="text-left pb-2">Service</th>
                  <th className="text-right pb-2">Subs</th>
                  <th className="text-right pb-2">MRR</th>
                  <th className="text-right pb-2">% of Total</th>
                </tr>
              </thead>
              <tbody>
                {revenue.byTitle.map(r => (
                  <tr key={r.title} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-2 font-medium">{r.title}</td>
                    <td className="py-2 text-right tabular-nums text-gray-600">{r.count}</td>
                    <td className="py-2 text-right tabular-nums font-semibold">{fmt$(r.mrr)}</td>
                    <td className="py-2 text-right tabular-nums text-gray-500">
                      {revenue.mrr > 0 ? ((r.mrr / revenue.mrr) * 100).toFixed(1) : 0}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── MEMBERSHIP ── */}
      {tab === 'membership' && (
        <div className="space-y-5">
          <div className="flex gap-1 mb-2">
            {(['users', 'companies'] as MemberTab[]).map(t => (
              <button
                key={t}
                onClick={() => setMemberTab(t)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  memberTab === t ? 'bg-brand text-white' : 'text-gray-500 hover:bg-gray-100'
                }`}
              >
                {t === 'users' ? <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />User Data</span> : <span className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" />Company Data</span>}
              </button>
            ))}
          </div>

          {memberTab === 'users' && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <KpiCard label="Total Portal Members" value={membership.totalUsers.toLocaleString()} sub="all synced from PV" accent />
                <KpiCard label="Active Members" value={membership.activeUsers.toLocaleString()} sub={`${membership.totalUsers > 0 ? ((membership.activeUsers / membership.totalUsers) * 100).toFixed(0) : 0}% of total`} />
                <KpiCard label="Inactive / No Card" value={membership.inactiveUsers.toLocaleString()} sub="pending or lapsed" />
                <KpiCard label="Membership Types" value={membership.byPrimaryMembership.length.toString()} sub="distinct primary types" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white border rounded-lg p-5">
                  <h3 className="font-semibold mb-1">Primary Membership Composition</h3>
                  <p className="text-xs text-gray-400 mb-4">Top types by member count</p>
                  {membership.byPrimaryMembership.map(m => (
                    <BarRow
                      key={m.type}
                      label={m.type}
                      value={m.count}
                      max={membership.byPrimaryMembership[0]?.count ?? 1}
                      formatVal={n => n.toLocaleString()}
                    />
                  ))}
                </div>
                <div className="bg-white border rounded-lg p-5">
                  <h3 className="font-semibold mb-1">Top Add-ons</h3>
                  <p className="text-xs text-gray-400 mb-4">Most common add-on benefits</p>
                  {membership.byAddOn.map(a => (
                    <BarRow
                      key={a.addon}
                      label={a.addon}
                      value={a.count}
                      max={membership.byAddOn[0]?.count ?? 1}
                      formatVal={n => n.toLocaleString()}
                    />
                  ))}
                  {membership.byAddOn.length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-6">No add-on data</p>
                  )}
                </div>
              </div>
            </>
          )}

          {memberTab === 'companies' && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <KpiCard label="Total Companies" value={membership.companies.total.toLocaleString()} sub="non-personal" accent />
                <KpiCard label="With Subscriptions" value={membership.companies.withSubs.toLocaleString()} sub={`${membership.companies.total > 0 ? ((membership.companies.withSubs / membership.companies.total) * 100).toFixed(0) : 0}% paying`} />
                <KpiCard label="Avg Members / Company" value={membership.companies.avgMembersPerCo.toString()} />
                <KpiCard label="Avg MRR / Company" value={fmt$(membership.companies.avgMrrPerCo)} sub="paying companies" />
                <KpiCard label="Cross-Company Members" value={membership.companies.crossCompanyCount.toLocaleString()} sub="sponsored by another co." />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white border rounded-lg p-5">
                  <h3 className="font-semibold mb-1">Top Companies by Members</h3>
                  <p className="text-xs text-gray-400 mb-4">Affiliated = their own members · Sponsored = cross-company members they sponsor</p>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs uppercase text-gray-400 border-b">
                        <th className="text-left pb-2">Company</th>
                        <th className="text-right pb-2">Affiliated</th>
                        <th className="text-right pb-2">Sponsored</th>
                      </tr>
                    </thead>
                    <tbody>
                      {membership.companies.topByMembers.map((c, i) => (
                        <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                          <td className="py-2 font-medium truncate max-w-[160px]">{c.name}</td>
                          <td className="py-2 text-right tabular-nums">{c.affiliated.toLocaleString()}</td>
                          <td className="py-2 text-right tabular-nums">
                            {c.sponsored > 0
                              ? <span className="text-amber-600 font-medium">{c.sponsored.toLocaleString()}</span>
                              : <span className="text-gray-300">—</span>
                            }
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="bg-white border rounded-lg p-5">
                  <h3 className="font-semibold mb-1">Top Companies by Revenue</h3>
                  <p className="text-xs text-gray-400 mb-4">Monthly recurring revenue contribution</p>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs uppercase text-gray-400 border-b">
                        <th className="text-left pb-2">Company</th>
                        <th className="text-right pb-2">Subs</th>
                        <th className="text-right pb-2">MRR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {membership.companies.topByRevenue.map((c, i) => (
                        <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                          <td className="py-2 font-medium truncate max-w-[160px]">{c.name}</td>
                          <td className="py-2 text-right tabular-nums text-gray-500">{c.subCount}</td>
                          <td className="py-2 text-right tabular-nums font-semibold">{fmt$(c.mrr)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-white border rounded-lg p-5">
                <h3 className="font-semibold mb-1">Company Size Distribution</h3>
                <p className="text-xs text-gray-400 mb-4">Companies grouped by member count</p>
                {membership.companies.bySize.map(s => (
                  <BarRow
                    key={s.label}
                    label={s.label}
                    value={s.count}
                    max={Math.max(...membership.companies.bySize.map(x => x.count), 1)}
                    formatVal={n => n.toLocaleString()}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── ENGAGEMENT ── */}
      {tab === 'engagement' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard label="Logins (30d)" value={engagement.loginsLast30d.toLocaleString()} sub="portal sign-ins" accent />
            <KpiCard label="SSO Launches (30d)" value={engagement.ssoLast30d.toLocaleString()} sub="SAML completions" />
            <KpiCard label="Active Users (30d)" value={engagement.activeUsersLast30d.toLocaleString()} sub="unique" />
            <KpiCard label="SSO-Ready Users" value={membership.totalUsers.toLocaleString()} sub="synced accounts" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border rounded-lg p-5">
              <h3 className="font-semibold mb-1">Connected Service Providers</h3>
              <p className="text-xs text-gray-400 mb-4">Active SSO platforms</p>
              {engagement.serviceProviders.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">No service providers configured</p>
              ) : (
                <div className="space-y-2">
                  {engagement.serviceProviders.map(sp => (
                    <div key={sp.id} className="flex items-center gap-3 p-2.5 rounded-lg border bg-gray-50">
                      {sp.logo ? (
                        <img src={sp.logo} alt={sp.name} className="h-6 w-6 object-contain rounded" />
                      ) : (
                        <div className="h-6 w-6 bg-gray-200 rounded flex items-center justify-center text-xs font-bold text-gray-500">
                          {sp.name[0]}
                        </div>
                      )}
                      <span className="text-sm font-medium">{sp.name}</span>
                      <span className="ml-auto text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Active</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white border rounded-lg p-5">
              <h3 className="font-semibold mb-1">Recent Sign-in Activity</h3>
              <p className="text-xs text-gray-400 mb-4">Latest portal sessions · last 30 days</p>
              {engagement.recentSessions.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">No recent sessions</p>
              ) : (
                <div className="space-y-0 divide-y">
                  {engagement.recentSessions.map((s, i) => (
                    <div key={i} className="flex items-center gap-3 py-2.5">
                      <div className="h-2 w-2 rounded-full bg-blue-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium truncate block">{s.userName}</span>
                        <span className="text-xs text-gray-400">signed in</span>
                      </div>
                      <span className="text-xs text-gray-400 whitespace-nowrap">
                        {new Date(s.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <p className="text-xs text-gray-400 italic">
            Engagement data accumulates as members sign in and launch SSO services.
          </p>
        </div>
      )}

      {/* ── WEEKLY / MONTHLY GROWTH ── */}
      {(tab === 'weekly' || tab === 'monthly') && (
        <GrowthTab
          points={tab === 'weekly' ? growth.weekly : growth.monthly}
          unitLabel={tab === 'weekly' ? 'week' : 'month'}
        />
      )}
    </div>
  )
}

function ChangeBadge({ value, isCurrency }: { value: number; isCurrency?: boolean }) {
  if (value === 0) return <span className="text-gray-300">—</span>
  const positive = value > 0
  const label = isCurrency ? fmt$(Math.abs(value)) : Math.abs(value).toLocaleString()
  return (
    <span className={`font-medium ${positive ? 'text-green-600' : 'text-red-500'}`}>
      {positive ? '+' : '−'}{label}
    </span>
  )
}

function TrendRow({ label, points, pick, formatVal }: { label: string; points: GrowthPoint[]; pick: (p: GrowthPoint) => number; formatVal: (n: number) => string }) {
  const values = points.map(pick)
  const max = Math.max(...values, 1)
  return (
    <div className="mb-3">
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-600">{label}</span>
      </div>
      <div className="flex items-end gap-1 h-16">
        {points.map((p, i) => (
          <div key={p.period} className="flex-1 flex flex-col items-center justify-end gap-1" title={`${p.period}: ${formatVal(values[i])}`}>
            <div className="w-full bg-brand/70 rounded-t transition-all" style={{ height: `${max > 0 ? Math.max((values[i] / max) * 100, 2) : 2}%` }} />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-gray-400 mt-1">
        <span>{points[0]?.period}</span>
        <span>{points[points.length - 1]?.period}</span>
      </div>
    </div>
  )
}

function GrowthTab({ points, unitLabel }: { points: GrowthPoint[]; unitLabel: string }) {
  const latest = points[points.length - 1]
  const first = points[0]
  const memberShiftPct = first?.totalMembers ? Math.round(((latest.totalMembers - first.totalMembers) / first.totalMembers) * 100) : 0
  const mrrShiftPct = first?.mrr ? Math.round(((latest.mrr - first.mrr) / first.mrr) * 100) : 0

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Total Members Now" value={(latest?.totalMembers ?? 0).toLocaleString()} sub={`${(latest?.memberChange ?? 0) >= 0 ? '+' : ''}${latest?.memberChange ?? 0} vs prior ${unitLabel}`} accent />
        <KpiCard label="Total MRR Now" value={fmt$(latest?.mrr ?? 0)} sub={`${(latest?.mrrChange ?? 0) >= 0 ? '+' : ''}${fmt$(latest?.mrrChange ?? 0)} vs prior ${unitLabel}`} />
        <KpiCard label={`Member Shift (${points.length} ${unitLabel}s)`} value={`${memberShiftPct >= 0 ? '+' : ''}${memberShiftPct}%`} sub={`${first?.totalMembers ?? 0} → ${latest?.totalMembers ?? 0}`} />
        <KpiCard label={`MRR Shift (${points.length} ${unitLabel}s)`} value={`${mrrShiftPct >= 0 ? '+' : ''}${mrrShiftPct}%`} sub={`${fmt$(first?.mrr ?? 0)} → ${fmt$(latest?.mrr ?? 0)}`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border rounded-lg p-5">
          <h3 className="font-semibold mb-1">Total Members Over Time</h3>
          <p className="text-xs text-gray-400 mb-4">Cumulative CMT-qualifying members, end of each {unitLabel}</p>
          <TrendRow label="Members" points={points} pick={p => p.totalMembers} formatVal={n => n.toLocaleString()} />
        </div>
        <div className="bg-white border rounded-lg p-5">
          <h3 className="font-semibold mb-1">MRR Over Time</h3>
          <p className="text-xs text-gray-400 mb-4">Cumulative monthly recurring revenue, end of each {unitLabel}</p>
          <TrendRow label="MRR" points={points} pick={p => p.mrr} formatVal={fmt$} />
        </div>
      </div>

      <div className="bg-white border rounded-lg p-5">
        <h3 className="font-semibold mb-1">Period-over-Period Shift</h3>
        <p className="text-xs text-gray-400 mb-4">Change vs the previous {unitLabel}</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase text-gray-400 border-b">
              <th className="text-left pb-2">Period</th>
              <th className="text-right pb-2">Members</th>
              <th className="text-right pb-2">Δ Members</th>
              <th className="text-right pb-2">Companies</th>
              <th className="text-right pb-2">Δ Companies</th>
              <th className="text-right pb-2">MRR</th>
              <th className="text-right pb-2">Δ MRR</th>
            </tr>
          </thead>
          <tbody>
            {points.map(p => (
              <tr key={p.period} className="border-b last:border-0 hover:bg-gray-50">
                <td className="py-2 font-medium">{p.period}</td>
                <td className="py-2 text-right tabular-nums">{p.totalMembers.toLocaleString()}</td>
                <td className="py-2 text-right tabular-nums"><ChangeBadge value={p.memberChange} /></td>
                <td className="py-2 text-right tabular-nums">{p.totalCompanies.toLocaleString()}</td>
                <td className="py-2 text-right tabular-nums"><ChangeBadge value={p.companyChange} /></td>
                <td className="py-2 text-right tabular-nums">{fmt$(p.mrr)}</td>
                <td className="py-2 text-right tabular-nums"><ChangeBadge value={p.mrrChange} isCurrency /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400 italic">
        Trajectory reflects records currently on file, grouped by when they were created — there's no historical
        snapshot log, so this can't show a dip from a member who both joined and churned before today.
      </p>
    </div>
  )
}
