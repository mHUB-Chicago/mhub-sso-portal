import { createApi } from '@reduxjs/toolkit/query/react'
import { apiFetch } from '@/lib/api'
import { z } from 'zod'

interface LoginRequest {
  email: string
  password: string
}

interface LoginResponse {
  user: {
    id: string
    email: string
    name: string
    role: 'admin' | 'user'
  }
  token: string
}

// Custom base query using your apiFetch function (for when you have real backend)
const customBaseQuery = async (args: any) => {
  try {
    // Real API implementation - uncomment when backend is ready
    /*
    const { path, method = 'GET', body } = args
    const result = await apiFetch(
      path,
      {
        method,
        body: body ? JSON.stringify(body) : undefined,
      },
      z.any() // You can use proper schema here when defined
    )
    
    if (result.error) {
      return { error: result.error }
    }
    
    return { data: result.data }
    */
    
    // Fallback for now
    return { data: null }
  } catch (error: any) {
    return { error: { message: error.message } }
  }
}

// Mock base query for development
const mockBaseQuery = async (args: any) => {
  const { body } = args
  
  // Mock API delay
  await new Promise(resolve => setTimeout(resolve, 2000))
  
  // Mock validation
  if (body?.email && body?.password?.length >= 6) {
    const isAdmin = body.email.includes('admin')
    const mockResponse = {
      user: {
        id: '1',
        email: body.email,
        name: body.email.split('@')[0].replace('.', ' '),
        role: isAdmin ? 'admin' : 'user' as const
      },
      token: 'mock-jwt-token-' + Date.now()
    }
    
    return { data: mockResponse }
  }
  
  return {
    error: {
      status: 401,
      message: 'Invalid email or password'
    }
  }
}

export const authApi = createApi({
  reducerPath: 'authApi',
  baseQuery: import.meta.env.MODE === 'development' ? mockBaseQuery : customBaseQuery,
  endpoints: (builder) => ({
    login: builder.mutation<LoginResponse, LoginRequest>({
      query: (credentials) => ({
        path: 'auth/login',
        method: 'POST',
        body: credentials,
      }),
    }),
  }),
})

export const { useLoginMutation } = authApi