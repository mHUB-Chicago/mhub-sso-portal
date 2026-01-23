import { useState, useEffect } from 'react'
import { Outlet, Link, useNavigate } from 'react-router-dom'
import { useAppSelector, useAppDispatch } from '@/store'
import { logout, loginSuccess } from '@/store/slices/authSlice'
import { useGetMeQuery } from '@/store/api/authApi'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

export function RootLayout() {
  const { isAuthenticated, user } = useAppSelector(state => state.auth)
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const [showLogoutDialog, setShowLogoutDialog] = useState(false)

  // Check session on mount if not authenticated in Redux
  const { data } = useGetMeQuery(undefined, {
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

  const handleLogout = () => {
    dispatch(logout())
    navigate('/')
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center">
            <img src="/logo.png" alt="MHUB Logo" className="h-8" />
          </Link>
          <nav className="flex items-center space-x-4">
            <Link to="/" className="text-sm font-medium hover:text-primary">
              Home
            </Link>
            {isAuthenticated ? (
              <>
                <Link to="/dashboard" className="text-sm font-medium hover:text-primary">
                  Dashboard
                </Link>
                {user?.role === 'ADMIN' && (
                  <Link to="/admin/dashboard" className="text-sm font-medium hover:text-primary">
                    Admin Panel
                  </Link>
                )}
                <Button
                  onClick={() => setShowLogoutDialog(true)}
                  variant="ghost"
                  size="sm"
                  className="text-sm font-medium"
                >
                  Logout
                </Button>
              </>
            ) : (
              <Link to="/login" className="text-sm font-medium hover:text-primary">
                Login
              </Link>
            )}
          </nav>
        </div>
      </header>
      <main className="container mx-auto px-4 py-8">
        <Outlet />
      </main>

      <AlertDialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Logout</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to log out? You will need to sign in again to access your account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleLogout}
              className="bg-[#D30046] hover:bg-[#B8003C]"
            >
              Logout
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}