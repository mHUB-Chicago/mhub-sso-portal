import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { ShieldX } from 'lucide-react'

export function UnauthorizedPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-12rem)] text-center">
      <ShieldX className="h-16 w-16 text-destructive mb-4" />
      <h1 className="text-3xl font-bold mb-2">Access Denied</h1>
      <p className="text-muted-foreground mb-8 max-w-md">
        You don't have permission to access this page. This area is restricted to administrators only.
      </p>
      <div className="flex gap-4">
        <Button asChild>
          <Link to="/">Go Home</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link to="/dashboard">User Dashboard</Link>
        </Button>
      </div>
    </div>
  )
}