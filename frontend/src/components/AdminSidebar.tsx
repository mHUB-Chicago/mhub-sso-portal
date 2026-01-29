import { Link, useLocation } from 'react-router-dom'
import { useAppSelector } from '@/store'
import {
  Users,
  Building2,
  ShieldCheck,
  KeyRound,
  LayoutDashboard,
  X
} from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'

interface AdminSidebarProps {
  isOpen: boolean
  onClose: () => void
}

export function AdminSidebar({ isOpen, onClose }: AdminSidebarProps) {
  const user = useAppSelector(state => state.auth.user)
  const location = useLocation()

  const handleLinkClick = () => {
    // Close sidebar on mobile when a link is clicked
    onClose()
  }

  return (
    <aside
      className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-gray-50 border-r flex flex-col
        transform transition-transform duration-300 ease-in-out
        lg:relative lg:translate-x-0
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}
    >
      <div className="p-6 flex-1">
        <div className="mb-12 flex items-center justify-between">
          <img src="/logo.png" alt="MHUB Logo" className="h-8" />
          {/* Close button - mobile only */}
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
        <nav className="space-y-3">
          <Link
            to="/dashboard"
            onClick={handleLinkClick}
            className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            <LayoutDashboard className="h-5 w-5 text-gray-500" />
            Dashboard
          </Link>
          <Link
            to="/admin/users"
            onClick={handleLinkClick}
            className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium ${
              location.pathname.startsWith('/admin/users')
                ? 'bg-brand text-white'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <Users className={`h-5 w-5 ${
              location.pathname.startsWith('/admin/users')
                ? 'text-white'
                : 'text-gray-500'
            }`} />
            Users
          </Link>
          <Link
            to="/admin/companies"
            onClick={handleLinkClick}
            className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium ${
              location.pathname.startsWith('/admin/companies')
                ? 'bg-brand text-white'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <Building2 className={`h-5 w-5 ${
              location.pathname.startsWith('/admin/companies')
                ? 'text-white'
                : 'text-gray-500'
            }`} />
            Companies
          </Link>
          <Link
            to="/admin/admins"
            onClick={handleLinkClick}
            className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium ${
              location.pathname.startsWith('/admin/admins')
                ? 'bg-brand text-white'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <ShieldCheck className={`h-5 w-5 ${
              location.pathname.startsWith('/admin/admins')
                ? 'text-white'
                : 'text-gray-500'
            }`} />
            Admins
          </Link>
          <Link
            to="/admin/idp"
            onClick={handleLinkClick}
            className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium ${
              location.pathname.startsWith('/admin/idp')
                ? 'bg-brand text-white'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <KeyRound className={`h-5 w-5 ${
              location.pathname.startsWith('/admin/idp')
                ? 'text-white'
                : 'text-gray-500'
            }`} />
            IDP Management
          </Link>
        </nav>
      </div>

      <div className="p-6 border-t bg-gray-50">
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-xs bg-gray-200">
              {user?.name?.split(' ').map(n => n[0]).join('').toUpperCase() || 'AU'}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{user?.name || 'Admin User'}</p>
            <p className="text-xs text-gray-500 truncate">Admin</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
