import 'dotenv/config'
import http from 'node:http'
import { handleLessonPipeline } from './lessonHttp.mjs'
import { handleAssets }         from './assetsHttp.mjs'
import { handleVlm }            from './vlmHttp.mjs'

const PORT = Number(process.env.LESSON_SERVER_PORT || 8787)

const server = http.createServer(async (req, res) => {
  let handled

  handled = await handleAssets(req, res)
  if (handled === 'handled') return

  handled = await handleVlm(req, res)
  if (handled === 'handled') return

  handled = await handleLessonPipeline(req, res)
  if (handled === 'handled') return

  if (req.method === 'GET' && (req.url === '/' || req.url?.startsWith('/?'))) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>ThinkPop API</title></head>
<body style="font-family:system-ui;max-width:36rem;margin:2rem auto;line-height:1.5">
  <h1>ThinkPop API</h1>
  <h2>Lesson pipeline</h2>
  <p><code>POST /api/lesson-pipeline</code> — body: <code>{"problem":"your question"}</code> — streams NDJSON</p>
  <h2>Assets</h2>
  <p><code>GET  /api/assets</code> — list all assets; query: <code>?category=Food&amp;tag=fruit&amp;generated=true</code></p>
  <p><code>GET  /api/assets/:id</code> — single asset</p>
  <p><code>POST /api/assets/generate</code> — body: <code>{"name","description","category","tags","color","shape"}</code> → returns <code>{taskId}</code></p>
  <p><code>GET  /api/assets/generate/:taskId</code> — poll generation status</p>
  <p><code>DELETE /api/assets/:id</code> — delete a generated asset</p>
  <p style="margin-top:2rem"><strong>Open the Vite app instead:</strong> run <code>npm run dev</code> (usually <a href="http://127.0.0.1:5173">http://127.0.0.1:5173</a>).</p>
</body></html>`)
    return
  }

  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Not found' }))
})

server.listen(PORT, () => {
  console.log(`[thinkpop] lesson API only → http://127.0.0.1:${PORT} (open Vite URL for the app)`)
})
