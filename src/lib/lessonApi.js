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

/** Stable seed so different problems rotate among multiple matching GLBs. */
function hashProblemSeed(text) {
  let h = 2166136261
  const s = String(text || '')
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Pass-through from Agent 6 visual model → 3D scene (object tokens + caption). */
function agentVisualHints(visualModel) {
  const vm = visualModel && typeof visualModel === 'object' ? visualModel : {}
  const out = {}
  if (typeof vm.itemShape === 'string' && vm.itemShape.trim()) {
    out.itemShape = vm.itemShape.trim()
  }
  if (typeof vm.itemColor === 'string' && vm.itemColor.startsWith('#')) {
    out.itemColor = vm.itemColor
  }
  if (typeof vm.itemLabel === 'string' && vm.itemLabel.trim()) {
    out.itemLabel = vm.itemLabel.trim()
  } else if (typeof vm.caption === 'string' && vm.caption.trim()) {
    out.itemLabel = vm.caption.trim()
  }
  return out
}

function parseOperationNumbers(text) {
  const s = String(text || '')
  let m = s.match(/(\d{1,2})\s*\+\s*(\d{1,2})/)
  if (m) return { op: 'addition', a: Number(m[1]), b: Number(m[2]) }
  m = s.match(/(\d{1,2})\s*-\s*(\d{1,2})/)
  if (m) return { op: 'subtraction', a: Number(m[1]), b: Number(m[2]) }
  m = s.match(/(\d{1,2})\s*[x×*]\s*(\d{1,2})/)
  if (m) return { op: 'multiplication', a: Number(m[1]), b: Number(m[2]) }
  m = s.match(/(\d{1,2})\s*[\/÷]\s*(\d{1,2})/)
  if (m) return { op: 'division', total: Number(m[1]), groupSize: Number(m[2]) }
  return null
}

function inferFallbackVisualization(result, problemText, assetVariant) {
  const topicText = String(result?.topic?.topicTitle || '').toLowerCase()
  const summaryText = String(result?.topic?.briefSummary || '').toLowerCase()
  const lessonText = Array.isArray(result?.lessonPlan?.segments)
    ? result.lessonPlan.segments
      .flatMap(seg => (Array.isArray(seg?.sentences) ? seg.sentences.map(s => s?.text) : [seg?.narration]))
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    : ''
  const combined = `${problemText} ${topicText} ${summaryText} ${lessonText}`.trim()
  const parsed = parseOperationNumbers(problemText) || parseOperationNumbers(combined)

  const hasMathCue = /\b(add|plus|sum|subtract|minus|take away|difference|multiply|times|product|divide|division|group|row|count)\b/.test(combined)
  if (!hasMathCue && !parsed) return null

  const hints = agentVisualHints(result?.visualModel)
  if (parsed?.op === 'subtraction' || /\bsubtract|minus|take away|difference\b/.test(combined)) {
    const a = parsed?.a ?? 8
    const b = Math.min(a, parsed?.b ?? 3)
    return { type: 'subtraction', a, b, steps: true, assetVariant, ...hints }
  }
  if (parsed?.op === 'multiplication' || /\bmultiply|multiplication|times|product|rows?|columns?|equal groups\b/.test(combined)) {
    const a = parsed?.a ?? 3
    const b = parsed?.b ?? 4
    return { type: 'multiplication', a, b, steps: true, assetVariant, ...hints }
  }
  if (parsed?.op === 'division' || /\bdivide|division|quotient|remainder|equal groups\b/.test(combined)) {
    const total = parsed?.total ?? 12
    const groupSize = parsed?.groupSize ?? 3
    return {
      type: 'division',
      total,
      groupSize,
      quotient: Math.floor(total / groupSize),
      remainder: total % groupSize,
      steps: true,
      assetVariant,
      ...hints,
    }
  }
  const a = parsed?.a ?? 4
  const b = parsed?.b ?? 3
  return { type: 'addition', a, b, steps: true, assetVariant, ...hints }
}

/** @param {Record<string, unknown>} result */
export function extractVisualization(result) {
  if (result?.visualization && typeof result.visualization === 'object') {
    return result.visualization
  }

  const rawProblem = String(result?.problem || result?.intake?.normalizedProblem || '')
  const problemText = normalizeSpokenMath(rawProblem)
  const assetVariant = hashProblemSeed(rawProblem)
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
        assetVariant,
        ...agentVisualHints(visualModel),
      }
    }
    return {
      type: 'addition',
      a: Number(visualModel.rowCounts[0]) || 0,
      b: Number(visualModel.rowCounts[1]) || 0,
      steps: true,
      assetVariant,
      ...agentVisualHints(visualModel),
    }
  }

  if (visualModel.kind === 'grid' && visualModel.rows > 0 && visualModel.cols > 0) {
    return {
      type: 'multiplication',
      a: Number(visualModel.cols) || 0,
      b: Number(visualModel.rows) || 0,
      steps: true,
      assetVariant,
      ...agentVisualHints(visualModel),
    }
  }

  if (visualModel.kind === 'division_groups' && visualModel.total > 0 && visualModel.groupSize > 0) {
    return {
      type: 'division',
      total: Number(visualModel.total) || 0,
      groupSize: Number(visualModel.groupSize) || 0,
      quotient: Number(visualModel.quotient) || 0,
      remainder: Number(visualModel.remainder) || 0,
      steps: true,
      assetVariant,
      ...agentVisualHints(visualModel),
    }
  }

  return inferFallbackVisualization(result, problemText, assetVariant)
}

/** @param {Record<string, unknown>} result */
export function formatLessonPlanMessage(result) {
  const { lessonPlan } = result
  const segs = lessonPlan?.segments || []
  const lines = []
  for (const seg of segs) {
    if (seg.sentences?.length) {
      for (const s of seg.sentences) lines.push((s.text || '').trim())
    } else if (seg.narration) {
      lines.push(seg.narration.trim())
    }
  }
  return lines.filter(Boolean).join(' ')
}

/** Flatten all sentences from all segments into a single ordered array. */
export function flattenSentences(lessonPlan) {
  const out = []
  for (const seg of (lessonPlan?.segments || [])) {
    if (seg.sentences?.length) {
      for (const s of seg.sentences) out.push(s)
    } else if (seg.narration) {
      out.push({
        id: `${seg.id}-s0`,
        text: seg.narration.trim(),
        durationSeconds: seg.durationSeconds || 5,
      })
    }
  }
  return out
}

const CONCEPT_SEGMENT_KINDS = new Set(['hook', 'model'])

function pushSegmentSentences(seg, out) {
  if (seg.sentences?.length) {
    for (const s of seg.sentences) out.push(s)
  } else if (seg.narration) {
    out.push({
      id: `${seg.id}-s0`,
      text: seg.narration.trim(),
      durationSeconds: seg.durationSeconds || 5,
    })
  }
}

/**
 * Split lesson narration: **topic teaching** (hook + model) vs **reinforcement** (practice, wrap, …).
 * Topic phase is where 3D visual explanations run; the rest is for after hands-on tools.
 * If segments omit `kind`, falls back to first half / second half of all sentences.
 *
 * @param {object | null | undefined} lessonPlan
 * @returns {{ concept: object[], rest: object[] }}
 */
export function getConceptAndRestSentences(lessonPlan) {
  const segs = lessonPlan?.segments || []
  const concept = []
  const rest = []
  for (const seg of segs) {
    const kind = String(seg.kind || '').toLowerCase()
    if (CONCEPT_SEGMENT_KINDS.has(kind)) {
      pushSegmentSentences(seg, concept)
    } else {
      pushSegmentSentences(seg, rest)
    }
  }
  if (concept.length > 0) {
    return { concept, rest }
  }
  const all = flattenSentences(lessonPlan)
  if (all.length <= 1) {
    return { concept: all, rest: [] }
  }
  const mid = Math.ceil(all.length / 2)
  return { concept: all.slice(0, mid), rest: all.slice(mid) }
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
