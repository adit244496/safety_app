import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      // Use 127.0.0.1 (not localhost) — on Windows, Node resolves "localhost" to
      // IPv6 (::1) first, but uvicorn listens on IPv4 only, so the proxy would refuse.
      '/api': 'http://127.0.0.1:8000',
      '/uploads': 'http://127.0.0.1:8000'
    }
  }
})
