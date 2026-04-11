import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiKey = env.ELEVENLABS_API_KEY || process.env.ELEVENLABS_API_KEY || ''

  const elevenLabsProxy = {
    target: 'https://api.elevenlabs.io',
    changeOrigin: true,
    secure: true,
    rewrite: (path) => path.replace(/^\/api\/elevenlabs/, ''),
    configure: (proxy) => {
      proxy.on('proxyReq', (proxyReq) => {
        if (apiKey) {
          proxyReq.setHeader('xi-api-key', apiKey)
        }
      })
    },
  }
  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api/elevenlabs': elevenLabsProxy,
      },
    },
    preview: {
      proxy: {
        '/api/elevenlabs': elevenLabsProxy,
      },
    },
  }
})
