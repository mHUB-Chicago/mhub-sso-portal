import { Navigate } from 'react-router-dom'
import { useAppSelector } from '@/store'

interface AdminRouteProps {
  children: React.ReactNode
}

export function AdminRoute({ children }: AdminRouteProps) {
  const { isAuthenticated, user } = useAppSelector(state => state.auth)

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (user?.role !== 'ADMIN') {
    return <Navigate to="/unauthorized" replace />
  }

  return <>{children}</>
}