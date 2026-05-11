import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/cpanelapi': 'http://localhost:2082',
      '/packages': 'http://localhost:2082',
    },
  },
})
