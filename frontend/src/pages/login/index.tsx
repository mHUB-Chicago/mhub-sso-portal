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
  // From /login/start — decide, before Step 2 is submitted, whether this login will end
  // in an SSO into PV (and so needs the pre-opened tab first). See the password form's onSubmit.
  const [peopleVineLandingUrl, setPeopleVineLandingUrl] = useState<string | null>(null)
  const [requiresOtp, setRequiresOtp] = useState(false)
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
  // Set once the onboarding payment is detected AND the session has been torn down —
  // switches this page to a static final message (no spinner, no route back to the form).
  const [onboardingDone, setOnboardingDone] = useState(false)
  // Run-once guard for the teardown below — a ref (not effect cleanup) so a re-render
  // from the still-running poll can't abort the logout halfway and strand the spinner.
  const onboardingTeardownStartedRef = useRef(false)

  const [startLogin, { isLoading: isStartingLogin }] = useStartLoginMutation()
  const [verifyLogin, { isLoading: isVerifying }] = useVerifyLoginMutation()
  const [logoutMutation] = useLogoutMutation()

  // Holds the real (SSO-authenticated) tab's Window reference. Deliberately NOT closed
  // on payment completion — that tab is sitting on PV's "Thank You" page, which is
  // where the member should end up.
  const realTabRef = useRef<Window | null>(null)

  // While waiting on the PV tab, poll our own session instead of relying on PV's own
  // post-submit page behavior (a different domain we don't control) — once the payment
  // webhook lands, onboardingPaymentAgreementAt flips and we can bring the member back
  // into the portal ourselves.
  const { data: meData } = useGetMeQuery(undefined, { pollingInterval: 3000, skip: !(isRedirecting && openedNewTab) || onboardingDone })
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
    if (!isOnboardingPaymentFlow || !paymentCompleted || onboardingTeardownStartedRef.current) return
    onboardingTeardownStartedRef.current = true
    // Onboarding payment is a one-time event, and the member has no membership yet
    // (mHUB staff set it up afterward), so there's nothing to log back in to. End the
    // session here and leave the member on PV's "Thank You" tab — no redirect to /login.
    // The session is cleared (server + local) BEFORE the final message shows, so a
    // refresh of this tab lands on a logged-out login form, never back in the flow.
    ;(async () => {
      try {
        await logoutMutation().unwrap()
      } catch {
        // Best-effort — even if the server call fails, still clear local auth state.
      }
      dispatch(logout())
      setOnboardingDone(true)
      // Browsers only honor this for script-opened tabs; this one was usually opened by
      // the member (email link / typed URL), so it typically stays open showing the
      // final message below.
      window.close()
    })()
  }, [isOnboardingPaymentFlow, paymentCompleted, dispatch, logoutMutation])

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
      const result = await startLogin({ email: data.email, tx: txQueryParam ?? undefined }).unwrap()
      if (!result.data) {
        throw new Error('Invalid response from server')
      }
      setEmail(data.email)
      setRequestId(result.data.request_id)
      setPeopleVineLandingUrl(result.data.peopleVineLandingUrl)
      setRequiresOtp(result.data.requiresOtp)
      setStep('password')
    } catch (error: unknown) {
      const err = error as { data?: { message?: string } }
      toast.error(err.data?.message || 'Something went wrong. Please try again.')
    } finally {
      isSubmittingEmailRef.current = false
    }
  }

  // Once the pre-opened tab's PV landing page has loaded (getRedirectTabLoadPromise),
  // points that same tab at the real (SAML) URL. Navigating an existing
  // Window isn't subject to popup-blocking, unlike a fresh window.open() this late (after
  // the verify request, no longer a direct continuation of the click). Falls back to a
  // same-tab redirect if there was no pre-opened tab.
  const navigateTab = async (tab: Window | null, url: string) => {
    if (tab && !tab.closed) {
      await getRedirectTabLoadPromise()
      tab.location.href = url
      realTabRef.current = tab
      setOpenedNewTab(true)
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
      // Nothing SSO-related runs until the pre-opened tab is ready — not even
      // verifyLogin. Throws (caught below) if it was closed or never loaded.
      if (redirectTab) await getRedirectTabLoadPromise()
      const verify = (id: string) => verifyLogin({ request_id: id, password: data.password }).unwrap()
      let result
      try {
        result = await verify(requestId)
      } catch (error: unknown) {
        // A login request only lives 15 minutes, so a tab left open on this step used to
        // reject even the right password. For a password login, start a fresh request and
        // retry once — not for a one-time password, where a restart emails a new code
        // that invalidates the one just typed.
        // SERVER_ERROR gets the same one retry: a transient backend crash (e.g. Prisma's
        // WASM engine running out of memory) resets on the server, so a fresh request
        // usually succeeds — and a half-completed verify would now read as expired anyway.
        const code = (error as { code?: string }).code
        if ((code !== 'LOGIN_EXPIRED' && code !== 'SERVER_ERROR') || requiresOtp) throw error
        const restarted = await startLogin({ email, tx: txQueryParam ?? undefined }).unwrap()
        if (!restarted.data) throw error
        setRequestId(restarted.data.request_id)
        result = await verify(restarted.data.request_id)
      }

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
        // A plain /login (no returnTo, e.g. right after Set Password) still lands a
        // pending member on the payment form via the backend's redirectUrl — flag it
        // the same way so the payment-completed teardown above actually runs.
        if (stillNeedsOnboardingPayment) setIsOnboardingPaymentFlow(true)
        await navigateTab(redirectTab, redirectUrl)
      } else {
        redirectTab?.close()
        clearRedirectTab()
        navigate('/dashboard')
      }
    } catch (error: unknown) {
      redirectTab?.close()
      clearRedirectTab()
      const err = error as { data?: { message?: string }; message?: string; code?: string }
      toast.error(err.data?.message || err.message || 'Invalid credentials. Please try again.')
      // An expired one-time-password login can't be retried in place — send them back
      // to request a new code.
      if (err.code === 'LOGIN_EXPIRED') handleBack()
    } finally {
      isSubmittingPasswordRef.current = false
    }
  }

  const handleBack = () => {
    setStep('email')
    setRequestId('')
    passwordForm.reset()
  }

  if (onboardingDone) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md text-center">
          <img src="/logo.png" alt="MHUB Logo" className="h-10 mx-auto mb-8" />
          <h2 className="text-2xl font-semibold mb-3">Thank you!</h2>
          <p className="text-gray-600">
            We've received your payment and agreement. The mHUB team will reach out with next steps once your membership is set up.
          </p>
          <p className="text-gray-500 text-sm mt-4">You can close this tab.</p>
        </div>
      </div>
    )
  }

  if (isRedirecting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="flex flex-col items-center gap-4 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-brand" />
          <p className="text-gray-600">
            {isOnboardingPaymentFlow && paymentCompleted
              ? 'Payment received, finishing up...'
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
                  autoComplete="username"
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
              // Opens ONLY when this login ends in an SSO into PV (peopleVineLandingUrl,
              // from /login/start) — and never on an access-code pass (requiresOtp), which
              // goes on to change-password instead of SSO. PV ignores RelayState and lands
              // on the last PV page viewed in this browser, so the tab loads the landing
              // page first (the payment form while it's pending, PV home otherwise) and
              // only then runs the SSO. Without that, one visit to the payment form made
              // every later PV login in this browser land on it.
              // If the browser blocks this window.open(), the submission is aborted here
              // entirely rather than silently falling through.
              if (!requiresOtp && peopleVineLandingUrl) {
                const tab = openRedirectTab(peopleVineLandingUrl)
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

            {/* Password managers pick which saved password to fill from the username in
                the same form. This step had none, so browsers guessed — often filling an
                old password or another environment's, which then tripped the lockout. */}
            <input type="text" name="username" autoComplete="username" value={email} readOnly hidden />

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
                  autoComplete={requiresOtp ? 'one-time-code' : 'current-password'}
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
