import { useNavigate, Link } from 'react-router-dom'
import { useStartLoginMutation, useVerifyLoginMutation, useGetMeQuery, useLogoutMutation } from '@/store/api/authApi'
import { useAppDispatch } from '@/store'
import { loginSuccess, logout } from '@/store/slices/authSlice'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { Eye, EyeOff, Mail, Lock, Loader2, ArrowLeft, Info, AlertCircle } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { openRedirectTab, getRedirectTab, getRedirectTabLoadPromise, clearRedirectTab } from '@/utils/redirectTab'
import { getPeopleVineSsoUrl, PEOPLEVINE_ROOT_URL } from '@/utils/peopleVine'

type LoginStep = 'email' | 'password'

interface EmailFormData {
  email: string
}

interface PasswordFormData {
  password: string
}

export function LoginPage() {
  const [txQueryParam] = useState(() => new URLSearchParams(window.location.search).get('tx'))
  const [returnToParam] = useState(() => new URLSearchParams(window.location.search).get('returnTo'))
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
  const [peopleVineLandingUrl, setPeopleVineLandingUrl] = useState<string | null>(null)
  // A regular member's login that ends in PV (landing on PV's root, not the onboarding
  // payment form): go there in this tab via PV's SSO script instead of a pre-opened tab.
  const peopleVineSsoUrl = peopleVineLandingUrl === PEOPLEVINE_ROOT_URL ? getPeopleVineSsoUrl() : null
  const [requiresOtp, setRequiresOtp] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [isRedirecting, setIsRedirecting] = useState(false)
  const [openedNewTab, setOpenedNewTab] = useState(false)
  const [isOnboardingPaymentFlow, setIsOnboardingPaymentFlow] = useState(false)
  const [onboardingDone, setOnboardingDone] = useState(false)
  // Shown inline rather than as a toast: retrying won't fix it, and a toast vanishes
  // before people read it.
  const [inactiveMessage, setInactiveMessage] = useState<string | null>(null)
  const onboardingTeardownStartedRef = useRef(false)

  const [startLogin, { isLoading: isStartingLogin }] = useStartLoginMutation()
  const [verifyLogin, { isLoading: isVerifying }] = useVerifyLoginMutation()
  const [logoutMutation] = useLogoutMutation()

  const realTabRef = useRef<Window | null>(null)

  const { data: meData } = useGetMeQuery(undefined, { pollingInterval: 3000, skip: !(isRedirecting && openedNewTab) || onboardingDone })
  const meUser = meData?.data?.user
  const isPendingMembership = meUser?.accountStatus === 'pending_membership'
  const paymentCompleted = !!meUser?.onboardingPaymentAgreementAt

  useEffect(() => {
    if (!isOnboardingPaymentFlow || !paymentCompleted || onboardingTeardownStartedRef.current) return
    onboardingTeardownStartedRef.current = true
    ;(async () => {
      try {
        await logoutMutation().unwrap()
      } catch {
        // Best-effort — even if the server call fails, still clear local auth state.
      }
      dispatch(logout())
      setOnboardingDone(true)
      window.close()
    })()
  }, [isOnboardingPaymentFlow, paymentCompleted, dispatch, logoutMutation])

  const emailForm = useForm<EmailFormData>()
  const passwordForm = useForm<PasswordFormData>()

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
      if (redirectTab) await getRedirectTabLoadPromise()
      const verify = (id: string) => verifyLogin({ request_id: id, password: data.password }).unwrap()
      let result
      try {
        result = await verify(requestId)
      } catch (error: unknown) {
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

      if (user.mustResetPassword) {
        const stillNeedsOnboardingPayment = user.accountStatus === 'pending_membership' && !user.onboardingPaymentAgreementAt
        const changePwdParams = new URLSearchParams()
        if (txQueryParam) changePwdParams.set('tx', txQueryParam)
        if (returnToParam && stillNeedsOnboardingPayment) changePwdParams.set('returnTo', returnToParam)
        const changePwdQuery = changePwdParams.toString()
        navigate(changePwdQuery ? `/change-password?${changePwdQuery}` : '/change-password')
        return
      }

      const stillNeedsOnboardingPayment = user.accountStatus === 'pending_membership' && !user.onboardingPaymentAgreementAt
      if (peopleVineSsoUrl && !stillNeedsOnboardingPayment) {
        // Replaces a PV-initiated tx too: PV's script starts a fresh SSO from its login page.
        setIsRedirecting(true)
        window.location.assign(peopleVineSsoUrl)
      } else if (txQueryParam) {
        await navigateTab(redirectTab, `${import.meta.env.VITE_API_URL}/saml/continue?tx=${txQueryParam}`)
      } else if (returnToParam && stillNeedsOnboardingPayment) {
        setIsOnboardingPaymentFlow(true)
        await navigateTab(redirectTab, returnToParam)
      } else if (redirectUrl) {
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
      if (err.code === 'ACCOUNT_INACTIVE') {
        setInactiveMessage(err.message || 'Your account is inactive. Please contact an admin.')
        return
      }
      toast.error(err.data?.message || err.message || 'Invalid credentials. Please try again.')
      if (err.code === 'LOGIN_EXPIRED') handleBack()
    } finally {
      isSubmittingPasswordRef.current = false
    }
  }

  const handleBack = () => {
    setStep('email')
    setRequestId('')
    setInactiveMessage(null)
    passwordForm.reset()
  }

  if (onboardingDone) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md text-center">
          <img src="/logo.png" alt="mHUB Logo" className="h-10 mx-auto mb-8" />
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
          <img src="/logo.png" alt="mHUB Logo" className="h-10 mx-auto mb-8" />
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
              if (!requiresOtp && peopleVineLandingUrl && !peopleVineSsoUrl) {
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

            {inactiveMessage ? (
              <div role="alert" className="flex items-start gap-2 p-3 bg-red-50 border-2 border-red-500 rounded-md">
                <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-base font-bold text-red-700">{inactiveMessage}</p>
              </div>
            ) : (
              // OTP Info Message — red/bold because people kept missing it. Hidden once
              // the account is known to be inactive, where it'd only compete with that.
              <div className="flex items-start gap-2 p-3 bg-red-50 border-2 border-red-500 rounded-md">
                <Info className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-base font-bold text-red-700">
                  If this is your first time logging in, check your email for a one-time password.
                </p>
              </div>
            )}

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
