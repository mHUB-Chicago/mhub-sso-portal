import { useNavigate } from 'react-router-dom'
import { useAppDispatch } from '@/store'
import { loginSuccess } from '@/store/slices/authSlice'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

interface AdminLoginFormData {
  email: string
  password: string
}

export function AdminLoginPage() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const { register, handleSubmit, formState: { errors } } = useForm<AdminLoginFormData>()

  const onSubmit = async (data: AdminLoginFormData) => {
    // Mock admin login - replace with actual API call
    const mockAdminLogin = () => new Promise((resolve, reject) => {
      setTimeout(() => {
        // Mock validation - check if it's an admin email
        if (data.email.includes('admin') && data.password.length >= 6) {
          resolve({
            id: '1',
            email: data.email,
            name: 'Admin User',
            role: 'admin' as const
          })
        } else {
          reject(new Error('Invalid admin credentials'))
        }
      }, 1500) // 1.5 second delay
    })

    toast.promise(mockAdminLogin(), {
      loading: 'Verifying admin credentials...',
      success: (userData: any) => {
        dispatch(loginSuccess(userData))
        navigate('/admin/dashboard')
        return 'Admin login successful!'
      },
      error: 'Invalid admin credentials. Admin emails must contain "admin".'
    })
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-center mb-4">
            <img src="/logo.png" alt="MHUB Logo" className="h-12" />
          </div>
          <CardTitle className="text-2xl text-center">Admin Portal</CardTitle>
          <CardDescription className="text-center">
            Sign in to access the admin dashboard
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Admin Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@example.com"
                {...register('email', { required: 'Email is required' })}
              />
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                {...register('password', { required: 'Password is required' })}
              />
              {errors.password && (
                <p className="text-sm text-destructive">{errors.password.message}</p>
              )}
            </div>
            <Button type="submit" className="w-full">
              Sign In as Admin
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}