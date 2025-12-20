import { apiFetch } from '@/lib/api'
import { createApi } from '@reduxjs/toolkit/query/react'
import z from 'zod'

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
  console.log('customBaseQuery called with args:', args);
  try {
    const { path, method = 'GET', body } = args
    const result = await apiFetch(
      path,
      {
        method,
        body: body ? JSON.stringify(body) : undefined,
      },
      z.any()
    )
    
    if (result.error) {
      return { error: result.error }
    }
    
    return { data: result.data }
  } catch (error: any) {
    return { error: { message: error.message } }
  }
}

export const authApi = createApi({
  reducerPath: 'authApi',
  baseQuery: customBaseQuery,
  endpoints: (builder) => ({
    login: builder.mutation<LoginResponse, LoginRequest>({
      query: (credentials) => ({
        path: 'user/login',
        method: 'POST',
        body: credentials,
      }),
    }),
  }),
})

export const { useLoginMutation } = authApi