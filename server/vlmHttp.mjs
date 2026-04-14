import { getOpenAI } from './openaiClient.mjs'

function cors(res, origin) {
  res.setHeader('Access-Control-Allow-Origin', origin || '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', c => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

export async function handleVlm(req, res) {
  const url = new URL(req.url || '/', 'http://localhost')
  const origin = req.headers['origin']

  if (req.method === 'OPTIONS' && url.pathname === '/api/vlm-chat') {
    cors(res, origin)
    res.writeHead(204)
    res.end()
    return 'handled'
  }

  if (req.method === 'POST' && url.pathname === '/api/vlm-chat') {
    cors(res, origin)
    try {
      const raw  = await readBody(req)
      const body = JSON.parse(raw)
      const { messages, model = 'gpt-4o' } = body

      if (!Array.isArray(messages) || messages.length === 0) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'messages array required' }))
        return 'handled'
      }

      const openai     = getOpenAI()
      const completion = await openai.chat.completions.create({
        model,
        max_tokens: 2048,
        messages,
      })

      const reply = completion.choices[0]?.message?.content ?? ''
      const usage = completion.usage

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ reply, usage }))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const status = msg.includes('401') ? 401 : msg.includes('429') ? 429 : 500
      res.writeHead(status, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: msg }))
    }
    return 'handled'
  }

  return null
}
