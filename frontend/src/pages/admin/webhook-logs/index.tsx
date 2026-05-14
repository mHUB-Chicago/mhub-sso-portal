import { useState } from "react"
import { Link } from "react-router-dom"
import { Loader2, RefreshCw, Eye } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useGetWebhookLogsQuery, type WebhookLog } from "@/store/api/webhookApi"

const statusVariant = (status: string): "default" | "outline" | "destructive" => {
  if (status === "processed") return "default"
  if (status === "invalid") return "destructive"
  return "outline"
}

const FIELD_LABELS: Record<string, string> = {
  customer_no: "Customer No",
  event_type: "Event Type",
  first_name: "First Name",
  last_name: "Last Name",
  email: "Email",
  company_name: "Company Name",
  membership_type: "Membership Type",
  phone: "Phone",
  address: "Address",
  city: "City",
  state: "State",
  zip: "Zip Code",
  subscription_no: "Subscription No",
  status: "Status",
  type: "Type",
  username: "Username",
}

const DIFF_LABELS: Record<string, string> = {
  name: "Name",
  email: "Email",
  username: "Username",
  active: "Active",
  phone: "Phone",
  address: "Address",
  city: "City",
  state: "State",
  zipCode: "Zip Code",
  cardStatus: "Card Status",
  profilePhoto: "Profile Photo",
  isPersonal: "Is Personal",
}

function DiffSection({ label, before, after }: { label: string; before: Record<string, any> | null; after: Record<string, any> | null }) {
  if (!before && !after) return null

  const keys = Object.keys(after ?? before ?? {})
  const changed = keys.filter(k => JSON.stringify((before ?? {})[k]) !== JSON.stringify((after ?? {})[k]))

  if (before === null) {
    return (
      <div>
        <p className="text-muted-foreground font-medium mb-2">{label} — Created</p>
        <div className="border rounded-md divide-y">
          {keys.map(k => (
            <div key={k} className="flex items-start gap-4 px-3 py-2">
              <span className="text-muted-foreground w-36 shrink-0">{DIFF_LABELS[k] ?? k}</span>
              <span className="text-green-600 font-medium break-all">{String(after![k] ?? "—")}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (changed.length === 0) {
    return (
      <div>
        <p className="text-muted-foreground font-medium mb-2">{label} — No changes</p>
      </div>
    )
  }

  return (
    <div>
      <p className="text-muted-foreground font-medium mb-2">{label} — Changes</p>
      <div className="border rounded-md divide-y">
        {changed.map(k => (
          <div key={k} className="flex items-start gap-4 px-3 py-2">
            <span className="text-muted-foreground w-36 shrink-0">{DIFF_LABELS[k] ?? k}</span>
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-red-500 line-through break-all text-xs">{String((before ?? {})[k] ?? "—")}</span>
              <span className="text-green-600 font-medium break-all">{String((after ?? {})[k] ?? "—")}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function PayloadModal({ log, onClose }: { log: WebhookLog; onClose: () => void }) {
  let fields: [string, string][] = []
  let parseError = false
  let diff: Record<string, { before: any; after: any }> | null = null

  if (log.payload) {
    try {
      const parsed = JSON.parse(log.payload)
      fields = Object.entries(parsed)
        .filter(([, v]) => v !== null && v !== undefined && v !== "")
        .map(([k, v]) => [k, String(v)])
    } catch {
      parseError = true
    }
  }

  if (log.diff) {
    try {
      diff = JSON.parse(log.diff)
    } catch {}
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Webhook Details</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
            <div>
              <p className="text-muted-foreground">Received At</p>
              <p className="font-medium">{new Date(log.receivedAt).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Source</p>
              <p className="font-medium">{log.source}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Customer No</p>
              <p className="font-medium">{log.customerNo ?? "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Event Type</p>
              <p className="font-medium">{log.eventType ?? "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Status</p>
              <Badge variant={statusVariant(log.status)}>{log.status}</Badge>
            </div>
          </div>

          {diff && (
            <div className="space-y-3">
              <p className="font-medium">Data Changes</p>
              {diff.company && (
                <DiffSection label="Company" before={diff.company.before} after={diff.company.after} />
              )}
              {diff.user && (
                <DiffSection label="User" before={diff.user.before} after={diff.user.after} />
              )}
            </div>
          )}

          {fields.length > 0 && (
            <div>
              <p className="text-muted-foreground font-medium mb-2">Payload Fields</p>
              <div className="border rounded-md divide-y">
                {fields.map(([key, value]) => (
                  <div key={key} className="flex items-start gap-4 px-3 py-2">
                    <span className="text-muted-foreground w-40 shrink-0">
                      {FIELD_LABELS[key] ?? key}
                    </span>
                    <span className="font-medium break-all">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {parseError && (
            <div>
              <p className="text-muted-foreground font-medium mb-2">Raw Payload</p>
              <pre className="bg-gray-50 border rounded-md p-3 text-xs overflow-auto max-h-48 break-all whitespace-pre-wrap">
                {log.payload}
              </pre>
            </div>
          )}

          {!log.payload && (
            <p className="text-muted-foreground text-center py-4">No payload data.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function AdminWebhookLogsPage() {
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(50)
  const [selected, setSelected] = useState<WebhookLog | null>(null)

  const { data, isLoading, isFetching, error, refetch } = useGetWebhookLogsQuery({
    limit: pageSize,
    offset: page * pageSize,
  })

  const logs = data?.data?.logs ?? []
  const total = data?.data?.total ?? 0
  const totalPages = Math.ceil(total / pageSize)

  const handlePageSizeChange = (val: string) => {
    setPageSize(Number(val))
    setPage(0)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-red-500 mb-2">Failed to load webhook logs</p>
          <Button variant="outline" onClick={() => refetch()}>Retry</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <nav className="text-sm text-gray-500 mb-2">
            <Link to="/dashboard" className="hover:text-gray-700 cursor-pointer">Home</Link>
            <span className="mx-1">›</span>
            <span className="font-semibold text-gray-900">Webhook Logs</span>
          </nav>
          <h1 className="text-2xl font-bold">Webhook Logs</h1>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600" style={{ width: 160 }}>Received At</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600" style={{ width: 100 }}>Source</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600" style={{ width: 110 }}>PeopleVine ID</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600" style={{ width: 140 }}>Event Type</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600" style={{ width: 100 }}>Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600" style={{ width: 80 }}>Details</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {logs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">No webhook logs yet</td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {new Date(log.receivedAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{log.source}</td>
                  <td className="px-4 py-3 text-gray-700">{log.customerNo ?? <span className="text-gray-400">—</span>}</td>
                  <td className="px-4 py-3 text-gray-700">{log.eventType ?? <span className="text-gray-400">—</span>}</td>
                  <td className="px-4 py-3">
                    <Badge variant={statusVariant(log.status)}>{log.status}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setSelected(log)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between py-2">
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">
            {total === 0 ? "0" : `${page * pageSize + 1}–${Math.min((page + 1) * pageSize, total)}`} of {total}
          </p>
          <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
            <SelectTrigger className="w-28 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[25, 50, 100].map(n => (
                <SelectItem key={n} value={String(n)}>{n} / page</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Page {page + 1} of {totalPages || 1}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      </div>

      {selected && <PayloadModal log={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
