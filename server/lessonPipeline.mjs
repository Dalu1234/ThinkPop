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
      title: `Making ${sum} by adding ${a} and ${b}`,
      estimatedMinutes: 15,
      segments: [
        {
          id: 'seg-hook',
          kind: 'hook',
          durationSeconds: 45,
          narration: `Here are ${a} stars and ${b} more stars. Let's put the groups together and see how many we have altogether.`,
          visualCue: `Show one group of ${a} stars and a second group of ${b} stars with a small gap between them.`,
          sceneHint: 'count_groups_hook',
        },
        {
          id: 'seg-model',
          kind: 'model',
          durationSeconds: 75,
          narration: `We can count the first group: ${a}. Now we count on ${b} more to make ${sum}. That means ${a} plus ${b} equals ${sum}.`,
          visualCue: `Slide both groups together and count each star aloud until the total reaches ${sum}.`,
          sceneHint: 'count_on_addition',
        },
        {
          id: 'seg-practice',
          kind: 'practice',
          durationSeconds: 90,
          narration: `Let's try it together. Start at ${a}, then count on ${b} more: ${sum}. Say the full equation with me: ${a} + ${b} = ${sum}.`,
          visualCue: `Highlight the first ${a} objects, then pulse ${b} additional objects one at a time.`,
          sceneHint: 'guided_addition_practice',
        },
        {
          id: 'seg-check',
          kind: 'check',
          durationSeconds: 60,
          narration: `Quick check: if we have ${a} blocks and add ${b} more, how many blocks do we have altogether? Yes, ${sum}.`,
          visualCue: `Show stacked number cards ${a}, +, ${b}, =, ? then flip the answer card to ${sum}.`,
          sceneHint: 'addition_check',
        },
        {
          id: 'seg-wrap',
          kind: 'wrap',
          durationSeconds: 45,
          narration: `Nice job. Addition means putting groups together. Today we learned that ${a} plus ${b} equals ${sum}.`,
          visualCue: `Display the final equation ${a} + ${b} = ${sum} with all ${sum} objects grouped together.`,
          sceneHint: 'addition_wrap',
        },
      ],
      teacherNotes:
        'Encourage learners to count on from the larger number when appropriate and point to each object once while counting.',
    }
    const gesturePlan = mockGesturePlan(lessonPlan)
    const visualModel = mockVisualModel(problem, intake, topic, lessonPlan)
    return { intake, topic, objectives, lessonPlan, gesturePlan, visualModel }
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
      title: `Understanding ${a} x ${b} as equal groups`,
      estimatedMinutes: 18,
      segments: [
        {
          id: 'seg-hook',
          kind: 'hook',
          durationSeconds: 45,
          narration: `Imagine ${b} rows with ${a} apples in each row. Multiplication helps us find the total quickly.`,
          visualCue: `Show ${b} rows forming, with ${a} apples placed in each row.`,
          sceneHint: 'array_hook',
        },
        {
          id: 'seg-model',
          kind: 'model',
          durationSeconds: 90,
          narration: `The expression ${a} times ${b} means ${b} equal groups of ${a}. We can count by rows or use repeated addition: ${a} + ${a}${b > 2 ? ` + ...` : ''} = ${product}.`,
          visualCue: `Label each row with ${a} and show the full array totaling ${product} apples.`,
          sceneHint: 'array_model',
        },
        {
          id: 'seg-practice',
          kind: 'practice',
          durationSeconds: 90,
          narration: `Let's count the array together. There are ${b} rows, and each row has ${a}. That makes ${product} altogether.`,
          visualCue: `Pulse one row at a time, then highlight all ${product} apples together.`,
          sceneHint: 'array_count_practice',
        },
        {
          id: 'seg-check',
          kind: 'check',
          durationSeconds: 60,
          narration: `Quick check: if one row has ${a} apples and there are ${b} rows, what multiplication sentence matches? ${a} x ${b} = ${product}.`,
          visualCue: `Show the array beside the equation ${a} x ${b} = ${product}.`,
          sceneHint: 'multiplication_check',
        },
        {
          id: 'seg-wrap',
          kind: 'wrap',
          durationSeconds: 45,
          narration: `Great work. Equal groups help us see multiplication, and now we know that ${a} times ${b} equals ${product}.`,
          visualCue: `Zoom out to the full array and celebrate the product ${product}.`,
          sceneHint: 'multiplication_wrap',
        },
      ],
      teacherNotes:
        'Point to each row as a group and connect the array to repeated addition before naming the product.',
    }
    const gesturePlan = mockGesturePlan(lessonPlan)
    const visualModel = mockVisualModel(problem, intake, topic, lessonPlan)
    return { intake, topic, objectives, lessonPlan, gesturePlan, visualModel }
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
      title: `Making equal groups for ${total} / ${groupSize}`,
      estimatedMinutes: 18,
      segments: [
        {
          id: 'seg-hook',
          kind: 'hook',
          durationSeconds: 45,
          narration: `Here are ${total} apples altogether. We want to put them into equal groups of ${groupSize}.`,
          visualCue: `Show all ${total} apples in one collection before any grouping begins.`,
          sceneHint: 'division_total_hook',
        },
        {
          id: 'seg-model',
          kind: 'model',
          durationSeconds: 90,
          narration: `We keep making groups of ${groupSize}. Each time we make one full group, we count it. ${total} divided by ${groupSize} tells how many groups we can form.`,
          visualCue: `Move the apples into equal groups of ${groupSize} and count each completed group.`,
          sceneHint: 'division_group_model',
        },
        {
          id: 'seg-practice',
          kind: 'practice',
          durationSeconds: 90,
          narration: remainder
            ? `Let's group them together. We can make ${quotient} full groups of ${groupSize}, and ${remainder} apple stays left over.`
            : `Let's group them together. We can make ${quotient} full groups of ${groupSize}, so the answer is ${quotient}.`,
          visualCue: `Highlight each finished group and show the number of groups growing to ${quotient}.`,
          sceneHint: 'division_group_practice',
        },
        {
          id: 'seg-check',
          kind: 'check',
          durationSeconds: 60,
          narration: remainder
            ? `Quick check: if ${total} apples are grouped into sets of ${groupSize}, how many full groups can we make and what is left over?`
            : `Quick check: if ${total} apples are grouped into sets of ${groupSize}, how many groups do we make? ${quotient}.`,
          visualCue: `Show the grouped apples beside the equation ${total} ÷ ${groupSize} = ${quotient}${remainder ? ' R ' + remainder : ''}.`,
          sceneHint: 'division_check',
        },
        {
          id: 'seg-wrap',
          kind: 'wrap',
          durationSeconds: 45,
          narration: remainder
            ? `Great work. Division helped us make ${quotient} equal groups of ${groupSize} with ${remainder} left over.`
            : `Great work. Division helped us make ${quotient} equal groups of ${groupSize}, so ${total} divided by ${groupSize} equals ${quotient}.`,
          visualCue: `Hold the final equal groups on screen and celebrate the quotient ${quotient}.`,
          sceneHint: 'division_wrap',
        },
      ],
      teacherNotes:
        'Have students say the total, the size of each group, and the number of groups aloud as the apples are sorted.',
    }
    const gesturePlan = mockGesturePlan(lessonPlan)
    const visualModel = mockVisualModel(problem, intake, topic, lessonPlan)
    return { intake, topic, objectives, lessonPlan, gesturePlan, visualModel }
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

    const lessonPlan = await agentLessonPlan(intake, topic, objectives)
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
