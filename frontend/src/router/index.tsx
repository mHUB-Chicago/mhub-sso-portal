import { createBrowserRouter } from 'react-router-dom'
import { RootLayout } from '@/layouts/RootLayout'
import { AdminLayout } from '@/layouts/AdminLayout'
import { HomePage } from '@/pages/home'
import { LoginPage } from '@/pages/login'
import { DashboardPage } from '@/pages/dashboard'
import { UnauthorizedPage } from '@/pages/unauthorized'
import { NotFoundPage } from '@/pages/not-found'
import { ForgotPasswordPage } from '@/pages/forgot-password'
import { ChangePasswordPage } from '@/pages/change-password'
import { AdminLoginPage } from '@/pages/admin/login'
import { AdminDashboardPage } from '@/pages/admin/dashboard'
import { AdminUsersPage } from '@/pages/admin/users'
import { AdminEditUserPage } from '@/pages/admin/users/edit'
import AdminAddUserPage from '@/pages/admin/users/add'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { AdminRoute } from '@/components/AdminRoute'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      {
        index: true,
        element: <HomePage />
      },
      {
        path: 'dashboard',
        element: (
          <ProtectedRoute>
            <DashboardPage />
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
    path: '/admin/login',
    element: <AdminLoginPage />
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