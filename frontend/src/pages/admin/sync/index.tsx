import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCw, Play, Loader2, CheckCircle2, XCircle, Clock, StopCircle, AlertCircle, Upload, X, Plus, Download, MailX, BookX, UserCheck, HelpCircle, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { read, utils } from 'xlsx'
import { toCsv, downloadCsv } from '@/utils/csv'
import { useGetSyncStatusQuery, useStartSyncMutation, useCancelSyncMutation, useFreshSyncMutation, useLazyGetFreshStatsQuery, useImportFilteredMutation, useGetMembershipTypesQuery, useAddMembershipTypeMutation, useRemoveMembershipTypeMutation, useGetSyncHistoryQuery, useGetPrimarySubscriptionTypesQuery, useAddPrimarySubscriptionTypeMutation, useRemovePrimarySubscriptionTypeMutation, useGetAddonSubscriptionTypesQuery, useAddAddonSubscriptionTypeMutation, useRemoveAddonSubscriptionTypeMutation, type SyncSession, type SyncLogEntry } from '@/store/api/syncApi'
import { useGetUsersQuery } from '@/store/api/userApi'
import { useGetCompaniesQuery } from '@/store/api/companyApi'

const POLL_INTERVAL_MS = 1000

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
    cancelled: { icon: <StopCircle className="h-4 w-4" />,   label: 'Cancelled',  cls: 'text-gray-600 bg-gray-50 border-gray-200' },
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

function SyncTab({ session, type, label, description, onStart, onCancel, isStarting, isCancelling }: {
  session: SyncSession | null
  type: 'ALL' | 'CONTINUE'
  label: string
  description: string
  onStart: (type: 'ALL' | 'CONTINUE') => void
  onCancel: () => void
  isStarting: boolean
  isCancelling: boolean
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
      {/* Description + buttons */}
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-gray-600">{description}</p>
        <div className="flex items-center gap-2 shrink-0">
          {isActive && (
            <Button
              variant="outline"
              onClick={onCancel}
              disabled={isCancelling}
              className="border-red-300 text-red-600 hover:bg-red-50"
            >
              {isCancelling
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Cancelling…</>
                : <><StopCircle className="h-4 w-4 mr-2" />Force Cancel</>}
            </Button>
          )}
          <Button
            onClick={() => onStart(type)}
            disabled={isStarting || isActive}
          >
            {isActive
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Running…</>
              : <><Play className="h-4 w-4 mr-2" />{label}</>}
          </Button>
        </div>
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

type ConfirmState =
  | { mode: 'add'; name: string }
  | { mode: 'delete'; name: string }
  | null

function TypesManager({
  title,
  description,
  placeholder,
  badgeClass,
  types,
  isLoading,
  isAdding,
  onAdd,
  onRemove,
}: {
  title: string
  description: string
  placeholder: string
  badgeClass: string
  types: string[]
  isLoading: boolean
  isAdding: boolean
  onAdd: (name: string) => Promise<void>
  onRemove: (name: string) => Promise<void>
}) {
  const [newType, setNewType] = useState('')
  const [confirm, setConfirm] = useState<ConfirmState>(null)
  const [isPending, setIsPending] = useState(false)

  const handleConfirm = async () => {
    if (!confirm) return
    setIsPending(true)
    try {
      if (confirm.mode === 'add') {
        await onAdd(confirm.name)
        setNewType('')
      } else {
        await onRemove(confirm.name)
      }
    } finally {
      setIsPending(false)
      setConfirm(null)
    }
  }

  return (
    <div className="border border-gray-200 rounded-lg p-4 space-y-3">
      <p className="text-sm font-medium text-gray-700">{title}</p>
      <p className="text-xs text-gray-500">{description}</p>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" />Loading…
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {types.map(name => (
            <span key={name} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border ${badgeClass}`}>
              {name}
              <button type="button" onClick={() => setConfirm({ mode: 'delete', name })} className="opacity-50 hover:opacity-100 hover:text-red-500 transition-colors">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Input
          value={newType}
          onChange={e => setNewType(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && newType.trim()) setConfirm({ mode: 'add', name: newType.trim() }) }}
          placeholder={placeholder}
          className="h-8 text-sm"
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => { if (newType.trim()) setConfirm({ mode: 'add', name: newType.trim() }) }}
          disabled={isAdding || !newType.trim()}
          className="h-8 shrink-0"
        >
          <Plus className="h-4 w-4 mr-1" />Add
        </Button>
      </div>

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-start gap-3">
              <AlertCircle className={`h-5 w-5 shrink-0 mt-0.5 ${confirm.mode === 'delete' ? 'text-red-500' : 'text-blue-500'}`} />
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {confirm.mode === 'add' ? 'Add type?' : 'Remove type?'}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  {confirm.mode === 'add'
                    ? <>Add <span className="font-medium text-gray-800">"{confirm.name}"</span> to {title}?</>
                    : <>Remove <span className="font-medium text-gray-800">"{confirm.name}"</span> from {title}?</>}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setConfirm(null)} disabled={isPending}>Cancel</Button>
              <Button
                size="sm"
                onClick={handleConfirm}
                disabled={isPending}
                className={confirm.mode === 'delete' ? 'bg-red-600 hover:bg-red-700 text-white' : ''}
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : confirm.mode === 'add' ? 'Yes, Add' : 'Yes, Remove'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MembershipTypesManager() {
  const { data, isLoading } = useGetMembershipTypesQuery()
  const [addType, { isLoading: isAdding }] = useAddMembershipTypeMutation()
  const [removeType] = useRemoveMembershipTypeMutation()
  const types = data?.data ?? []

  const handleAdd = async (name: string) => {
    try { await addType({ name }).unwrap() }
    catch { toast.error('Failed to add membership type') }
  }

  const handleRemove = async (name: string) => {
    try { await removeType(name).unwrap() }
    catch { toast.error('Failed to remove membership type') }
  }

  return (
    <TypesManager
      title="Company Membership Types"
      description="Only subscriptions matching these types will be synced as companies."
      placeholder="Add membership type…"
      badgeClass="bg-gray-100 text-gray-700 border-gray-200"
      types={types}
      isLoading={isLoading}
      isAdding={isAdding}
      onAdd={handleAdd}
      onRemove={handleRemove}
    />
  )
}

function PrimarySubscriptionTypesManager() {
  const { data, isLoading } = useGetPrimarySubscriptionTypesQuery()
  const [addType, { isLoading: isAdding }] = useAddPrimarySubscriptionTypeMutation()
  const [removeType] = useRemovePrimarySubscriptionTypeMutation()
  const types = data?.data ?? []

  const handleAdd = async (name: string) => {
    try { await addType({ name }).unwrap() }
    catch { toast.error('Failed to add primary subscription type') }
  }

  const handleRemove = async (name: string) => {
    try { await removeType(name).unwrap() }
    catch { toast.error('Failed to remove primary subscription type') }
  }

  return (
    <TypesManager
      title="Primary Subscription Types"
      description="Subscriptions listed here are treated as the primary membership a user inherits from their company. Used to populate the Primary Membership column on users."
      placeholder="Add primary subscription type…"
      badgeClass="bg-blue-50 text-blue-700 border-blue-200"
      types={types}
      isLoading={isLoading}
      isAdding={isAdding}
      onAdd={handleAdd}
      onRemove={handleRemove}
    />
  )
}

function AddonSubscriptionTypesManager() {
  const { data, isLoading } = useGetAddonSubscriptionTypesQuery()
  const [addType, { isLoading: isAdding }] = useAddAddonSubscriptionTypeMutation()
  const [removeType] = useRemoveAddonSubscriptionTypeMutation()
  const types = data?.data ?? []

  const handleAdd = async (name: string) => {
    try { await addType({ name }).unwrap() }
    catch { toast.error('Failed to add add-on subscription type') }
  }

  const handleRemove = async (name: string) => {
    try { await removeType(name).unwrap() }
    catch { toast.error('Failed to remove add-on subscription type') }
  }

  return (
    <TypesManager
      title="Add-on Subscription Types"
      description="Subscriptions listed here are treated as add-ons on top of a primary membership. Used to populate the Add-ons column on users."
      placeholder="Add add-on subscription type…"
      badgeClass="bg-purple-50 text-purple-700 border-purple-200"
      types={types}
      isLoading={isLoading}
      isAdding={isAdding}
      onAdd={handleAdd}
      onRemove={handleRemove}
    />
  )
}


type ClearResult = { usersDeleted: number; companiesDeleted: number }
type CompanyImport = { subscriptionNo: string; companyName: string; primaryMembership: string | null }
type MemberImport = { customerNo: string; email: string; firstName: string; lastName: string; companyName: string; username: string | null }
type ImportData = { companies: CompanyImport[]; members: MemberImport[] }
type ConfirmMode = 'clear' | 'clear-and-sync'

function FreshSyncTab() {
  const [importData, setImportData] = useState<ImportData | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [clearResult, setClearResult] = useState<ClearResult | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmMode, setConfirmMode] = useState<ConfirmMode>('clear')
  const [dbStats, setDbStats] = useState<{ companies: number; users: number } | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [pollingInterval, setPollingInterval] = useState<number | false>(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const logEndRef = useRef<HTMLDivElement>(null)

  const [freshSync] = useFreshSyncMutation()
  const [importFiltered] = useImportFilteredMutation()
  const [cancelSync, { isLoading: isCancelling }] = useCancelSyncMutation()
  const [fetchStats] = useLazyGetFreshStatsQuery()
  const { data: statusData } = useGetSyncStatusQuery(undefined, {
    pollingInterval: pollingInterval || undefined,
  })

  const filteredSession = statusData?.data?.type === 'FILTERED' ? statusData.data : null
  const sessionIsActive = filteredSession?.status === 'pending' || filteredSession?.status === 'running'

  useEffect(() => {
    if (sessionIsActive) setPollingInterval(1000)
    else setPollingInterval(false)
  }, [sessionIsActive])

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [filteredSession?.logs])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const buffer = ev.target?.result as ArrayBuffer
      const wb = read(buffer)
      const companyRows = utils.sheet_to_json<{ subcription_no?: number | string; company_name?: string; membership_type?: string }>(wb.Sheets['Companies'] ?? {}) as any[]
      const companies: CompanyImport[] = companyRows
        .filter((r: any) => r.company_name)
        .map((r: any) => ({
          subscriptionNo: r.subcription_no ? String(r.subcription_no) : '',
          companyName: String(r.company_name).trim(),
          primaryMembership: r.membership_type ? String(r.membership_type).trim() : null,
        }))
      const memberRows = utils.sheet_to_json<{ customer_no?: number | string; email?: string; first_name?: string; last_name?: string; company_name?: string; username?: string }>(wb.Sheets['Members'] ?? {}) as any[]
      const members: MemberImport[] = memberRows
        .filter((r: any) => r.customer_no)
        .map((r: any) => ({
          customerNo: String(r.customer_no),
          email: String(r.email ?? '').trim().toLowerCase(),
          firstName: String(r.first_name ?? '').trim(),
          lastName: String(r.last_name ?? '').trim(),
          companyName: String(r.company_name ?? '').trim(),
          username: r.username ? String(r.username).trim() : null,
        }))
      setImportData({ companies, members })
    }
    reader.readAsArrayBuffer(file)
  }

  const handleActionClick = async (mode: ConfirmMode) => {
    const stats = await fetchStats().unwrap()
    setDbStats(stats.data)
    setConfirmMode(mode)
    setConfirmOpen(true)
  }

  const handleConfirm = async () => {
    setConfirmOpen(false)
    setIsProcessing(true)
    try {
      const res = await freshSync({}).unwrap()
      setClearResult(res.data)
      if (confirmMode === 'clear-and-sync' && importData) {
        await importFiltered({ companies: importData.companies, members: importData.members }).unwrap()
        setPollingInterval(1000)
        toast.success('Database cleared. Import queued.')
      } else {
        toast.success('Database cleared.')
      }
    } catch {
      toast.error('Operation failed')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleCancel = async () => {
    try {
      await cancelSync().unwrap()
      toast.success('Import cancelled.')
    } catch {
      toast.error('Failed to cancel import.')
    }
  }

  const logs: SyncLogEntry[] = filteredSession?.logs ?? []

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-600">
        Permanently cleans all companies and members from the mhub db. Admin accounts are preserved.
      </p>

      {/* File upload */}
      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={handleFileChange}
        />
        <div
          className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
            importData ? 'border-green-300 bg-green-50' : 'border-gray-200 hover:border-gray-300 bg-gray-50'
          }`}
          onClick={() => fileInputRef.current?.click()}
        >
          {importData ? (
            <div className="space-y-1">
              <p className="text-sm font-medium text-green-700">{fileName}</p>
              <p className="text-xs text-gray-500">{importData.companies.length} companies · {importData.members.length} members</p>
              <p className="text-xs text-blue-500">Click to change file</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Upload className="h-5 w-5 text-gray-400 mx-auto" />
              <p className="text-sm text-gray-500">Click to upload import list (.xlsx)</p>
              <p className="text-xs text-gray-400">Required for Clear &amp; Sync. File must have "Companies" and "Members" tabs.</p>
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      {!clearResult && (
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => handleActionClick('clear')}
            disabled={isProcessing}
            className="border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            {isProcessing && confirmMode === 'clear'
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Clearing…</>
              : <><AlertCircle className="h-4 w-4 mr-2" />Clear Local DB</>}
          </Button>
          <Button
            onClick={() => handleActionClick('clear-and-sync')}
            disabled={!importData || isProcessing}
            className="bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
          >
            {isProcessing && confirmMode === 'clear-and-sync'
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processing…</>
              : <><AlertCircle className="h-4 w-4 mr-2" />Clear &amp; Sync</>}
          </Button>
        </div>
      )}


      {/* Import progress */}
      {filteredSession && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <StatusBadge status={filteredSession.status} />
              {filteredSession.step && <span className="text-sm text-gray-500">{filteredSession.step}</span>}
            </div>
            <div className="flex items-center gap-3">
              {sessionIsActive && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCancel}
                  disabled={isCancelling}
                  className="border-red-300 text-red-600 hover:bg-red-50"
                >
                  {isCancelling
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Cancelling…</>
                    : <><StopCircle className="h-4 w-4 mr-2" />Force Cancel</>}
                </Button>
              )}
              <span className="text-sm font-semibold text-gray-700">{filteredSession.progress}%</span>
            </div>
          </div>
          <ProgressBar value={filteredSession.progress} />
          {logs.length > 0 && (
            <div className="bg-gray-900 rounded-lg p-4 h-72 overflow-y-auto space-y-1 border border-gray-800">
              {logs.map((entry, i) => <LogLine key={i} entry={entry} />)}
              <div ref={logEndRef} />
            </div>
          )}
        </div>
      )}

      {/* Reset */}
      {clearResult && filteredSession && !sessionIsActive && (
        <div className="flex justify-end">
          <Button variant="outline" onClick={() => { setClearResult(null); setImportData(null); setFileName(null); }}>
            Reset
          </Button>
        </div>
      )}

      {/* Confirmation dialog */}
      {confirmOpen && dbStats && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-6 w-6 text-red-500 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-base font-semibold text-gray-900">
                  {confirmMode === 'clear' ? 'Confirm Clear Local DB' : 'Confirm Clear & Sync'}
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  {confirmMode === 'clear'
                    ? 'This will permanently clean all companies and members from the mhub db. This cannot be undone.'
                    : 'This will permanently clean all companies and members, then import from the uploaded list. This cannot be undone.'}
                </p>
              </div>
            </div>

            <div className="rounded-md bg-red-50 border border-red-200 p-4 space-y-2">
              <p className="text-xs font-semibold text-red-700 uppercase tracking-wide">Records to be cleaned</p>
              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="rounded-md bg-white border border-red-100 p-3">
                  <div className="text-2xl font-bold text-red-600">{dbStats.companies}</div>
                  <div className="text-xs text-gray-500 mt-0.5">Companies</div>
                </div>
                <div className="rounded-md bg-white border border-red-100 p-3">
                  <div className="text-2xl font-bold text-red-600">{dbStats.users}</div>
                  <div className="text-xs text-gray-500 mt-0.5">Members</div>
                </div>
              </div>
            </div>

            {confirmMode === 'clear-and-sync' && importData && (
              <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-sm text-blue-700">
                Will import <span className="font-semibold">{importData.companies.length} companies</span> and <span className="font-semibold">{importData.members.length} members</span> from <span className="font-medium">{fileName}</span>
              </div>
            )}

            <p className="text-xs text-gray-400">Admin accounts are preserved. PeopleVine is not touched.</p>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
              <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={handleConfirm}>
                {confirmMode === 'clear' ? 'Yes, Clear DB' : 'Yes, Clear & Sync'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const SYNC_TYPE_LABELS: Record<string, string> = {
  ALL: 'Sync All',
  CONTINUE: 'Sync Continue',
  FILTERED: 'Fresh Sync',
}

const BASE_URL = `${import.meta.env.VITE_API_URL ?? 'http://localhost:8787'}${import.meta.env.VITE_API_BASE_PATH ?? '/api'}`

const ESTIMATED_RAW_BYTES = 10 * 1024 * 1024 // 10 MB estimate for progress bar

const downloadAudit = async (sessionId: string) => {
  const token = localStorage.getItem('authToken')
  const res = await fetch(`${BASE_URL}/sync/sessions/${sessionId}/audit`, {
    credentials: 'include',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) return
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const disposition = res.headers.get('content-disposition') ?? ''
  const match = disposition.match(/filename="([^"]+)"/)
  a.download = match?.[1] ?? `sync-audit-${sessionId.slice(0, 8)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function AuditLogsTab() {
  const [selectedSession, setSelectedSession] = useState<SyncSession | null>(null)
  const [dlState, setDlState] = useState<{ active: boolean; bytes: number; done: boolean }>({ active: false, bytes: 0, done: false })
  const { data, isLoading, refetch } = useGetSyncHistoryQuery({})

  const sessions = data?.data?.sessions ?? []
  const total = data?.data?.total ?? 0

  const handleRawDownload = async () => {
    setDlState({ active: true, bytes: 0, done: false })
    try {
      const token = localStorage.getItem('authToken')
      const res = await fetch(`${BASE_URL}/sync/raw-export`, {
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok || !res.body) return

      const reader = res.body.getReader()
      const chunks: Uint8Array<ArrayBuffer>[] = []
      let received = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
        received += value.length
        setDlState({ active: true, bytes: received, done: false })
      }

      setDlState({ active: true, bytes: received, done: true })

      const blob = new Blob(chunks, { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `pv-raw-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setTimeout(() => setDlState({ active: false, bytes: 0, done: false }), 2000)
    }
  }

  const dlPct = dlState.done
    ? 100
    : Math.min(Math.round((dlState.bytes / ESTIMATED_RAW_BYTES) * 100), 99)
  const dlMb = (dlState.bytes / (1024 * 1024)).toFixed(1)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{total} total sync sessions</p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRawDownload} disabled={dlState.active}>
            <Download className="h-4 w-4 mr-2" />Raw
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />Refresh
          </Button>
        </div>
      </div>

      {dlState.active && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{dlState.done ? 'Download complete' : 'Downloading raw PV data…'}</span>
            <span className="font-medium tabular-nums">{dlPct}% · {dlMb} MB</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
            <div
              className={`h-2 rounded-full transition-all duration-300 ease-out ${dlState.done ? 'bg-green-500' : 'bg-brand'}`}
              style={{ width: `${dlPct}%` }}
            />
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-8 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" />Loading…
        </div>
      ) : sessions.length === 0 ? (
        <div className="bg-gray-50 rounded-lg border border-dashed border-gray-200 h-40 flex items-center justify-center">
          <p className="text-sm text-gray-400">No sync sessions yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map(session => (
            <div
              key={session.id}
              className="border border-gray-200 rounded-lg overflow-hidden"
            >
              <div className="flex items-stretch">
                <button
                  type="button"
                  onClick={() => setSelectedSession(selectedSession?.id === session.id ? null : session)}
                  className="flex-1 flex items-center justify-between gap-4 px-4 py-3 text-left hover:bg-gray-50 transition-colors min-w-0"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <StatusBadge status={session.status} />
                    <span className="text-sm font-medium text-gray-700 shrink-0">
                      {SYNC_TYPE_LABELS[session.type] ?? session.type}
                    </span>
                    <span className="text-xs text-gray-400 truncate">{session.step}</span>
                  </div>
                  <div className="flex items-center gap-4 shrink-0 text-xs text-gray-400">
                    <span>{new Date(session.startedAt).toLocaleString()}</span>
                    <span className="font-medium text-gray-600">{session.progress}%</span>
                  </div>
                </button>
                {session.status === 'completed' && (session.type === 'ALL' || session.type === 'CONTINUE') && (
                  <button
                    type="button"
                    onClick={() => downloadAudit(session.id)}
                    title="Download sync audit CSV"
                    className="shrink-0 flex items-center gap-1.5 px-3 border-l border-gray-100 text-xs font-medium text-brand hover:bg-gray-50 transition-colors"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Audit
                  </button>
                )}
              </div>

              {selectedSession?.id === session.id && session.logs.length > 0 && (
                <div className="border-t border-gray-200 bg-gray-900 p-4 h-64 overflow-y-auto space-y-1">
                  {session.logs.map((entry, i) => <LogLine key={i} entry={entry} />)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}


const PAGE_SIZE = 25
const SHOW_MEMBERSHIP_STATUS_COLUMN = false

type AttentionCategory = 'all' | 'noEmailUser' | 'noEmailCompany' | 'noPrimary' | 'directPersonal' | 'unresolved'

const CATEGORY_META: Record<Exclude<AttentionCategory, 'all'>, {
  label: string
  sublabel: string
  icon: React.ReactNode
  cardCls: string
  iconCls: string
  badgeCls: string
  badgeLabel: string
}> = {
  noEmailUser:     { label: 'Missing Email',        sublabel: 'Users',     icon: <MailX className="h-5 w-5" />,     cardCls: 'border-orange-200 bg-orange-50',   iconCls: 'text-orange-500 bg-orange-100',  badgeCls: 'text-orange-700 border-orange-300 bg-orange-50',    badgeLabel: 'Missing Email' },
  noEmailCompany:  { label: 'Missing Email',        sublabel: 'Companies', icon: <MailX className="h-5 w-5" />,     cardCls: 'border-amber-200 bg-amber-50',     iconCls: 'text-amber-600 bg-amber-100',    badgeCls: 'text-amber-700 border-amber-300 bg-amber-50',       badgeLabel: 'Missing Email' },
  noPrimary:       { label: 'No Primary Membership',sublabel: 'Users',     icon: <BookX className="h-5 w-5" />,     cardCls: 'border-yellow-200 bg-yellow-50',   iconCls: 'text-yellow-600 bg-yellow-100',  badgeCls: 'text-yellow-700 border-yellow-300 bg-yellow-50',    badgeLabel: 'No Primary' },
  directPersonal:  { label: 'Direct Personal Sub',  sublabel: 'Users',     icon: <UserCheck className="h-5 w-5" />, cardCls: 'border-blue-200 bg-blue-50',       iconCls: 'text-blue-600 bg-blue-100',      badgeCls: 'text-blue-700 border-blue-300 bg-blue-50',          badgeLabel: 'Direct Personal' },
  unresolved:      { label: 'Unresolved',           sublabel: 'Users',     icon: <HelpCircle className="h-5 w-5" />,cardCls: 'border-red-200 bg-red-50',         iconCls: 'text-red-500 bg-red-100',        badgeCls: 'text-red-700 border-red-300 bg-red-50',             badgeLabel: 'Unresolved' },
}

function NeedsAttentionTab({ activeFilter, setActiveFilter }: { activeFilter: 'true' | 'false' | ''; setActiveFilter: (v: 'true' | 'false' | '') => void }) {
  const [search, setSearch] = useState('')
  const [primaryMembership, setPrimaryMembership] = useState('')
  const [selected, setSelected] = useState<AttentionCategory>('all')
  const [pages, setPages] = useState<Record<string, number>>({})

  const getPage = (key: string) => pages[key] ?? 1
  const setPage = (key: string, p: number) => setPages(prev => ({ ...prev, [key]: p }))

  useEffect(() => { setPages({}) }, [search, primaryMembership, activeFilter, selected])

  const { data: noEmailUsersData, isLoading: loadingNoEmailUsers } = useGetUsersQuery({ limit: 1000, offset: 0, role: 'USER', noEmail: 'true' })
  const { data: noEmailCompaniesData, isLoading: loadingNoEmailCompanies } = useGetCompaniesQuery({ limit: 1000, offset: 0, noEmail: 'true' })
  const { data: noPrimaryUsersData, isLoading: loadingNoPrimaryUsers } = useGetUsersQuery({ limit: 1000, offset: 0, role: 'USER', noPrimary: 'true' })
  const { data: directPersonalUsersData, isLoading: loadingDirectPersonalUsers } = useGetUsersQuery({ limit: 1000, offset: 0, role: 'USER', directPersonal: 'true' })
  const { data: unresolvedUsersData, isLoading: loadingUnresolvedUsers } = useGetUsersQuery({ limit: 1000, offset: 0, role: 'USER', unresolved: 'true' })
  const { data: membershipTypesData } = useGetMembershipTypesQuery()
  const membershipTypes = membershipTypesData?.data ?? []

  const allNoEmailUsers = noEmailUsersData?.data?.users ?? []
  const allNoEmailCompanies = noEmailCompaniesData?.data?.companies ?? []
  const allNoPrimaryUsers = noPrimaryUsersData?.data?.users ?? []
  const allDirectPersonalUsers = directPersonalUsersData?.data?.users ?? []
  const allUnresolvedUsers = unresolvedUsersData?.data?.users ?? []

  const q = search.toLowerCase().trim()
  const noEmailUsers = allNoEmailUsers.filter(u =>
    (!q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)) &&
    (!primaryMembership || u.primaryMembership === primaryMembership) &&
    (activeFilter === '' || String(u.active) === activeFilter)
  )
  const noEmailCompanies = allNoEmailCompanies.filter(co =>
    (!q || co.name.toLowerCase().includes(q) || co.email.toLowerCase().includes(q)) &&
    (!primaryMembership || co.membershipTypes?.includes(primaryMembership)) &&
    (activeFilter === '' || String(co.active) === activeFilter)
  )
  const noPrimaryUsers = allNoPrimaryUsers.filter(u =>
    (!q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)) &&
    (activeFilter === '' || String(u.active) === activeFilter)
  )
  const directPersonalUsers = allDirectPersonalUsers.filter(u =>
    (!q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)) &&
    (activeFilter === '' || String(u.active) === activeFilter)
  )
  const unresolvedUsers = allUnresolvedUsers.filter(u =>
    (!q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)) &&
    (activeFilter === '' || String(u.active) === activeFilter)
  )

  const getEmailIssue = (email: string) =>
    email.endsWith('@placeholder.invalid') ? 'Not Linked to PV' : 'No Email in PV'

  const getAddOns = (addOns: string): string[] => {
    try { return JSON.parse(addOns) as string[] }
    catch { return [] }
  }

  const counts: Record<Exclude<AttentionCategory, 'all'>, number> = {
    noEmailUser:    noEmailUsers.length,
    noEmailCompany: noEmailCompanies.length,
    noPrimary:      noPrimaryUsers.length,
    directPersonal: directPersonalUsers.length,
    unresolved:     unresolvedUsers.length,
  }
  const totalIssues = Object.values(counts).reduce((a, b) => a + b, 0)

  const handleExport = () => {
    const headers = ['Type', 'PeopleVine ID', 'Name', 'PV Email', 'Membership / Add-ons', 'Issue']
    const rows = [
      ...noEmailUsers.map(u => ['User', u.peopleVineId ?? '', u.name, u.email, u.primaryMembership ?? '', getEmailIssue(u.email)]),
      ...noEmailCompanies.map(co => ['Company', co.peopleVineId ?? '', co.name, co.email, co.membershipTypes?.join(', ') ?? '', getEmailIssue(co.email)]),
      ...noPrimaryUsers.map(u => ['User', u.peopleVineId ?? '', u.name, u.email, getAddOns(u.addOns).join(', '), u.membershipStatus ?? 'No Primary Membership Flagged']),
      ...directPersonalUsers.map(u => ['User', u.peopleVineId ?? '', u.name, u.email, u.primaryMembership ?? '', 'Direct Personal Subscription']),
      ...unresolvedUsers.map(u => ['User', u.peopleVineId ?? '', u.name, u.email, u.primaryMembership ?? '', 'Unresolved Classification']),
    ]
    downloadCsv(`needs-attention-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(headers, rows))
  }

  const isLoading = loadingNoEmailUsers || loadingNoEmailCompanies || loadingNoPrimaryUsers || loadingDirectPersonalUsers || loadingUnresolvedUsers

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400 py-12 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" />Loading…
      </div>
    )
  }

  if (totalIssues === 0 && !q && !primaryMembership && activeFilter === '') {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-8 flex flex-col items-center gap-3">
        <CheckCircle2 className="h-8 w-8 text-green-500" />
        <p className="text-sm font-medium text-green-800">All clear — no issues found</p>
        <p className="text-xs text-green-600">Every member has a valid email and portal access.</p>
      </div>
    )
  }

  const ActiveBadge = ({ active }: { active: boolean }) => (
    <Badge variant={active ? 'default' : 'outline'} className={active ? 'bg-green-100 text-green-700 border-green-200 hover:bg-green-100' : 'text-gray-400'}>
      {active ? 'Active' : 'Inactive'}
    </Badge>
  )

  const NameLink = ({ id, name, type }: { id: string | number; name: string; type: 'user' | 'company' }) => (
    <Link
      to={type === 'user' ? `/admin/users/${id}/edit` : `/admin/companies/${id}/edit`}
      className={`font-medium hover:text-brand hover:underline underline-offset-2 inline-flex items-center gap-1 group ${name ? 'text-gray-900' : 'text-gray-400 italic'}`}
    >
      {name || 'No name in PV'}
      <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-50 transition-opacity shrink-0" />
    </Link>
  )

  const showNoEmailUsers    = selected === 'all' || selected === 'noEmailUser'
  const showNoEmailCompanies = selected === 'all' || selected === 'noEmailCompany'
  const showNoPrimary       = selected === 'all' || selected === 'noPrimary'
  const showDirectPersonal  = selected === 'all' || selected === 'directPersonal'
  const showUnresolved      = selected === 'all' || selected === 'unresolved'

  const visibleTotal = (showNoEmailUsers ? noEmailUsers.length : 0)
    + (showNoEmailCompanies ? noEmailCompanies.length : 0)
    + (showNoPrimary ? noPrimaryUsers.length : 0)
    + (showDirectPersonal ? directPersonalUsers.length : 0)
    + (showUnresolved ? unresolvedUsers.length : 0)

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {(Object.entries(CATEGORY_META) as [Exclude<AttentionCategory, 'all'>, typeof CATEGORY_META[keyof typeof CATEGORY_META]][]).map(([key, meta]) => {
          const count = counts[key]
          const isSelected = selected === key
          return (
            <button
              key={key}
              onClick={() => setSelected(isSelected ? 'all' : key)}
              className={`relative text-left rounded-xl border p-4 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                isSelected
                  ? `${meta.cardCls} shadow-md ring-2 ring-offset-1 ring-current`
                  : count === 0
                  ? 'border-gray-100 bg-gray-50 opacity-60 cursor-default'
                  : `${meta.cardCls} hover:shadow-sm hover:scale-[1.01]`
              }`}
              disabled={count === 0}
            >
              <div className={`inline-flex items-center justify-center rounded-lg p-2 mb-3 ${meta.iconCls}`}>
                {meta.icon}
              </div>
              <div className="text-2xl font-bold text-gray-900 leading-none mb-1">{count}</div>
              <div className="text-xs font-semibold text-gray-700 leading-tight">{meta.label}</div>
              <div className="text-xs text-gray-400 mt-0.5">{meta.sublabel}</div>
              {isSelected && (
                <div className="absolute top-2 right-2">
                  <X className="h-3.5 w-3.5 text-gray-400" />
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or email…"
          className="w-56 h-9 text-sm"
        />
        <Select value={primaryMembership || 'all'} onValueChange={v => setPrimaryMembership(v === 'all' ? '' : v)}>
          <SelectTrigger className="h-9 w-48 text-sm">
            <SelectValue placeholder="All Memberships" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Memberships</SelectItem>
            {membershipTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={activeFilter || 'all'} onValueChange={v => setActiveFilter(v === 'all' ? '' : v as 'true' | 'false')}>
          <SelectTrigger className="h-9 w-36 text-sm">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="true">Active</SelectItem>
            <SelectItem value="false">Inactive</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-2">
          {(q || primaryMembership || activeFilter) && (
            <span className="text-xs text-gray-400">{visibleTotal} result{visibleTotal !== 1 ? 's' : ''}</span>
          )}
          <Button variant="outline" size="sm" className="h-9" onClick={handleExport} disabled={totalIssues === 0}>
            <Download className="h-4 w-4 mr-2" />Export
          </Button>
        </div>
      </div>

      {/* Tables */}
      {visibleTotal === 0 ? (
        <div className="bg-gray-50 rounded-lg border border-dashed border-gray-200 h-32 flex items-center justify-center">
          <p className="text-sm text-gray-400">No results match your filters.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {showNoEmailUsers && noEmailUsers.length > 0 && (() => {
            const p = getPage('noEmailUser')
            const totalPages = Math.ceil(noEmailUsers.length / PAGE_SIZE)
            const rows = noEmailUsers.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE)
            return (
              <IssueSection title="Missing Valid Email" subtitle={`${noEmailUsers.length} user${noEmailUsers.length !== 1 ? 's' : ''}`} badgeCls={CATEGORY_META.noEmailUser.badgeCls} page={p} totalPages={totalPages} total={noEmailUsers.length} onPageChange={np => setPage('noEmailUser', np)}>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600 w-1/4">Name</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600 w-32">PeopleVine ID</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600 w-1/3">PV Email</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600">Membership</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600 w-40">Issue</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600 w-24">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.map(u => (
                      <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-2.5"><NameLink id={u.id} name={u.name} type="user" /></td>
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-400">{u.peopleVineId ?? '—'}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-400 truncate max-w-0" title={u.email}>{u.email}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-500 truncate max-w-0">{u.primaryMembership ?? '—'}</td>
                        <td className="px-4 py-2.5">
                          <Badge variant="outline" className={`text-xs whitespace-nowrap ${CATEGORY_META.noEmailUser.badgeCls}`}>{getEmailIssue(u.email)}</Badge>
                        </td>
                        <td className="px-4 py-2.5"><ActiveBadge active={u.active} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </IssueSection>
            )
          })()}

          {showNoEmailCompanies && noEmailCompanies.length > 0 && (() => {
            const p = getPage('noEmailCompany')
            const totalPages = Math.ceil(noEmailCompanies.length / PAGE_SIZE)
            const rows = noEmailCompanies.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE)
            return (
              <IssueSection title="Missing Valid Email" subtitle={`${noEmailCompanies.length} compan${noEmailCompanies.length !== 1 ? 'ies' : 'y'}`} badgeCls={CATEGORY_META.noEmailCompany.badgeCls} page={p} totalPages={totalPages} total={noEmailCompanies.length} onPageChange={np => setPage('noEmailCompany', np)}>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600 w-1/4">Company</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600 w-32">PeopleVine ID</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600 w-1/3">PV Email</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600">Membership</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600 w-40">Issue</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600 w-24">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.map(co => (
                      <tr key={co.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-2.5"><NameLink id={co.id} name={co.name} type="company" /></td>
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-400">{co.peopleVineId ?? '—'}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-400 truncate max-w-0" title={co.email}>{co.email}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-500 truncate max-w-0">{co.membershipTypes?.join(', ') || '—'}</td>
                        <td className="px-4 py-2.5">
                          <Badge variant="outline" className={`text-xs whitespace-nowrap ${CATEGORY_META.noEmailCompany.badgeCls}`}>{getEmailIssue(co.email)}</Badge>
                        </td>
                        <td className="px-4 py-2.5"><ActiveBadge active={co.active} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </IssueSection>
            )
          })()}

          {showNoPrimary && noPrimaryUsers.length > 0 && (() => {
            const p = getPage('noPrimary')
            const totalPages = Math.ceil(noPrimaryUsers.length / PAGE_SIZE)
            const rows = noPrimaryUsers.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE)
            return (
              <IssueSection title="No Primary Membership" subtitle={`${noPrimaryUsers.length} user${noPrimaryUsers.length !== 1 ? 's' : ''}`} badgeCls={CATEGORY_META.noPrimary.badgeCls} page={p} totalPages={totalPages} total={noPrimaryUsers.length} onPageChange={np => setPage('noPrimary', np)}>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600 w-1/4">Name</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600 w-32">PeopleVine ID</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600 w-1/3">PV Email</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600">Add-Ons</th>
                      {SHOW_MEMBERSHIP_STATUS_COLUMN && <th className="text-left px-4 py-2.5 font-medium text-gray-600 w-36">Membership Status</th>}
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600 w-24">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.map(u => (
                      <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-2.5"><NameLink id={u.id} name={u.name} type="user" /></td>
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-400">{u.peopleVineId ?? '—'}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-400 truncate max-w-0" title={u.email}>{u.email}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-500 truncate max-w-0">{getAddOns(u.addOns).join(', ') || '—'}</td>
                        {SHOW_MEMBERSHIP_STATUS_COLUMN && (
                          <td className="px-4 py-2.5">
                            <Badge variant="outline" className={`text-xs whitespace-nowrap ${u.membershipStatus === 'Expired / Cancelled' ? 'text-rose-700 border-rose-300 bg-rose-50' : 'text-gray-500 border-gray-300 bg-gray-50'}`}>
                              {u.membershipStatus ?? '—'}
                            </Badge>
                          </td>
                        )}
                        <td className="px-4 py-2.5"><ActiveBadge active={u.active} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </IssueSection>
            )
          })()}

          {showDirectPersonal && directPersonalUsers.length > 0 && (() => {
            const p = getPage('directPersonal')
            const totalPages = Math.ceil(directPersonalUsers.length / PAGE_SIZE)
            const rows = directPersonalUsers.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE)
            return (
              <IssueSection title="Direct Personal Subscription" subtitle={`${directPersonalUsers.length} user${directPersonalUsers.length !== 1 ? 's' : ''}`} badgeCls={CATEGORY_META.directPersonal.badgeCls} page={p} totalPages={totalPages} total={directPersonalUsers.length} onPageChange={np => setPage('directPersonal', np)}>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600 w-1/4">Name</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600 w-32">PeopleVine ID</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600 w-1/3">PV Email</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600">Membership</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600 w-24">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.map(u => (
                      <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-2.5"><NameLink id={u.id} name={u.name} type="user" /></td>
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-400">{u.peopleVineId ?? '—'}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-400 truncate max-w-0" title={u.email}>{u.email}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-500 truncate max-w-0">{u.primaryMembership ?? '—'}</td>
                        <td className="px-4 py-2.5"><ActiveBadge active={u.active} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </IssueSection>
            )
          })()}

          {showUnresolved && unresolvedUsers.length > 0 && (() => {
            const p = getPage('unresolved')
            const totalPages = Math.ceil(unresolvedUsers.length / PAGE_SIZE)
            const rows = unresolvedUsers.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE)
            return (
              <IssueSection title="Unresolved Classification" subtitle={`${unresolvedUsers.length} user${unresolvedUsers.length !== 1 ? 's' : ''}`} badgeCls={CATEGORY_META.unresolved.badgeCls} page={p} totalPages={totalPages} total={unresolvedUsers.length} onPageChange={np => setPage('unresolved', np)}>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600 w-1/4">Name</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600 w-32">PeopleVine ID</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600 w-1/3">PV Email</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600 w-24">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.map(u => (
                      <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-2.5"><NameLink id={u.id} name={u.name} type="user" /></td>
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-400">{u.peopleVineId ?? '—'}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-400 truncate max-w-0" title={u.email}>{u.email}</td>
                        <td className="px-4 py-2.5"><ActiveBadge active={u.active} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </IssueSection>
            )
          })()}
        </div>
      )}
    </div>
  )
}

function PaginationBar({ page, totalPages, total, onPageChange }: {
  page: number
  totalPages: number
  total: number
  onPageChange: (p: number) => void
}) {
  if (totalPages <= 1) return null
  const start = (page - 1) * PAGE_SIZE + 1
  const end = Math.min(page * PAGE_SIZE, total)
  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-200 bg-gray-50">
      <span className="text-xs text-gray-500">{start}–{end} of {total}</span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          className="p-1 rounded hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="h-4 w-4 text-gray-600" />
        </button>
        <span className="text-xs text-gray-600 px-2 tabular-nums">{page} / {totalPages}</span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages}
          className="p-1 rounded hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight className="h-4 w-4 text-gray-600" />
        </button>
      </div>
    </div>
  )
}

function IssueSection({ title, subtitle, badgeCls, page, totalPages, total, onPageChange, children }: {
  title: string
  subtitle: string
  badgeCls: string
  page: number
  totalPages: number
  total: number
  onPageChange: (p: number) => void
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${badgeCls}`}>{subtitle}</span>
      </div>
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        {children}
        <PaginationBar page={page} totalPages={totalPages} total={total} onPageChange={onPageChange} />
      </div>
    </div>
  )
}

type SyncConfirm = { type: 'ALL' | 'CONTINUE'; includeFreeMembers: boolean } | null

export function AdminSyncPage() {
  const [activeTab, setActiveTab] = useState<'ALL' | 'CONTINUE' | 'FRESH' | 'LOGS' | 'ATTENTION'>('ALL')
  const [pollingInterval, setPollingInterval] = useState<number | false>(false)
  const [syncConfirm, setSyncConfirm] = useState<SyncConfirm>(null)
  const [attentionActiveFilter, setAttentionActiveFilter] = useState<'true' | 'false' | ''>('')

  const { data, refetch } = useGetSyncStatusQuery(undefined, {
    pollingInterval: pollingInterval || undefined,
  })
  const [startSync, { isLoading: isStarting }] = useStartSyncMutation()
  const [cancelSync, { isLoading: isCancelling }] = useCancelSyncMutation()

  const session = data?.data ?? null
  const isRunning = session?.status === 'running' || session?.status === 'pending'

  const prevSessionIdRef = useRef<string | null>(null)
  const prevStatusRef = useRef<string | null>(null)
  useEffect(() => {
    const id = session?.id ?? null
    const status = session?.status ?? null
    if (
      id &&
      id === prevSessionIdRef.current &&
      prevStatusRef.current !== 'completed' &&
      status === 'completed' &&
      (session?.type === 'ALL' || session?.type === 'CONTINUE')
    ) {
      toast.success('Sync complete! Downloading audit summary…', { duration: 4000 })
      downloadAudit(id)
    }
    prevSessionIdRef.current = id
    prevStatusRef.current = status
  }, [session?.id, session?.status, session?.type])

  const { data: noEmailUsersCount } = useGetUsersQuery({ limit: 1000, offset: 0, role: 'USER', noEmail: 'true', ...(attentionActiveFilter && { active: attentionActiveFilter }) })
  const { data: noEmailCompaniesCount } = useGetCompaniesQuery({ limit: 1000, offset: 0, noEmail: 'true', ...(attentionActiveFilter && { active: attentionActiveFilter }) })
  const { data: noPrimaryUsersCount } = useGetUsersQuery({ limit: 1000, offset: 0, role: 'USER', noPrimary: 'true', ...(attentionActiveFilter && { active: attentionActiveFilter }) })
  const { data: directPersonalUsersCount } = useGetUsersQuery({ limit: 1000, offset: 0, role: 'USER', directPersonal: 'true', ...(attentionActiveFilter && { active: attentionActiveFilter }) })
  const { data: unresolvedUsersCount } = useGetUsersQuery({ limit: 1000, offset: 0, role: 'USER', unresolved: 'true', ...(attentionActiveFilter && { active: attentionActiveFilter }) })
  const attentionCount = (noEmailUsersCount?.data?.users?.length ?? 0) + (noEmailCompaniesCount?.data?.companies?.length ?? 0) + (noPrimaryUsersCount?.data?.users?.length ?? 0) + (directPersonalUsersCount?.data?.users?.length ?? 0) + (unresolvedUsersCount?.data?.users?.length ?? 0)

  useEffect(() => {
    if (isRunning) {
      setPollingInterval(POLL_INTERVAL_MS)
    } else {
      setPollingInterval(false)
    }
  }, [isRunning])

  const handleStart = (type: 'ALL' | 'CONTINUE') => {
    setSyncConfirm({ type, includeFreeMembers: true })
  }

  const handleConfirmSync = async () => {
    if (!syncConfirm) return
    const { type, includeFreeMembers } = syncConfirm
    setSyncConfirm(null)
    setActiveTab(type)
    await startSync({ type, includeFreeMembers })
    setPollingInterval(POLL_INTERVAL_MS)
    refetch()
  }

  const handleCancel = async () => {
    try {
      await cancelSync().unwrap()
      toast.success('Sync cancelled.')
      refetch()
    } catch {
      toast.error('Failed to cancel sync.')
    }
  }

  const tabs: { key: 'ALL' | 'CONTINUE' | 'FRESH' | 'LOGS' | 'ATTENTION'; label: string; badge?: number }[] = [
    { key: 'ALL',       label: 'Sync All' },
    { key: 'CONTINUE',  label: 'Sync Continue' },
    { key: 'FRESH',     label: 'Fresh Sync' },
    { key: 'LOGS',      label: 'Audit Logs' },
    { key: 'ATTENTION', label: 'Needs Attention', badge: attentionCount },
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
              className={`inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-brand text-brand'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className="inline-flex items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold min-w-[18px] h-[18px] px-1">
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {syncConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {syncConfirm.type === 'ALL' ? 'Start Sync All?' : 'Start Continue Sync?'}
                </p>
                <p className="text-sm text-gray-500 mt-1">Configure sync options before starting.</p>
              </div>
            </div>
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={syncConfirm.includeFreeMembers}
                onChange={e => setSyncConfirm({ ...syncConfirm, includeFreeMembers: e.target.checked })}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand"
              />
              <div>
                <p className="text-sm font-medium text-gray-800">Include free membership members</p>
                <p className="text-xs text-gray-500 mt-0.5">Syncs CRM-only members who have a PeopleVine membership but no active billing subscription.</p>
              </div>
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setSyncConfirm(null)}>Cancel</Button>
              <Button size="sm" onClick={handleConfirmSync} disabled={isStarting}>
                {isStarting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Starting…</> : 'Start Sync'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Tab content */}
      <div>
        {activeTab === 'ALL' && (
          <div className="space-y-5">
            <SyncTab
              session={session}
              type="ALL"
              label="Start Sync All"
              description="Fetches all subscriptions, companies, and users from PeopleVine. Deactivates companies and users no longer active in PeopleVine."
              onStart={handleStart}
              onCancel={handleCancel}
              isStarting={isStarting}
              isCancelling={isCancelling}
            />
            <MembershipTypesManager />
            <PrimarySubscriptionTypesManager />
            <AddonSubscriptionTypesManager />
          </div>
        )}
        {activeTab === 'CONTINUE' && (
          <SyncTab
            session={session}
            type="CONTINUE"
            label="Start Continue Sync"
            description="Skips the subscription and company fetch. Picks up from the user sync step using the existing companies in the database. Use this when a previous sync timed out during the user phase."
            onStart={handleStart}
            onCancel={handleCancel}
            isStarting={isStarting}
            isCancelling={isCancelling}
          />
        )}
        {activeTab === 'FRESH' && <FreshSyncTab />}
        {activeTab === 'LOGS' && <AuditLogsTab />}
        {activeTab === 'ATTENTION' && <NeedsAttentionTab activeFilter={attentionActiveFilter} setActiveFilter={setAttentionActiveFilter} />}
      </div>
    </div>
  )
}
