import { useState } from 'react'
import { useAppSelector, useAppDispatch } from '@/store'
import { logout } from '@/store/slices/authSlice'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useNavigate } from 'react-router-dom'
import {
  Search,
  Bell,
  User,
  LogOut,
  ChevronDown,
  Cog,
  Menu
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

interface AdminHeaderProps {
  onMenuClick: () => void
}

export function AdminHeader({ onMenuClick }: AdminHeaderProps) {
  const user = useAppSelector(state => state.auth.user)
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const [showLogoutDialog, setShowLogoutDialog] = useState(false)

  const handleLogout = () => {
    dispatch(logout())
    navigate('/admin/login')
  }

  return (
    <header className="bg-white border-b h-16 px-4 md:px-6 flex items-center justify-between w-full">
      <div className="flex items-center gap-4">
        {/* Hamburger menu - mobile only */}
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={onMenuClick}
        >
          <Menu className="h-5 w-5" />
        </Button>

        {/* Search - hidden on small screens */}
        <div className="relative hidden sm:block">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search..."
            className="pl-10 w-48 md:w-80 bg-gray-50 border-gray-200"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-3">
        {/* Search button - mobile only */}
        <Button variant="ghost" size="icon" className="sm:hidden">
          <Search className="h-5 w-5 text-gray-600" />
        </Button>

        <Button variant="ghost" size="icon">
          <Bell className="h-5 w-5 text-gray-600" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2 h-8">
              <Avatar className="h-6 w-6">
                <AvatarFallback className="text-xs bg-gray-200">
                  {user?.name?.split(' ').map(n => n[0]).join('').toUpperCase() || 'A'}
                </AvatarFallback>
              </Avatar>
              <ChevronDown className="h-4 w-4 text-gray-600 hidden sm:block" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>
              <User className="h-4 w-4 mr-2" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Cog className="h-4 w-4 mr-2" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setShowLogoutDialog(true)}>
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <AlertDialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm Logout</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to log out? You will need to sign in again to access the admin panel.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleLogout}
                className="bg-brand hover:bg-brand-hover"
              >
                Logout
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </header>
  )
}
