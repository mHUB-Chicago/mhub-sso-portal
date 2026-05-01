import { createBrowserRouter } from 'react-router-dom'
import { RootLayout } from '@/layouts/RootLayout'
import { DashboardLayout } from '@/layouts/DashboardLayout'
import { AdminLayout } from '@/layouts/AdminLayout'
import { HomePage } from '@/pages/home'
import { LoginPage } from '@/pages/login'
import { DashboardPage } from '@/pages/dashboard'
import { UnauthorizedPage } from '@/pages/unauthorized'
import { NotFoundPage } from '@/pages/not-found'
import { ForgotPasswordPage } from '@/pages/forgot-password'
import { ChangePasswordPage } from '@/pages/change-password'
import { AdminDashboardPage } from '@/pages/admin/dashboard'
import { AdminUsersPage } from '@/pages/admin/users'
import { AdminEditUserPage } from '@/pages/admin/users/edit'
import AdminAddUserPage from '@/pages/admin/users/add'
import { AdminCompaniesPage } from '@/pages/admin/companies'
import { AdminEditCompanyPage } from '@/pages/admin/companies/edit'
import { AdminManagementPage } from '@/pages/admin/admins'
import { AdminEditAdminPage } from '@/pages/admin/admins/edit'
import { IDPManagementPage } from '@/pages/admin/idp'
import { IDPEditPage } from '@/pages/admin/idp/edit'
import { IDPAddPage } from '@/pages/admin/idp/add'
import { AdminSyncPage } from '@/pages/admin/sync'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { AdminRoute } from '@/components/AdminRoute'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      {
        index: true,
        element: (
          <ProtectedRoute>
            <HomePage />
          </ProtectedRoute>
        )
      },
      {
        path: 'unauthorized',
        element: <UnauthorizedPage />
      }
    ]
  },
  {
    path: '/dashboard',
    element: (
      <ProtectedRoute>
        <DashboardLayout />
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: <DashboardPage />
      }
    ]
  },
  {
    path: '/login',
    element: <LoginPage />
  },
  {
    path: '/forgot-password',
    element: <ForgotPasswordPage />
  },
  {
    path: '/change-password',
    element: (
      <ProtectedRoute>
        <ChangePasswordPage />
      </ProtectedRoute>
    )
  },
  {
    path: '/admin',
    element: (
      <AdminRoute>
        <AdminLayout />
      </AdminRoute>
    ),
    children: [
      {
        index: true,
        element: <AdminDashboardPage />
      },
      {
        path: 'dashboard',
        element: <AdminDashboardPage />
      },
      {
        path: 'users',
        element: <AdminUsersPage />
      },
      {
        path: 'users/:id/edit',
        element: <AdminEditUserPage />
      },
      {
        path: 'users/new',
        element: <AdminAddUserPage />
      },
      {
        path: 'companies',
        element: <AdminCompaniesPage />
      },
      {
        path: 'companies/:id/edit',
        element: <AdminEditCompanyPage />
      },
      {
        path: 'admins',
        element: <AdminManagementPage />
      },
      {
        path: 'admins/:id/edit',
        element: <AdminEditAdminPage />
      },
      {
        path: 'idp',
        element: <IDPManagementPage />
      },
      {
        path: 'idp/add',
        element: <IDPAddPage />
      },
      {
        path: 'idp/:id/edit',
        element: <IDPEditPage />
      },
      {
        path: 'sync',
        element: <AdminSyncPage />
      },
      {
        path: 'settings',
        element: <div>Admin Settings Page (TODO)</div>
      },
      {
        path: '*',
        element: <NotFoundPage />
      }
    ]
  },
  {
    path: '*',
    element: <NotFoundPage />
  }
])