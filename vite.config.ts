import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

const sharedConfigProxyTarget = process.env.SHARED_CONFIG_PROXY_TARGET ?? 'http://localhost:8788'

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    host: true,
    port: 5175,
    proxy: {
      '/api/admin/shared-config': {
        target: sharedConfigProxyTarget,
        changeOrigin: true,
      },
      '/health': {
        target: sharedConfigProxyTarget,
        changeOrigin: true,
      },
    },
  },
  build: {
    target: 'chrome85',
    cssMinify: false,
    chunkSizeWarningLimit: 1500,
    rolldownOptions: {
      onwarn(warning, defaultHandler) {
        if (warning.code === 'COMMONJS_VARIABLE_IN_ESM' && warning.id?.includes('/dashjs/')) return
        defaultHandler(warning)
      },
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/react') || id.includes('/node_modules/react-dom')) return 'react-vendor'
          if (id.includes('/node_modules/hls.js')) return 'media-hls'
          if (id.includes('/node_modules/')) return 'vendor'
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
