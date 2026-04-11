import 'dotenv/config'
import { handleLessonPipeline } from './server/lessonHttp.mjs'

/** Serves POST /api/lesson-pipeline on the same port as Vite (no second server). */
export function lessonApiPlugin() {
  return {
    name: 'thinkpop-lesson-api',
    configureServer(viteServer) {
      viteServer.httpServer?.once('listening', () => {
        const a = viteServer.httpServer?.address()
        const port = a && typeof a === 'object' ? a.port : ''
        if (port) {
          console.log(
            `[thinkpop] Open the app at http://127.0.0.1:${port} (lesson API is on the same origin)`
          )
        }
      })
      viteServer.middlewares.use(async (req, res, next) => {
        const result = await handleLessonPipeline(req, res)
        if (result === 'handled') return
        next()
      })
    },
  }
}
