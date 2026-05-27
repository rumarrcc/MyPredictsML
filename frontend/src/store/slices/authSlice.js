import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import { authService } from '@/services/authService'

export const loginThunk = createAsyncThunk('auth/login', async (credentials, { rejectWithValue }) => {
  try {
    const data = await authService.login(credentials)
    localStorage.setItem('token', data.token)
    localStorage.setItem('user', JSON.stringify(data.user))
    return data
  } catch (err) {
    return rejectWithValue(err.response?.data || { message: 'Error al iniciar sesión' })
  }
})

export const registerThunk = createAsyncThunk('auth/register', async (userData, { rejectWithValue }) => {
  try {
    const data = await authService.register(userData)
    return data
  } catch (err) {
    return rejectWithValue(err.response?.data || { message: 'Error al registrarse' })
  }
})

export const getMeThunk = createAsyncThunk('auth/getMe', async (_, { rejectWithValue }) => {
  try {
    return await authService.getMe()
  } catch (err) {
    return rejectWithValue(err.response?.data?.message || 'Error')
  }
})

export const updateProfileThunk = createAsyncThunk('auth/updateProfile', async (data, { rejectWithValue }) => {
  try {
    return await authService.updateProfile(data)
  } catch (err) {
    return rejectWithValue(err.response?.data?.message || 'Error')
  }
})

const storedUser  = (() => { try { return JSON.parse(localStorage.getItem('user')) } catch { return null } })()
const storedToken = localStorage.getItem('token') || null

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user:            storedUser,
    token:           storedToken,
    isAuthenticated: !!storedToken,
    isLoading:       false,
    error:           null,
  },
  reducers: {
    logout(state) {
      state.user            = null
      state.token           = null
      state.isAuthenticated = false
      localStorage.removeItem('token')
      localStorage.removeItem('user')
    },
    clearError(state) { state.error = null },
  },
  extraReducers: (builder) => {
    const pending   = (state) => { state.isLoading = true; state.error = null }
    const rejected  = (state, a) => { state.isLoading = false; state.error = a.payload?.message || a.payload }

    builder
      .addCase(loginThunk.pending, pending)
      .addCase(loginThunk.fulfilled, (state, { payload }) => {
        state.isLoading       = false
        state.token           = payload.token
        state.user            = payload.user
        state.isAuthenticated = true
        localStorage.setItem('user', JSON.stringify(payload.user))
      })
      .addCase(loginThunk.rejected, rejected)

      .addCase(registerThunk.pending, pending)
      .addCase(registerThunk.fulfilled, (state, { payload }) => {
        state.isLoading       = false
        state.token           = null
        state.isAuthenticated = false
        state.user            = null
        localStorage.removeItem('token')
        localStorage.removeItem('user')
      })
      .addCase(registerThunk.rejected, rejected)

      .addCase(getMeThunk.fulfilled, (state, { payload }) => {
        state.user            = payload
        state.isAuthenticated = true
        localStorage.setItem('user', JSON.stringify(payload))
      })
      .addCase(getMeThunk.rejected, (state, a) => {
        state.isLoading       = false
        state.error           = a.payload
        state.user            = null
        state.token           = null
        state.isAuthenticated = false
        localStorage.removeItem('token')
        localStorage.removeItem('user')
      })

      .addCase(updateProfileThunk.fulfilled, (state, { payload }) => {
        state.user = { ...state.user, ...payload }
        localStorage.setItem('user', JSON.stringify(state.user))
      })
  },
})

export const { logout, clearError } = authSlice.actions
export default authSlice.reducer
