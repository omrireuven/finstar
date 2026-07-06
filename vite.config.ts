import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api/yahoo/': {
        target: 'https://query1.finance.yahoo.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/yahoo\//, '/'),
      },
      '/api/telegram/': {
        target: 'https://api.telegram.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/telegram\//, '/'),
      },
      '/api/db': {
        target: 'http://127.0.0.1:3002',
        changeOrigin: true,
      },
      '/api/settings': {
        target: 'http://127.0.0.1:3002',
        changeOrigin: true,
      },
      '/api/scrape': {
        target: 'http://127.0.0.1:3003',
        changeOrigin: true,
      },
    },
    watch: {
      ignored: ['**/finstar-db.json', '**/finstar-settings.json', '**/finstar-settings.json.bak'],
    },
  },
})
