import { combineReducers, configureStore } from '@reduxjs/toolkit'
import { useDispatch, useSelector } from 'react-redux'
import authReducer, { logout } from './slices/authSlice'
import { authApi } from './api/authApi'
import { userApi } from './api/userApi'
import { companyApi } from './api/companyApi'
import { serviceProviderApi } from './api/serviceProviderApi'
import { syncApi } from './api/syncApi'
import { webhookApi } from './api/webhookApi'
import { reportsApi } from './api/reportsApi'
import { onboardingApi } from './api/onboardingApi'
import { publicOnboardingApi } from './api/publicOnboardingApi'

const appReducer = combineReducers({
  auth: authReducer,
  [authApi.reducerPath]: authApi.reducer,
  [userApi.reducerPath]: userApi.reducer,
  [companyApi.reducerPath]: companyApi.reducer,
  [serviceProviderApi.reducerPath]: serviceProviderApi.reducer,
  [syncApi.reducerPath]: syncApi.reducer,
  [webhookApi.reducerPath]: webhookApi.reducer,
  [reportsApi.reducerPath]: reportsApi.reducer,
  [onboardingApi.reducerPath]: onboardingApi.reducer,
  [publicOnboardingApi.reducerPath]: publicOnboardingApi.reducer,
})

// On logout, reset the ENTIRE store (every RTK Query cache included) instead of just
// the auth slice — otherwise a next login in the same tab (different user, e.g. admin
// then a just-onboarded member) can render from the previous session's cached query
// results (getMyUser's apps/role, etc.) before/instead of refetching fresh ones.
type AppReducerState = ReturnType<typeof appReducer>
type AppReducerAction = Parameters<typeof appReducer>[1]
const rootReducer = (state: AppReducerState | undefined, action: AppReducerAction) => {
  if (action.type === logout.type) {
    state = undefined
  }
  return appReducer(state, action)
}

export const store = configureStore({
  reducer: rootReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(authApi.middleware, userApi.middleware, companyApi.middleware, serviceProviderApi.middleware, syncApi.middleware, webhookApi.middleware, reportsApi.middleware, onboardingApi.middleware, publicOnboardingApi.middleware),
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch

export const useAppDispatch = useDispatch.withTypes<AppDispatch>()
export const useAppSelector = useSelector.withTypes<RootState>()