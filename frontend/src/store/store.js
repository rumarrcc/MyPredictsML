import { configureStore } from '@reduxjs/toolkit'
import authReducer       from './slices/authSlice'
import stockReducer      from './slices/stockSlice'
import predictionReducer from './slices/predictionSlice'
import portfolioReducer  from './slices/portfolioSlice'
import themeReducer      from './slices/themeSlice'

export const store = configureStore({
  reducer: {
    auth:       authReducer,
    stock:      stockReducer,
    prediction: predictionReducer,
    portfolio:  portfolioReducer,
    theme:      themeReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({ serializableCheck: false }),
})

export default store
