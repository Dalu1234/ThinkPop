import OpenAI from 'openai'

let singleton = null

export function getOpenAI() {
  if (!process.env.OPENAI_API_KEY) return null
  if (!singleton) {
    singleton = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return singleton
}

/**
 * @param {object} opts
 * @param {string} opts.model
 * @param {string} opts.system
 * @param {string} opts.user
 */
export async function completeJson({ model, system, user }) {
  const client = getOpenAI()
  if (!client) throw new Error('OPENAI_API_KEY is not set')

  const res = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    response_format: { type: 'json_object' },
  })
  const text = res.choices[0]?.message?.content
  if (!text) throw new Error('Empty model response')
  return JSON.parse(text)
}
