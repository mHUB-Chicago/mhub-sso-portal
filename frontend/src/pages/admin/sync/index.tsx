import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCw, Play, Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useGetSyncStatusQuery, useStartSyncMutation, type SyncSession, type SyncLogEntry } from '@/store/api/syncApi'

const POLL_INTERVAL_MS = 3000

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
      <div
        className="h-3 rounded-full transition-all duration-500 ease-out bg-brand"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  )
}

function StatusBadge({ status }: { status: SyncSession['status'] }) {
  const map = {
    pending:   { icon: <Clock className="h-4 w-4" />,        label: 'Pending',    cls: 'text-yellow-600 bg-yellow-50 border-yellow-200' },
    running:   { icon: <Loader2 className="h-4 w-4 animate-spin" />, label: 'Running', cls: 'text-blue-600 bg-blue-50 border-blue-200' },
    completed: { icon: <CheckCircle2 className="h-4 w-4" />, label: 'Completed',  cls: 'text-green-600 bg-green-50 border-green-200' },
    failed:    { icon: <XCircle className="h-4 w-4" />,      label: 'Failed',     cls: 'text-red-600 bg-red-50 border-red-200' },
  }
  const { icon, label, cls } = map[status] ?? map.pending
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${cls}`}>
      {icon}{label}
    </span>
  )
}

function LogLine({ entry }: { entry: SyncLogEntry }) {
  const color = entry.level === 'error' ? 'text-red-400' : entry.level === 'warn' ? 'text-yellow-400' : 'text-green-300'
  const time = new Date(entry.time).toLocaleTimeString()
  return (
    <div className="flex gap-2 text-xs font-mono leading-relaxed">
      <span className="text-gray-500 shrink-0">{time}</span>
      <span className={`shrink-0 uppercase font-bold ${color}`}>[{entry.level}]</span>
      <span className="text-gray-200 break-all">{entry.message}</span>
    </div>
  )
}

function SyncTab({ session, type, label, description, onStart, isStarting }: {
  session: SyncSession | null
  type: 'ALL' | 'CONTINUE'
  label: string
  description: string
  onStart: (type: 'ALL' | 'CONTINUE') => void
  isStarting: boolean
}) {
  const logEndRef = useRef<HTMLDivElement>(null)
  const isThisSession = session?.type === type
  const isActive = isThisSession && (session?.status === 'running' || session?.status === 'pending')

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [session?.logs])

  const progress = isThisSession ? session.progress : 0
  const step = isThisSession ? session.step : ''
  const logs: SyncLogEntry[] = isThisSession ? (session.logs ?? []) : []
  const status = isThisSession ? session.status : null

  return (
    <div className="space-y-5">
      {/* Description + Start button */}
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-gray-600">{description}</p>
        <Button
          onClick={() => onStart(type)}
          disabled={isStarting || isActive}
          className="shrink-0"
        >
          {isActive
            ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Running…</>
            : <><Play className="h-4 w-4 mr-2" />{label}</>}
        </Button>
      </div>

      {/* Status + progress */}
      {isThisSession && status && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <StatusBadge status={status} />
              {step && <span className="text-sm text-gray-500">{step}</span>}
            </div>
            <span className="text-sm font-semibold text-gray-700">{progress}%</span>
          </div>
          <ProgressBar value={progress} />
        </div>
      )}

      {/* Log console */}
      {isThisSession && logs.length > 0 && (
        <div className="bg-gray-900 rounded-lg p-4 h-72 overflow-y-auto space-y-1 border border-gray-800">
          {logs.map((entry, i) => <LogLine key={i} entry={entry} />)}
          <div ref={logEndRef} />
        </div>
      )}

      {(!isThisSession || logs.length === 0) && (
        <div className="bg-gray-50 rounded-lg border border-dashed border-gray-200 h-40 flex items-center justify-center">
          <p className="text-sm text-gray-400">No logs yet. Start a sync to see progress here.</p>
        </div>
      )}
    </div>
  )
}

export function AdminSyncPage() {
  const [activeTab, setActiveTab] = useState<'ALL' | 'CONTINUE'>('ALL')
  const [pollingInterval, setPollingInterval] = useState<number | false>(false)

  const { data, refetch } = useGetSyncStatusQuery(undefined, {
    pollingInterval: pollingInterval || undefined,
  })
  const [startSync, { isLoading: isStarting }] = useStartSyncMutation()

  const session = data?.data ?? null
  const isRunning = session?.status === 'running' || session?.status === 'pending'

  // Start polling when running, stop when done
  useEffect(() => {
    if (isRunning) {
      setPollingInterval(POLL_INTERVAL_MS)
    } else {
      setPollingInterval(false)
    }
  }, [isRunning])

  const handleStart = async (type: 'ALL' | 'CONTINUE') => {
    setActiveTab(type)
    await startSync({ type })
    setPollingInterval(POLL_INTERVAL_MS)
    refetch()
  }

  const tabs: { key: 'ALL' | 'CONTINUE'; label: string }[] = [
    { key: 'ALL', label: 'Sync All' },
    { key: 'CONTINUE', label: 'Sync Continue' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <nav className="text-sm text-gray-500 mb-2">
          <Link to="/dashboard" className="hover:text-gray-700 cursor-pointer">Home</Link>
          <span className="mx-1">›</span>
          <span className="font-semibold text-gray-900">Sync</span>
        </nav>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">PeopleVine Sync</h1>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRunning}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isRunning ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-0" aria-label="Sync tabs">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-brand text-brand'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'ALL' && (
          <SyncTab
            session={session}
            type="ALL"
            label="Start Sync All"
            description="Fetches all subscriptions, companies, and users from PeopleVine."
            onStart={handleStart}
            isStarting={isStarting}
          />
        )}
        {activeTab === 'CONTINUE' && (
          <SyncTab
            session={session}
            type="CONTINUE"
            label="Start Continue Sync"
            description="Skips the subscription and company fetch. Picks up from the user sync step using the existing companies in the database. Use this when a previous sync timed out during the user phase."
            onStart={handleStart}
            isStarting={isStarting}
          />
        )}
      </div>
    </div>
  )
}
