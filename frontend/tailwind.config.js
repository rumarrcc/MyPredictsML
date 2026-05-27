/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  important: '#root',   // Necesario para coexistir con MUI
  theme: {
    extend: {
      colors: {
        primary: {
          50:  '#e3f2fd',
          100: '#bbdefb',
          500: '#2196f3',
          600: '#1e88e5',
          700: '#1976d2',
          900: '#0d47a1',
        },
        success: { 500: '#4caf50', 600: '#43a047' },
        danger:  { 500: '#f44336', 600: '#e53935' },
        warning: { 500: '#ff9800', 600: '#fb8c00' },
        dark:    { 800: '#1e1e2e', 900: '#12121f' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
  corePlugins: {
    preflight: false,   // Evita conflictos con estilos MUI
  },
}
