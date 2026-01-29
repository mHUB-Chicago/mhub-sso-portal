import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from 'sonner'
import { Loader2, Trash2 } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useGetServiceProviderByIdQuery, useUpdateServiceProviderMutation, useDeleteServiceProviderMutation } from '@/store/api/serviceProviderApi'

interface LocalChanges {
  name?: string
  active?: boolean
  entityId?: string
  acsUrl?: string
  loginUrl?: string
  signTarget?: 'ASSERTION' | 'RESPONSE' | 'BOTH'
  logoPreview?: string
}

export function IDPEditPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data, isLoading, error } = useGetServiceProviderByIdQuery(id!, { skip: !id, refetchOnMountOrArgChange: true })
  const [updateServiceProvider, { isLoading: isUpdating }] = useUpdateServiceProviderMutation()
  const [deleteServiceProvider, { isLoading: isDeleting }] = useDeleteServiceProviderMutation()

  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [localChanges, setLocalChanges] = useState<LocalChanges>({})

  // Derive current values from server data + local changes
  const sp = data?.data?.serviceProvider
  const name = localChanges.name ?? sp?.name ?? ''
  const active = localChanges.active ?? sp?.active ?? true
  const entityId = localChanges.entityId ?? sp?.entityId ?? ''
  const acsUrl = localChanges.acsUrl ?? sp?.acsUrl ?? ''
  const loginUrl = localChanges.loginUrl ?? sp?.loginUrl ?? ''
  const signTarget = localChanges.signTarget ?? sp?.signTarget ?? 'ASSERTION'
  const logoPreview = localChanges.logoPreview ?? sp?.logo ?? ''

  const updateField = <K extends keyof LocalChanges>(field: K, value: LocalChanges[K]) => {
    setLocalChanges(prev => ({ ...prev, [field]: value }))
  }

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setLogoFile(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        updateField('logoPreview', reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleSave = async () => {
    if (!id) return

    try {
      const formData = new FormData()
      formData.append('name', name)
      formData.append('active', active.toString())
      formData.append('entityId', entityId)
      formData.append('acsUrl', acsUrl)
      formData.append('loginUrl', loginUrl)
      formData.append('signTarget', signTarget)
      if (logoFile) {
        formData.append('logo', logoFile)
      }

      await updateServiceProvider({ id, data: formData }).unwrap()
      toast.success('Application updated successfully!')
      navigate('/admin/idp')
    } catch (err) {
      toast.error('Failed to update application. Please try again.')
      console.error('Error updating service provider:', err)
    }
  }

  const handleCancel = () => {
    navigate('/admin/idp')
  }

  const handleDelete = async () => {
    if (!id) return

    try {
      await deleteServiceProvider(id).unwrap()
      toast.success('Application deleted successfully!')
      navigate('/admin/idp')
    } catch (err) {
      toast.error('Failed to delete application. Please try again.')
      console.error('Error deleting service provider:', err)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  if (error || !sp) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-red-500 mb-2">Failed to load application</p>
          <Button variant="outline" onClick={() => navigate('/admin/idp')}>
            Back to IDP Management
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500">
        <Link to="/dashboard" className="hover:text-gray-700">Home</Link>
        <span className="mx-1">›</span>
        <Link to="/admin/idp" className="hover:text-gray-700">IDP Management</Link>
        <span className="mx-1">›</span>
        <span className="font-semibold text-gray-900">Edit Application</span>
      </nav>

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Edit Application</h1>
        <Badge variant={active ? "default" : "outline"}>
          {active ? "Active" : "Inactive"}
        </Badge>
      </div>

      <div className="bg-white rounded-lg border p-6 space-y-6">
        {/* Logo Section */}
        <div className="space-y-3">
          <Label>Application Logo</Label>
          <div className="flex items-center gap-4">
            {logoPreview ? (
              <img src={logoPreview} alt={name} className="h-16 w-16 object-contain border rounded p-2 bg-white" />
            ) : (
              <div className="h-16 w-16 bg-gray-100 border rounded flex items-center justify-center text-gray-400 text-xs">
                No logo
              </div>
            )}
          </div>
          <Input
            type="file"
            accept="image/*"
            onChange={handleLogoChange}
            className="w-72"
          />
        </div>

        {/* Basic Info */}
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="name">Application Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => updateField('name', e.target.value)}
              placeholder="Enter application name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="active">Status</Label>
            <div className="flex items-center gap-2 pt-2">
              <Switch
                id="active"
                checked={active}
                onCheckedChange={(checked) => updateField('active', checked)}
              />
              <span className="text-sm text-gray-600">{active ? 'Active' : 'Inactive'}</span>
            </div>
          </div>
        </div>

        {/* SAML Configuration */}
        <div className="space-y-4">
          <h2 className="text-lg font-medium border-b pb-2">SAML Configuration</h2>

          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-2">
              <Label htmlFor="entityId">Entity ID</Label>
              <Input
                id="entityId"
                value={entityId}
                onChange={(e) => updateField('entityId', e.target.value)}
                placeholder="https://example.com/saml/metadata"
              />
              <p className="text-xs text-gray-500">The Entity ID from the Service Provider's SAML metadata</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="acsUrl">Assertion Consumer Service (ACS) URL</Label>
              <Input
                id="acsUrl"
                value={acsUrl}
                onChange={(e) => updateField('acsUrl', e.target.value)}
                placeholder="https://example.com/saml/acs"
              />
              <p className="text-xs text-gray-500">The URL where SAML assertions are sent</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="loginUrl">Login URL</Label>
              <Input
                id="loginUrl"
                value={loginUrl}
                onChange={(e) => updateField('loginUrl', e.target.value)}
                placeholder="https://example.com/login"
              />
              <p className="text-xs text-gray-500">The URL users are redirected to after authentication</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="signTarget">Signature Target</Label>
              <Select value={signTarget} onValueChange={(value: 'ASSERTION' | 'RESPONSE' | 'BOTH') => updateField('signTarget', value)}>
                <SelectTrigger className="w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ASSERTION">Assertion Only</SelectItem>
                  <SelectItem value="RESPONSE">Response Only</SelectItem>
                  <SelectItem value="BOTH">Both</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">Which part of the SAML response to sign</p>
            </div>
          </div>
        </div>

        {/* Read-only Info */}
        <div className="space-y-4">
          <h2 className="text-lg font-medium border-b pb-2">Metadata</h2>
          <div className="grid grid-cols-2 gap-6 text-sm">
            <div>
              <span className="text-gray-500">Created:</span>
              <span className="ml-2">{new Date(sp.createdAt).toLocaleString()}</span>
            </div>
            <div>
              <span className="text-gray-500">Last Modified:</span>
              <span className="ml-2">{new Date(sp.updatedAt).toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-between pt-4 border-t">
          <Button
            variant="destructive"
            onClick={() => setShowDeleteDialog(true)}
            disabled={isUpdating || isDeleting}
            className="px-6"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete Application
          </Button>
          <div className="flex space-x-3">
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={isUpdating || isDeleting}
              className="px-6"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isUpdating || isDeleting}
              className="bg-brand hover:bg-brand-hover px-6"
            >
              {isUpdating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Application</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{name}</strong>? This action cannot be undone.
              <br /><br />
              This will remove the application from all users and companies that currently have access to it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
