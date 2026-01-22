import { useNavigate } from 'react-router-dom'
import { useChangePasswordMutation } from '@/store/api/authApi'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { Eye, EyeOff, Lock, Loader2, ShieldCheck } from 'lucide-react'
import { useState } from 'react'

interface ChangePasswordFormData {
  password: string
  confirmPassword: string
}

export function ChangePasswordPage() {
  const txQueryParam = new URLSearchParams(window.location.search).get('tx')
  const navigate = useNavigate()
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const [changePassword, { isLoading }] = useChangePasswordMutation()

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ChangePasswordFormData>()

  const password = watch('password')

  const onSubmit = async (data: ChangePasswordFormData) => {
    try {
      await changePassword({ password: data.password }).unwrap()
      toast.success('Password changed successfully!')

      // Handle SAML flow or regular navigation
      if (txQueryParam) {
        window.location.assign(`${import.meta.env.VITE_API_URL}/saml/continue?tx=${txQueryParam}`)
      } else {
        navigate('/dashboard')
      }
    } catch (error: unknown) {
      const err = error as { data?: { message?: string } }
      toast.error(err.data?.message || 'Failed to change password. Please try again.')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src="/logo.png" alt="MHUB Logo" className="h-10 mx-auto mb-8" />
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-[#D30046]/10 rounded-full">
              <ShieldCheck className="h-8 w-8 text-[#D30046]" />
            </div>
          </div>
          <h2 className="text-3xl font-bold mb-2">Set Your Password</h2>
          <p className="text-gray-600 text-base">
            Please create a new password for your account
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
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
            className="w-full py-4 h-12 bg-[#D30046] hover:bg-[#B8003C] disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-md"
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
