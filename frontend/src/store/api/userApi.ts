import { createApi } from '@reduxjs/toolkit/query/react'

interface CreateUserRequest {
  fullName: string
  email: string
  company: string
  gender: string
  dateOfBirth: string
  phone: string
  address: string
  digifaster: boolean
  learnworlds: boolean
  mhubShop: boolean
  peoplevine: boolean
}

interface User {
  id: string
  fullName: string
  email: string
  company: string
  gender: string
  dateOfBirth: string
  phone: string
  address: string
  digifaster: boolean
  learnworlds: boolean
  mhubShop: boolean
  peoplevine: boolean
  createdAt: string
  updatedAt: string
}

// Mock base query for development
const mockBaseQuery = async (args: any) => {
  const { body, method } = args
  
  // Mock API delay
  await new Promise(resolve => setTimeout(resolve, 1500))
  
  if (method === 'POST' && args.path === 'users') {
    // Mock user creation
    const newUser: User = {
      id: Date.now().toString(),
      ...body,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    
    return { data: newUser }
  }
  
  return {
    error: {
      status: 404,
      message: 'Not found'
    }
  }
}

// Real base query - uncomment when backend is ready
/*
const customBaseQuery = async (args: any) => {
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
*/

export const userApi = createApi({
  reducerPath: 'userApi',
  baseQuery: mockBaseQuery, // Switch to customBaseQuery when backend is ready
  tagTypes: ['User'],
  endpoints: (builder) => ({
    createUser: builder.mutation<User, CreateUserRequest>({
      query: (user) => ({
        path: 'users',
        method: 'POST',
        body: user,
      }),
      invalidatesTags: ['User'],
    }),
  }),
})

export const { useCreateUserMutation } = userApi