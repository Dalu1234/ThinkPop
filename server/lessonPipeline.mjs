import { completeJson, getOpenAI } from './openaiClient.mjs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'
const AGENT_OUTPUTS_DIR = path.resolve(process.cwd(), 'agent-outputs')

const BASE = `You are one stage in a multi-agent system that builds elementary mathematics lessons (grades Kâ€“5).
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
  const subtraction = parseSubtraction(problem)
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
          durationSeconds: 6,
          narration: `We have ${a} stars and ${b} more â€” let's count them all together.`,
          visualCue: `Two groups of stars`,
          sceneHint: 'count_groups_hook',
        },
        {
          id: 'seg-model',
          kind: 'model',
          durationSeconds: 7,
          narration: `Start at ${a} and count on ${b} more to get ${sum}.`,
          visualCue: `Stars combine into one group`,
          sceneHint: 'count_on_addition',
        },
        {
          id: 'seg-practice',
          kind: 'practice',
          durationSeconds: 6,
          narration: `Say it with me: ${a} plus ${b} equals ${sum}.`,
          visualCue: `Equation ${a} + ${b} = ${sum}`,
          sceneHint: 'guided_addition_practice',
        },
        {
          id: 'seg-wrap',
          kind: 'wrap',
          durationSeconds: 5,
          narration: `Great work â€” ${a} plus ${b} always equals ${sum}.`,
          visualCue: `Final equation highlighted`,
          sceneHint: 'addition_wrap',
        },
      ],
      teacherNotes: 'Have students point to each object while counting on.',
    }
    const gesturePlan = mockGesturePlan(lessonPlan)
    const visualModel = mockVisualModel(problem, intake, topic, lessonPlan)
    return { intake, topic, objectives, lessonPlan, gesturePlan, visualModel }
  }

  if (subtraction) {
    const { a, b } = subtraction
    const difference = Math.max(0, a - b)
    const intake = {
      normalizedProblem: problem?.trim() || `What is ${a} - ${b}?`,
      gradeBand: 'K-2',
      mathDomain: 'Subtraction within 20',
      ambiguities: [],
      learnerIntent: 'Understand subtraction as taking away from a starting amount to find what remains.',
    }
    const topic = {
      topicTitle: 'Subtracting by taking away',
      subtopics: ['Starting amount', 'Taking away', 'How many are left'],
      briefSummary:
        'Learners begin with a total, take some away, and count what remains to match a subtraction equation.',
      relatedPrerequisites: ['Counting objects to 20', 'Recognizing numerals', 'Addition within 20'],
    }
    const objectives = {
      objectives: [
        {
          id: 'obj-1',
          statement: 'Show a starting group and identify how many are taken away.',
          bloomLevel: 'understand',
        },
        {
          id: 'obj-2',
          statement: `Subtract ${b} from ${a} to find ${difference}.`,
          bloomLevel: 'apply',
        },
        {
          id: 'obj-3',
          statement: `Write the equation ${a} - ${b} = ${difference} to match a take-away model.`,
          bloomLevel: 'apply',
        },
      ],
    }
    const lessonPlan = {
      title: `Subtracting ${b} from ${a}`,
      estimatedMinutes: 5,
      segments: [
        {
          id: 'seg-hook',
          kind: 'hook',
          durationSeconds: 6,
          narration: `We start with ${a} blocks and plan to take away ${b} of them.`,
          visualCue: `${a} blocks with ${b} highlighted`,
          sceneHint: 'subtraction_takeaway_hook',
        },
        {
          id: 'seg-model',
          kind: 'model',
          durationSeconds: 7,
          narration: `Watch ${b} blocks move away, leaving ${difference} blocks behind.`,
          visualCue: `Highlighted blocks slide away`,
          sceneHint: 'subtraction_takeaway_model',
        },
        {
          id: 'seg-practice',
          kind: 'practice',
          durationSeconds: 6,
          narration: `Say it with me: ${a} minus ${b} equals ${difference}.`,
          visualCue: `Equation ${a} - ${b} = ${difference}`,
          sceneHint: 'guided_subtraction_practice',
        },
        {
          id: 'seg-wrap',
          kind: 'wrap',
          durationSeconds: 5,
          narration: `Great job noticing what stays after we take ${b} away from ${a}.`,
          visualCue: `Remaining blocks glow`,
          sceneHint: 'subtraction_wrap',
        },
      ],
      teacherNotes: 'Have students touch the highlighted objects first, then count the remaining ones.',
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
      title: `${a} times ${b} as equal groups`,
      estimatedMinutes: 5,
      segments: [
        {
          id: 'seg-hook',
          kind: 'hook',
          durationSeconds: 6,
          narration: `Here are ${b} rows with ${a} apples in each row.`,
          visualCue: `Array of ${b} rows Ã— ${a} apples`,
          sceneHint: 'array_hook',
        },
        {
          id: 'seg-model',
          kind: 'model',
          durationSeconds: 7,
          narration: `${a} times ${b} means ${b} equal groups of ${a}, giving us ${product} total.`,
          visualCue: `Rows labeled, total shown`,
          sceneHint: 'array_model',
        },
        {
          id: 'seg-practice',
          kind: 'practice',
          durationSeconds: 6,
          narration: `Count the rows with me: ${b} rows of ${a} equals ${product}.`,
          visualCue: `Each row pulses in turn`,
          sceneHint: 'array_count_practice',
        },
        {
          id: 'seg-wrap',
          kind: 'wrap',
          durationSeconds: 5,
          narration: `${a} times ${b} equals ${product} â€” remember that!`,
          visualCue: `Equation ${a} Ã— ${b} = ${product}`,
          sceneHint: 'multiplication_wrap',
        },
      ],
      teacherNotes: 'Connect each row to one equal group.',
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
      title: `Dividing ${total} into groups of ${groupSize}`,
      estimatedMinutes: 5,
      segments: [
        {
          id: 'seg-hook',
          kind: 'hook',
          durationSeconds: 6,
          narration: `We have ${total} apples to split into equal groups of ${groupSize}.`,
          visualCue: `${total} apples in one pile`,
          sceneHint: 'division_total_hook',
        },
        {
          id: 'seg-model',
          kind: 'model',
          durationSeconds: 7,
          narration: `We keep making groups of ${groupSize} until we run out â€” that gives us ${quotient} groups.`,
          visualCue: `Apples move into groups of ${groupSize}`,
          sceneHint: 'division_group_model',
        },
        {
          id: 'seg-practice',
          kind: 'practice',
          durationSeconds: 6,
          narration: remainder
            ? `${total} divided by ${groupSize} equals ${quotient} with ${remainder} left over.`
            : `${total} divided by ${groupSize} equals ${quotient}.`,
          visualCue: `Groups highlighted with answer`,
          sceneHint: 'division_group_practice',
        },
        {
          id: 'seg-wrap',
          kind: 'wrap',
          durationSeconds: 5,
          narration: `Division splits a total into equal groups â€” nice work today!`,
          visualCue: `Final equation displayed`,
          sceneHint: 'division_wrap',
        },
      ],
      teacherNotes: 'Have students count each completed group aloud.',
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
    mathDomain: 'Fractions â€” adding with like/unlike denominators',
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
        durationSeconds: 6,
        narration: 'To add fractions, the pieces need to be the same size first.',
        visualCue: 'Bar split into equal parts',
        sceneHint: 'area_model_rectangle',
      },
      {
        id: 'seg-model',
        kind: 'model',
        durationSeconds: 7,
        narration: 'When denominators match, just add the numerators and keep the denominator.',
        visualCue: '1/4 + 2/4 combined on bar',
        sceneHint: 'fraction_bar_add_like',
      },
      {
        id: 'seg-practice',
        kind: 'practice',
        durationSeconds: 6,
        narration: 'Try it: one half plus one fourth â€” convert halves to fourths, then add.',
        visualCue: '1/2 â†’ 2/4, then 2/4 + 1/4 = 3/4',
        sceneHint: 'equivalent_fraction_transform',
      },
      {
        id: 'seg-wrap',
        kind: 'wrap',
        durationSeconds: 5,
        narration: 'Same-sized pieces let us add fractions safely â€” great work!',
        visualCue: 'Final fraction highlighted',
        sceneHint: 'celebration',
      },
    ],
    teacherNotes: 'Stress equal piece size before combining numerators.',
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

function normalizeSpokenMath(problem) {
  let s = String(problem || '').toLowerCase().trim()
  if (!s) return ''

  s = s
    .replace(/\?/g, ' ')
    .replace(/\bwhat\s+is\b/g, ' ')
    .replace(/\bcan\s+you\s+teach\s+me\b/g, ' ')
    .replace(/\bteach\s+me\b/g, ' ')
    .replace(/\bshow\s+me\b/g, ' ')
    .replace(/\bplease\b/g, ' ')
    .replace(/\bmultiplied\s+by\b/g, ' times ')
    .replace(/\bdivide(?:d)?\s+by\b/g, ' divided by ')
    .replace(/\bplus\b/g, ' + ')
    .replace(/\bminus\b/g, ' - ')
    .replace(/\btimes\b/g, ' x ')
    .replace(/\bx\b/g, ' x ')
    .replace(/\bdivided\s+by\b/g, ' / ')

  s = s.replace(
    /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/g,
    match => String(NUMBER_WORDS[match] ?? match)
  )

  return s.replace(/\s+/g, '')
}

function parseAddition(problem) {
  const s = normalizeSpokenMath(problem)
  const m = s.match(/(\d{1,2})\s*\+\s*(\d{1,2})/)
  if (!m) return null
  const a = Math.max(0, parseInt(m[1], 10))
  const b = Math.max(0, parseInt(m[2], 10))
  return { a, b }
}

function parseSubtraction(problem) {
  const s = normalizeSpokenMath(problem)
  const m = s.match(/(\d{1,2})\s*-\s*(\d{1,2})/)
  if (!m) return null
  const a = Math.max(0, parseInt(m[1], 10))
  const b = Math.max(0, parseInt(m[2], 10))
  return { a, b }
}

function parseMultiplication(problem) {
  const s = normalizeSpokenMath(problem)
  const m = s.match(/(\d{1,2})\s*[xÃ—*]\s*(\d{1,2})/i)
  if (!m) return null
  const a = Math.min(12, Math.max(1, parseInt(m[1], 10)))
  const b = Math.min(12, Math.max(1, parseInt(m[2], 10)))
  return { a, b }
}

function parseDivision(problem) {
  const s = normalizeSpokenMath(problem)
  const m = s.match(/(\d{1,2})\s*[\/Ã·]\s*(\d{1,2})/i)
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
  const subtraction = parseSubtraction(problem)
  if (subtraction) {
    return {
      kind: 'addition_rows',
      rowCounts: [subtraction.a, subtraction.b],
      itemShape: 'block',
      itemColor: '#00e5ff',
      caption: `${subtraction.a} - ${subtraction.b} = ${Math.max(0, subtraction.a - subtraction.b)}`,
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
        ? `${div.total} Ã· ${div.groupSize} = ${quotient} remainder ${remainder}`
        : `${div.total} Ã· ${div.groupSize} = ${quotient} (${quotient} groups of ${div.groupSize})`,
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
      caption: `${mult.a} Ã— ${mult.b} = ${mult.a * mult.b} (${cols} per row Ã— ${rows} rows)`,
    }
  }
  if (/fraction|half|third|fourth|quarter|denominator/i.test(problem + (topic?.topicTitle || ''))) {
    return {
      kind: 'grid',
      rows: 1,
      cols: 4,
      itemShape: 'block',
      itemColor: '#ff6eb4',
      caption: 'Four equal parts â€” one whole split into fourths',
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
You are Agent 1 â€” Intake. Read the learner or teacher message and extract structured context for a math lesson.
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
You are Agent 2 â€” Topic designer. Given intake JSON, propose the focused instructional topic.
Return JSON only with keys:
- topicTitle (string, 3â€“6 words)
- subtopics (array of strings, 2â€“3 items)
- briefSummary (string, ONE sentence only)
- relatedPrerequisites (array of strings, 1â€“2 items)`
  const user = JSON.stringify(intake, null, 2)
  return completeJson({ model: MODEL, system, user })
}

async function agentObjectives(intake, topic) {
  const system = `${BASE}
You are Agent 3 â€” Objectives. Write measurable outcomes for elementary students.
Return JSON only with keys:
- objectives (array of exactly 2 objects)
Each objective object: id (string), statement (string, one short sentence starting with a student action verb), bloomLevel (one of: remember, understand, apply, analyze).`
  const user = `Intake:\n${JSON.stringify(intake, null, 2)}\n\nTopic:\n${JSON.stringify(topic, null, 2)}`
  return completeJson({ model: MODEL, system, user })
}

async function agentLessonPlan(intake, topic, objectives) {
  const system = `${BASE}
You are Agent 4 â€” Lesson plan. Build a short lesson a 3D visual tutor speaks aloud.
Return JSON only with keys:
- title (string, 4â€“7 words)
- estimatedMinutes (number, 3â€“8)
- segments (ordered array, exactly 3â€“4 items)
Each segment: id (string), kind (one of: hook, model, practice, wrap), durationSeconds (number, 4â€“8), narration (string, ONE sentence of 10â€“18 words â€” this is spoken aloud, keep it tight), visualCue (string, 3â€“5 words), sceneHint (short token like "number_line_jump")
- teacherNotes (string, one sentence)`
  const user = `Intake:\n${JSON.stringify(intake, null, 2)}\n\nTopic:\n${JSON.stringify(topic, null, 2)}\n\nObjectives:\n${JSON.stringify(objectives, null, 2)}`
  return completeJson({ model: MODEL, system, user })
}

// MDM motion prompts â€” text fed directly into the Human Motion Diffusion Model.
// Phrasing follows HumanML3D training conventions ("a person...").
const MDM_MOTION_PROMPTS = {
  wave:      'a person waves their right hand warmly at the audience',
  point:     'a person raises their right arm and points forward with their finger',
  count:     'a person counts on their fingers, raising one hand in front of their body',
  emphasize: 'a person gestures expressively with both hands while explaining something',
  open:      'a person opens both arms wide to their sides in a welcoming gesture',
  rest:      'a person stands in a relaxed neutral position with arms at their sides',
}

async function agentGesturePlan(lessonPlan) {
  const system = `${BASE}
You are Agent 5 — Gesture Director trained for Motion Diffusion Models (MDM)-style motion prompting.

The 3D tutor generates motion from natural language descriptions that must:
- Describe full-body motion over time (not just hands)
- Be physically plausible and smooth (no jittery or impossible poses)
- Reflect intent, emotion, and teaching context
- Allow variation (multiple valid motions per description)

Return JSON only with key "gestures": an array with EXACTLY one object per segment in the lesson plan, in the SAME ORDER.

Each object must include:
- segmentId (string, must match input)
- hand ("left"|"right"|"both")
- motion ("rest"|"point"|"wave"|"count"|"open"|"emphasize")
- mdmPrompt (string)

mdmPrompt rules (CRITICAL):
- 12–22 words
- Describe continuous motion over time (sequence, not static pose)
- Include body coordination: torso, head, arms, and optionally legs
- Include spatial direction or trajectory when relevant
- Include teaching intent (explaining, emphasizing, guiding attention)
- Avoid vague phrases like "moves hands"
- Prefer verbs like: steps, shifts, leans, rotates, raises, lowers, extends

Examples of GOOD prompts:
- "a person steps slightly forward, raises both arms outward, and points while clearly explaining a concept"
- "a tutor shifts weight to one side, gestures rhythmically with both hands while counting key ideas aloud"

Examples of BAD prompts:
- "moves hand"
- "gestures while talking"

Motion variation guidance:
- Hook: expressive, attention-grabbing (wave, open, larger motion)
- Concept/model: precise, directional (point, controlled gestures)
- Practice: rhythmic, structured (count, repeated motion)
- Check: inviting, receptive (open, slight lean forward)
- Wrap: confident, summarizing (emphasize, grounded stance)

Ensure gestures align with pedagogy and feel like natural human motion sequences, not isolated actions.
`
  const user = JSON.stringify(lessonPlan, null, 2)
  return completeJson({ model: MODEL, system, user })
}

async function agentVisualModel(intake, topic, lessonPlan) {
  const system = `${BASE}
You are Agent 6 - Visual model director. Choose a concrete countable 3D arrangement for the MAIN mathematical idea.
For whole-number addition (e.g., 3+4), use kind "addition_rows" with rowCounts array (e.g. [3, 4]) to show groups on separate rows. Use itemShape "apple" by default.
For whole-number subtraction (e.g., 9-3), use kind "addition_rows" with rowCounts array [9, 3] so the frontend can show the starting set and the amount removed.
For whole-number division (e.g., 8/2), use kind "division_groups" with total, groupSize, quotient, and remainder so the frontend can show the full set and then split it into equal groups.
For whole-number multiplication (e.g. 3 x 4), use kind "grid" with rows and cols so rows*cols equals the product; put the first factor as cols (items per row) and second as rows unless the problem wording clearly says otherwise.
Return JSON only:
- kind: "grid"|"addition_rows"|"division_groups"|"none"
- rows: integer 1-12 (use 0 if kind is none, addition_rows, or division_groups)
- cols: integer 1-12 (use 0 if kind is none, addition_rows, or division_groups)
- rowCounts: array of integers (e.g., [3, 4]) ONLY if kind is "addition_rows"
- total: integer 1-36 ONLY if kind is "division_groups"
- groupSize: integer 1-12 ONLY if kind is "division_groups"
- quotient: integer 0-36 ONLY if kind is "division_groups"
- remainder: integer 0-11 ONLY if kind is "division_groups"
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
      // mdmPrompt: use the AI-generated one if valid, else fall back to the default map
      const mdmPrompt = (typeof g.mdmPrompt === 'string' && g.mdmPrompt.length > 8)
        ? g.mdmPrompt
        : MDM_MOTION_PROMPTS[motion]
      return { segmentId: seg.id, hand, motion, mdmPrompt }
    }),
  }
}

function normalizeVisualModel(raw) {
  const validKinds = ['grid', 'addition_rows', 'division_groups']
  const kind = validKinds.includes(raw?.kind) ? raw.kind : 'none'
  let rows = Number(raw?.rows) || 0
  let cols = Number(raw?.cols) || 0
  if (kind === 'grid') {
    rows = Math.min(12, Math.max(1, Math.round(rows)))
    cols = Math.min(12, Math.max(1, Math.round(cols)))
  }
  let rowCounts = []
  if (kind === 'addition_rows' && Array.isArray(raw?.rowCounts)) {
    rowCounts = raw.rowCounts.map(n => Math.min(12, Math.max(0, Math.round(Number(n) || 0))))
  }
  let total = 0
  let groupSize = 0
  let quotient = 0
  let remainder = 0
  if (kind === 'division_groups') {
    total = Math.min(36, Math.max(1, Math.round(Number(raw?.total) || 0)))
    groupSize = Math.min(12, Math.max(1, Math.round(Number(raw?.groupSize) || 0)))
    quotient = Math.min(36, Math.max(0, Math.round(Number(raw?.quotient) || 0)))
    remainder = Math.min(11, Math.max(0, Math.round(Number(raw?.remainder) || 0)))
  }
  const shapes = ['apple', 'sphere', 'block']
  const shape = shapes.includes(raw?.itemShape) ? raw.itemShape : 'sphere'
  const color = typeof raw?.itemColor === 'string' && raw.itemColor.startsWith('#') ? raw.itemColor : '#00e5ff'
  return {
    kind,
    rows,
    cols,
    rowCounts,
    total,
    groupSize,
    quotient,
    remainder,
    itemShape: shape,
    itemColor: color,
    caption: String(raw?.caption || ''),
  }
}

function buildVisualizationPayload(problem, visualModel) {
  if (!visualModel || typeof visualModel !== 'object') return null

  if (visualModel.kind === 'addition_rows' && Array.isArray(visualModel.rowCounts) && visualModel.rowCounts.length >= 2) {
    const [first, second] = visualModel.rowCounts
    const raw = normalizeSpokenMath(problem)
    const subtractionMatch = raw.match(/(\d{1,2})\s*-\s*(\d{1,2})/)
    if (subtractionMatch) {
      return {
        type: 'subtraction',
        a: Number(subtractionMatch[1]) || Number(first) || 0,
        b: Number(subtractionMatch[2]) || Number(second) || 0,
        steps: true,
      }
    }
    return {
      type: 'addition',
      a: Number(first) || 0,
      b: Number(second) || 0,
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

  if (visualModel.kind === 'division_groups' && visualModel.total > 0 && visualModel.groupSize > 0) {
    return {
      type: 'division',
      total: Number(visualModel.total) || 0,
      groupSize: Number(visualModel.groupSize) || 0,
      quotient: Number(visualModel.quotient) || 0,
      remainder: Number(visualModel.remainder) || 0,
      steps: true,
    }
  }

  return null
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
    const visualization = buildVisualizationPayload(problem, m.visualModel)
    const artifacts = await writeAgentOutputs(problem, { ...m, visualization })
    yield { stage: 'intake', agent: 'Agent 1 â€” Intake', data: m.intake }
    await delay(280)
    yield { stage: 'topic', agent: 'Agent 2 â€” Topic', data: m.topic }
    await delay(280)
    yield { stage: 'objectives', agent: 'Agent 3 â€” Objectives', data: m.objectives }
    await delay(280)
    yield { stage: 'lessonPlan', agent: 'Agent 4 â€” Lesson plan', data: m.lessonPlan }
    await delay(260)
    yield { stage: 'gestures', agent: 'Agent 5 â€” Gesture director', data: m.gesturePlan }
    await delay(260)
    yield { stage: 'visualModel', agent: 'Agent 6 â€” Visual model', data: m.visualModel }
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
        visualization,
        artifacts,
        mock: true,
      },
    }
    return
  }

  try {
    const intake = await agentIntake(problem)
    yield { stage: 'intake', agent: 'Agent 1 â€” Intake', data: intake }

    const topic = await agentTopic(intake)
    yield { stage: 'topic', agent: 'Agent 2 â€” Topic', data: topic }

    const objectives = await agentObjectives(intake, topic)
    yield { stage: 'objectives', agent: 'Agent 3 â€” Objectives', data: objectives }

    const lessonPlan = await agentLessonPlan(intake, topic, objectives)
    yield { stage: 'lessonPlan', agent: 'Agent 4 â€” Lesson plan', data: lessonPlan }

    const gestureRaw = await agentGesturePlan(lessonPlan)
    const gesturePlan = normalizeGesturePlan(lessonPlan, gestureRaw)
    yield { stage: 'gestures', agent: 'Agent 5 â€” Gesture director', data: gesturePlan }

    const visualRaw = await agentVisualModel(intake, topic, lessonPlan)
    const visualModel = normalizeVisualModel(visualRaw)
    const visualization = buildVisualizationPayload(problem, visualModel)
    const artifacts = await writeAgentOutputs(problem, {
      intake,
      topic,
      objectives,
      lessonPlan,
      gesturePlan,
      visualModel,
      visualization,
    })
    yield { stage: 'visualModel', agent: 'Agent 6 â€” Visual model', data: visualModel }

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
        visualization,
        artifacts,
        mock: false,
      },
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    yield { stage: 'error', error: message }
  }
}


