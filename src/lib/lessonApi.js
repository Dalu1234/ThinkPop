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
export function formatLessonPlanMessage(result) {
  const { intake, topic, objectives, lessonPlan, gesturePlan, visualModel, mock } = result
  const lines = []

  lines.push('Your question')
  lines.push(intake?.normalizedProblem || result.problem || '')
  lines.push('')
  lines.push(`Topic — ${topic?.topicTitle || 'Math'}`)
  if (topic?.briefSummary) {
    lines.push(topic.briefSummary)
  }
  lines.push('')
  lines.push('Learning goals')
  const objs = objectives?.objectives || []
  objs.forEach((o, i) => {
    lines.push(`${i + 1}. ${o.statement || o.text || JSON.stringify(o)}`)
  })
  lines.push('')
  lines.push(
    `Lesson plan — ${lessonPlan?.title || 'Lesson'} (about ${lessonPlan?.estimatedMinutes ?? '?'} min)`
  )
  const segs = lessonPlan?.segments || []
  segs.forEach((s, i) => {
    const kind = s.kind || 'step'
    const sec = s.durationSeconds != null ? `${s.durationSeconds}s` : ''
    lines.push('')
    lines.push(`${i + 1}. ${kind}${sec ? ` (${sec})` : ''}`)
    if (s.narration) lines.push(s.narration)
    if (s.visualCue) lines.push(`Visual: ${s.visualCue}`)
  })
  if (lessonPlan?.teacherNotes) {
    lines.push('')
    lines.push(`Teacher note: ${lessonPlan.teacherNotes}`)
  }
  const gests = gesturePlan?.gestures
  if (Array.isArray(gests) && gests.length) {
    lines.push('')
    lines.push('Gestures (Agent 5) — while explaining each segment')
    gests.forEach((g, i) => {
      lines.push(`${i + 1}. ${g.segmentId || 'segment'}: ${g.motion || '?'} (${g.hand || 'both'} hand)`)
    })
  }
  if (visualModel && visualModel.kind === 'grid' && visualModel.rows && visualModel.cols) {
    lines.push('')
    lines.push(
      `3D model (Agent 6): ${visualModel.rows} rows × ${visualModel.cols} columns of ${visualModel.itemShape || 'items'}`
    )
    if (visualModel.caption) lines.push(visualModel.caption)
  } else if (visualModel?.caption) {
    lines.push('')
    lines.push(`3D model (Agent 6): ${visualModel.caption}`)
  }
  if (mock) {
    lines.push('')
    lines.push(
      'Demo mode: add OPENAI_API_KEY to .env and run npm run dev (lesson server) for live agents.'
    )
  }
  return lines.join('\n')
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
