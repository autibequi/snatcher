import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    allowedHosts: true,
    headers: {
      // Impede Cloudflare e browser de cachear arquivos do dev server
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Surrogate-Control': 'no-store',
      'CDN-Cache-Control': 'no-store',
    },
    proxy: {
      '/api': {
        target: 'http://promo-snatcher-backend:8000',
        changeOrigin: true,
      },
      '/r/': {
        target: 'http://promo-snatcher-backend:8000',
        changeOrigin: true,
      },
    },
  },
})
