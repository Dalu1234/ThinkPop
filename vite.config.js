import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { lessonApiPlugin } from './vite-lesson-api-plugin.js'

export default defineConfig({
  plugins: [react(), lessonApiPlugin()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: false,
  },
})
