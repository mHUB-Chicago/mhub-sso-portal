import { Card } from '@/components/ui/card'
import { Loader2, Settings } from 'lucide-react'
import { useGetMeQuery } from '@/store/api/authApi'
import { Link } from 'react-router-dom'
import type { MouseEvent } from 'react'
import { toast } from 'sonner'
import { openRedirectTab, getRedirectTabLoadPromise, clearRedirectTab } from '@/utils/redirectTab'
import { getPeopleVineSsoUrl, PEOPLEVINE_ORIGIN, PEOPLEVINE_ROOT_URL } from '@/utils/peopleVine'

interface App {
  name: string
  logo: string
  url: string
}

// PV ignores RelayState and lands on the last PV page viewed in this browser (e.g. the
// onboarding payment form). Where PV's SSO script knows this IdP, opening PV's root with the
// marker logs in and lands on home in one go (see getPeopleVineSsoUrl). Otherwise load PV's
// root in the new tab first, then run the SSO there.
const openPeopleVine = async (e: MouseEvent<HTMLAnchorElement>, url: string) => {
  e.preventDefault()
  const ssoUrl = getPeopleVineSsoUrl()
  if (ssoUrl) {
    window.open(ssoUrl, '_blank', 'noopener')
    return
  }
  const tab = openRedirectTab(PEOPLEVINE_ROOT_URL)
  if (!tab) {
    window.open(url, '_blank', 'noopener,noreferrer')
    return
  }
  try {
    await getRedirectTabLoadPromise()
    tab.location.href = url
  } catch (error) {
    toast.error(error instanceof Error ? error.message : 'Could not open the member portal.')
  } finally {
    clearRedirectTab()
  }
}

export function DashboardPage() {
  const { data, isLoading } = useGetMeQuery()

  const apps: App[] = data?.data?.apps || []
  const isAdmin = data?.data?.user?.role === 'ADMIN'

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-brand" />
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
            onClick={app.url.startsWith(PEOPLEVINE_ORIGIN) ? (e) => openPeopleVine(e, app.url) : undefined}
            className="block"
          >
            <Card className="p-8 hover:shadow-lg transition-shadow cursor-pointer border-gray-200 hover:border-brand/30">
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
            <Card className="p-8 hover:shadow-lg transition-shadow cursor-pointer border-gray-200 hover:border-brand/30">
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="w-16 h-16 flex items-center justify-center">
                  <Settings className="w-12 h-12 text-brand" />
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
