import { useAppSelector } from '@/store'
import { Button } from '@/components/ui/button'
import { Card, CardContent} from '@/components/ui/card'
import { User, Building2, Mail, Phone } from 'lucide-react'

export function DashboardPage() {
  const user = useAppSelector(state => state.auth.user)

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold">Your Profile</h1>
        <Button variant="outline">
          Edit Details
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <User className="h-5 w-5 text-gray-500" />
              <div className="flex-1">
                <label className="text-sm text-gray-600">Full Name</label>
                <p className="font-medium">{user?.name || 'Alice Smith'}</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <Building2 className="h-5 w-5 text-gray-500" />
              <div className="flex-1">
                <label className="text-sm text-gray-600">Company</label>
                <p className="font-medium">mHub Innovations</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <Mail className="h-5 w-5 text-gray-500" />
              <div className="flex-1">
                <label className="text-sm text-gray-600">Email</label>
                <p className="font-medium">{user?.email || 'alice.smith@mhub.com'}</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <Phone className="h-5 w-5 text-gray-500" />
              <div className="flex-1">
                <label className="text-sm text-gray-600">Phone</label>
                <p className="font-medium">+1 (555) 123-4567</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}