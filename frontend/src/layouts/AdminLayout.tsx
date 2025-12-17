import { Outlet } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AdminHeader } from '@/components/AdminHeader'
import { AdminSidebar } from '@/components/AdminSidebar'

export function AdminLayout() {
  return (
    <div className="min-h-screen bg-white flex">
      <AdminSidebar />
      
      <div className="flex-1 flex flex-col">
        <AdminHeader />
        
        <main className="flex-1 p-6 bg-white">
          <Outlet />
        </main>
      </div>
      
      <Toaster />
    </div>
  )
}