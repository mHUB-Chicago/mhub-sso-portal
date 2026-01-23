import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

interface AuthState {
  isAuthenticated: boolean
  user: {
    id: string
    email: string
    name: string
    role: 'ADMIN' | 'USER'
  } | null
  loading: boolean
}

const initialState: AuthState = {
  isAuthenticated: false,
  user: null,
  loading: false
}

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    loginStart: (state) => {
      state.loading = true
    },
    loginSuccess: (state, action: PayloadAction<{ id: string; email: string; name: string; role: 'ADMIN' | 'USER' }>) => {
      state.isAuthenticated = true
      state.user = action.payload
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