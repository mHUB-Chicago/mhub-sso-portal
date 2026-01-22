import { apiFetch } from '@/lib/api'
import { createApi } from '@reduxjs/toolkit/query/react'
import {
  StartLoginResponseSchema,
  VerifyLoginResponseSchema,
  ChangePasswordResponseSchema,
  ForgotPasswordResponseSchema,
} from '../../../../common/schemas/login'
import { GetMyUserResponseSchema } from '../../../../common/schemas/user'
import z from 'zod'

// Request types
interface StartLoginRequest {
  email: string
}

interface VerifyLoginRequest {
  request_id: string
  password: string
}

interface ChangePasswordRequest {
  password: string
}

interface ForgotPasswordRequest {
  email: string
}

// Response types inferred from schemas
type StartLoginResponse = z.infer<typeof StartLoginResponseSchema>
type VerifyLoginResponse = z.infer<typeof VerifyLoginResponseSchema>
type ChangePasswordResponse = z.infer<typeof ChangePasswordResponseSchema>
type ForgotPasswordResponse = z.infer<typeof ForgotPasswordResponseSchema>
type GetMyUserResponse = z.infer<typeof GetMyUserResponseSchema>

// Custom base query using apiFetch
const customBaseQuery = async (args: {
  path: string
  method?: string
  body?: unknown
  schema: z.ZodSchema
}) => {
  try {
    const { path, method = 'GET', body, schema } = args
    const result = await apiFetch(
      path,
      {
        method,
        body: body ? JSON.stringify(body) : undefined,
      },
      schema
    )

    if (result.error) {
      return { error: result.error }
    }

    return { data: result.data }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { error: { message } }
  }
}

export const authApi = createApi({
  reducerPath: 'authApi',
  baseQuery: customBaseQuery,
  endpoints: (builder) => ({
    // Step 1: Start login with email
    startLogin: builder.mutation<StartLoginResponse, StartLoginRequest>({
      query: (body) => ({
        path: 'login/start',
        method: 'POST',
        body,
        schema: StartLoginResponseSchema,
      }),
    }),

    // Step 2: Verify with password or OTP
    verifyLogin: builder.mutation<VerifyLoginResponse, VerifyLoginRequest>({
      query: (body) => ({
        path: 'login/verify',
        method: 'POST',
        body,
        schema: VerifyLoginResponseSchema,
      }),
    }),

    // Change password (requires auth)
    changePassword: builder.mutation<ChangePasswordResponse, ChangePasswordRequest>({
      query: (body) => ({
        path: 'login/change-password',
        method: 'POST',
        body,
        schema: ChangePasswordResponseSchema,
      }),
    }),

    // Forgot password - sends OTP and sets mustResetPassword
    forgotPassword: builder.mutation<ForgotPasswordResponse, ForgotPasswordRequest>({
      query: (body) => ({
        path: 'login/forgot-password',
        method: 'POST',
        body,
        schema: ForgotPasswordResponseSchema,
      }),
    }),

    // Get current user (check if logged in)
    getMe: builder.query<GetMyUserResponse, void>({
      query: () => ({
        path: 'user/me',
        method: 'GET',
        schema: GetMyUserResponseSchema,
      }),
    }),
  }),
})

export const {
  useStartLoginMutation,
  useVerifyLoginMutation,
  useChangePasswordMutation,
  useForgotPasswordMutation,
  useGetMeQuery,
  useLazyGetMeQuery,
} = authApi
