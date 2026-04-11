import { runLessonPipelineStream } from './lessonPipeline.mjs'

export function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

export function readJsonBody(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', chunk => {
      size += chunk.length
      if (size > limit) {
        reject(new Error('Body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8')
        resolve(raw ? JSON.parse(raw) : {})
      } catch (e) {
        reject(e)
      }
    })
    req.on('error', reject)
  })
}

/**
 * @returns {Promise<'handled' | 'skip'>}
 */
export async function handleLessonPipeline(req, res) {
  const path = (req.url || '').split('?')[0]
  if (path !== '/api/lesson-pipeline') return 'skip'

  const origin = req.headers.origin

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders(origin))
    res.end()
    return 'handled'
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json', ...corsHeaders(origin) })
    res.end(JSON.stringify({ error: 'Use POST with JSON { "problem": "your question" }' }))
    return 'handled'
  }

  let body
  try {
    body = await readJsonBody(req)
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json', ...corsHeaders(origin) })
    res.end(JSON.stringify({ error: 'Invalid JSON body' }))
    return 'handled'
  }

  res.writeHead(200, {
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-store',
    ...corsHeaders(origin),
  })

  try {
    for await (const event of runLessonPipelineStream(body)) {
      res.write(`${JSON.stringify(event)}\n`)
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    res.write(`${JSON.stringify({ stage: 'error', error: message })}\n`)
  }
  res.end()
  return 'handled'
}
