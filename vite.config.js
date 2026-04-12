import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { lessonApiPlugin } from './vite-lesson-api-plugin.js'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiKey = env.ELEVENLABS_API_KEY || process.env.ELEVENLABS_API_KEY || ''
  // Real MDM (e.g. brainpop backend): set VITE_MOTION_PROXY_TARGET=http://127.0.0.1:8001 — skips ThinkPop motion-server on :8000
  const motionProxyTarget =
    env.VITE_MOTION_PROXY_TARGET ||
    process.env.VITE_MOTION_PROXY_TARGET ||
    'http://127.0.0.1:8000'

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
    plugins: [react(), lessonApiPlugin()],
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: false,
      proxy: {
        '/api/elevenlabs': elevenLabsProxy,
        // Motion: ThinkPop gateway :8000 by default, or brainpop MDM via VITE_MOTION_PROXY_TARGET
        '/api/motion': {
          target: motionProxyTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/motion/, '/generate'),
        },
      },
    },
    preview: {
      proxy: {
        '/api/elevenlabs': elevenLabsProxy,
        '/api/motion': {
          target: motionProxyTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/motion/, '/generate'),
        },
      },
    },
  }
})
