import { useNavigate } from 'react-router-dom'
import { useAppSelector } from '@/store'

export function HomePage() {
  const navigate = useNavigate()
  const isAuthenticated = useAppSelector(state => state.auth.isAuthenticated)

  if (!isAuthenticated) {
    return null;
  } else {
    navigate('/dashboard')
    return null;
  }
}