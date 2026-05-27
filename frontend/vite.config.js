import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      buffer: 'buffer',
      'buffer/': 'buffer'
    },
  },

  define: {
    global: 'globalThis',
  },

  optimizeDeps: {
    include: ['buffer'],
  },

  server: {
    port: 5173,
    allowedHosts: [
      'localhost',
      '127.0.0.1',
    ],
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          redux: ['@reduxjs/toolkit', 'react-redux'],
          mui: ['@mui/material', '@mui/icons-material'],
          plotly: ['plotly.js', 'react-plotly.js'],
        },
      },
    },
  },
})
