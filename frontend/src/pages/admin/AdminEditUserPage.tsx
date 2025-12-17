import { useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from 'sonner'

// This would typically come from the API based on the user ID
const mockUserData = {
  id: '1',
  fullName: 'Jane Smith',
  company: 'Innovate Corp',
  membership: 'Premium',
  email: 'jane.smith@innovatecorp.com',
  phoneNumber: '(555) 987-6543',
  avatar: null,
  accessLevels: {
    digifaster: true,
    mhubShop: true,
    learnworlds: false,
    peoplevine: false
  }
}

export function AdminEditUserPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [isLoading, setIsLoading] = useState(false)
  
  const [formData, setFormData] = useState({
    fullName: mockUserData.fullName,
    company: mockUserData.company,
    membership: mockUserData.membership,
    email: mockUserData.email,
    phoneNumber: mockUserData.phoneNumber,
    accessLevels: mockUserData.accessLevels
  })

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleAccessLevelChange = (level: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      accessLevels: {
        ...prev.accessLevels,
        [level]: checked
      }
    }))
  }

  const handleSave = async () => {
    setIsLoading(true)
    // Simulate API call
    setTimeout(() => {
      setIsLoading(false)
      toast.success('User updated successfully!')
      navigate('/admin/users')
    }, 1500)
  }

  const handleCancel = () => {
    navigate('/admin/users')
  }

  const initials = formData.fullName.split(' ').map(n => n[0]).join('').toUpperCase()

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500">
        <Link to="/admin/dashboard" className="hover:text-gray-700">Home</Link>
        <span className="mx-1">›</span>
        <Link to="/admin/users" className="hover:text-gray-700">Users</Link>
        <span className="mx-1">›</span>
        <span className="font-semibold text-gray-900">Edit User</span>
      </nav>

      {/* Header */}
      <h1 className="text-xl font-semibold">mHub User Information</h1>

      <div className="bg-white rounded-lg border p-6 space-y-8">
        {/* Profile Photo Section */}
        <div className="flex flex-col items-center space-y-4">
          <Avatar className="w-24 h-24">
            <AvatarImage src={mockUserData.avatar || undefined} />
            <AvatarFallback className="text-lg bg-gray-200">{initials}</AvatarFallback>
          </Avatar>
          <Button variant="outline" size="sm">
            Upload New Photo
          </Button>
        </div>

        {/* Form Fields */}
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="fullName">Full Name</Label>
            <Input
              id="fullName"
              value={formData.fullName}
              onChange={(e) => handleInputChange('fullName', e.target.value)}
              className="h-10"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="company">Company</Label>
            <Input
              id="company"
              value={formData.company}
              onChange={(e) => handleInputChange('company', e.target.value)}
              className="h-10"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="membership">Peoplevine Membership</Label>
            <Select value={formData.membership} onValueChange={(value) => handleInputChange('membership', value)}>
              <SelectTrigger className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Premium">Premium</SelectItem>
                <SelectItem value="Standard">Standard</SelectItem>
                <SelectItem value="Enterprise">Enterprise</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => handleInputChange('email', e.target.value)}
              className="h-10"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phoneNumber">Phone Number</Label>
            <Input
              id="phoneNumber"
              value={formData.phoneNumber}
              onChange={(e) => handleInputChange('phoneNumber', e.target.value)}
              className="h-10"
            />
          </div>
        </div>

        {/* System Access Levels */}
        <div className="space-y-4">
          <h2 className="text-lg font-medium">System Access Levels</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="digifaster"
                checked={formData.accessLevels.digifaster}
                onCheckedChange={(checked) => handleAccessLevelChange('digifaster', checked as boolean)}
              />
              <Label htmlFor="digifaster" className="flex items-center">
                <div className="w-3 h-3 bg-red-500 rounded-sm mr-2"></div>
                Digifaster
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="learnworlds"
                checked={formData.accessLevels.learnworlds}
                onCheckedChange={(checked) => handleAccessLevelChange('learnworlds', checked as boolean)}
              />
              <Label htmlFor="learnworlds">Learnworlds</Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="mhubShop"
                checked={formData.accessLevels.mhubShop}
                onCheckedChange={(checked) => handleAccessLevelChange('mhubShop', checked as boolean)}
              />
              <Label htmlFor="mhubShop" className="flex items-center">
                <div className="w-3 h-3 bg-pink-500 rounded-sm mr-2"></div>
                Mhub Shop (WordPress)
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="peoplevine"
                checked={formData.accessLevels.peoplevine}
                onCheckedChange={(checked) => handleAccessLevelChange('peoplevine', checked as boolean)}
              />
              <Label htmlFor="peoplevine">Peoplevine</Label>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end space-x-3 pt-4">
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
            {isLoading ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </div>
  )
}