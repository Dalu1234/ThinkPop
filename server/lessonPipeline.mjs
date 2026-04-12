import { completeJson, getOpenAI } from './openaiClient.mjs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'
const AGENT_OUTPUTS_DIR = path.resolve(process.cwd(), 'agent-outputs')

const BASE = `You are one stage in a multi-agent system that builds elementary mathematics lessons (grades K–5).
Use clear, encouraging language. Stay strictly within school mathematics. No unrelated topics.`

function delay(ms) {
  return new Promise(r => setTimeout(r, ms))
}

function slugify(value) {
  return String(value || 'lesson')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'lesson'
}

function runId(problem) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  return `${stamp}-${slugify(problem)}`
}

async function writeAgentOutputs(problem, outputs) {
  const dir = path.join(AGENT_OUTPUTS_DIR, runId(problem))
  await mkdir(dir, { recursive: true })

  const files = [
    ['agent-1-intake.json', outputs.intake],
    ['agent-2-topic.json', outputs.topic],
    ['agent-3-objectives.json', outputs.objectives],
    ['agent-4-lesson-plan.json', outputs.lessonPlan],
    ['agent-5-gestures.json', outputs.gesturePlan],
    ['agent-6-visual-model.json', outputs.visualModel],
  ]

  await Promise.all(
    files.map(([name, data]) =>
      writeFile(path.join(dir, name), `${JSON.stringify(data, null, 2)}\n`, 'utf8')
    )
  )

  return {
    directory: dir,
    files: Object.fromEntries(files.map(([name]) => [name.replace('.json', ''), path.join(dir, name)])),
  }
}

function mockPipeline(problem) {
  const addition = parseAddition(problem)
  const division = parseDivision(problem)
  const multiplication = parseMultiplication(problem)

  if (addition) {
    const { a, b } = addition
    const sum = a + b
    const intake = {
      normalizedProblem: problem?.trim() || `What is ${a} + ${b}?`,
      gradeBand: 'K-2',
      mathDomain: 'Addition within 20',
      ambiguities: [],
      learnerIntent: 'Understand how addition combines two groups to make a total.',
    }
    const topic = {
      topicTitle: 'Adding two whole numbers with visual groups',
      subtopics: ['Combining groups', 'Counting on', 'Writing an addition equation'],
      briefSummary:
        'Learners combine two small sets, count the total, and connect the model to an addition equation.',
      relatedPrerequisites: ['Counting objects to 20', 'Recognizing numerals', 'One-to-one counting'],
    }
    const objectives = {
      objectives: [
        {
          id: 'obj-1',
          statement: 'Count two groups of objects and tell how many there are altogether.',
          bloomLevel: 'understand',
        },
        {
          id: 'obj-2',
          statement: `Add ${a} and ${b} to find a total of ${sum}.`,
          bloomLevel: 'apply',
        },
        {
          id: 'obj-3',
          statement: `Write the equation ${a} + ${b} = ${sum} to match a visual model.`,
          bloomLevel: 'apply',
        },
      ],
    }
    const lessonPlan = {
      title: `Adding ${a} and ${b}`,
      estimatedMinutes: 5,
      segments: [
        {
          id: 'seg-hook',
          kind: 'hook',
          visualCue: `Two groups of stars`,
          sceneHint: 'count_groups_hook',
          sentences: [
            { id: 's1', text: `Hey there! Today we're going to learn about addition.`, durationSeconds: 4 },
            { id: 's2', text: `We have ${a} stars and ${b} more — let's count them all together.`, durationSeconds: 5 },
          ],
        },
        {
          id: 'seg-model',
          kind: 'model',
          visualCue: `Stars combine into one group`,
          sceneHint: 'count_on_addition',
          sentences: [
            { id: 's3', text: `Start at ${a} and count on ${b} more.`, durationSeconds: 4 },
            { id: 's4', text: `That gives us ${sum} altogether!`, durationSeconds: 4 },
          ],
        },
        {
          id: 'seg-practice',
          kind: 'practice',
          visualCue: `Equation ${a} + ${b} = ${sum}`,
          sceneHint: 'guided_addition_practice',
          sentences: [
            { id: 's5', text: `Say it with me: ${a} plus ${b} equals ${sum}.`, durationSeconds: 4 },
            { id: 's6', text: `Now you try — count on from ${a}.`, durationSeconds: 4 },
          ],
        },
        {
          id: 'seg-wrap',
          kind: 'wrap',
          visualCue: `Final equation highlighted`,
          sceneHint: 'addition_wrap',
          sentences: [
            { id: 's7', text: `Great work — ${a} plus ${b} always equals ${sum}.`, durationSeconds: 4 },
            { id: 's8', text: `You did an awesome job today!`, durationSeconds: 3 },
          ],
        },
      ],
      teacherNotes: 'Have students point to each object while counting on.',
    }
    const lessonPlanNorm = normalizeLessonPlan(lessonPlan)
    const gesturePlan = normalizeGesturePlan(lessonPlanNorm, mockGesturePlan(lessonPlanNorm))
    const visualModel = mockVisualModel(problem, intake, topic, lessonPlanNorm)
    return { intake, topic, objectives, lessonPlan: lessonPlanNorm, gesturePlan, visualModel }
  }

  if (multiplication) {
    const { a, b } = multiplication
    const product = a * b
    const intake = {
      normalizedProblem: problem?.trim() || `What is ${a} x ${b}?`,
      gradeBand: '3-5',
      mathDomain: 'Multiplication as equal groups',
      ambiguities: [],
      learnerIntent: 'Understand multiplication as equal groups and find the total number of objects.',
    }
    const topic = {
      topicTitle: 'Multiplication with equal groups and arrays',
      subtopics: ['Equal groups', 'Rows and columns', 'Repeated addition'],
      briefSummary:
        'Learners interpret multiplication as equal groups, build an array, and connect the array to a multiplication equation.',
      relatedPrerequisites: ['Skip counting', 'Addition', 'Counting rows and columns'],
    }
    const objectives = {
      objectives: [
        {
          id: 'obj-1',
          statement: 'Describe multiplication as equal groups of the same size.',
          bloomLevel: 'understand',
        },
        {
          id: 'obj-2',
          statement: `Build or read an array for ${a} x ${b}.`,
          bloomLevel: 'apply',
        },
        {
          id: 'obj-3',
          statement: `Find the product of ${a} x ${b} = ${product}.`,
          bloomLevel: 'apply',
        },
      ],
    }
    const lessonPlan = {
      title: `${a} times ${b} as equal groups`,
      estimatedMinutes: 5,
      segments: [
        {
          id: 'seg-hook',
          kind: 'hook',
          visualCue: `Array of ${b} rows × ${a} apples`,
          sceneHint: 'array_hook',
          sentences: [
            { id: 's1', text: `Let's learn about multiplication today!`, durationSeconds: 4 },
            { id: 's2', text: `Here are ${b} rows with ${a} apples in each row.`, durationSeconds: 5 },
          ],
        },
        {
          id: 'seg-model',
          kind: 'model',
          visualCue: `Rows labeled, total shown`,
          sceneHint: 'array_model',
          sentences: [
            { id: 's3', text: `${a} times ${b} means ${b} equal groups of ${a}.`, durationSeconds: 5 },
            { id: 's4', text: `That gives us ${product} total!`, durationSeconds: 3 },
          ],
        },
        {
          id: 'seg-practice',
          kind: 'practice',
          visualCue: `Each row pulses in turn`,
          sceneHint: 'array_count_practice',
          sentences: [
            { id: 's5', text: `Count the rows with me: ${b} rows of ${a}.`, durationSeconds: 4 },
            { id: 's6', text: `That equals ${product} altogether!`, durationSeconds: 4 },
          ],
        },
        {
          id: 'seg-wrap',
          kind: 'wrap',
          visualCue: `Equation ${a} × ${b} = ${product}`,
          sceneHint: 'multiplication_wrap',
          sentences: [
            { id: 's7', text: `${a} times ${b} equals ${product} — remember that!`, durationSeconds: 4 },
            { id: 's8', text: `Great job learning multiplication!`, durationSeconds: 3 },
          ],
        },
      ],
      teacherNotes: 'Connect each row to one equal group.',
    }
    const lessonPlanNorm = normalizeLessonPlan(lessonPlan)
    const gesturePlan = normalizeGesturePlan(lessonPlanNorm, mockGesturePlan(lessonPlanNorm))
    const visualModel = mockVisualModel(problem, intake, topic, lessonPlanNorm)
    return { intake, topic, objectives, lessonPlan: lessonPlanNorm, gesturePlan, visualModel }
  }

  if (division) {
    const { total, groupSize } = division
    const quotient = Math.floor(total / groupSize)
    const remainder = total % groupSize
    const intake = {
      normalizedProblem: problem?.trim() || `What is ${total} / ${groupSize}?`,
      gradeBand: '3-5',
      mathDomain: 'Whole-number division as equal groups',
      ambiguities: remainder ? ['There is a remainder to interpret.'] : [],
      learnerIntent: 'Understand division by sorting a total into equal groups and finding how many groups can be made.',
    }
    const topic = {
      topicTitle: 'Division with equal groups',
      subtopics: ['Total amount', 'Group size', 'Number of groups'],
      briefSummary:
        'Learners start with the whole set, make equal groups, and use the grouping to see the quotient.',
      relatedPrerequisites: ['Counting objects', 'Equal groups', 'Multiplication facts'],
    }
    const objectives = {
      objectives: [
        {
          id: 'obj-1',
          statement: 'Describe division as putting a total into equal groups.',
          bloomLevel: 'understand',
        },
        {
          id: 'obj-2',
          statement: `Make groups of ${groupSize} from a total of ${total}.`,
          bloomLevel: 'apply',
        },
        {
          id: 'obj-3',
          statement: remainder
            ? `Find that ${total} divided by ${groupSize} makes ${quotient} equal groups with ${remainder} left over.`
            : `Find that ${total} divided by ${groupSize} makes ${quotient} equal groups.`,
          bloomLevel: 'apply',
        },
      ],
    }
    const lessonPlan = {
      title: `Dividing ${total} into groups of ${groupSize}`,
      estimatedMinutes: 5,
      segments: [
        {
          id: 'seg-hook',
          kind: 'hook',
          visualCue: `${total} apples in one pile`,
          sceneHint: 'division_total_hook',
          sentences: [
            { id: 's1', text: `Today we're learning about division!`, durationSeconds: 4 },
            { id: 's2', text: `We have ${total} apples to split into equal groups of ${groupSize}.`, durationSeconds: 5 },
          ],
        },
        {
          id: 'seg-model',
          kind: 'model',
          visualCue: `Apples move into groups of ${groupSize}`,
          sceneHint: 'division_group_model',
          sentences: [
            { id: 's3', text: `We keep making groups of ${groupSize} until we run out.`, durationSeconds: 5 },
            { id: 's4', text: `That gives us ${quotient} groups!`, durationSeconds: 3 },
          ],
        },
        {
          id: 'seg-practice',
          kind: 'practice',
          visualCue: `Groups highlighted with answer`,
          sceneHint: 'division_group_practice',
          sentences: [
            { id: 's5', text: remainder
                ? `${total} divided by ${groupSize} equals ${quotient} with ${remainder} left over.`
                : `${total} divided by ${groupSize} equals ${quotient}.`, durationSeconds: 5 },
            { id: 's6', text: `Can you say the equation with me?`, durationSeconds: 3 },
          ],
        },
        {
          id: 'seg-wrap',
          kind: 'wrap',
          visualCue: `Final equation displayed`,
          sceneHint: 'division_wrap',
          sentences: [
            { id: 's7', text: `Division splits a total into equal groups.`, durationSeconds: 4 },
            { id: 's8', text: `Nice work today!`, durationSeconds: 3 },
          ],
        },
      ],
      teacherNotes: 'Have students count each completed group aloud.',
    }
    const lessonPlanNorm = normalizeLessonPlan(lessonPlan)
    const gesturePlan = normalizeGesturePlan(lessonPlanNorm, mockGesturePlan(lessonPlanNorm))
    const visualModel = mockVisualModel(problem, intake, topic, lessonPlanNorm)
    return { intake, topic, objectives, lessonPlan: lessonPlanNorm, gesturePlan, visualModel }
  }

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
    title: 'Adding fractions with like denominators',
    estimatedMinutes: 5,
    segments: [
      {
        id: 'seg-hook',
        kind: 'hook',
        visualCue: 'Bar split into equal parts',
        sceneHint: 'area_model_rectangle',
        sentences: [
          { id: 's1', text: 'Let\'s explore how to add fractions!', durationSeconds: 4 },
          { id: 's2', text: 'To add fractions, the pieces need to be the same size first.', durationSeconds: 5 },
        ],
      },
      {
        id: 'seg-model',
        kind: 'model',
        visualCue: '1/4 + 2/4 combined on bar',
        sceneHint: 'fraction_bar_add_like',
        sentences: [
          { id: 's3', text: 'When denominators match, just add the numerators.', durationSeconds: 4 },
          { id: 's4', text: 'Keep the denominator the same — easy!', durationSeconds: 4 },
        ],
      },
      {
        id: 'seg-practice',
        kind: 'practice',
        visualCue: '1/2 → 2/4, then 2/4 + 1/4 = 3/4',
        sceneHint: 'equivalent_fraction_transform',
        sentences: [
          { id: 's5', text: 'Try it: one half plus one fourth.', durationSeconds: 4 },
          { id: 's6', text: 'Convert halves to fourths, then add them together.', durationSeconds: 4 },
        ],
      },
      {
        id: 'seg-wrap',
        kind: 'wrap',
        visualCue: 'Final fraction highlighted',
        sceneHint: 'celebration',
        sentences: [
          { id: 's7', text: 'Same-sized pieces let us add fractions safely.', durationSeconds: 4 },
          { id: 's8', text: 'Great work today!', durationSeconds: 3 },
        ],
      },
    ],
    teacherNotes: 'Stress equal piece size before combining numerators.',
  }
  const lessonPlanNorm = normalizeLessonPlan(lessonPlan)
  const gesturePlan = normalizeGesturePlan(lessonPlanNorm, mockGesturePlan(lessonPlanNorm))
  const visualModel = mockVisualModel(problem, intake, topic, lessonPlanNorm)
  return { intake, topic, objectives, lessonPlan: lessonPlanNorm, gesturePlan, visualModel }
}

const MOCK_MDM_PROMPTS = [
  'a tutor steps forward warmly and raises one hand in a friendly wave toward the students',
  'a person opens both palms outward at chest height while leaning slightly toward the audience',
  'a tutor raises the right arm and points forward steadily as if tracing a number in the air',
  'a person shifts weight side to side and nods with an encouraging smile toward the class',
  'a tutor gestures with both hands in a small rhythmic motion as if counting beats aloud',
  'a person takes a short confident step forward and relaxes the shoulders while explaining',
  'a tutor lifts both hands briefly upward in a small celebratory motion then lowers them smoothly',
  'a person stands tall, exhales, and gives a calm closing nod while facing the learners',
]

function mockGesturePlan(lessonPlan) {
  const gestures = []
  let i = 0
  for (const { sent } of enumerateLessonSentences(lessonPlan)) {
    gestures.push({
      sentenceId: sent.id,
      mdmPrompt: MOCK_MDM_PROMPTS[i % MOCK_MDM_PROMPTS.length],
    })
    i++
  }
  return { gestures }
}

/** Clamp per-sentence display duration (seconds). */
function clampSentenceDurationSeconds(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return 4
  return Math.min(12, Math.max(2, Math.round(n)))
}

/**
 * Ensure every segment has a `sentences` array so Agent 5 and the client agree on ids.
 * Migrates legacy `narration` + `durationSeconds` into a single sentence per segment.
 */
function normalizeLessonPlan(raw) {
  const base = raw && typeof raw === 'object' ? raw : {}
  const segments = Array.isArray(base.segments) ? base.segments : []
  return {
    ...base,
    segments: segments.map((seg) => {
      const sid = String(seg.id ?? 'seg')
      if (Array.isArray(seg.sentences) && seg.sentences.length > 0) {
        return {
          ...seg,
          sentences: seg.sentences
            .map((s, j) => {
              const text = String(s.text ?? s.narration ?? '').trim()
              if (!text) return null
              return {
                id: String(s.id ?? `${sid}-s${j}`),
                text,
                durationSeconds: clampSentenceDurationSeconds(
                  s.durationSeconds ?? seg.durationSeconds
                ),
              }
            })
            .filter(Boolean),
        }
      }
      const narr = typeof seg.narration === 'string' ? seg.narration.trim() : ''
      if (narr) {
        return {
          ...seg,
          sentences: [
            {
              id: `${sid}-s0`,
              text: narr,
              durationSeconds: clampSentenceDurationSeconds(seg.durationSeconds),
            },
          ],
        }
      }
      return { ...seg, sentences: [] }
    }),
  }
}

/** Ordered (segment, sentence) pairs — single source of truth for gesture + client flatten. */
function enumerateLessonSentences(lessonPlan) {
  const rows = []
  for (const seg of lessonPlan?.segments || []) {
    const list = seg.sentences
    if (!Array.isArray(list)) continue
    for (const s of list) {
      const text = String(s.text ?? '').trim()
      if (!text) continue
      rows.push({ seg, sent: s })
    }
  }
  return rows
}

function parseAddition(problem) {
  const s = (problem || '').replace(/\s+/g, '')
  const m = s.match(/(\d{1,2})\s*\+\s*(\d{1,2})/)
  if (!m) return null
  const a = Math.max(0, parseInt(m[1], 10))
  const b = Math.max(0, parseInt(m[2], 10))
  return { a, b }
}

function parseMultiplication(problem) {
  const s = (problem || '').replace(/\s+/g, '')
  const m = s.match(/(\d{1,2})\s*[x×*]\s*(\d{1,2})/i) || s.match(/(\d{1,2})\s*times\s*(\d{1,2})/i)
  if (!m) return null
  const a = Math.min(12, Math.max(1, parseInt(m[1], 10)))
  const b = Math.min(12, Math.max(1, parseInt(m[2], 10)))
  return { a, b }
}

function parseDivision(problem) {
  const s = (problem || '').replace(/\s+/g, '')
  const m =
    s.match(/(\d{1,2})\s*[\/÷]\s*(\d{1,2})/i) ||
    s.match(/(\d{1,2})\s*dividedby\s*(\d{1,2})/i)
  if (!m) return null
  const total = Math.min(36, Math.max(1, parseInt(m[1], 10)))
  const groupSize = Math.min(12, Math.max(1, parseInt(m[2], 10)))
  return { total, groupSize }
}

function mockVisualModel(problem, intake, topic, lessonPlan) {
  const addition = parseAddition(problem)
  if (addition) {
    return {
      kind: 'addition_rows',
      rowCounts: [addition.a, addition.b],
      itemShape: 'apple',
      itemColor: '#e84b3c',
      caption: `${addition.a} + ${addition.b} = ${addition.a + addition.b}`,
    }
  }
  const div = parseDivision(problem)
  if (div) {
    const quotient = Math.floor(div.total / div.groupSize)
    const remainder = div.total % div.groupSize
    return {
      kind: 'division_groups',
      total: div.total,
      groupSize: div.groupSize,
      quotient,
      remainder,
      itemShape: 'apple',
      itemColor: '#e84b3c',
      caption: remainder
        ? `${div.total} ÷ ${div.groupSize} = ${quotient} remainder ${remainder}`
        : `${div.total} ÷ ${div.groupSize} = ${quotient} (${quotient} groups of ${div.groupSize})`,
    }
  }
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
- topicTitle (string, 3–6 words)
- subtopics (array of strings, 2–3 items)
- briefSummary (string, ONE sentence only)
- relatedPrerequisites (array of strings, 1–2 items)`
  const user = JSON.stringify(intake, null, 2)
  return completeJson({ model: MODEL, system, user })
}

async function agentObjectives(intake, topic) {
  const system = `${BASE}
You are Agent 3 — Objectives. Write measurable outcomes for elementary students.
Return JSON only with keys:
- objectives (array of exactly 2 objects)
Each objective object: id (string), statement (string, one short sentence starting with a student action verb), bloomLevel (one of: remember, understand, apply, analyze).`
  const user = `Intake:\n${JSON.stringify(intake, null, 2)}\n\nTopic:\n${JSON.stringify(topic, null, 2)}`
  return completeJson({ model: MODEL, system, user })
}

async function agentLessonPlan(intake, topic, objectives) {
  const system = `${BASE}
You are Agent 4 — Lesson plan. Build a short lesson a 3D visual tutor speaks aloud.
Return JSON only with keys:
- title (string, 4–7 words)
- estimatedMinutes (number, 3–8)
- segments (ordered array, exactly 3–4 items)
Each segment: id (string), kind (one of: hook, model, practice, wrap), visualCue (string, 3–5 words), sceneHint (short token like "number_line_jump"), sentences (array of 2–3 objects)
Each sentence object: id (string, globally unique like "s1","s2"…), text (string, ONE spoken sentence of 8–16 words), durationSeconds (number, 3–6)
The robot will perform a distinct gesture for EVERY sentence, so each sentence should be a complete thought.
- teacherNotes (string, one sentence)`
  const user = `Intake:\n${JSON.stringify(intake, null, 2)}\n\nTopic:\n${JSON.stringify(topic, null, 2)}\n\nObjectives:\n${JSON.stringify(objectives, null, 2)}`
  return completeJson({ model: MODEL, system, user })
}

// Single fallback if the model omits text — same semantics as DEFAULT_TEACHING_MOTION_PROMPT in motionApi.js
const DEFAULT_MDM_PROMPT_FALLBACK =
  'a person stands naturally and gestures smoothly with their whole body while explaining an idea clearly to students'

async function agentGesturePlan(lessonPlan) {
  const system = `${BASE}
You are Agent 5 — Motion prompt author for a Human Motion Diffusion Model (MDM).

The 3D tutor's skeleton is driven ONLY by your natural-language motion prompts (no discrete action labels on the client).
Each prompt is sent to the MDM as-is to synthesize HumanML3D joint trajectories.

The lesson plan has segments with a "sentences" array. Produce EXACTLY ONE motion prompt per sentence, same order.

Return JSON only with key "gestures": an array of objects, each with:
- sentenceId (string, must match the sentence id from the lesson plan)
- mdmPrompt (string) — the ONLY field that controls motion; make it specific to that sentence's teaching beat

mdmPrompt rules (CRITICAL):
- 12–22 words
- Start with "a person" or "a tutor" (HumanML3D-style)
- Describe continuous motion over time (a short sequence, not a frozen pose)
- Full body: torso, head, arms; add legs when walking, stepping, or shifting weight
- Include direction or trajectory when it matters (forward, toward the learner, to the side)
- Tie motion to teaching intent (welcoming, pointing at an idea, celebrating, inviting practice)
- Do NOT output enums, tags, or shorthand like "wave" or "point" alone — always a full phrase
- Avoid vague lines like "moves hands" or "gestures while talking"

Good examples:
- "a tutor steps slightly forward, opens both palms toward the class, and nods while introducing the new topic"
- "a person raises the right arm and traces a steady pointing motion forward as if highlighting a number on a board"

Bad examples:
- "waves"
- "hand gesture"

Vary prompts across sentences so the character feels alive and aligned with each line of dialogue.
`
  const user = JSON.stringify(lessonPlan, null, 2)
  return completeJson({ model: MODEL, system, user })
}

async function agentVisualModel(intake, topic, lessonPlan) {
  const system = `${BASE}
You are Agent 6 — Visual model director. Choose a concrete countable 3D arrangement for the MAIN mathematical idea.
For whole-number addition (e.g., 3+4), use kind "addition_rows" with rowCounts array (e.g. [3, 4]) to show groups on separate rows. Use itemShape "apple" by default.
For whole-number multiplication (e.g. 3×4), use kind "grid" with rows and cols so rows*cols equals the product; put the FIRST factor as cols (items per row) and SECOND as rows unless the problem wording clearly says otherwise (e.g. "3 apples in each of 4 rows" → cols 3, rows 4).
Return JSON only:
- kind: "grid"|"addition_rows"|"none"
- rows: integer 1-12 (use 0 if kind is none or addition_rows)
- cols: integer 1-12 (use 0 if kind is none or addition_rows)
- rowCounts: array of integers (e.g., [3, 4]) ONLY if kind is "addition_rows"
- itemShape: "apple"|"sphere"|"block"
- itemColor: CSS hex color
- caption: one short line for the learner
If the lesson is purely symbolic with no discrete model, use kind "none" with rows 0, cols 0.`
  const user = `Intake:\n${JSON.stringify(intake, null, 2)}\n\nTopic:\n${JSON.stringify(topic, null, 2)}\n\nLesson plan:\n${JSON.stringify(lessonPlan, null, 2)}`
  return completeJson({ model: MODEL, system, user })
}

function normalizeGesturePlan(lessonPlan, raw) {
  const list = Array.isArray(raw?.gestures) ? raw.gestures : []
  const bySentenceId = new Map()
  const bySegmentId = new Map()
  for (const g of list) {
    if (g.sentenceId != null) bySentenceId.set(String(g.sentenceId), g)
    if (g.segmentId != null) bySegmentId.set(String(g.segmentId), g)
  }
  const gestures = []
  let i = 0
  for (const { seg, sent } of enumerateLessonSentences(lessonPlan)) {
    const g =
      bySentenceId.get(String(sent.id)) ||
      bySegmentId.get(String(seg.id)) ||
      list[i] ||
      {}
    let mdmPrompt = typeof g.mdmPrompt === 'string' ? g.mdmPrompt.trim() : ''
    if (mdmPrompt.length < 12) mdmPrompt = DEFAULT_MDM_PROMPT_FALLBACK
    gestures.push({ sentenceId: sent.id, mdmPrompt })
    i++
  }
  return { gestures }
}

function normalizeVisualModel(raw) {
  const validKinds = ['grid', 'addition_rows']
  const kind = validKinds.includes(raw?.kind) ? raw.kind : 'none'
  let rows = Number(raw?.rows) || 0
  let cols = Number(raw?.cols) || 0
  if (kind === 'grid') {
    rows = Math.min(12, Math.max(1, Math.round(rows)))
    cols = Math.min(12, Math.max(1, Math.round(cols)))
  }
  let rowCounts = []
  if (kind === 'addition_rows') {
    if (Array.isArray(raw?.rowCounts)) {
      rowCounts = raw.rowCounts.map(n => Math.min(12, Math.max(0, Math.round(Number(n) || 0))))
    }
  }
  const shapes = ['apple', 'sphere', 'block']
  const shape = shapes.includes(raw?.itemShape) ? raw.itemShape : 'sphere'
  const color = typeof raw?.itemColor === 'string' && raw.itemColor.startsWith('#') ? raw.itemColor : '#00e5ff'
  return {
    kind,
    rows,
    cols,
    rowCounts,
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
    const artifacts = await writeAgentOutputs(problem, m)
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
        artifacts,
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

    const lessonPlanRaw = await agentLessonPlan(intake, topic, objectives)
    const lessonPlan = normalizeLessonPlan(lessonPlanRaw)
    yield { stage: 'lessonPlan', agent: 'Agent 4 — Lesson plan', data: lessonPlan }

    const gestureRaw = await agentGesturePlan(lessonPlan)
    const gesturePlan = normalizeGesturePlan(lessonPlan, gestureRaw)
    yield { stage: 'gestures', agent: 'Agent 5 — Gesture director', data: gesturePlan }

    const visualRaw = await agentVisualModel(intake, topic, lessonPlan)
    const visualModel = normalizeVisualModel(visualRaw)
    const artifacts = await writeAgentOutputs(problem, {
      intake,
      topic,
      objectives,
      lessonPlan,
      gesturePlan,
      visualModel,
    })
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
        artifacts,
        mock: false,
      },
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    yield { stage: 'error', error: message }
  }
}
