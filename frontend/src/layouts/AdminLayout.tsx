import { Outlet, Link, useNavigate } from 'react-router-dom'
import { useAppSelector, useAppDispatch } from '@/store'
import { logout } from '@/store/slices/authSlice'
import { Button } from '@/components/ui/button'
import { Toaster } from 'sonner'
import { Users, Settings, BarChart, LogOut } from 'lucide-react'

export function AdminLayout() {
  const user = useAppSelector(state => state.auth.user)
  const dispatch = useAppDispatch()
  const navigate = useNavigate()

  const handleLogout = () => {
    dispatch(logout())
    navigate('/admin/login')
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64 min-h-screen bg-card border-r">
          <div className="p-6">
            <div className="flex items-center gap-2 mb-8">
              <img src="/logo.png" alt="MHUB Logo" className="h-8" />
              <span className="text-xl font-bold">Admin Portal</span>
            </div>
            
            <nav className="space-y-2">
              <Link 
                to="/admin/dashboard" 
                className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium hover:bg-accent hover:text-accent-foreground"
              >
                <BarChart className="h-4 w-4" />
                Dashboard
              </Link>
              <Link 
                to="/admin/users" 
                className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium hover:bg-accent hover:text-accent-foreground"
              >
                <Users className="h-4 w-4" />
                Users
              </Link>
              <Link 
                to="/admin/settings" 
                className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium hover:bg-accent hover:text-accent-foreground"
              >
                <Settings className="h-4 w-4" />
                Settings
              </Link>
            </nav>
          </div>
          
          <div className="absolute bottom-0 w-64 p-6 border-t">
            <div className="flex items-center justify-between">
              <div className="text-sm">
                <p className="font-medium">{user?.name}</p>
                <p className="text-muted-foreground">{user?.email}</p>
              </div>
              <Button 
                variant="ghost" 
                size="icon"
                onClick={handleLogout}
                title="Logout"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 p-8">
          <Outlet />
        </main>
      </div>
      <Toaster />
    </div>
  )
}