import { useNavigate, Link } from 'react-router-dom'
import { useStartLoginMutation, useVerifyLoginMutation, useGetMeQuery, useLogoutMutation } from '@/store/api/authApi'
import { useAppDispatch } from '@/store'
import { loginSuccess, logout } from '@/store/slices/authSlice'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { Eye, EyeOff, Mail, Lock, Loader2, ArrowLeft, Info } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { openRedirectTab, getRedirectTab, getRedirectTabLoadPromise, clearRedirectTab } from '@/utils/redirectTab'

type LoginStep = 'email' | 'password'

interface EmailFormData {
  email: string
}

interface PasswordFormData {
  password: string
}

export function LoginPage() {
  // Captured once (lazy initializer) rather than re-read from window.location on every
  // render, then stripped from the visible URL below — otherwise, navigating back to
  // this history entry after logging in (e.g. via the browser back button) would replay
  // a stale returnTo/tx against whichever account logs in next, regardless of who that is.
  const [txQueryParam] = useState(() => new URLSearchParams(window.location.search).get('tx'))
  const [returnToParam] = useState(() => new URLSearchParams(window.location.search).get('returnTo'))
  // Set only by change-password's redirect back here right after a real password was
  // just set — see its comment. Distinguishes THIS visit (guaranteed real password at
  // Step 2) from a brand-new member's very first visit off the onboarding email (Step 2
  // there is still their OTP, not a password, even though returnTo is present both times).
  const [passwordJustSetParam] = useState(() => new URLSearchParams(window.location.search).get('passwordJustSet'))
  useEffect(() => {
    if (txQueryParam || returnToParam || passwordJustSetParam) {
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [])
  const navigate = useNavigate()
  const dispatch = useAppDispatch()

  const [step, setStep] = useState<LoginStep>('email')
  const [email, setEmail] = useState('')
  const [requestId, setRequestId] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  // Covers the gap between a successful verify and the browser actually finishing
  // the redirect — without this, the "Signing in..." button reverts to idle for a
  // moment before the page navigates away, which reads as the login silently doing
  // nothing right before the SSO handoff.
  const [isRedirecting, setIsRedirecting] = useState(false)
  const [openedNewTab, setOpenedNewTab] = useState(false)
  // Set only right when the tab we're opening is specifically the PV onboarding-payment
  // one (see handlePasswordSubmit's returnToParam branch) — never for the tx (SAML
  // relay) or redirectUrl (auto-redirect SP) branches. Distinguishes that one case from
  // every other login that also opens a tab, without relying on the polled user's
  // accountStatus (which is broader than just "currently doing the onboarding tab flow").
  const [isOnboardingPaymentFlow, setIsOnboardingPaymentFlow] = useState(false)

  const [startLogin, { isLoading: isStartingLogin }] = useStartLoginMutation()
  const [verifyLogin, { isLoading: isVerifying }] = useVerifyLoginMutation()
  const [logoutMutation] = useLogoutMutation()

  // Holds the real (SSO-authenticated) tab's Window reference so it can be closed once
  // payment completion is detected below, instead of leaving it open in the background.
  const realTabRef = useRef<Window | null>(null)

  // While waiting on the PV tab, poll our own session instead of relying on PV's own
  // post-submit page behavior (a different domain we don't control) — once the payment
  // webhook lands, onboardingPaymentAgreementAt flips and we can bring the member back
  // into the portal ourselves.
  const { data: meData } = useGetMeQuery(undefined, { pollingInterval: 3000, skip: !(isRedirecting && openedNewTab) })
  const meUser = meData?.data?.user
  const isPendingMembership = meUser?.accountStatus === 'pending_membership'
  const paymentCompleted = !!meUser?.onboardingPaymentAgreementAt

  useEffect(() => {
    // Gated on isOnboardingPaymentFlow too (not just paymentCompleted) — otherwise this
    // fires for ANY regular member's normal SSO login through the tab-opening flow
    // below, since a long-since-onboarded active member also has
    // onboardingPaymentAgreementAt already set. Without this gate, every ordinary login
    // that opens a new tab gets immediately logged out and its tab closed the moment the
    // poll below returns, not just the PV onboarding-payment case this is meant for.
    if (!isOnboardingPaymentFlow || !paymentCompleted) return
    // Onboarding payment is a one-time event — once it's done, close the PV tab and
    // send the member back to /login for a fresh, real login instead of silently
    // continuing into /dashboard on this session (see change-password/index.tsx's same
    // reasoning for why a real login, not an auto-continuation, is required here).
    realTabRef.current?.close()
    const timer = setTimeout(async () => {
      try {
        await logoutMutation().unwrap()
      } catch {
        // Best-effort — even if the server call fails, still clear local auth state
        // and send them to /login below so they don't appear to still be signed in.
      }
      dispatch(logout())
      navigate('/login')
    }, 1500)
    return () => clearTimeout(timer)
  }, [isOnboardingPaymentFlow, paymentCompleted, navigate, dispatch, logoutMutation])

  const emailForm = useForm<EmailFormData>()
  const passwordForm = useForm<PasswordFormData>()

  // `isVerifying`/`isStartingLogin` from RTK Query only flip true after the mutation is
  // dispatched — a fast double-click or Enter+click landing in the same tick can slip a
  // second submit in before React re-renders the disabled button. These refs are set
  // synchronously, so the second call is blocked immediately regardless of render timing.
  const isSubmittingEmailRef = useRef(false)
  const isSubmittingPasswordRef = useRef(false)

  const handleEmailSubmit = async (data: EmailFormData) => {
    if (isSubmittingEmailRef.current) return
    isSubmittingEmailRef.current = true
    try {
      const result = await startLogin({ email: data.email }).unwrap()
      if (!result.data) {
        throw new Error('Invalid response from server')
      }
      setEmail(data.email)
      setRequestId(result.data.request_id)
      setStep('password')
    } catch (error: unknown) {
      const err = error as { data?: { message?: string } }
      toast.error(err.data?.message || 'Something went wrong. Please try again.')
    } finally {
      isSubmittingEmailRef.current = false
    }
  }

  // Closes the fake tab once its own page has actually finished loading (or after
  // redirectTab.ts's load-wait cap, whichever comes first — see getRedirectTabLoadPromise),
  // then opens a brand new tab pointed at the real (SAML) URL — the fake tab and the
  // real one are never the same window, so nothing SAML-related runs against the fake
  // tab in the background while it's up. A fixed timer here previously could swap it out
  // before the fake page had actually rendered on a slow connection. Falls back to a
  // same-tab redirect if there was no fake tab to begin with, or if this second
  // window.open() gets popup-blocked — a fresh window.open() called here isn't a direct
  // synchronous continuation of the original click (it's after the verify request + the
  // load wait), so most browsers may block it even though the first one succeeded.
  const navigateTab = async (tab: Window | null, url: string) => {
    if (tab) {
      await getRedirectTabLoadPromise()
      tab.close()
      const realTab = window.open(url, '_blank')
      if (realTab) {
        realTabRef.current = realTab
        setOpenedNewTab(true)
      } else {
        window.location.assign(url)
      }
    } else {
      window.location.assign(url)
    }
    clearRedirectTab()
    setIsRedirecting(true)
  }

  const handlePasswordSubmit = async (data: PasswordFormData) => {
    if (isSubmittingPasswordRef.current) return
    isSubmittingPasswordRef.current = true
    const redirectTab = getRedirectTab()
    try {
      const result = await verifyLogin({
        request_id: requestId,
        password: data.password,
      }).unwrap()

      if (!result.data) {
        throw new Error('Invalid response from server')
      }

      const user = result.data.user
      const redirectUrl = result.data.redirectUrl
      const sessionId = result.data.sessionId

      // Update Redux auth state
      dispatch(loginSuccess({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
        redirectUrl,
        sessionId,
        membershipAgreementSignedAt: user.membershipAgreementSignedAt,
        isPendingMembership: user.accountStatus === 'pending_membership',
      }))

      // Check if user needs to reset password
      if (user.mustResetPassword) {
        // Deliberately NOT closing/clearing the tab here — change-password reuses
        // this same one (getRedirectTab()) instead of opening a second one, so the
        // flow only ever opens one tab total instead of one per step.
        // Preserve tx (SAML flow) and returnTo (plain post-login redirect, e.g. the
        // onboarding payment form gate) so change-password can send them on afterward —
        // dropping either here would strand a first-time login at /dashboard instead.
        // returnTo is only carried forward while payment is still actually pending —
        // same stale-link reasoning as handlePasswordSubmit's stillNeedsOnboardingPayment
        // below (a mustResetPassword reset for someone who already finished onboarding
        // shouldn't get bounced back to PV just because they clicked an old email link).
        const stillNeedsOnboardingPayment = user.accountStatus === 'pending_membership' && !user.onboardingPaymentAgreementAt
        const changePwdParams = new URLSearchParams()
        if (txQueryParam) changePwdParams.set('tx', txQueryParam)
        if (returnToParam && stillNeedsOnboardingPayment) changePwdParams.set('returnTo', returnToParam)
        const changePwdQuery = changePwdParams.toString()
        navigate(changePwdQuery ? `/change-password?${changePwdQuery}` : '/change-password')
        return
      }

      // Handle SAML flow or regular navigation
      // `returnToParam` is baked statically into the onboarding email link at send
      // time — it never updates, so a member who already finished Payment & Agreement
      // (or whose accountStatus is no longer pending_membership) but clicks that same
      // old email link again would otherwise get bounced straight back to PV every
      // time. Only honor it while it's still actually true that they belong there;
      // `redirectUrl` below already reflects this same live check from the backend
      // (see handleVerifyLogin's pendingOnboardingRedirectUrl), so falling through to
      // it (or to /dashboard) once payment is done is the correct outcome, not a bug.
      const stillNeedsOnboardingPayment = user.accountStatus === 'pending_membership' && !user.onboardingPaymentAgreementAt
      if (txQueryParam) {
        await navigateTab(redirectTab, `${import.meta.env.VITE_API_URL}/saml/continue?tx=${txQueryParam}`)
      } else if (returnToParam && stillNeedsOnboardingPayment) {
        // Back to SAML/SSO (2026-09-23) — PV changed this survey to "Registered Member
        // Only", so a plain link no longer works, an actual PV session is required again.
        setIsOnboardingPaymentFlow(true)
        await navigateTab(redirectTab, returnToParam)
      } else if (redirectUrl) {
        await navigateTab(redirectTab, redirectUrl)
      } else {
        redirectTab?.close()
        clearRedirectTab()
        navigate('/dashboard')
      }
    } catch (error: unknown) {
      redirectTab?.close()
      clearRedirectTab()
      const err = error as { data?: { message?: string }; message?: string }
      toast.error(err.data?.message || err.message || 'Invalid credentials. Please try again.')
    } finally {
      isSubmittingPasswordRef.current = false
    }
  }

  const handleBack = () => {
    setStep('email')
    setRequestId('')
    passwordForm.reset()
  }

  if (isRedirecting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="flex flex-col items-center gap-4 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-brand" />
          <p className="text-gray-600">
            {paymentCompleted
              ? 'Payment completed! Please log in again to continue.'
              : isPendingMembership && openedNewTab
                ? "Complete the payment form in the new tab that just opened — we'll bring you back here automatically once it's done."
                : openedNewTab
                  ? 'Continue in the new tab that just opened.'
                  : 'Redirecting you, please wait...'}
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
          <h2 className="text-3xl font-bold mb-2">Welcome Back!</h2>
          <p className="text-gray-600 text-base">
            Log in to access your personalized<br />customer portal
          </p>
        </div>

        {step === 'email' ? (
          // Step 1: Email Input
          <form onSubmit={emailForm.handleSubmit(handleEmailSubmit)} className="space-y-6">
            <div>
              <Label htmlFor="email" className="text-sm font-medium text-gray-700">
                Email or Username
              </Label>
              <div className="mt-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-400" />
                </div>
                <Input
                  id="email"
                  type="text"
                  placeholder="john.doe@example.com or username"
                  className="w-full pl-10 pr-3 py-4 border-gray-300 h-12"
                  disabled={isStartingLogin}
                  {...emailForm.register('email', {
                    required: 'Email or username is required',
                  })}
                />
              </div>
              {emailForm.formState.errors.email && (
                <p className="mt-1 text-sm text-red-600">
                  {emailForm.formState.errors.email.message}
                </p>
              )}
            </div>

            <Button
              type="submit"
              disabled={isStartingLogin}
              className="w-full py-4 h-12 bg-brand hover:bg-brand-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-md"
            >
              {isStartingLogin ? (
                <div className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Please wait...
                </div>
              ) : (
                'Next'
              )}
            </Button>

            <div className="text-center">
              <Link to="/forgot-password" className="text-sm text-brand hover:underline">
                Forgot Password?
              </Link>
            </div>
          </form>
        ) : (
          // Step 2: Password/OTP Input
          <form
            onSubmit={(e) => {
              // Must run before passwordForm.handleSubmit's own async validation —
              // window.open() called after an `await` is treated as an untrusted
              // popup by most browsers and gets silently blocked or force-closed, so
              // this can't wait on verifyLogin's response to know the account status.
              // Opens straight at the live PV payment form (rather than about:blank) so
              // the tab shows a real destination immediately instead of a blank page —
              // it gets pointed at the actual SAML relay URL once the request resolves
              // (see getRedirectTabLoadPromise below), this just changes what's visible while
              // that's in flight. Matches the backend's ONBOARDING_PAYMENT_FORM_URL
              // default (onboardingController.ts). Deliberate, accepted tradeoff: if this
              // browser already holds a stale PV session cookie from a different member
              // tested moments earlier, this tab briefly shows THEIR form, not a blank
              // page — confirmed and reaccepted after weighing it against the plainer
              // about:blank placeholder this replaced.
              // Opens for a SAML relay (tx) — always a real password (an already-active
              // member) — OR a pending-payment redirect (returnTo) but ONLY when
              // `passwordJustSetParam` confirms this is the revisit after change-password,
              // not a brand-new member's very first pass through this same step (still
              // their OTP there, not a password — `returnTo` alone is present on both
              // visits, since it's carried through every hop, so it can't tell them apart
              // by itself; passwordJustSetParam is the one thing that's only ever set on
              // the second, guaranteed-real-password visit).
              // This tab must actually open and load before the SAML/SSO request is
              // allowed to proceed — PV changed this survey to "Registered Member Only"
              // (2026-09-23), so a real PV session (via this SAML SSO) is required again
              // to reach it. If the browser blocks this window.open(), the submission is
              // aborted here entirely rather than silently falling through.
              if (txQueryParam || (returnToParam && passwordJustSetParam)) {
                const tab = openRedirectTab('https://member.mhubchicago.com/form/20611')
                if (!tab) {
                  e.preventDefault()
                  toast.error('Please allow pop-ups for this site, then try signing in again.')
                  return
                }
              }
              return passwordForm.handleSubmit(handlePasswordSubmit)(e)
            }}
            className="space-y-6"
          >
            {/* Back button with email display */}
            <button
              type="button"
              onClick={handleBack}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="text-sm">{email}</span>
            </button>

            <div>
              <Label htmlFor="password" className="text-sm font-medium text-gray-700">
                Password
              </Label>
              <div className="mt-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  className="w-full pl-10 pr-10 py-4 border-gray-300 h-12"
                  disabled={isVerifying}
                  autoFocus
                  {...passwordForm.register('password', {
                    required: 'Password is required',
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
              {passwordForm.formState.errors.password && (
                <p className="mt-1 text-sm text-red-600">
                  {passwordForm.formState.errors.password.message}
                </p>
              )}
            </div>

            {/* OTP Info Message */}
            <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
              <Info className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-blue-700">
                If this is your first time logging in, check your email for a one-time password.
              </p>
            </div>

            <Button
              type="submit"
              disabled={isVerifying}
              className="w-full py-4 h-12 bg-brand hover:bg-brand-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-md"
            >
              {isVerifying ? (
                <div className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing in...
                </div>
              ) : (
                'Sign in'
              )}
            </Button>

            <div className="text-center">
              <Link to="/forgot-password" className="text-sm text-brand hover:underline">
                Forgot Password?
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
