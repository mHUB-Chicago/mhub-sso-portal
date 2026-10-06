import { useState, useMemo } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from 'sonner'
import { Loader2, ExternalLink, FileText, Download, AlertTriangle } from 'lucide-react'
import { useGetUserByIdQuery, useUpdateUserMutation } from '@/store/api/userApi'
import { useGetPortalAccessTypesQuery } from '@/store/api/syncApi'
import { LoginAccessBadge } from '@/components/LoginAccessBadge'
import { hasPortalMembership, loginAccess } from '../../../../../../common/access'

export function AdminEditUserPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: userData, isLoading, error } = useGetUserByIdQuery(id!, { skip: !id, refetchOnMountOrArgChange: true })
  const { data: portalAccessTypesData } = useGetPortalAccessTypesQuery()
  const [updateUser, { isLoading: isUpdating }] = useUpdateUserMutation()

  // Track user changes separately from server data
  const [localChanges, setLocalChanges] = useState<{
    role?: 'USER' | 'ADMIN'
    enabledServiceProviderIds?: string[]
  }>({})

  // Derive current values from server data + local changes
  const role = localChanges.role ?? userData?.data?.user.role ?? 'USER'
  const enabledServiceProviderIds = useMemo(() => {
    if (localChanges.enabledServiceProviderIds !== undefined) {
      return localChanges.enabledServiceProviderIds
    }
    return userData?.data?.enabledServiceProviders.map(sp => sp.id) ?? []
  }, [userData, localChanges])

  const handleServiceProviderToggle = (spId: string, checked: boolean) => {
    const currentIds = enabledServiceProviderIds
    const newIds = checked
      ? [...currentIds, spId]
      : currentIds.filter(id => id !== spId)
    setLocalChanges(prev => ({ ...prev, enabledServiceProviderIds: newIds }))
  }

  const handleRoleChange = (value: 'USER' | 'ADMIN') => {
    setLocalChanges(prev => ({ ...prev, role: value }))
  }

  const handleSave = async () => {
    if (!id) return

    try {
      await updateUser({
        id,
        role,
        enabledServiceProviderIds,
      }).unwrap()
      toast.success('User updated successfully!')
      navigate('/admin/users')
    } catch (err) {
      toast.error('Failed to update user. Please try again.')
      console.error('Error updating user:', err)
    }
  }

  const handleCancel = () => {
    navigate('/admin/users')
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  if (error || !userData?.data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-red-500 mb-2">Failed to load user</p>
          <Button variant="outline" onClick={() => navigate('/admin/users')}>
            Back to Users
          </Button>
        </div>
      </div>
    )
  }

  const { user, company, allowedServiceProviders, membershipAgreementPdf } = userData.data
  const initials = user.name.split(' ').map(n => n[0]).join('').toUpperCase()
  // Same rule login enforces (@common/access). Null until the Portal Access Types load,
  // so it never flashes a wrong "Blocked".
  const access = portalAccessTypesData
    ? loginAccess(user, hasPortalMembership(new Set(portalAccessTypesData.data), user.primaryMembership, user.addOns))
    : null
  const isInherited = user.memberSource === 'membership'

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500">
        <Link to="/dashboard" className="hover:text-gray-700">Home</Link>
        <span className="mx-1">›</span>
        <Link to="/admin/users" className="hover:text-gray-700">Users</Link>
        <span className="mx-1">›</span>
        <span className="font-semibold text-gray-900">Edit User</span>
      </nav>

      {/* Header */}
      <h1 className="text-xl font-semibold">Edit User</h1>

      <div className="bg-white rounded-lg border p-6 space-y-8">
        {/* Profile Section */}
        <div className="flex items-start gap-6">
          <Avatar className="w-20 h-20">
            <AvatarFallback className="text-xl bg-gray-200">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 space-y-4">
            <div>
              <h2 className="text-lg font-medium">{user.name}</h2>
              <p className="text-sm text-gray-500">{user.email}</p>
            </div>
            <div className="flex gap-2">
              <Badge variant={user.emailVerified ? "default" : "outline"}>
                {user.emailVerified ? "Email Verified" : "Email Pending"}
              </Badge>
              {user.mustResetPassword && (
                <Badge variant="destructive">Must Reset Password</Badge>
              )}
            </div>
          </div>
        </div>

        {/* User Info (Read-only) */}
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label className="text-gray-500">Company</Label>
            <p className="font-medium">{company.name}</p>
          </div>

          <div className="space-y-2">
            <Label className="text-gray-500">PeopleVine ID</Label>
            {user.peopleVineId ? (
              <a
                href={`https://control.peoplevine.com/admin_customer_menu.aspx?customer_no=${user.peopleVineId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-brand hover:underline inline-flex items-center gap-1"
              >
                {user.peopleVineId}
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : (
              <p className="font-medium">N/A</p>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-gray-500">Member Since</Label>
            <p className="font-medium">{new Date(user.createdAt).toLocaleDateString()}</p>
          </div>

          <div className="space-y-2">
            <Label className="text-gray-500">Phone</Label>
            <p className="font-medium">{user.phone ?? <span className="text-gray-400">—</span>}</p>
          </div>

          <div className="space-y-2">
            <Label className="text-gray-500">Card Status</Label>
            <p className="font-medium">{user.cardStatus ?? <span className="text-gray-400">—</span>}</p>
          </div>

          <div className="space-y-2">
            <Label className="text-gray-500">Address</Label>
            <p className="font-medium">
              {[user.address, user.city, user.state, user.zipCode].filter(Boolean).join(', ') || <span className="text-gray-400">—</span>}
            </p>
          </div>
        </div>

        {/* Access — whether login lets this user in, plus the synced facts behind it. No
            "reason" on purpose: the portal doesn't record why the sync marked someone
            inactive, so admins get the facts rather than a guess. */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-medium">Access</h2>
            {access && <LoginAccessBadge access={access} />}
          </div>
          <div className="grid grid-cols-2 gap-6 border rounded-lg p-4 bg-gray-50">
            <div className="space-y-1">
              <Label className="text-gray-500">Primary membership</Label>
              <p className="font-medium">
                {user.primaryMembership ?? <span className="text-gray-400">—</span>}
                {user.primaryMembershipStatus && <span className="text-gray-500 font-normal"> ({user.primaryMembershipStatus})</span>}
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-gray-500">Membership source</Label>
              <p className="font-medium">
                {isInherited ? `Inherited from ${user.memberSourceCompany ?? company.name}` : 'Subscription holder'}
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-gray-500">Company status</Label>
              <p className="font-medium">{company.name} ({company.active ? 'Active' : 'Inactive'})</p>
            </div>
            <div className="space-y-1">
              <Label className="text-gray-500">Account (from sync)</Label>
              <p className="font-medium">
                {user.active ? 'Active' : 'Inactive'}
                <span className="text-gray-500 font-normal"> — {user.accountStatus.replace(/[-_]/g, ' ')}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Membership Agreement — additive, unrelated to the PV payment/agreement
            tracking shown elsewhere; see membershipAgreementService.ts (backend). */}
        <div className="space-y-2">
          <h2 className="text-lg font-medium">Membership Agreement</h2>
          {user.membershipAgreementSignedAt && membershipAgreementPdf ? (
            <div className="flex items-center gap-3 border rounded-lg bg-gray-50 p-3.5">
              <div className="h-10 w-9 rounded bg-white border flex items-center justify-center text-red-600 flex-shrink-0">
                <FileText className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold">Membership Agreement</p>
                  <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Signed</Badge>
                </div>
                <p className="text-xs text-gray-500 truncate">
                  Signed by {user.membershipAgreementSignedName ?? user.name} on{' '}
                  {new Date(user.membershipAgreementSignedAt).toLocaleDateString()} &bull; mHUB_Membership_Agreement_{user.name.replace(/\s+/g, '')}_Signed.pdf
                </p>
              </div>
              <a
                href={membershipAgreementPdf}
                download={`mHUB_Membership_Agreement_${user.name.replace(/\s+/g, '')}_Signed.pdf`}
              >
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Download className="h-3.5 w-3.5" />
                  Download Signed Agreement
                </Button>
              </a>
            </div>
          ) : (
            <p className="text-sm text-gray-500 italic">Not signed yet.</p>
          )}
        </div>

        {/* Role Selection */}
        <div className="space-y-2">
          <Label htmlFor="role">User Role</Label>
          <Select value={role} onValueChange={handleRoleChange}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="USER">User</SelectItem>
              <SelectItem value="ADMIN">Admin</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-gray-500">Admins can manage users, companies, and service providers.</p>
        </div>

        {/* Service Provider Access */}
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-medium">Service Provider Access</h2>
            <p className="text-sm text-gray-500">
              Select which applications this user can access. Only service providers enabled for their company are shown.
            </p>
          </div>

          {access === 'blocked' && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-300 rounded-md">
              <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800">
                This user is currently <span className="font-semibold">blocked from logging in</span> (see Access above),
                so these settings have no effect until their access is restored.
              </p>
            </div>
          )}

          {allowedServiceProviders.length === 0 ? (
            <p className="text-sm text-gray-500 italic">No service providers available for this company.</p>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {allowedServiceProviders.map((sp) => (
                <div key={sp.id} className="flex items-center space-x-3 p-3 border rounded-lg">
                  <Checkbox
                    id={sp.id}
                    checked={enabledServiceProviderIds.includes(sp.id)}
                    onCheckedChange={(checked) => handleServiceProviderToggle(sp.id, checked as boolean)}
                  />
                  <div className="flex items-center gap-3 flex-1">
                    {sp.logo && (
                      <img src={sp.logo} alt={sp.name} className="h-8 w-8 object-contain" />
                    )}
                    <Label htmlFor={sp.id} className="cursor-pointer flex-1">
                      {sp.name}
                    </Label>
                  </div>
                  {!sp.active && (
                    <Badge variant="outline" className="text-xs">Inactive</Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end space-x-3 pt-4 border-t">
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isUpdating}
            className="px-6"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isUpdating}
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
  )
}
