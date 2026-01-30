import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

interface AuthState {
  isAuthenticated: boolean
  user: {
    id: string
    email: string
    name: string
    role: 'ADMIN' | 'USER'
  } | null
  redirectUrl?: string | null
  loading: boolean
}

interface LoginSuccessPayload {
  user: {
    id: string
    email: string
    name: string
    role: 'ADMIN' | 'USER'
  }
  redirectUrl: string | null
}

const getInitialState = (): AuthState => {
  const token = localStorage.getItem('authToken')
  const userStr = localStorage.getItem('user')

  if (token && userStr) {
    try {
      const user = JSON.parse(userStr)
      return {
        isAuthenticated: true,
        user,
        loading: false
      }
    } catch {
      return {
        isAuthenticated: false,
        user: null,
        loading: false
      }
    }
  }

  return {
    isAuthenticated: false,
    user: null,
    loading: false
  }
}

const initialState: AuthState = getInitialState()

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    loginStart: (state) => {
      state.loading = true
    },
    loginSuccess: (state, action: PayloadAction<LoginSuccessPayload>) => {
      state.isAuthenticated = true
      state.user = action.payload.user
      state.redirectUrl = action.payload.redirectUrl
      state.loading = false
    },
    loginFailure: (state) => {
      state.isAuthenticated = false
      state.user = null
      state.loading = false
    },
    logout: (state) => {
      state.isAuthenticated = false
      state.user = null
      state.loading = false
    }
  }
})

export const { loginStart, loginSuccess, loginFailure, logout } = authSlice.actions
export default authSlice.reducer