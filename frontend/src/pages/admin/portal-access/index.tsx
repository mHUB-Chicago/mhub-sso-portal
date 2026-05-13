import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, Plus, Trash2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { useGetPortalAccessTypesQuery, useAddPortalAccessTypeMutation, useRemovePortalAccessTypeMutation } from '@/store/api/syncApi'

type ConfirmState = { mode: 'add'; name: string } | { mode: 'delete'; name: string } | null

export function AdminPortalAccessPage() {
  const { data, isLoading } = useGetPortalAccessTypesQuery()
  const [addType, { isLoading: isAdding }] = useAddPortalAccessTypeMutation()
  const [removeType] = useRemovePortalAccessTypeMutation()

  const [newType, setNewType] = useState('')
  const [search, setSearch] = useState('')
  const [confirm, setConfirm] = useState<ConfirmState>(null)
  const [isPending, setIsPending] = useState(false)

  const types = data?.data ?? []
  const filtered = types.filter(t => t.toLowerCase().includes(search.toLowerCase()))

  const handleConfirm = async () => {
    if (!confirm) return
    setIsPending(true)
    try {
      if (confirm.mode === 'add') {
        await addType({ name: confirm.name }).unwrap()
        setNewType('')
      } else {
        await removeType(confirm.name).unwrap()
      }
    } catch {
      toast.error(confirm.mode === 'add' ? 'Failed to add type' : 'Failed to remove type')
    } finally {
      setIsPending(false)
      setConfirm(null)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <nav className="text-sm text-gray-500 mb-2">
          <Link to="/dashboard" className="hover:text-gray-700">Home</Link>
          <span className="mx-1">›</span>
          <span className="font-semibold text-gray-900">Portal Access</span>
        </nav>
        <h1 className="text-2xl font-bold">Portal Access Types</h1>
        <p className="text-sm text-gray-500 mt-1">Members with these membership types can log in to the SSO portal.</p>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            Membership Types
            <span className="text-sm font-normal text-gray-500 ml-2">({types.length} total)</span>
          </h2>
        </div>

        <div className="flex items-center justify-between py-4 gap-4">
          <Input
            placeholder="Search types..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="max-w-sm"
          />
          <div className="flex items-center gap-2">
            <Input
              value={newType}
              onChange={e => setNewType(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && newType.trim()) setConfirm({ mode: 'add', name: newType.trim() }) }}
              placeholder="New membership type…"
              className="w-56"
            />
            <Button
              onClick={() => { if (newType.trim()) setConfirm({ mode: 'add', name: newType.trim() }) }}
              disabled={isAdding || !newType.trim()}
            >
              <Plus className="h-4 w-4 mr-2" />Add
            </Button>
          </div>
        </div>

        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">#</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Membership Type</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center">
                    <Loader2 className="h-5 w-5 animate-spin text-gray-400 mx-auto" />
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-gray-400">
                    {search ? 'No results found.' : 'No portal access types configured.'}
                  </td>
                </tr>
              ) : (
                filtered.map((name, i) => (
                  <tr key={name} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-400 text-sm">{i + 1}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{name}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setConfirm({ mode: 'delete', name })}
                        className="text-muted-foreground hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
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
                    ? <><span className="font-medium text-gray-800">"{confirm.name}"</span> will be allowed to log in.</>
                    : <><span className="font-medium text-gray-800">"{confirm.name}"</span> will no longer be able to log in.</>}
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
