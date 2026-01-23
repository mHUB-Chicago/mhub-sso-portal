import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useAppSelector } from '@/store'

export function HomePage() {
  const isAuthenticated = useAppSelector(state => state.auth.isAuthenticated)

  return (
    <div className="flex flex-col items-center justify-center space-y-8 text-center">
      <h1 className="text-4xl font-bold tracking-tight">
        Welcome to MHUB SSO Portal
      </h1>
      <p className="text-xl text-muted-foreground max-w-2xl">
        Secure single sign-on solution for all your authentication needs
      </p>
      <div className="flex gap-4">
        {isAuthenticated ? (
          <Button asChild className="bg-[#D30046] hover:bg-[#B8003C]">
            <Link to="/dashboard">Go to Dashboard</Link>
          </Button>
        ) : (
          <>
            <Button asChild className="bg-[#D30046] hover:bg-[#B8003C]">
              <Link to="/login">Sign In</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/dashboard">Go to Dashboard</Link>
            </Button>
          </>
        )}
      </div>
    </div>
  )
}