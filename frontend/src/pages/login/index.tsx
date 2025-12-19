import { useNavigate, Link } from 'react-router-dom'
import { useAppDispatch } from '@/store'
import { loginSuccess } from '@/store/slices/authSlice'
import { useLoginMutation } from '@/store/api/authApi'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { Eye, EyeOff, Mail, Lock, Loader2 } from 'lucide-react'
import { useState } from 'react'

interface LoginFormData {
  email: string
  password: string
}

export function LoginPage() {
  const txQueryParam = new URLSearchParams(window.location.search).get('tx')
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const [showPassword, setShowPassword] = useState(false)
  const { register, handleSubmit, formState: { errors } } = useForm<LoginFormData>()
  const [login, { isLoading }] = useLoginMutation()

  const onSubmit = async (data: LoginFormData) => {
    try {
      const loginResult = await fetch(`${import.meta.env.VITE_API_URL}/api/user/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      }).then(res => res.json());
      if (txQueryParam) {
        window.location.assign(`${import.meta.env.VITE_API_URL}/saml/continue?tx=${txQueryParam}`);
      } else {
        navigate('/dashboard')
      }
    } catch (error: any) {
      toast.error(error.data?.message || 'Invalid email or password')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src="/logo.png" alt="MHUB Logo" className="h-10 mx-auto mb-8" />
          <h2 className="text-3xl font-bold mb-2">Welcome Back!</h2>
          <p className="text-gray-600 text-base">
            Log in to access your personalized<br />customer portal
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
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
                disabled={isLoading}
                {...register('email', { required: 'Email is required' })}
              />
            </div>
            {errors.email && (
              <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
            )}
          </div>

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
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                className="w-full pl-10 pr-10 py-4 border-gray-300 h-12"
                disabled={isLoading}
                {...register('password', { required: 'Password is required' })}
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

          <Button 
            type="submit" 
            disabled={isLoading}
            className="w-full py-4 h-12 bg-[#D30046] hover:bg-[#B8003C] disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-md"
          >
            {isLoading ? (
              <div className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Signing in...
              </div>
            ) : (
              'Login'
            )}
          </Button>
        </form>

        <div className="text-center mt-6">
          <Link to="/forgot-password" className="text-sm text-[#D30046] hover:underline">
            Forgot Password?
          </Link>
        </div>
      </div>
    </div>
  )
}