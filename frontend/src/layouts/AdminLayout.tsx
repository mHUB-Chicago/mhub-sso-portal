import { Outlet } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AdminHeader } from '@/components/AdminHeader'
import { AdminSidebar } from '@/components/AdminSidebar'

export function AdminLayout() {
  return (
    <div className="h-screen bg-white flex overflow-hidden">
      <AdminSidebar />
      
      <div className="flex-1 flex flex-col min-w-0">
        <AdminHeader />
        
        <main className="flex-1 overflow-y-auto p-6 bg-white">
          <Outlet />
        </main>
      </div>
      
      <Toaster />
    </div>
  )
}