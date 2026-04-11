import { completeJson, getOpenAI } from './openaiClient.mjs'

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'

const BASE = `You are one stage in a multi-agent system that builds elementary mathematics lessons (grades K–5).
Use clear, encouraging language. Stay strictly within school mathematics. No unrelated topics.`

function delay(ms) {
  return new Promise(r => setTimeout(r, ms))
}

function mockPipeline(problem) {
  const intake = {
    normalizedProblem:
      problem?.trim() ||
      'The learner asked for help with a fraction addition exercise.',
    gradeBand: '3-5',
    mathDomain: 'Fractions — adding with like/unlike denominators',
    ambiguities: [],
    learnerIntent: 'Understand how to add fractions and visualize parts of a whole.',
  }
  const topic = {
    topicTitle: 'Adding fractions with visual models',
    subtopics: ['Unit fractions', 'Common denominators', 'Number line model'],
    briefSummary:
      'Learners connect symbolic fraction addition to area and length models before practicing symbolic steps.',
    relatedPrerequisites: ['Parts of a whole', 'Equivalent fractions'],
  }
  const objectives = {
    objectives: [
      {
        id: 'obj-1',
        statement: 'Explain what the numerator and denominator represent in a fraction.',
        bloomLevel: 'understand',
      },
      {
        id: 'obj-2',
        statement: 'Add two fractions with the same denominator using a visual model.',
        bloomLevel: 'apply',
      },
      {
        id: 'obj-3',
        statement: 'Rewrite fractions with unlike denominators using a common denominator.',
        bloomLevel: 'apply',
      },
    ],
  }
  const lessonPlan = {
    title: 'Hands-on fraction addition',
    estimatedMinutes: 25,
    segments: [
      {
        id: 'seg-hook',
        kind: 'hook',
        durationSeconds: 45,
        narration:
          "Let's use a chocolate bar to think about pieces that are the same size before we add them.",
        visualCue: '3D rectangle split into equal parts; pulse one shaded slice.',
        sceneHint: 'area_model_rectangle',
      },
      {
        id: 'seg-model',
        kind: 'model',
        durationSeconds: 120,
        narration:
          'When denominators match, we add the numerators and keep the denominator—the size of each piece did not change.',
        visualCue: 'Show 1/4 + 2/4 on the same bar; highlight merged shaded region.',
        sceneHint: 'fraction_bar_add_like',
      },
      {
        id: 'seg-practice',
        kind: 'practice',
        durationSeconds: 180,
        narration:
          'Try 1/2 + 1/4. First, change halves into fourths so the pieces match, then add.',
        visualCue: 'Transform 1/2 into 2/4 beside 1/4; combine to 3/4.',
        sceneHint: 'equivalent_fraction_transform',
      },
      {
        id: 'seg-check',
        kind: 'check',
        durationSeconds: 90,
        narration: 'Quick check: without drawing, what denominator do 1/3 and 1/6 share?',
        visualCue: 'Show two empty fraction bars labeled thirds and sixths.',
        sceneHint: 'compare_denominators',
      },
      {
        id: 'seg-wrap',
        kind: 'wrap',
        durationSeconds: 60,
        narration:
          'Great work! Same-sized pieces let us add safely; equivalent fractions help us resize pieces when needed.',
        visualCue: 'Celebrate checkmark over the combined bar.',
        sceneHint: 'celebration',
      },
    ],
    teacherNotes:
      'Emphasize “same-sized part” over rote rules; use gestures or manipulatives alongside the 3D model.',
  }
  const gesturePlan = mockGesturePlan(lessonPlan)
  const visualModel = mockVisualModel(problem, intake, topic, lessonPlan)
  return { intake, topic, objectives, lessonPlan, gesturePlan, visualModel }
}

function mockGesturePlan(lessonPlan) {
  const segments = lessonPlan?.segments || []
  const motions = ['wave', 'point', 'count', 'emphasize', 'open', 'point', 'wave']
  const hands = ['right', 'left', 'right', 'both', 'right', 'left', 'both']
  const gestures = segments.map((seg, i) => ({
    segmentId: seg.id,
    hand: hands[i % hands.length],
    motion: motions[i % motions.length],
  }))
  return { gestures }
}

function parseMultiplication(problem) {
  const s = (problem || '').replace(/\s+/g, '')
  const m = s.match(/(\d{1,2})\s*[x×*]\s*(\d{1,2})/i) || s.match(/(\d{1,2})\s*times\s*(\d{1,2})/i)
  if (!m) return null
  const a = Math.min(12, Math.max(1, parseInt(m[1], 10)))
  const b = Math.min(12, Math.max(1, parseInt(m[2], 10)))
  return { a, b }
}

function mockVisualModel(problem, intake, topic, lessonPlan) {
  const mult = parseMultiplication(problem)
  if (mult) {
    const rows = mult.b
    const cols = mult.a
    return {
      kind: 'grid',
      rows,
      cols,
      itemShape: 'apple',
      itemColor: '#e84b3c',
      caption: `${mult.a} × ${mult.b} = ${mult.a * mult.b} (${cols} per row × ${rows} rows)`,
    }
  }
  if (/fraction|half|third|fourth|quarter|denominator/i.test(problem + (topic?.topicTitle || ''))) {
    return {
      kind: 'grid',
      rows: 1,
      cols: 4,
      itemShape: 'block',
      itemColor: '#ff6eb4',
      caption: 'Four equal parts — one whole split into fourths',
    }
  }
  return {
    kind: 'none',
    rows: 0,
    cols: 0,
    itemShape: 'sphere',
    itemColor: '#00e5ff',
    caption: lessonPlan?.title || 'Model',
  }
}

async function agentIntake(rawProblem) {
  const system = `${BASE}
You are Agent 1 — Intake. Read the learner or teacher message and extract structured context for a math lesson.
Return JSON only with keys:
- normalizedProblem (string)
- gradeBand (one of: "K-2", "3-5", "6+", "unspecified")
- mathDomain (short string, e.g. "Addition within 20")
- ambiguities (array of strings; empty if none)
- learnerIntent (string)`
  const user = `Message:\n${rawProblem}`
  return completeJson({ model: MODEL, system, user })
}

async function agentTopic(intake) {
  const system = `${BASE}
You are Agent 2 — Topic designer. Given intake JSON, propose the focused instructional topic.
Return JSON only with keys:
- topicTitle (string)
- subtopics (array of strings, 2–5 items)
- briefSummary (2–4 sentences)
- relatedPrerequisites (array of strings, 1–4 items)`
  const user = JSON.stringify(intake, null, 2)
  return completeJson({ model: MODEL, system, user })
}

async function agentObjectives(intake, topic) {
  const system = `${BASE}
You are Agent 3 — Objectives. Write measurable outcomes for elementary students.
Return JSON only with keys:
- objectives (array of 2–4 objects)
Each objective object: id (string), statement (string starting with student action), bloomLevel (one of: remember, understand, apply, analyze).`
  const user = `Intake:\n${JSON.stringify(intake, null, 2)}\n\nTopic:\n${JSON.stringify(topic, null, 2)}`
  return completeJson({ model: MODEL, system, user })
}

async function agentLessonPlan(intake, topic, objectives) {
  const system = `${BASE}
You are Agent 4 — Lesson plan. Build a concise lesson that a 3D visual tutor and voice narration can follow.
Return JSON only with keys:
- title (string)
- estimatedMinutes (number, 10–40)
- segments (ordered array, 4–7 items)
Each segment: id (string), kind (one of: hook, model, practice, check, wrap), durationSeconds (number), narration (string, speak-aloud script), visualCue (string, what appears on screen), sceneHint (short machine token like "number_line_jump" or "fraction_bar")
- teacherNotes (string, 1–3 sentences for the adult)`
  const user = `Intake:\n${JSON.stringify(intake, null, 2)}\n\nTopic:\n${JSON.stringify(topic, null, 2)}\n\nObjectives:\n${JSON.stringify(objectives, null, 2)}`
  return completeJson({ model: MODEL, system, user })
}

async function agentGesturePlan(lessonPlan) {
  const system = `${BASE}
You are Agent 5 — Gesture director. The 3D tutor will move its arms while each lesson segment is explained.
Return JSON only with key "gestures": an array with EXACTLY one object per segment in the lesson plan, in the SAME ORDER as segments.
Each object: segmentId (string, must match the segment id), hand ("left"|"right"|"both"), motion ("rest"|"point"|"wave"|"count"|"open"|"emphasize").
Vary motions naturally: hook might use "wave", model might use "point", practice "count", check "open", wrap "emphasize".`
  const user = JSON.stringify(lessonPlan, null, 2)
  return completeJson({ model: MODEL, system, user })
}

async function agentVisualModel(intake, topic, lessonPlan) {
  const system = `${BASE}
You are Agent 6 — Visual model director. Choose a concrete countable 3D arrangement for the MAIN mathematical idea.
For whole-number multiplication (e.g. 3×4), use kind "grid" with rows and cols so rows*cols equals the product; put the FIRST factor as cols (items per row) and SECOND as rows unless the problem wording clearly says otherwise (e.g. "3 apples in each of 4 rows" → cols 3, rows 4).
Return JSON only:
- kind: "grid" or "none"
- rows: integer 1-12 (use 0 if kind is none)
- cols: integer 1-12 (use 0 if kind is none)
- itemShape: "apple"|"sphere"|"block"
- itemColor: CSS hex color
- caption: one short line for the learner
If the lesson is purely symbolic with no discrete model, use kind "none" with rows 0, cols 0.`
  const user = `Intake:\n${JSON.stringify(intake, null, 2)}\n\nTopic:\n${JSON.stringify(topic, null, 2)}\n\nLesson plan:\n${JSON.stringify(lessonPlan, null, 2)}`
  return completeJson({ model: MODEL, system, user })
}

function normalizeGesturePlan(lessonPlan, raw) {
  const segments = lessonPlan?.segments || []
  const list = Array.isArray(raw?.gestures) ? raw.gestures : []
  const byId = new Map(list.map(g => [g.segmentId, g]))
  const motions = ['rest', 'point', 'wave', 'count', 'open', 'emphasize']
  const hands = ['right', 'left', 'both']
  return {
    gestures: segments.map((seg, i) => {
      const g = byId.get(seg.id) || list[i] || {}
      const motion = motions.includes(g.motion) ? g.motion : motions[i % motions.length]
      const hand = hands.includes(g.hand) ? g.hand : hands[i % hands.length]
      return { segmentId: seg.id, hand, motion }
    }),
  }
}

function normalizeVisualModel(raw) {
  const kind = raw?.kind === 'grid' ? 'grid' : 'none'
  let rows = Number(raw?.rows) || 0
  let cols = Number(raw?.cols) || 0
  if (kind === 'grid') {
    rows = Math.min(12, Math.max(1, Math.round(rows)))
    cols = Math.min(12, Math.max(1, Math.round(cols)))
  }
  const shapes = ['apple', 'sphere', 'block']
  const shape = shapes.includes(raw?.itemShape) ? raw.itemShape : 'sphere'
  const color = typeof raw?.itemColor === 'string' && raw.itemColor.startsWith('#') ? raw.itemColor : '#00e5ff'
  return {
    kind,
    rows,
    cols,
    itemShape: shape,
    itemColor: color,
    caption: String(raw?.caption || ''),
  }
}

/**
 * @param {{ problem: string, gradeBand?: string }} input
 */
export async function* runLessonPipelineStream(input) {
  const problem = (input.problem || '').trim()
  if (!problem) {
    yield { stage: 'error', error: 'Missing problem text' }
    return
  }

  const useMock = !getOpenAI()

  if (useMock) {
    await delay(200)
    const m = mockPipeline(problem)
    yield { stage: 'intake', agent: 'Agent 1 — Intake', data: m.intake }
    await delay(280)
    yield { stage: 'topic', agent: 'Agent 2 — Topic', data: m.topic }
    await delay(280)
    yield { stage: 'objectives', agent: 'Agent 3 — Objectives', data: m.objectives }
    await delay(280)
    yield { stage: 'lessonPlan', agent: 'Agent 4 — Lesson plan', data: m.lessonPlan }
    await delay(260)
    yield { stage: 'gestures', agent: 'Agent 5 — Gesture director', data: m.gesturePlan }
    await delay(260)
    yield { stage: 'visualModel', agent: 'Agent 6 — Visual model', data: m.visualModel }
    yield {
      stage: 'complete',
      result: {
        problem,
        intake: m.intake,
        topic: m.topic,
        objectives: m.objectives,
        lessonPlan: m.lessonPlan,
        gesturePlan: m.gesturePlan,
        visualModel: m.visualModel,
        mock: true,
      },
    }
    return
  }

  try {
    const intake = await agentIntake(problem)
    yield { stage: 'intake', agent: 'Agent 1 — Intake', data: intake }

    const topic = await agentTopic(intake)
    yield { stage: 'topic', agent: 'Agent 2 — Topic', data: topic }

    const objectives = await agentObjectives(intake, topic)
    yield { stage: 'objectives', agent: 'Agent 3 — Objectives', data: objectives }

    const lessonPlan = await agentLessonPlan(intake, topic, objectives)
    yield { stage: 'lessonPlan', agent: 'Agent 4 — Lesson plan', data: lessonPlan }

    const gestureRaw = await agentGesturePlan(lessonPlan)
    const gesturePlan = normalizeGesturePlan(lessonPlan, gestureRaw)
    yield { stage: 'gestures', agent: 'Agent 5 — Gesture director', data: gesturePlan }

    const visualRaw = await agentVisualModel(intake, topic, lessonPlan)
    const visualModel = normalizeVisualModel(visualRaw)
    yield { stage: 'visualModel', agent: 'Agent 6 — Visual model', data: visualModel }

    yield {
      stage: 'complete',
      result: {
        problem,
        intake,
        topic,
        objectives,
        lessonPlan,
        gesturePlan,
        visualModel,
        mock: false,
      },
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    yield { stage: 'error', error: message }
  }
}
