import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      // Safety backend runs on 8001 (port 8000 is used by another local app).
      // Use 127.0.0.1 (not localhost) — on Windows, Node resolves "localhost" to
      // IPv6 (::1) first, but uvicorn listens on IPv4 only, so the proxy would refuse.
      '/api': 'http://127.0.0.1:8001',
      '/uploads': 'http://127.0.0.1:8001'
    }
  }
})
