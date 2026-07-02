import { useState, useMemo } from 'react'
import { useGetReportsQuery, useGetWeeklyReportQuery, type DailyLogins } from '@/store/api/reportsApi'
import { useGetSyncStatusQuery } from '@/store/api/syncApi'
import { Loader2, TrendingUp, Users, Activity, Building2, RefreshCw, CalendarDays, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, Minus } from 'lucide-react'

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

type Tab = 'revenue' | 'membership' | 'engagement' | 'weekly'
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

  const { revenue, membership, engagement } = data.data

  const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'revenue', label: 'Revenue', icon: <TrendingUp className="h-4 w-4" /> },
    { key: 'membership', label: 'Membership', icon: <Users className="h-4 w-4" /> },
    { key: 'engagement', label: 'Engagement', icon: <Activity className="h-4 w-4" /> },
    { key: 'weekly', label: 'Weekly', icon: <CalendarDays className="h-4 w-4" /> },
  ]

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

      {tab === 'weekly' && <WeeklyTab />}
    </div>
  )
}

type WeeklySubTab = 'movement' | 'engagement'

function Delta({ value, suffix = '', invert = false }: { value: number; suffix?: string; invert?: boolean }) {
  if (value === 0) {
    return (
      <span className="flex items-center gap-1 text-xs text-gray-400 font-medium">
        <Minus className="h-3 w-3" />
        same as last week
      </span>
    )
  }
  const good = invert ? value < 0 : value > 0
  return (
    <span className={`flex items-center gap-1 text-xs font-semibold ${good ? 'text-green-600' : 'text-red-500'}`}>
      {value > 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {Math.abs(value)}{suffix} vs last week
    </span>
  )
}

function DailyLoginsChart({ data }: { data: DailyLogins[] }) {
  const width = 520
  const height = 160
  const padX = 24
  const padY = 20
  const max = Math.max(...data.map(d => d.count), 1)
  const step = data.length > 1 ? (width - padX * 2) / (data.length - 1) : 0
  const points = data.map((d, i) => {
    const x = padX + i * step
    const y = height - padY - (d.count / max) * (height - padY * 2)
    return { x, y, d }
  })
  const linePoints = points.map(p => `${p.x},${p.y}`).join(' ')
  const areaPoints = `${padX},${height - padY} ${linePoints} ${padX + (data.length - 1) * step},${height - padY}`

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ overflow: 'visible' }}>
      <polygon points={areaPoints} fill="#e8842b" opacity={0.08} />
      <polyline points={linePoints} fill="none" stroke="#e8842b" strokeWidth={2.5} />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={3} fill="#e8842b" />
          <text x={p.x} y={height - 4} fill="#9ca3af" fontSize={10} textAnchor="middle">{p.d.day}</text>
        </g>
      ))}
    </svg>
  )
}

function WeeklyTab() {
  const [offset, setOffset] = useState(0)
  const [subTab, setSubTab] = useState<WeeklySubTab>('movement')
  const { data, isLoading, isError, refetch } = useGetWeeklyReportQuery(offset)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3 text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading weekly report…
      </div>
    )
  }

  if (isError || !data?.data) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-gray-500">
        <p>Failed to load weekly report.</p>
        <button onClick={() => refetch()} className="text-brand underline text-sm">Retry</button>
      </div>
    )
  }

  const { weekLabel, prevWeekLabel, canGoForward, movement, income, changes, engagement } = data.data
  const maxPlatformLaunches = Math.max(...engagement.byPlatform.map(p => p.launches), 1)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="text-xs uppercase tracking-wide text-gray-400 font-semibold">Week of</span>
        <div className="flex items-center gap-2 border rounded-lg px-3 py-1.5">
          <button onClick={() => setOffset(o => o - 1)} className="text-gray-400 hover:text-gray-700" aria-label="Previous week">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold">{weekLabel}</span>
          <button
            onClick={() => canGoForward && setOffset(o => Math.min(0, o + 1))}
            disabled={!canGoForward}
            className={canGoForward ? 'text-gray-400 hover:text-gray-700' : 'text-gray-200 cursor-not-allowed'}
            aria-label="Next week"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <span className="text-xs text-gray-400">vs. previous week ({prevWeekLabel})</span>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setSubTab('movement')}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-colors border ${
            subTab === 'movement' ? 'bg-brand border-brand text-white' : 'text-gray-500 border-gray-200 hover:text-gray-700'
          }`}
        >
          <Users className="h-3.5 w-3.5" />
          Membership Movement
        </button>
        <button
          onClick={() => setSubTab('engagement')}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-colors border ${
            subTab === 'engagement' ? 'bg-brand border-brand text-white' : 'text-gray-500 border-gray-200 hover:text-gray-700'
          }`}
        >
          <Activity className="h-3.5 w-3.5" />
          Engagement
        </button>
      </div>

      {subTab === 'movement' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white border border-l-4 border-l-brand rounded-lg p-4">
              <div className="text-2xl font-bold tracking-tight text-green-600">+{movement.newMembers}</div>
              <div className="text-xs text-gray-500 uppercase tracking-wide mt-1">New Members</div>
              <div className="text-xs text-gray-400 mt-1">joined this week</div>
              <div className="mt-2"><Delta value={movement.newMembersDelta} /></div>
            </div>
            <div className="bg-white border rounded-lg p-4">
              <div className="text-2xl font-bold tracking-tight text-red-500">−{movement.cancelled}</div>
              <div className="text-xs text-gray-500 uppercase tracking-wide mt-1">Cancelled</div>
              <div className="text-xs text-gray-400 mt-1">memberships ended</div>
              <div className="mt-2"><Delta value={movement.cancelledDelta} invert /></div>
            </div>
            <div className="bg-white border rounded-lg p-4">
              <div className="text-2xl font-bold tracking-tight text-gray-500">−{movement.inactive}</div>
              <div className="text-xs text-gray-500 uppercase tracking-wide mt-1">Went Inactive</div>
              <div className="text-xs text-gray-400 mt-1">lapsed / expired</div>
              <div className="mt-2"><Delta value={movement.inactiveDelta} invert /></div>
            </div>
            <div className="bg-white border rounded-lg p-4">
              <div className="text-2xl font-bold tracking-tight">{movement.netChange >= 0 ? '+' : ''}{movement.netChange}</div>
              <div className="text-xs text-gray-500 uppercase tracking-wide mt-1">Net Change</div>
              <div className="text-xs text-gray-400 mt-1">active membership base</div>
              <div className="mt-2"><Delta value={movement.netChangeDelta} /></div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border rounded-lg p-5">
              <h3 className="font-semibold mb-1">Income Impact</h3>
              <p className="text-xs text-gray-400 mb-4">Change in MRR from this week's movement</p>
              <div className="flex items-baseline gap-2 mb-1">
                <span className={`text-3xl font-bold tracking-tight ${income.netChange < 0 ? 'text-red-500' : 'text-green-600'}`}>
                  {income.netChange >= 0 ? '+' : '−'}{fmt$(Math.abs(income.netChange))}
                </span>
                <span className="text-xs text-gray-500">net MRR change this week</span>
              </div>
              <p className="text-xs text-gray-400 mb-4">
                −{fmt$(income.lostFromCancellations)} from cancellations, +{fmt$(income.gainedFromNew)} from new paid memberships
              </p>
              {changes.filter(ch => ch.changeType === 'Cancelled' && ch.mrr != null).length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">No paid cancellations this week</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs uppercase text-gray-400 border-b">
                      <th className="text-left pb-2">Cancelled Membership</th>
                      <th className="text-left pb-2">Sponsoring Company</th>
                      <th className="text-right pb-2">MRR Lost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {changes.filter(ch => ch.changeType === 'Cancelled' && ch.mrr != null).map((ch, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-2 font-medium">{ch.membership}</td>
                        <td className="py-2 text-gray-500">{ch.sponsoringCompany}</td>
                        <td className="py-2 text-right tabular-nums">−{fmt$(ch.mrr ?? 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className="text-xs text-gray-400 italic mt-2">Lost MRR attributed to each membership's sponsoring company, per card.</p>
            </div>

            <div className="bg-white border rounded-lg p-5">
              <h3 className="font-semibold mb-1">This Week's Movement</h3>
              <p className="text-xs text-gray-400 mb-4">Membership changes captured from PeopleVine webhooks</p>
              <div className="flex items-center justify-between py-2.5 border-b">
                <div className="flex items-center gap-2.5">
                  <span className="h-2 w-2 rounded-full bg-green-500" />
                  <div>
                    <div className="text-sm font-semibold">New Members</div>
                    <div className="text-xs text-gray-400">New registrations & activations</div>
                  </div>
                </div>
                <span className="text-lg font-bold text-green-600">+{movement.newMembers}</span>
              </div>
              <div className="flex items-center justify-between py-2.5 border-b">
                <div className="flex items-center gap-2.5">
                  <span className="h-2 w-2 rounded-full bg-red-500" />
                  <div>
                    <div className="text-sm font-semibold">Cancelled</div>
                    <div className="text-xs text-gray-400">Membership cancelled in PeopleVine</div>
                  </div>
                </div>
                <span className="text-lg font-bold text-red-500">−{movement.cancelled}</span>
              </div>
              <div className="flex items-center justify-between py-2.5 border-b">
                <div className="flex items-center gap-2.5">
                  <span className="h-2 w-2 rounded-full bg-gray-400" />
                  <div>
                    <div className="text-sm font-semibold">Went Inactive</div>
                    <div className="text-xs text-gray-400">Expired, suspended, or lapsed</div>
                  </div>
                </div>
                <span className="text-lg font-bold text-red-500">−{movement.inactive}</span>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <div className="flex items-center gap-2.5">
                  <span className="h-2 w-2 rounded-full bg-brand" />
                  <div>
                    <div className="text-sm font-semibold">Net Change</div>
                    <div className="text-xs text-gray-400">Active membership base</div>
                  </div>
                </div>
                <span className="text-lg font-bold">{movement.netChange >= 0 ? '+' : ''}{movement.netChange}</span>
              </div>
            </div>
          </div>

          <div className="bg-white border rounded-lg p-5">
            <h3 className="font-semibold mb-1">Membership Changes — Detail</h3>
            <p className="text-xs text-gray-400 mb-4">Every membership that changed state this week</p>
            {changes.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No membership changes this week</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase text-gray-400 border-b">
                    <th className="text-left pb-2">Member</th>
                    <th className="text-left pb-2">Membership</th>
                    <th className="text-left pb-2">Change</th>
                    <th className="text-left pb-2">Affiliated Company</th>
                    <th className="text-left pb-2">Sponsoring Company</th>
                    <th className="text-right pb-2">MRR</th>
                  </tr>
                </thead>
                <tbody>
                  {changes.map((ch, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-2 font-medium">{ch.member}</td>
                      <td className="py-2 text-gray-500">{ch.membership}</td>
                      <td className="py-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          ch.changeType === 'Cancelled' ? 'bg-red-50 text-red-500' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {ch.changeType}
                        </span>
                      </td>
                      <td className="py-2 text-gray-500">{ch.affiliatedCompany}</td>
                      <td className="py-2 text-gray-500">{ch.sponsoringCompany}</td>
                      <td className="py-2 text-right tabular-nums">{ch.mrr != null ? `−${fmt$(ch.mrr)}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {subTab === 'engagement' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard label="Logins" value={engagement.logins.toLocaleString()} sub="portal sign-ins" accent />
            <KpiCard label="SSO Launches" value={engagement.ssoLaunches.toLocaleString()} sub="SAML completions" />
            <KpiCard label="Active Users" value={engagement.activeUsers.toLocaleString()} sub="unique this week" />
            <KpiCard label="Sessions / User" value={engagement.sessionsPerUser.toString()} sub="avg this week" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border rounded-lg p-5">
              <h3 className="font-semibold mb-1">SSO Launches by Platform</h3>
              <p className="text-xs text-gray-400 mb-4">Which services members launched this week</p>
              {engagement.byPlatform.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">No SSO launches this week</p>
              ) : (
                engagement.byPlatform.map(p => (
                  <BarRow key={p.name} label={p.name} value={p.launches} max={maxPlatformLaunches} formatVal={n => n.toLocaleString()} />
                ))
              )}
            </div>

            <div className="bg-white border rounded-lg p-5">
              <h3 className="font-semibold mb-1">Daily Logins</h3>
              <p className="text-xs text-gray-400 mb-4">Portal sign-ins each day this week</p>
              <DailyLoginsChart data={engagement.dailyLogins} />
            </div>
          </div>

          <div className="bg-white border rounded-lg p-5">
            <h3 className="font-semibold mb-1">Platform Engagement — Detail</h3>
            <p className="text-xs text-gray-400 mb-4">Per connected service, this week vs. previous</p>
            {engagement.byPlatform.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No platform activity this week</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase text-gray-400 border-b">
                    <th className="text-left pb-2">Platform</th>
                    <th className="text-right pb-2">SSO Launches</th>
                    <th className="text-right pb-2">Unique Users</th>
                    <th className="text-right pb-2">vs Last Week</th>
                  </tr>
                </thead>
                <tbody>
                  {engagement.byPlatform.map(p => (
                    <tr key={p.name} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-2 font-medium">{p.name}</td>
                      <td className="py-2 text-right tabular-nums">{p.launches}</td>
                      <td className="py-2 text-right tabular-nums">{p.uniqueUsers}</td>
                      <td className={`py-2 text-right tabular-nums font-medium ${p.changePct >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        <span className="inline-flex items-center gap-1 justify-end">
                          {p.changePct >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                          {Math.abs(p.changePct)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <p className="text-xs text-gray-400 italic">
            Weekly report generated from PeopleVine webhook events (membership movement) and portal SSO event logs (engagement). Income impact reflects paid memberships only.
          </p>
        </div>
      )}
    </div>
  )
}
