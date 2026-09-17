import { useNavigate } from 'react-router-dom'
import { useChangePasswordMutation } from '@/store/api/authApi'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { Eye, EyeOff, Lock, Loader2, ShieldCheck } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { useAppSelector } from '@/store'

interface ChangePasswordFormData {
  password: string
  confirmPassword: string
}

// Minimum time to leave the pre-opened tab showing its initial URL (the PV payment
// form) before redirecting it to the SAML relay — gives that page time to actually
// render instead of being hijacked mid-load.
const MIN_TAB_LOAD_MS = 5000

export function ChangePasswordPage() {
  // Same reasoning as LoginPage — capture once and strip from the URL so navigating
  // back to this history entry later doesn't replay a stale returnTo/tx.
  const [txQueryParam] = useState(() => new URLSearchParams(window.location.search).get('tx'))
  const [returnToParam] = useState(() => new URLSearchParams(window.location.search).get('returnTo'))
  useEffect(() => {
    if (txQueryParam || returnToParam) {
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [])
  const { redirectUrl } = useAppSelector(state => state.auth)
  const navigate = useNavigate()
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  // Covers the gap between a successful password change and the browser actually
  // finishing the redirect — see the same state in login/index.tsx.
  const [isRedirecting, setIsRedirecting] = useState(false)
  const [openedNewTab, setOpenedNewTab] = useState(false)
  // Set synchronously in the raw form onSubmit, below — see the same ref in
  // login/index.tsx for why this can't be opened inside the async onSubmit callback.
  const redirectTabRef = useRef<Window | null>(null)
  // Timestamp the tab was opened — navigateTab waits out the rest of
  // MIN_TAB_LOAD_MS from this point before redirecting it.
  const redirectTabOpenedAtRef = useRef(0)

  const [changePassword, { isLoading }] = useChangePasswordMutation()

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ChangePasswordFormData>()

  const password = watch('password')

  // Points an already-open tab at `url` once we know it, or falls back to a same-tab
  // redirect if the tab never opened (popup blocked) — see login/index.tsx's navigateTab.
  const navigateTab = async (tab: Window | null, url: string) => {
    if (tab) {
      const elapsed = Date.now() - redirectTabOpenedAtRef.current
      const remaining = MIN_TAB_LOAD_MS - elapsed
      if (remaining > 0) {
        await new Promise((resolve) => setTimeout(resolve, remaining))
      }
      tab.location.href = url
      setOpenedNewTab(true)
    } else {
      window.location.assign(url)
    }
    setIsRedirecting(true)
  }

  const onSubmit = async (data: ChangePasswordFormData) => {
    const redirectTab = redirectTabRef.current
    try {
      await changePassword({ password: data.password }).unwrap()
      toast.success('Password changed successfully!')

      // Handle SAML flow or regular navigation
      if (txQueryParam) {
        await navigateTab(redirectTab, `${import.meta.env.VITE_API_URL}/saml/continue?tx=${txQueryParam}`)
      } else if (returnToParam) {
        await navigateTab(redirectTab, returnToParam)
      } else if (redirectUrl) {
        await navigateTab(redirectTab, redirectUrl)
      } else {
        redirectTab?.close()
        navigate('/dashboard')
      }
    } catch (error: unknown) {
      redirectTab?.close()
      const err = error as { data?: { message?: string } }
      toast.error(err.data?.message || 'Failed to change password. Please try again.')
    }
  }

  if (isRedirecting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="flex flex-col items-center gap-4 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-brand" />
          <p className="text-gray-600">
            {openedNewTab ? 'Continue in the new tab that just opened.' : 'Redirecting you, please wait...'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src="/logo.png" alt="MHUB Logo" className="h-10 mx-auto mb-8" />
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-brand/10 rounded-full">
              <ShieldCheck className="h-8 w-8 text-brand" />
            </div>
          </div>
          <h2 className="text-3xl font-bold mb-2">Set Your Password</h2>
          <p className="text-gray-600 text-base">
            Please create a new password for your account
          </p>
        </div>

        <form
          onSubmit={(e) => {
            // Must run before handleSubmit's own async validation — see
            // redirectTabRef above.
            // Opens straight at the PV payment form (rather than about:blank) so the
            // tab shows the real destination immediately — it gets pointed at the
            // actual SAML relay URL once the request resolves, same as before, this
            // just changes what's visible while that's in flight. Matches the
            // backend's ONBOARDING_PAYMENT_FORM_URL default (onboardingController.ts).
            redirectTabRef.current = window.open('https://member.mhubchicago.com/form/20611', '_blank')
            redirectTabOpenedAtRef.current = Date.now()
            return handleSubmit(onSubmit)(e)
          }}
          className="space-y-6"
        >
          <div>
            <Label htmlFor="password" className="text-sm font-medium text-gray-700">
              New Password
            </Label>
            <div className="mt-1 relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock className="h-5 w-5 text-gray-400" />
              </div>
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter new password"
                className="w-full pl-10 pr-10 py-4 border-gray-300 h-12"
                disabled={isLoading}
                {...register('password', {
                  required: 'Password is required',
                  minLength: {
                    value: 8,
                    message: 'Password must be at least 8 characters',
                  },
                })}
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 pr-3 flex items-center"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? (
                  <EyeOff className="h-5 w-5 text-gray-400" />
                ) : (
                  <Eye className="h-5 w-5 text-gray-400" />
                )}
              </button>
            </div>
            {errors.password && (
              <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="confirmPassword" className="text-sm font-medium text-gray-700">
              Confirm Password
            </Label>
            <div className="mt-1 relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock className="h-5 w-5 text-gray-400" />
              </div>
              <Input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="Confirm new password"
                className="w-full pl-10 pr-10 py-4 border-gray-300 h-12"
                disabled={isLoading}
                {...register('confirmPassword', {
                  required: 'Please confirm your password',
                  validate: (value) =>
                    value === password || 'Passwords do not match',
                })}
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 pr-3 flex items-center"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              >
                {showConfirmPassword ? (
                  <EyeOff className="h-5 w-5 text-gray-400" />
                ) : (
                  <Eye className="h-5 w-5 text-gray-400" />
                )}
              </button>
            </div>
            {errors.confirmPassword && (
              <p className="mt-1 text-sm text-red-600">{errors.confirmPassword.message}</p>
            )}
          </div>

          {/* Password requirements hint */}
          <div className="text-sm text-gray-500">
            <p>Password must:</p>
            <ul className="list-disc list-inside mt-1 space-y-1">
              <li>Be at least 8 characters long</li>
            </ul>
          </div>

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full py-4 h-12 bg-brand hover:bg-brand-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-md"
          >
            {isLoading ? (
              <div className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Updating password...
              </div>
            ) : (
              'Set Password'
            )}
          </Button>
        </form>
      </div>
    </div>
  )
}
