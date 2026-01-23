import { useNavigate, Link } from 'react-router-dom'
import { useStartLoginMutation, useVerifyLoginMutation } from '@/store/api/authApi'
import { useAppDispatch } from '@/store'
import { loginSuccess } from '@/store/slices/authSlice'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { Eye, EyeOff, Mail, Lock, Loader2, ArrowLeft, Info } from 'lucide-react'
import { useState } from 'react'

type LoginStep = 'email' | 'password'

interface EmailFormData {
  email: string
}

interface PasswordFormData {
  password: string
}

export function LoginPage() {
  const txQueryParam = new URLSearchParams(window.location.search).get('tx')
  const navigate = useNavigate()
  const dispatch = useAppDispatch()

  const [step, setStep] = useState<LoginStep>('email')
  const [email, setEmail] = useState('')
  const [requestId, setRequestId] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const [startLogin, { isLoading: isStartingLogin }] = useStartLoginMutation()
  const [verifyLogin, { isLoading: isVerifying }] = useVerifyLoginMutation()

  const emailForm = useForm<EmailFormData>()
  const passwordForm = useForm<PasswordFormData>()

  const handleEmailSubmit = async (data: EmailFormData) => {
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
    }
  }

  const handlePasswordSubmit = async (data: PasswordFormData) => {
    try {
      const result = await verifyLogin({
        request_id: requestId,
        password: data.password,
      }).unwrap()

      if (!result.data) {
        throw new Error('Invalid response from server')
      }

      const user = result.data.user

      // Update Redux auth state
      dispatch(loginSuccess({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      }))

      // Check if user needs to reset password
      if (user.mustResetPassword) {
        // Preserve tx param for SAML flow
        const changePwdUrl = txQueryParam
          ? `/change-password?tx=${txQueryParam}`
          : '/change-password'
        navigate(changePwdUrl)
        return
      }

      // Handle SAML flow or regular navigation
      if (txQueryParam) {
        window.location.assign(`${import.meta.env.VITE_API_URL}/saml/continue?tx=${txQueryParam}`)
      } else {
        navigate('/dashboard')
      }
    } catch (error: unknown) {
      const err = error as { data?: { message?: string }; message?: string }
      toast.error(err.data?.message || err.message || 'Invalid credentials. Please try again.')
    }
  }

  const handleBack = () => {
    setStep('email')
    setRequestId('')
    passwordForm.reset()
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
                Email
              </Label>
              <div className="mt-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-400" />
                </div>
                <Input
                  id="email"
                  type="email"
                  placeholder="john.doe@example.com"
                  className="w-full pl-10 pr-3 py-4 border-gray-300 h-12"
                  disabled={isStartingLogin}
                  {...emailForm.register('email', {
                    required: 'Email is required',
                    pattern: {
                      value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                      message: 'Please enter a valid email address'
                    }
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
              className="w-full py-4 h-12 bg-[#D30046] hover:bg-[#B8003C] disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-md"
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
              <Link to="/forgot-password" className="text-sm text-[#D30046] hover:underline">
                Forgot Password?
              </Link>
            </div>
          </form>
        ) : (
          // Step 2: Password/OTP Input
          <form onSubmit={passwordForm.handleSubmit(handlePasswordSubmit)} className="space-y-6">
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
              className="w-full py-4 h-12 bg-[#D30046] hover:bg-[#B8003C] disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-md"
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
              <Link to="/forgot-password" className="text-sm text-[#D30046] hover:underline">
                Forgot Password?
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
