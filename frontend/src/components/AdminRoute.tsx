import { Navigate } from 'react-router-dom'
import { useAppSelector, useAppDispatch } from '@/store'
import { useGetMeQuery } from '@/store/api/authApi'
import { loginSuccess } from '@/store/slices/authSlice'
import { useEffect } from 'react'
import { Loader2 } from 'lucide-react'

interface AdminRouteProps {
  children: React.ReactNode
}

export function AdminRoute({ children }: AdminRouteProps) {
  const dispatch = useAppDispatch()
  const { isAuthenticated, user } = useAppSelector(state => state.auth)

  // Check session on mount if not authenticated in Redux
  const { data, isLoading, isError } = useGetMeQuery(undefined, {
    skip: isAuthenticated,
  })

  // Update Redux state if session is valid
  useEffect(() => {
    if (data?.data?.user) {
      dispatch(loginSuccess({
        id: data.data.user.id,
        email: data.data.user.email,
        name: data.data.user.name,
        role: data.data.user.role,
      }))
    }
  }, [data, dispatch])

  // Show loading while checking session
  if (!isAuthenticated && isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#D30046]" />
      </div>
    )
  }

  // Redirect to login if not authenticated and session check failed
  if (!isAuthenticated && (isError || !data?.data?.user)) {
    return <Navigate to="/login" replace />
  }

  // Check admin role
  const currentUser = data?.data?.user || user
  if (currentUser?.role !== 'ADMIN') {
    return <Navigate to="/unauthorized" replace />
  }

  return <>{children}</>
}