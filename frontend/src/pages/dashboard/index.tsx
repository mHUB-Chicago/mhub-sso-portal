import { Card } from '@/components/ui/card'
import { Loader2, Settings } from 'lucide-react'
import { useGetMeQuery } from '@/store/api/authApi'
import { Link } from 'react-router-dom'

interface App {
  name: string
  logo: string
  url: string
}

export function DashboardPage() {
  const { data, isLoading } = useGetMeQuery()

  const apps: App[] = data?.data?.apps || []
  const isAdmin = data?.data?.user?.role === 'ADMIN'

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-[#D30046]" />
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto py-8">
      {/* App Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {apps.map((app) => (
          <a
            key={app.name}
            href={app.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block"
          >
            <Card className="p-8 hover:shadow-lg transition-shadow cursor-pointer border-gray-200 hover:border-[#D30046]/30">
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="w-16 h-16 flex items-center justify-center">
                  <img
                    src={app.logo}
                    alt={`${app.name} logo`}
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
                <span className="text-lg font-medium text-gray-900">{app.name}</span>
              </div>
            </Card>
          </a>
        ))}

        {/* Admin Panel Link */}
        {isAdmin && (
          <Link to="/admin/users" className="block">
            <Card className="p-8 hover:shadow-lg transition-shadow cursor-pointer border-gray-200 hover:border-[#D30046]/30">
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="w-16 h-16 flex items-center justify-center">
                  <Settings className="w-12 h-12 text-[#D30046]" />
                </div>
                <span className="text-lg font-medium text-gray-900">Admin Panel</span>
              </div>
            </Card>
          </Link>
        )}
      </div>
    </div>
  )
}