const MATH_EMOJIS = ['🔢', '📐', '📊', '🍕', '🧮', '🎯', '✨']

const NUMBER_WORDS = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
}

function normalizeSpokenMath(text) {
  let s = String(text || '').toLowerCase()
  s = s
    .replace(/\bwhat\s+is\b/g, ' ')
    .replace(/\bteach\s+me\b/g, ' ')
    .replace(/\bshow\s+me\b/g, ' ')
    .replace(/\bplus\b/g, ' + ')
    .replace(/\bminus\b/g, ' - ')
    .replace(/\btimes\b/g, ' x ')
    .replace(/\bdivided\s+by\b/g, ' / ')
  s = s.replace(
    /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/g,
    match => String(NUMBER_WORDS[match] ?? match)
  )
  return s.replace(/\s+/g, '')
}

export function emojiForTopic(text) {
  if (!text) return '🔢'
  let h = 0
  for (let i = 0; i < text.length; i++) {
    h = (h + text.charCodeAt(i) * (i + 1)) % MATH_EMOJIS.length
  }
  return MATH_EMOJIS[h]
}

/** @param {Record<string, unknown>} result */
export function extractVisualization(result) {
  if (result?.visualization && typeof result.visualization === 'object') {
    return result.visualization
  }

  const problemText = normalizeSpokenMath(result?.problem || result?.intake?.normalizedProblem || '')
  const visualModel = result?.visualModel
  if (!visualModel || typeof visualModel !== 'object') return null

  if (visualModel.kind === 'addition_rows' && Array.isArray(visualModel.rowCounts) && visualModel.rowCounts.length >= 2) {
    const subtractionMatch = problemText.match(/(\d{1,2})\s*-\s*(\d{1,2})/)
    if (subtractionMatch) {
      return {
        type: 'subtraction',
        a: Number(subtractionMatch[1]) || Number(visualModel.rowCounts[0]) || 0,
        b: Number(subtractionMatch[2]) || Number(visualModel.rowCounts[1]) || 0,
        steps: true,
      }
    }
    return {
      type: 'addition',
      a: Number(visualModel.rowCounts[0]) || 0,
      b: Number(visualModel.rowCounts[1]) || 0,
      steps: true,
    }
  }

  if (visualModel.kind === 'grid' && visualModel.rows > 0 && visualModel.cols > 0) {
    return {
      type: 'multiplication',
      a: Number(visualModel.cols) || 0,
      b: Number(visualModel.rows) || 0,
      steps: true,
    }
  }

  return null
}

/** @param {Record<string, unknown>} result */
export function formatLessonPlanMessage(result) {
  const { lessonPlan } = result
  const segs = lessonPlan?.segments || []
  // Speak only the narration lines — one sentence each, back to back.
  return segs
    .map(s => (s.narration || '').trim())
    .filter(Boolean)
    .join(' ')
}

/**
 * @param {string} problem
 * @param {{ onEvent?: (e: object) => void, signal?: AbortSignal, gradeBand?: string }} options
 */
export async function streamLessonPipeline(problem, options = {}) {
  const { onEvent, signal, gradeBand } = options
  const res = await fetch('/api/lesson-pipeline', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ problem, gradeBand }),
    signal,
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(errText || `Lesson pipeline failed (${res.status})`)
  }

  const reader = res.body?.getReader()
  if (!reader) throw new Error('No response body')

  const decoder = new TextDecoder()
  let buffer = ''
  let lastComplete = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let nl
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      if (!line) continue
      const evt = JSON.parse(line)
      onEvent?.(evt)
      if (evt.stage === 'complete') lastComplete = evt.result
      if (evt.stage === 'error') throw new Error(evt.error || 'Pipeline error')
    }
  }

  buffer += decoder.decode()
  const tail = buffer.trim()
  if (tail) {
    const evt = JSON.parse(tail)
    onEvent?.(evt)
    if (evt.stage === 'complete') lastComplete = evt.result
    if (evt.stage === 'error') throw new Error(evt.error || 'Pipeline error')
  }

  return lastComplete
}
