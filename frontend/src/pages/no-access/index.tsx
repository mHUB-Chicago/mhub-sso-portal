import { Link, useSearchParams } from 'react-router-dom'
import { ShieldX } from 'lucide-react'

export function NoAccessPage() {
  const [searchParams] = useSearchParams()
  const app = searchParams.get('app')?.trim().slice(0, 100) || 'this app'

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          <img src="/logo.png" alt="mHUB Logo" className="h-8" />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 pt-16 pb-20 text-center">
        <ShieldX className="h-14 w-14 text-brand mx-auto mb-5" />
        <h2 className="text-3xl font-extrabold text-gray-900 mb-3">You don't have access to {app} yet</h2>
        <p className="text-base text-gray-600 leading-relaxed max-w-xl mx-auto mb-8">
          Your account doesn't have access to this app. Please contact an mHUB staff member at{' '}
          <a href="mailto:Joe@mhub.org" className="font-bold text-brand underline">Joe@mhub.org</a> for assistance.
        </p>
        <Link
          to="/"
          className="inline-block rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
        >
          Back to Member Portal
        </Link>
      </main>
    </div>
  )
}
