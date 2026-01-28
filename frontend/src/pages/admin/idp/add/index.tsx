import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { useCreateServiceProviderMutation } from '@/store/api/serviceProviderApi'

export function IDPAddPage() {
  const navigate = useNavigate()
  const [createServiceProvider, { isLoading }] = useCreateServiceProviderMutation()

  const [name, setName] = useState('')
  const [entityId, setEntityId] = useState('')
  const [acsUrl, setAcsUrl] = useState('')
  const [loginUrl, setLoginUrl] = useState('')
  const [signTarget, setSignTarget] = useState<'ASSERTION' | 'RESPONSE' | 'BOTH'>('ASSERTION')
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string>('')

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setLogoFile(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setLogoPreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleSave = async () => {
    if (!name || !entityId || !acsUrl || !loginUrl) {
      toast.error('Please fill in all required fields')
      return
    }

    try {
      const formData = new FormData()
      formData.append('name', name)
      formData.append('entityId', entityId)
      formData.append('acsUrl', acsUrl)
      formData.append('loginUrl', loginUrl)
      formData.append('signTarget', signTarget)
      if (logoFile) {
        formData.append('logo', logoFile)
      }

      await createServiceProvider(formData).unwrap()
      toast.success('Application created successfully!')
      navigate('/admin/idp')
    } catch (err) {
      toast.error('Failed to create application. Please try again.')
      console.error('Error creating service provider:', err)
    }
  }

  const handleCancel = () => {
    navigate('/admin/idp')
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500">
        <Link to="/admin/users" className="hover:text-gray-700">Home</Link>
        <span className="mx-1">›</span>
        <Link to="/admin/idp" className="hover:text-gray-700">IDP Management</Link>
        <span className="mx-1">›</span>
        <span className="font-semibold text-gray-900">Add Application</span>
      </nav>

      {/* Header */}
      <h1 className="text-xl font-semibold">Add New Application</h1>

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
        <div className="space-y-2">
          <Label htmlFor="name">Application Name *</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter application name"
          />
        </div>

        {/* SAML Configuration */}
        <div className="space-y-4">
          <h2 className="text-lg font-medium border-b pb-2">SAML Configuration</h2>

          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-2">
              <Label htmlFor="entityId">Entity ID *</Label>
              <Input
                id="entityId"
                value={entityId}
                onChange={(e) => setEntityId(e.target.value)}
                placeholder="https://example.com/saml/metadata"
              />
              <p className="text-xs text-gray-500">The Entity ID from the Service Provider's SAML metadata</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="acsUrl">Assertion Consumer Service (ACS) URL *</Label>
              <Input
                id="acsUrl"
                value={acsUrl}
                onChange={(e) => setAcsUrl(e.target.value)}
                placeholder="https://example.com/saml/acs"
              />
              <p className="text-xs text-gray-500">The URL where SAML assertions are sent</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="loginUrl">Login URL *</Label>
              <Input
                id="loginUrl"
                value={loginUrl}
                onChange={(e) => setLoginUrl(e.target.value)}
                placeholder="https://example.com/login"
              />
              <p className="text-xs text-gray-500">The URL users are redirected to after authentication</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="signTarget">Signature Target</Label>
              <Select value={signTarget} onValueChange={(value: 'ASSERTION' | 'RESPONSE' | 'BOTH') => setSignTarget(value)}>
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

        {/* Action Buttons */}
        <div className="flex justify-end space-x-3 pt-4 border-t">
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isLoading}
            className="px-6"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isLoading}
            className="bg-[#D30046] hover:bg-[#B8003C] px-6"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Application'
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
