import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/review': {
        target: 'https://una-ai-tools-apis.una-oic.org',
        changeOrigin: true,
        rewrite: (path) => '/api/news_reviewer/review/',
        headers: {
          'x-api-key': 'ata_d96559789f111fffa039143dd65273d1d71a824f998e30b00a26a397',
        },
      },
    },
  },
})
