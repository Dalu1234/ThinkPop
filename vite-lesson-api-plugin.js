import 'dotenv/config'
import { handleLessonPipeline } from './server/lessonHttp.mjs'
import { handleAssets }         from './server/assetsHttp.mjs'
import { handleVlm }            from './server/vlmHttp.mjs'

/** Serves all API routes on the same port as Vite (no second server needed). */
export function lessonApiPlugin() {
  return {
    name: 'thinkpop-lesson-api',
    configureServer(viteServer) {
      viteServer.httpServer?.once('listening', () => {
        const a = viteServer.httpServer?.address()
        const port = a && typeof a === 'object' ? a.port : ''
        if (port) {
          console.log(
            `[thinkpop] Open the app at http://127.0.0.1:${port} (API is on the same origin)`
          )
        }
      })
      viteServer.middlewares.use(async (req, res, next) => {
        let result

        result = await handleAssets(req, res)
        if (result === 'handled') return

        result = await handleVlm(req, res)
        if (result === 'handled') return

        result = await handleLessonPipeline(req, res)
        if (result === 'handled') return

        next()
      })
    },
  }
}
