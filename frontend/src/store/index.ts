import { configureStore } from '@reduxjs/toolkit'
import { useDispatch, useSelector } from 'react-redux'
import authReducer from './slices/authSlice'
import { authApi } from './api/authApi'
import { userApi } from './api/userApi'
import { companyApi } from './api/companyApi'
import { serviceProviderApi } from './api/serviceProviderApi'
import { syncApi } from './api/syncApi'
import { webhookApi } from './api/webhookApi'

export const store = configureStore({
  reducer: {
    auth: authReducer,
    [authApi.reducerPath]: authApi.reducer,
    [userApi.reducerPath]: userApi.reducer,
    [companyApi.reducerPath]: companyApi.reducer,
    [serviceProviderApi.reducerPath]: serviceProviderApi.reducer,
    [syncApi.reducerPath]: syncApi.reducer,
    [webhookApi.reducerPath]: webhookApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(authApi.middleware, userApi.middleware, companyApi.middleware, serviceProviderApi.middleware, syncApi.middleware, webhookApi.middleware),
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch

export const useAppDispatch = useDispatch.withTypes<AppDispatch>()
export const useAppSelector = useSelector.withTypes<RootState>()