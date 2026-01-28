import { Link, useLocation } from 'react-router-dom'
import { useAppSelector } from '@/store'
import {
  Users,
  Building2,
  ShieldCheck,
  KeyRound,
  LayoutDashboard
} from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

export function AdminSidebar() {
  const user = useAppSelector(state => state.auth.user)
  const location = useLocation()

  return (
    <aside className="w-64 h-screen bg-gray-50 border-r flex flex-col">
      <div className="p-6 flex-1">
        <div className="mb-12">
          <img src="/logo.png" alt="MHUB Logo" className="h-8 mx-auto" />
        </div>
        <nav className="space-y-3">
          <Link
            to="/dashboard"
            className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            <LayoutDashboard className="h-5 w-5 text-gray-500" />
            Dashboard
          </Link>
          <Link
            to="/admin/users"
            className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium ${
              location.pathname.startsWith('/admin/users')
                ? 'bg-[#D30046] text-white'
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
            className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium ${
              location.pathname.startsWith('/admin/companies')
                ? 'bg-[#D30046] text-white'
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
            className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium ${
              location.pathname.startsWith('/admin/admins')
                ? 'bg-[#D30046] text-white'
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
            className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium ${
              location.pathname.startsWith('/admin/idp')
                ? 'bg-[#D30046] text-white'
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