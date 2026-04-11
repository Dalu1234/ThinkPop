import 'dotenv/config'
import http from 'node:http'
import { handleLessonPipeline } from './lessonHttp.mjs'

const PORT = Number(process.env.LESSON_SERVER_PORT || 8787)

const server = http.createServer(async (req, res) => {
  const handled = await handleLessonPipeline(req, res)
  if (handled === 'handled') return

  if (req.method === 'GET' && (req.url === '/' || req.url?.startsWith('/?'))) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>ThinkPop API</title></head>
<body style="font-family:system-ui;max-width:36rem;margin:2rem auto;line-height:1.5">
  <h1>ThinkPop lesson API</h1>
  <p>This port only exposes <code>POST /api/lesson-pipeline</code>. It is not the app UI.</p>
  <p><strong>Open the Vite app instead:</strong> run <code>npm run dev</code> and use the URL printed there (usually <a href="http://127.0.0.1:5173">http://127.0.0.1:5173</a>).</p>
</body></html>`)
    return
  }

  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Not found' }))
})

server.listen(PORT, () => {
  console.log(`[thinkpop] lesson API only → http://127.0.0.1:${PORT} (open Vite URL for the app)`)
})
