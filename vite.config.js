import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    allowedHosts: ['meshmap.gwtech.org', 'localhost'],
    proxy: {
      '/api': {
        target: 'https://meshtastic.liamcottle.net',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path
      }
    }
  }
})
