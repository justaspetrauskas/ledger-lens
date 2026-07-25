import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // In dev, the client runs on Vite (5173) and the proxy on Node (8080). Forward
  // /api to the proxy so the browser talks to one origin, same as in production.
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
})
