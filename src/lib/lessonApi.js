const MATH_EMOJIS = ['🔢', '📐', '📊', '🍕', '🧮', '🎯', '✨']

export function emojiForTopic(text) {
  if (!text) return '🔢'
  let h = 0
  for (let i = 0; i < text.length; i++) {
    h = (h + text.charCodeAt(i) * (i + 1)) % MATH_EMOJIS.length
  }
  return MATH_EMOJIS[h]
}

/** @param {Record<string, unknown>} result */
export function formatLessonPlanMessage(result, segmentsToSpeak = null) {
  const { lessonPlan } = result
  const segs = segmentsToSpeak || lessonPlan?.segments || []
  // Speak only the narration lines — one sentence each, back to back.
  return segs
    .map(s => (s.narration || '').trim())
    .filter(Boolean)
    .join(' ')
}

export function findQuestionForSegment(lessonPlan, segmentId) {
  if (!lessonPlan) return null
  
  if (segmentId.startsWith('seg-checkpoint-')) {
    const idx = parseInt(segmentId.replace('seg-checkpoint-', ''), 10) - 1
    const cp = lessonPlan.workedExample?.checkpoints?.[idx]
    if (cp) return { answer: cp.expectedAnswer, successMessage: 'Great job! That is correct.', segmentId }
  }
  
  if (segmentId.startsWith('seg-retry-checkpoint-')) {
    const idx = parseInt(segmentId.replace('seg-retry-checkpoint-', ''), 10) - 1
    const cp = lessonPlan.retryPlan?.workedExample?.checkpoints?.[idx]
    if (cp) return { answer: cp.expectedAnswer, successMessage: 'Great job! That is correct.', segmentId }
  }
  
  if (segmentId === 'seg-final-question' || segmentId === 'seg-retry-final') {
    return { ...lessonPlan.targetQuestion, segmentId }
  }
  
  return null
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
