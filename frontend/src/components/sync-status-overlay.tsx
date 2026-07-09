import { Loader2 } from 'lucide-react'
import { useGetSyncStatusQuery } from '@/store/api/syncApi'

// Blur + modal shown over Users/Companies/Reports/Needs Attention while a bulk sync (Sync All,
// Sync Continue, or Filtered import) is running, since the data on those pages can be mid-write
// during a sync and shouldn't be treated as final until it completes.
export function SyncProcessingOverlay({ step, progress }: { step?: string | null; progress?: number }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-3 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand mx-auto" />
        <p className="text-sm font-semibold text-gray-900">Sync is currently processing</p>
        <p className="text-sm text-gray-500">
          {step || 'Please wait until it completes — data on this page may be incomplete until then.'}
        </p>
        {typeof progress === 'number' && (
          <p className="text-xs text-gray-400">{progress}% complete</p>
        )}
      </div>
    </div>
  )
}

const isBulkSyncActive = (session?: { status: string; type: string } | null): boolean =>
  !!session &&
  (session.status === 'running' || session.status === 'pending') &&
  (session.type === 'ALL' || session.type === 'CONTINUE' || session.type === 'FILTERED')

// Self-polling version for pages that don't already fetch sync status themselves.
export function SyncStatusGate() {
  const { data } = useGetSyncStatusQuery(undefined, { pollingInterval: 3000 })
  const session = data?.data
  if (!isBulkSyncActive(session)) return null
  return <SyncProcessingOverlay step={session?.step} progress={session?.progress} />
}
