import { Navigate } from 'react-router-dom'
import { useAppSelector, useAppDispatch } from '@/store'
import { useGetMeQuery } from '@/store/api/authApi'
import { loginSuccess } from '@/store/slices/authSlice'
import { useEffect } from 'react'
import { Loader2 } from 'lucide-react'

interface ProtectedRouteProps {
  children: React.ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const dispatch = useAppDispatch()
  const isAuthenticated = useAppSelector(state => state.auth.isAuthenticated)

  // Check session on mount if not authenticated in Redux
  const { data, isLoading, isError } = useGetMeQuery(undefined, {
    skip: isAuthenticated, // Skip if already authenticated
  })

  // Update Redux state if session is valid
  useEffect(() => {
    if (data?.data?.user) {
      dispatch(loginSuccess({
        user: {
          id: data.data.user.id,
          email: data.data.user.email,
          name: data.data.user.name,
          role: data.data.user.role,
        },
        redirectUrl: null,
      }))
    }
  }, [data, dispatch])

  // Show loading while checking session
  if (!isAuthenticated && isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand" />
      </div>
    )
  }

  // Redirect to login if not authenticated and session check failed
  if (!isAuthenticated && (isError || !data?.data?.user)) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
