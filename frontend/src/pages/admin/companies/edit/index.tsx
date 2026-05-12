import { useState, useMemo } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Loader2, ExternalLink } from 'lucide-react'
import { useGetCompanyByIdQuery, useUpdateCompanyMutation } from '@/store/api/companyApi'

export function AdminEditCompanyPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: companyData, isLoading, error } = useGetCompanyByIdQuery(id!, { skip: !id, refetchOnMountOrArgChange: true })
  const [updateCompany, { isLoading: isUpdating }] = useUpdateCompanyMutation()

  // Track user changes separately from server data
  const [localChanges, setLocalChanges] = useState<{ enabledServiceProviderIds?: string[] }>({})

  // Derive current values from server data + local changes
  const enabledServiceProviderIds = useMemo(() => {
    if (localChanges.enabledServiceProviderIds !== undefined) {
      return localChanges.enabledServiceProviderIds
    }
    return companyData?.data?.enabledServiceProviders.map(sp => sp.id) ?? []
  }, [companyData, localChanges])

  const handleServiceProviderToggle = (spId: string, checked: boolean) => {
    const currentIds = enabledServiceProviderIds
    const newIds = checked
      ? [...currentIds, spId]
      : currentIds.filter(id => id !== spId)
    setLocalChanges(prev => ({ ...prev, enabledServiceProviderIds: newIds }))
  }

  const handleSave = async () => {
    if (!id) return

    try {
      await updateCompany({
        id,
        enabledServiceProviderIds,
      }).unwrap()
      toast.success('Company updated successfully!')
      navigate('/admin/companies')
    } catch (err) {
      toast.error('Failed to update company. Please try again.')
      console.error('Error updating company:', err)
    }
  }

  const handleCancel = () => {
    navigate('/admin/companies')
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  if (error || !companyData?.data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-red-500 mb-2">Failed to load company</p>
          <Button variant="outline" onClick={() => navigate('/admin/companies')}>
            Back to Companies
          </Button>
        </div>
      </div>
    )
  }

  const { company, allowedServiceProviders } = companyData.data
  const initials = company.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500">
        <Link to="/dashboard" className="hover:text-gray-700">Home</Link>
        <span className="mx-1">›</span>
        <Link to="/admin/companies" className="hover:text-gray-700">Companies</Link>
        <span className="mx-1">›</span>
        <span className="font-semibold text-gray-900">Edit Company</span>
      </nav>

      {/* Header */}
      <h1 className="text-xl font-semibold">Edit Company</h1>

      <div className="bg-white rounded-lg border p-6 space-y-8">
        {/* Profile Section */}
        <div className="flex items-start gap-6">
          <Avatar className="w-20 h-20">
            <AvatarFallback className="text-xl bg-gray-200">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 space-y-4">
            <div>
              <h2 className="text-lg font-medium">{company.name}</h2>
              <p className="text-sm text-gray-500">{company.email}</p>
            </div>
          </div>
        </div>

        {/* Company Info (Read-only) */}
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label className="text-gray-500">PeopleVine ID</Label>
            {company.peopleVineId ? (
              <a
                href={`https://control.peoplevine.com/admin_customer_menu.aspx?customer_no=${company.peopleVineId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-brand hover:underline inline-flex items-center gap-1"
              >
                {company.peopleVineId}
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : (
              <p className="font-medium">N/A</p>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-gray-500">Created</Label>
            <p className="font-medium">{new Date(company.createdAt).toLocaleDateString()}</p>
          </div>

          <div className="space-y-2">
            <Label className="text-gray-500">Membership Type</Label>
            <p className="font-medium">{company.membershipType ?? 'N/A'}</p>
          </div>

          <div className="space-y-2">
            <Label className="text-gray-500">Account Type</Label>
            <Badge variant="outline">{company.isPersonal ? 'Personal' : 'Organization'}</Badge>
          </div>
        </div>

        {/* Service Provider Access */}
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-medium">Service Provider Access</h2>
            <p className="text-sm text-gray-500">
              Select which applications are available for users in this company.
            </p>
          </div>

          {allowedServiceProviders.length === 0 ? (
            <p className="text-sm text-gray-500 italic">No service providers available.</p>
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
