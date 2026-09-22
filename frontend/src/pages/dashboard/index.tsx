import type { MouseEvent } from 'react'
import { Card } from '@/components/ui/card'
import { Loader2, Settings } from 'lucide-react'
import { useGetMeQuery } from '@/store/api/authApi'
import { Link } from 'react-router-dom'

interface App {
  name: string
  logo: string
  url: string
  isPeopleVine?: boolean
}

// Minimum time to leave the pre-opened tab showing its initial (PV-domain) URL before
// swapping to the real SSO destination — same reasoning/value as login/index.tsx.
const MIN_TAB_LOAD_MS = 2000

export function DashboardPage() {
  const { data, isLoading } = useGetMeQuery()

  const apps: App[] = data?.data?.apps || []
  const isAdmin = data?.data?.user?.role === 'ADMIN'
  const user = data?.data?.user
  const stillNeedsOnboardingPayment = !user?.onboardingPaymentAgreementAt

  // The PeopleVine tile's `url` is a relayState-carrying SSO link (see userController.ts)
  // rather than a plain page — clicking straight through with a normal <a target="_blank">
  // would show a blank tab while the SAML round-trip resolves. Opens a brief preview of
  // the actual PV-domain destination first (the payment form while onboarding payment is
  // still pending, PV's regular member home once it's done) purely for that reason.
  // IMPORTANT: closes that preview tab and opens a genuinely NEW tab for the real SSO url
  // (same pattern as login/index.tsx's navigateTab) rather than reusing it via
  // `tab.location.href` — reusing the same tab/browsing-context for both navigations was
  // suspected of contributing to an intermittent PV-side 502 seen elsewhere, so this
  // deliberately matches the tested working pattern instead. Deliberate, accepted
  // tradeoff (same as the login flow): if this browser already holds a stale PV session
  // from a different member, this brief preview reflects that, not a blank page.
  const handlePeopleVineClick = (e: MouseEvent, url: string) => {
    e.preventDefault()
    const previewUrl = stillNeedsOnboardingPayment
      ? 'https://member.mhubchicago.com/form/20611'
      : 'https://member.mhubchicago.com/home'
    const openedAt = Date.now()
    const previewTab = window.open(previewUrl, '_blank')
    if (!previewTab) {
      window.location.assign(url)
      return
    }
    const remaining = MIN_TAB_LOAD_MS - (Date.now() - openedAt)
    window.setTimeout(() => {
      previewTab.close()
      const realTab = window.open(url, '_blank')
      if (!realTab) {
        window.location.assign(url)
      }
    }, Math.max(remaining, 0))
  }

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
            onClick={app.isPeopleVine ? (e) => handlePeopleVineClick(e, app.url) : undefined}
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