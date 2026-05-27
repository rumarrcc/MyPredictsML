import React, { useMemo, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Provider, useSelector } from 'react-redux'
import { Buffer } from 'buffer'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import './index.css'

import { store } from '@/store/store'
import App from './App'
window.Buffer = Buffer

window.addEventListener('vite:preloadError', event => {
  event.preventDefault()
  if (sessionStorage.getItem('mypredicts-reloaded-after-chunk-error') !== '1') {
    sessionStorage.setItem('mypredicts-reloaded-after-chunk-error', '1')
    window.location.reload()
  }
})

window.addEventListener('load', () => {
  window.setTimeout(() => {
    sessionStorage.removeItem('mypredicts-reloaded-after-chunk-error')
    sessionStorage.removeItem('mypredicts-reloaded-after-boundary-error')
  }, 1500)
})

function buildTheme(mode) {
  const dark = mode === 'dark'
  return createTheme({
    palette: {
      mode,
      primary:    { main: '#7c3aed', light: '#a855f7', dark: '#4c1d95', contrastText: '#ffffff' },
      secondary:  { main: '#60a5fa', light: '#93c5fd', dark: '#2563eb', contrastText: '#06101f' },
      success:    { main: '#39d98a', light: '#78f2b7', dark: '#15945d' },
      error:      { main: '#ff5c7a', light: '#ff8aa0', dark: '#c4324d' },
      warning:    { main: '#f7c948', light: '#ffe08a', dark: '#b7791f' },
      background: {
        default: dark ? '#05070d' : '#f3f4f8',
        paper:   dark ? '#0b0f1a' : '#ffffff',
      },
      text: {
        primary:   dark ? '#f7f7fb' : '#10131d',
        secondary: dark ? '#9aa0ad' : '#52586a',
      },
      divider: dark ? 'rgba(139,92,246,.18)' : 'rgba(17,24,39,.12)',
    },
    typography: {
      fontFamily: '"Space Grotesk", "Manrope", "Inter", "Segoe UI", sans-serif',
      h1: { fontWeight: 950, letterSpacing: '-0.055em' },
      h2: { fontWeight: 950, letterSpacing: '-0.045em' },
      h3: { fontWeight: 900, letterSpacing: '-0.04em' },
      h4: { fontWeight: 900, letterSpacing: '-0.035em' },
      h5: { fontWeight: 850, letterSpacing: '-0.025em' },
      h6: { fontWeight: 800, letterSpacing: '-0.015em' },
      button: { fontWeight: 800 },
      caption: { letterSpacing: '.02em' },
    },
    shape: { borderRadius: 18 },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            background: dark
              ? 'radial-gradient(circle at 22% 12%, rgba(124,58,237,.20), transparent 34%), radial-gradient(circle at 78% 8%, rgba(96,165,250,.10), transparent 26%), #05070d'
              : '#f3f4f8',
          },
          '::selection': {
            background: dark ? 'rgba(168,85,247,.36)' : 'rgba(124,58,237,.22)',
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            ...(dark && {
              backgroundColor: 'rgba(10,14,25,.82)',
              border: '1px solid rgba(139,92,246,.16)',
              boxShadow: '0 22px 70px rgba(0,0,0,.34), inset 0 1px rgba(255,255,255,.035)',
              backdropFilter: 'blur(16px)',
            }),
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontWeight: 800,
            borderRadius: 12,
            transition: 'transform .18s ease, box-shadow .18s ease, border-color .18s ease, background .18s ease',
          },
          containedPrimary: {
            background: 'linear-gradient(135deg, #8b5cf6, #4c1d95)',
            boxShadow: dark ? '0 16px 40px rgba(124,58,237,.34)' : '0 12px 24px rgba(124,58,237,.18)',
            '&:hover': {
              background: 'linear-gradient(135deg, #a855f7, #5b21b6)',
              transform: 'translateY(-1px)',
              boxShadow: dark ? '0 18px 48px rgba(124,58,237,.48)' : '0 16px 30px rgba(124,58,237,.24)',
            },
          },
          outlined: {
            borderColor: dark ? 'rgba(139,92,246,.30)' : 'rgba(124,58,237,.24)',
            color: dark ? '#f7f7fb' : '#171827',
            '&:hover': {
              borderColor: '#8b5cf6',
              background: dark ? 'rgba(124,58,237,.10)' : 'rgba(124,58,237,.06)',
            },
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            fontWeight: 800,
            borderRadius: 999,
            ...(dark && {
              backgroundColor: 'rgba(124,58,237,.14)',
              color: '#c4b5fd',
              border: '1px solid rgba(168,85,247,.20)',
            }),
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            ...(dark && {
              background: 'linear-gradient(145deg, rgba(13,18,31,.92), rgba(7,10,18,.88))',
              border: '1px solid rgba(139,92,246,.16)',
              boxShadow: '0 22px 70px rgba(0,0,0,.34), inset 0 1px rgba(255,255,255,.035)',
              overflow: 'hidden',
            }),
          },
        },
      },
      MuiTextField: {
        defaultProps: { variant: 'outlined' },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            ...(dark && {
              backgroundColor: 'rgba(7,10,18,.72)',
              color: '#f7f7fb',
              '& fieldset': { borderColor: 'rgba(139,92,246,.20)' },
              '&:hover fieldset': { borderColor: 'rgba(168,85,247,.45)' },
              '&.Mui-focused fieldset': {
                borderColor: '#8b5cf6',
                boxShadow: '0 0 0 3px rgba(124,58,237,.16)',
              },
            }),
          },
          input: {
            '&::placeholder': { opacity: .7 },
          },
        },
      },
      MuiInputLabel: {
        styleOverrides: {
          root: {
            ...(dark && {
              color: 'rgba(245,245,247,.58)',
              '&.Mui-focused': { color: '#c4b5fd' },
            }),
          },
        },
      },
      MuiTabs: {
        styleOverrides: {
          root: {
            minHeight: 44,
            ...(dark && {
              borderRadius: 14,
              background: 'rgba(255,255,255,.025)',
            }),
          },
          indicator: {
            height: 0,
          },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            minHeight: 42,
            borderRadius: 12,
            textTransform: 'none',
            fontWeight: 800,
            ...(dark && {
              color: 'rgba(245,245,247,.62)',
              '&.Mui-selected': {
                color: '#fff',
                background: 'linear-gradient(135deg, rgba(124,58,237,.55), rgba(76,29,149,.42))',
                boxShadow: '0 14px 34px rgba(124,58,237,.22)',
              },
            }),
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: {
            borderColor: dark ? 'rgba(139,92,246,.12)' : 'rgba(17,24,39,.10)',
          },
          head: {
            fontWeight: 800,
            color: dark ? 'rgba(245,245,247,.56)' : '#555',
            textTransform: 'uppercase',
            fontSize: 11,
            letterSpacing: '.04em',
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            backgroundImage: 'none',
            ...(dark && {
              background: 'linear-gradient(145deg, rgba(12,17,30,.98), rgba(7,10,18,.96))',
              border: '1px solid rgba(139,92,246,.18)',
            }),
          },
        },
      },
      MuiMenuItem: {
        styleOverrides: {
          root: {
            borderRadius: 10,
            '&:hover': { backgroundColor: dark ? 'rgba(124,58,237,.14)' : '#e8eaf6' },
          },
        },
      },
      MuiSelect: {
        styleOverrides: {
          icon: { color: dark ? '#9aa0ad' : '#555' },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            ...(dark && {
              background: '#101421',
              border: '1px solid rgba(139,92,246,.20)',
              color: '#f7f7fb',
            }),
          },
        },
      },
    },
  })
}

function ThemedApp() {
  const mode  = useSelector(s => s.theme?.mode || 'dark')
  const theme = useMemo(() => buildTheme(mode), [mode])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', mode)
    document.documentElement.style.backgroundColor = mode === 'dark' ? '#05070d' : '#f3f4f8'
    document.body.style.backgroundColor = mode === 'dark' ? '#05070d' : '#f3f4f8'
    document.body.style.color = mode === 'dark' ? '#f7f7fb' : '#10131d'
  }, [mode])

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
      <ToastContainer
        position="bottom-right"
        autoClose={3500}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        pauseOnHover
        theme={mode}
        toastStyle={
          mode === 'dark'
            ? { backgroundColor: '#0b0f1a', border: '1px solid rgba(139,92,246,.18)', color: '#fff' }
            : { backgroundColor: '#ffffff', border: '1px solid #d0d4e8', color: '#0f0f23' }
        }
      />
    </ThemeProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Provider store={store}>
      <BrowserRouter>
        <ThemedApp />
      </BrowserRouter>
    </Provider>
  </React.StrictMode>
)
