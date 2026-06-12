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
      '/cpanelapi': 'http://49.204.125.246:2082',
      '/packages': 'http://49.204.125.246:2082',
    },
  },
})
