import { useState } from "react"
import { Link } from "react-router-dom"
import { Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useGetWebhookLogsQuery } from "@/store/api/webhookApi"

const PAGE_SIZE = 50

const statusVariant = (status: string): "default" | "outline" | "destructive" => {
  if (status === "processed") return "default"
  if (status === "invalid") return "destructive"
  return "outline"
}

export function AdminWebhookLogsPage() {
  const [page, setPage] = useState(0)

  const { data, isLoading, isFetching, error, refetch } = useGetWebhookLogsQuery({
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  })

  const logs = data?.data?.logs ?? []
  const total = data?.data?.total ?? 0
  const totalPages = Math.ceil(total / PAGE_SIZE)

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
      <div>
        <nav className="text-sm text-gray-500 mb-2">
          <Link to="/dashboard" className="hover:text-gray-700 cursor-pointer">Home</Link>
          <span className="mx-1">›</span>
          <span className="font-semibold text-gray-900">Webhook Logs</span>
        </nav>
        <h1 className="text-2xl font-bold">Webhook Logs</h1>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{total} total events</p>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Received At</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Source</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Customer #</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Event Type</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Payload</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {logs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">No webhook logs yet</td>
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
                  <td className="px-4 py-3 max-w-xs">
                    {log.payload ? (
                      <code className="text-xs text-gray-600 bg-gray-100 px-1 py-0.5 rounded truncate block max-w-xs overflow-hidden">
                        {log.payload}
                      </code>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Page {page + 1} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
