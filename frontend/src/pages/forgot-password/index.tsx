import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForgotPasswordMutation, useVerifyLoginMutation } from '@/store/api/authApi'
import { useAppDispatch } from '@/store'
import { loginSuccess } from '@/store/slices/authSlice'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { Mail, ArrowLeft, Lock, Eye, EyeOff, Loader2, Info } from 'lucide-react'

type ForgotPasswordStep = 'email' | 'otp'

interface EmailFormData {
  email: string
}

interface OTPFormData {
  otp: string
}

export function ForgotPasswordPage() {
  const navigate = useNavigate()
  const dispatch = useAppDispatch()

  const [step, setStep] = useState<ForgotPasswordStep>('email')
  const [email, setEmail] = useState('')
  const [requestId, setRequestId] = useState('')
  const [showOTP, setShowOTP] = useState(false)

  const [forgotPassword, { isLoading: isSendingOTP }] = useForgotPasswordMutation()
  const [verifyLogin, { isLoading: isVerifying }] = useVerifyLoginMutation()

  const emailForm = useForm<EmailFormData>()
  const otpForm = useForm<OTPFormData>()

  const handleEmailSubmit = async (data: EmailFormData) => {
    try {
      const result = await forgotPassword({ email: data.email }).unwrap()
      if (!result.data) {
        throw new Error('Invalid response from server')
      }
      setEmail(data.email)
      setRequestId(result.data.request_id)
      setStep('otp')
      toast.success('A one-time password has been sent to your email')
    } catch (error: unknown) {
      const err = error as { data?: { message?: string } }
      toast.error(err.data?.message || 'Something went wrong. Please try again.')
    }
  }

  const handleOTPSubmit = async (data: OTPFormData) => {
    try {
      const result = await verifyLogin({
        request_id: requestId,
        password: data.otp,
      }).unwrap()

      if (!result.data) {
        throw new Error('Invalid response from server')
      }

      const user = result.data.user
      const redirectUrl = result.data.redirectUrl

      // Update Redux auth state
      dispatch(loginSuccess({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
        redirectUrl,
      }))

      // User is now logged in - redirect to change password
      navigate('/change-password')
    } catch (error: unknown) {
      const err = error as { data?: { message?: string } }
      toast.error(err.data?.message || 'Invalid code. Please try again.')
    }
  }

  const handleBack = () => {
    setStep('email')
    setRequestId('')
    otpForm.reset()
  }

  const handleResendOTP = async () => {
    try {
      const result = await forgotPassword({ email }).unwrap()
      if (!result.data) {
        throw new Error('Invalid response from server')
      }
      setRequestId(result.data.request_id)
      toast.success('A new one-time password has been sent to your email')
    } catch (error: unknown) {
      const err = error as { data?: { message?: string } }
      toast.error(err.data?.message || 'Failed to resend code. Please try again.')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <img src="/logo.png" alt="MHUB Logo" className="h-10 mx-auto mb-8" />
          <h2 className="text-3xl font-bold text-gray-900 mb-2">
            {step === 'email' ? 'Forgot Password?' : 'Enter Verification Code'}
          </h2>
          <p className="text-gray-600">
            {step === 'email'
              ? "No worries! Enter your email and we'll send you a one-time password."
              : `We've sent a verification code to ${email}`}
          </p>
        </div>

        {step === 'email' ? (
          // Step 1: Email Input
          <form onSubmit={emailForm.handleSubmit(handleEmailSubmit)} className="space-y-6">
            <div>
              <Label htmlFor="email" className="text-sm font-medium text-gray-700">
                Email Address
              </Label>
              <div className="mt-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-400" />
                </div>
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter your email"
                  className="w-full pl-10 pr-3 py-4 border-gray-300 h-12"
                  disabled={isSendingOTP}
                  {...emailForm.register('email', {
                    required: 'Email is required',
                    pattern: {
                      value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                      message: 'Please enter a valid email address',
                    },
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
              disabled={isSendingOTP}
              className="w-full py-4 h-12 bg-brand hover:bg-brand-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-md"
            >
              {isSendingOTP ? (
                <div className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sending code...
                </div>
              ) : (
                'Send Code'
              )}
            </Button>

            <div className="text-center">
              <Link
                to="/login"
                className="inline-flex items-center text-sm text-brand hover:underline font-medium"
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back to Sign In
              </Link>
            </div>
          </form>
        ) : (
          // Step 2: OTP Input
          <form onSubmit={otpForm.handleSubmit(handleOTPSubmit)} className="space-y-6">
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
              <Label htmlFor="otp" className="text-sm font-medium text-gray-700">
                One-Time Password
              </Label>
              <div className="mt-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <Input
                  id="otp"
                  type={showOTP ? 'text' : 'password'}
                  placeholder="Enter the code from your email"
                  className="w-full pl-10 pr-10 py-4 border-gray-300 h-12"
                  disabled={isVerifying}
                  autoFocus
                  {...otpForm.register('otp', {
                    required: 'Please enter the code',
                  })}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={() => setShowOTP(!showOTP)}
                >
                  {showOTP ? (
                    <EyeOff className="h-5 w-5 text-gray-400" />
                  ) : (
                    <Eye className="h-5 w-5 text-gray-400" />
                  )}
                </button>
              </div>
              {otpForm.formState.errors.otp && (
                <p className="mt-1 text-sm text-red-600">
                  {otpForm.formState.errors.otp.message}
                </p>
              )}
            </div>

            {/* Info Message */}
            <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
              <Info className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-blue-700">
                Check your email inbox and spam folder for the verification code.
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
                  Verifying...
                </div>
              ) : (
                'Verify Code'
              )}
            </Button>

            <div className="text-center text-sm text-gray-600">
              Didn't receive the code?{' '}
              <button
                type="button"
                onClick={handleResendOTP}
                disabled={isSendingOTP}
                className="text-brand hover:underline font-medium disabled:opacity-50"
              >
                {isSendingOTP ? 'Sending...' : 'Resend code'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
