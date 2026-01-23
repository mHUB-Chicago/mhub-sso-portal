import { Card } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'
import { useGetMeQuery } from '@/store/api/authApi'

export function DashboardPage() {
  const { data, isLoading } = useGetMeQuery()

  const apps = data?.data?.apps || []

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
      </div>
    </div>
  )
}