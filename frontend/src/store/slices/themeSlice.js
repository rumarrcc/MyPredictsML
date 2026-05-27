import { createSlice } from '@reduxjs/toolkit'

const LS_KEY = 'mypredicts_theme'
const stored = localStorage.getItem(LS_KEY)

// default → dark
const initialMode = stored === 'light' ? 'light' : 'dark'

const themeSlice = createSlice({
  name: 'theme',
  initialState: { mode: initialMode },
  reducers: {
    toggleTheme(state) {
      state.mode = state.mode === 'dark' ? 'light' : 'dark'
      try { localStorage.setItem(LS_KEY, state.mode) } catch {}
    },
    setTheme(state, action) {
      state.mode = action.payload
      try { localStorage.setItem(LS_KEY, state.mode) } catch {}
    },
  },
})

export const { toggleTheme, setTheme } = themeSlice.actions
export default themeSlice.reducer
