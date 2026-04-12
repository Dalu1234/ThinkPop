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

function buildMockLessonPlan({
  intake,
  title,
  estimatedMinutes = 5,
  restatedPrompt,
  briefExplanation,
  workedExample,
  targetPrompt,
  targetAnswer,
  successMessage,
  alternateExplanation,
  retryWorkedExample,
}) {
  return normalizeInteractiveLessonPlan(
    {
      title,
      estimatedMinutes,
      conceptSummary: {
        restatedPrompt,
        briefExplanation,
      },
      workedExample,
      targetQuestion: {
        prompt: targetPrompt,
        answer: targetAnswer,
        successMessage,
      },
      retryPlan: {
        alternateExplanation,
        workedExample: retryWorkedExample,
      },
      teacherNotes: 'Pause after each checkpoint and wait for the learner to answer by voice.',
    },
    intake
  )
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
          durationSeconds: 6,
          narration: `We have ${a} stars and ${b} more — let's count them all together.`,
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
          narration: `Great work — ${a} plus ${b} always equals ${sum}.`,
          visualCue: `Final equation highlighted`,
          sceneHint: 'addition_wrap',
        },
      ],
      teacherNotes: 'Have students point to each object while counting on.',
    }
    const interactiveLessonPlan = buildMockLessonPlan({
      intake,
      title: lessonPlan.title,
      estimatedMinutes: lessonPlan.estimatedMinutes,
      restatedPrompt: `You want to learn how to solve ${a} + ${b}.`,
      briefExplanation: 'Addition means putting two groups together to find the total.',
      workedExample: {
        problem: `${a + 1} + 1`,
        steps: [`Start with ${a + 1}.`, 'Add 1 more.', `That gives us ${a + 2}.`],
        checkpoints: [
          {
            id: 'checkpoint-1',
            stepIndex: 0,
            question: `If you start at ${a + 1} and add 1 more, what number comes next?`,
            expectedAnswer: String(a + 2),
            hint: `Count one number after ${a + 1}.`,
          },
        ],
        answer: String(a + 2),
      },
      targetPrompt: `${a} + ${b}`,
      targetAnswer: String(sum),
      successMessage: `Great job — ${a} + ${b} = ${sum}.`,
      alternateExplanation: 'Let’s use objects this time and count all the pieces together.',
      retryWorkedExample: {
        problem: `${Math.max(1, a - 1)} + ${b}`,
        steps: [
          `Picture ${Math.max(1, a - 1)} dots.`,
          `Add ${b} more dots.`,
          'Count all the dots to find the total.',
        ],
        checkpoints: [
          {
            id: 'checkpoint-1',
            stepIndex: 1,
            question: `How many dots do you have after adding ${b} more?`,
            expectedAnswer: String(Math.max(1, a - 1) + b),
            hint: 'Count every dot once from left to right.',
          },
        ],
        answer: String(Math.max(1, a - 1) + b),
      },
    })
    const gesturePlan = mockGesturePlan(interactiveLessonPlan)
    const visualModel = mockVisualModel(problem, intake, topic, interactiveLessonPlan)
    return { intake, topic, objectives, lessonPlan: interactiveLessonPlan, gesturePlan, visualModel }
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
          visualCue: `Array of ${b} rows × ${a} apples`,
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
          narration: `${a} times ${b} equals ${product} — remember that!`,
          visualCue: `Equation ${a} × ${b} = ${product}`,
          sceneHint: 'multiplication_wrap',
        },
      ],
      teacherNotes: 'Connect each row to one equal group.',
    }
    const interactiveLessonPlan = buildMockLessonPlan({
      intake,
      title: lessonPlan.title,
      estimatedMinutes: lessonPlan.estimatedMinutes,
      restatedPrompt: `You want to learn how to solve ${a} times ${b}.`,
      briefExplanation: 'Multiplication means equal groups, so we can count groups of the same size.',
      workedExample: {
        problem: `${a} x ${Math.max(2, b - 1)}`,
        steps: [
          `Think of ${Math.max(2, b - 1)} equal groups with ${a} in each group.`,
          `Add ${a} again and again for each group.`,
          `That makes ${a * Math.max(2, b - 1)} in all.`,
        ],
        checkpoints: [
          {
            id: 'checkpoint-1',
            stepIndex: 0,
            question: `If there are ${Math.max(2, b - 1)} groups of ${a}, how many are there altogether?`,
            expectedAnswer: String(a * Math.max(2, b - 1)),
            hint: `Try repeated addition: ${a} added ${Math.max(2, b - 1)} times.`,
          },
        ],
        answer: String(a * Math.max(2, b - 1)),
      },
      targetPrompt: `${a} x ${b}`,
      targetAnswer: String(product),
      successMessage: `Nice work — ${a} times ${b} equals ${product}.`,
      alternateExplanation: 'Let’s picture rows and columns like an array so the equal groups are easier to see.',
      retryWorkedExample: {
        problem: `${Math.max(2, a - 1)} x ${b}`,
        steps: [
          `Make ${b} rows.`,
          `Put ${Math.max(2, a - 1)} items in each row.`,
          'Count all the items to find the product.',
        ],
        checkpoints: [
          {
            id: 'checkpoint-1',
            stepIndex: 1,
            question: `How many items are there in all?`,
            expectedAnswer: String(Math.max(2, a - 1) * b),
            hint: 'Count row by row or use repeated addition.',
          },
        ],
        answer: String(Math.max(2, a - 1) * b),
      },
    })
    const gesturePlan = mockGesturePlan(interactiveLessonPlan)
    const visualModel = mockVisualModel(problem, intake, topic, interactiveLessonPlan)
    return { intake, topic, objectives, lessonPlan: interactiveLessonPlan, gesturePlan, visualModel }
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
          narration: `We keep making groups of ${groupSize} until we run out — that gives us ${quotient} groups.`,
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
          narration: `Division splits a total into equal groups — nice work today!`,
          visualCue: `Final equation displayed`,
          sceneHint: 'division_wrap',
        },
      ],
      teacherNotes: 'Have students count each completed group aloud.',
    }
    const interactiveLessonPlan = buildMockLessonPlan({
      intake,
      title: lessonPlan.title,
      estimatedMinutes: lessonPlan.estimatedMinutes,
      restatedPrompt: `You want to learn how to solve ${total} divided by ${groupSize}.`,
      briefExplanation: 'Division means splitting a total into equal groups to find how many groups fit.',
      workedExample: {
        problem: `${groupSize * Math.max(2, quotient - 1)} / ${groupSize}`,
        steps: [
          `Start with ${groupSize * Math.max(2, quotient - 1)} total items.`,
          `Make groups of ${groupSize}.`,
          `Count the groups to get ${Math.max(2, quotient - 1)}.`,
        ],
        checkpoints: [
          {
            id: 'checkpoint-1',
            stepIndex: 1,
            question: `How many groups of ${groupSize} can you make?`,
            expectedAnswer: String(Math.max(2, quotient - 1)),
            hint: 'Keep taking away one full group at a time.',
          },
        ],
        answer: String(Math.max(2, quotient - 1)),
      },
      targetPrompt: `${total} / ${groupSize}`,
      targetAnswer: remainder ? `${quotient} remainder ${remainder}` : String(quotient),
      successMessage: remainder
        ? `Great job — ${total} divided by ${groupSize} is ${quotient} remainder ${remainder}.`
        : `Great job — ${total} divided by ${groupSize} is ${quotient}.`,
      alternateExplanation: 'Let’s think of division as repeated subtraction and see how many full groups we can remove.',
      retryWorkedExample: {
        problem: `${groupSize * Math.max(2, quotient)} / ${groupSize}`,
        steps: [
          `Start with ${groupSize * Math.max(2, quotient)}.`,
          `Subtract ${groupSize} again and again.`,
          'Count how many times you subtracted a full group.',
        ],
        checkpoints: [
          {
            id: 'checkpoint-1',
            stepIndex: 2,
            question: 'How many full groups did you make?',
            expectedAnswer: String(Math.max(2, quotient)),
            hint: 'Count each subtraction as one group.',
          },
        ],
        answer: String(Math.max(2, quotient)),
      },
    })
    const gesturePlan = mockGesturePlan(interactiveLessonPlan)
    const visualModel = mockVisualModel(problem, intake, topic, interactiveLessonPlan)
    return { intake, topic, objectives, lessonPlan: interactiveLessonPlan, gesturePlan, visualModel }
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
        narration: 'Try it: one half plus one fourth — convert halves to fourths, then add.',
        visualCue: '1/2 → 2/4, then 2/4 + 1/4 = 3/4',
        sceneHint: 'equivalent_fraction_transform',
      },
      {
        id: 'seg-wrap',
        kind: 'wrap',
        durationSeconds: 5,
        narration: 'Same-sized pieces let us add fractions safely — great work!',
        visualCue: 'Final fraction highlighted',
        sceneHint: 'celebration',
      },
    ],
    teacherNotes: 'Stress equal piece size before combining numerators.',
  }
  const interactiveLessonPlan = buildMockLessonPlan({
    intake,
    title: lessonPlan.title,
    estimatedMinutes: lessonPlan.estimatedMinutes,
    restatedPrompt: 'You want to learn how to add fractions.',
    briefExplanation: 'To add fractions, the pieces must be the same size, so the denominators need to match.',
    workedExample: {
      problem: '1/4 + 1/4',
      steps: [
        'The denominators already match, so the pieces are the same size.',
        'Add the numerators: 1 plus 1 equals 2.',
        'Keep the denominator 4, so the answer is 2/4.',
      ],
      checkpoints: [
        {
          id: 'checkpoint-1',
          stepIndex: 0,
          question: 'If the denominators are both 4, what denominator do we keep?',
          expectedAnswer: '4',
          hint: 'When the pieces are the same size, keep that shared denominator.',
        },
      ],
      answer: '2/4',
    },
    targetPrompt: '1/2 + 1/4',
    targetAnswer: '3/4',
    successMessage: 'Nice job — 1/2 plus 1/4 equals 3/4.',
    alternateExplanation: 'Let’s picture the fractions as slices of the same bar so we can combine equal-sized pieces.',
    retryWorkedExample: {
      problem: '2/4 + 1/4',
      steps: [
        'Picture one bar split into 4 equal parts.',
        'Shade 2 parts, then 1 more part.',
        'Now 3 out of 4 parts are shaded, so the answer is 3/4.',
      ],
      checkpoints: [
        {
          id: 'checkpoint-1',
          stepIndex: 2,
          question: 'How many fourths are shaded now?',
          expectedAnswer: '3/4',
          hint: 'Count the shaded fourths one by one.',
        },
      ],
      answer: '3/4',
    },
  })
  const gesturePlan = mockGesturePlan(interactiveLessonPlan)
  const visualModel = mockVisualModel(problem, intake, topic, interactiveLessonPlan)
  return { intake, topic, objectives, lessonPlan: interactiveLessonPlan, gesturePlan, visualModel }
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
Each segment: id (string), kind (one of: hook, model, practice, wrap), durationSeconds (number, 4–8), narration (string, ONE sentence of 10–18 words — this is spoken aloud, keep it tight), visualCue (string, 3–5 words), sceneHint (short token like "number_line_jump")
- teacherNotes (string, one sentence)`
  const user = `Intake:\n${JSON.stringify(intake, null, 2)}\n\nTopic:\n${JSON.stringify(topic, null, 2)}\n\nObjectives:\n${JSON.stringify(objectives, null, 2)}`
  return completeJson({ model: MODEL, system, user })
}

// MDM motion prompts — text fed directly into the Human Motion Diffusion Model.
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

async function agentInteractiveLessonPlan(intake, topic, objectives) {
  const system = `${BASE}
You are Agent 4 â€” Lesson plan. Build an audio-first interactive tutoring lesson a 3D visual tutor can lead.
Return JSON only with keys:
- title (string, 4â€“7 words)
- estimatedMinutes (number, 3â€“8)
- conceptSummary (object)
  - restatedPrompt (string, one short sentence that restates the learner request)
  - briefExplanation (string, 1â€“2 short sentences introducing the concept)
- workedExample (object)
  - problem (string, a fresh example problem, NOT the learner's exact original problem when possible)
  - steps (array of 2â€“4 objects)
    - id (string)
    - explanation (string, one short spoken teaching step)
    - checkpoint (optional object)
      - question (string, exactly one short question sentence)
      - expectedAnswer (string, very short exact expected answer, preferably a single number when appropriate)
      - hint (string, one short hint)
      - successMessage (string, short explicit praise that clearly says they are right)
      - failureMessage (string, polite but clear confirmation that they are incorrect)
  - answer (string)
- targetQuestion (object)
  - prompt (string, the learner's original problem or a clarified version of it)
  - answer (string)
  - successMessage (string, short explicit praise that clearly says they are right)
  - failureMessage (string, polite but clear confirmation that they are incorrect)
- retryPlan (object)
  - alternateExplanation (string, explain the concept in a different way than before)
  - workedExample (object with the same keys as workedExample)
- teacherNotes (string, one sentence)

Rules:
- Restate the concept, explain briefly, teach one example, ask at most 2 checkpoints, then ask the learner to answer the original question.
- The worked example must be close to the learner problem but not identical when possible.
- Ask only one question at each checkpoint.
- Put checkpoints inside the specific step they belong to instead of listing them separately.
- Every checkpoint must directly test the step it is attached to.
- Make each checkpoint question specific to the current problem context, objects, groups, numbers, or representation being discussed.
- Prefer checkpoint questions with short, concrete answers such as a single number, one operation, one count, or one brief math phrase.
- When a checkpoint can be answered with a number, ask it that way.
- Avoid open-ended checkpoint questions like "Why does that work?" or "Can you explain?" during the worked example.
- Keep expected answers STT-friendly: short, unambiguous, and easy to say aloud.
- Do not ask stacked or compound questions.
- Do not reuse canned phrasing unless it naturally matches the current problem.
- The retry explanation must use a meaningfully different teaching angle.
- Do not generate presentation-only fields like segments, scene hints, visual cues, gesture prompts, timing state, or retry counters.
- Keep language simple, warm, and audio-friendly.`
  const user = `Intake:\n${JSON.stringify(intake, null, 2)}\n\nTopic:\n${JSON.stringify(topic, null, 2)}\n\nObjectives:\n${JSON.stringify(objectives, null, 2)}`
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

function normalizeCheckpoint(raw, index) {
  return {
    id: String(raw?.id || `checkpoint-${index + 1}`),
    question: String(raw?.question || '').trim(),
    expectedAnswer: String(raw?.expectedAnswer || '').trim(),
    hint: String(raw?.hint || 'Let’s go one step at a time.').trim(),
    successMessage: String(raw?.successMessage || "Great job! That's completely right.").trim(),
    failureMessage: String(raw?.failureMessage || "That's not quite right. Try again!").trim(),
  }
}

function normalizeWorkedExample(raw, fallbackProblem = '3 + 2') {
  const rawCheckpoints = Array.isArray(raw?.checkpoints)
    ? raw.checkpoints
        .map((checkpoint, index) => ({
          checkpoint: normalizeCheckpoint(checkpoint, index),
          stepIndex: Math.max(0, Math.round(Number(checkpoint?.stepIndex) || 0)),
        }))
        .filter(({ checkpoint }) => checkpoint.question && checkpoint.expectedAnswer)
        .slice(0, 2)
    : []
  const steps = Array.isArray(raw?.steps)
    ? raw.steps
        .map((step, index) => {
          if (typeof step === 'string') {
            return {
              id: `step-${index + 1}`,
              explanation: String(step).trim(),
            }
          }
          return {
            id: String(step?.id || `step-${index + 1}`),
            explanation: String(step?.explanation || step?.text || '').trim(),
            checkpoint: step?.checkpoint ? normalizeCheckpoint(step.checkpoint, index) : undefined,
          }
        })
        .filter(step => step.explanation)
        .slice(0, 4)
    : []
  rawCheckpoints.forEach(({ checkpoint, stepIndex }) => {
    if (steps[stepIndex] && !steps[stepIndex].checkpoint) {
      steps[stepIndex].checkpoint = checkpoint
    }
  })
  return {
    problem: String(raw?.problem || fallbackProblem).trim(),
    steps: steps.length ? steps : ['Let’s solve it one step at a time together.'],
    answer: String(raw?.answer || '').trim(),
  }
}

function buildInteractiveSegments(lessonPlan) {
  const segments = []
  const checkpoints = (lessonPlan?.workedExample?.steps || [])
    .flatMap((step, index) => (step?.checkpoint ? [{ checkpoint: step.checkpoint, index }] : []))
  const retryCheckpoints = (lessonPlan?.retryPlan?.workedExample?.steps || [])
    .flatMap((step, index) => (step?.checkpoint ? [{ checkpoint: step.checkpoint, index }] : []))

  segments.push({
    id: 'seg-intro',
    kind: 'hook',
    durationSeconds: 7,
    narration: `${lessonPlan.conceptSummary.restatedPrompt} ${lessonPlan.conceptSummary.briefExplanation}`.trim(),
    visualCue: 'Topic restated clearly',
    sceneHint: 'concept_intro',
  })
  segments.push({
    id: 'seg-example',
    kind: 'model',
    durationSeconds: 8,
    narration: `Let’s try ${lessonPlan.workedExample.problem} together.`,
    visualCue: 'Example problem shown',
    sceneHint: 'worked_example_intro',
  })
  checkpoints.forEach(({ checkpoint, index }) => {
    segments.push({
      id: `seg-checkpoint-${index + 1}`,
      kind: 'check',
      durationSeconds: 6,
      narration: checkpoint.question,
      visualCue: `Checkpoint ${index + 1}`,
      sceneHint: 'checkpoint_prompt',
    })
  })
  segments.push({
    id: 'seg-final-question',
    kind: 'wrap',
    durationSeconds: 6,
    narration: lessonPlan.targetQuestion.prompt,
    visualCue: 'Original problem asked',
    sceneHint: 'final_question_prompt',
  })
  segments.push({
    id: 'seg-retry-intro',
    kind: 'model',
    durationSeconds: 8,
    narration: lessonPlan.retryPlan.alternateExplanation,
    visualCue: 'Topic explained again',
    sceneHint: 'retry_explanation',
  })
  segments.push({
    id: 'seg-retry-example',
    kind: 'practice',
    durationSeconds: 8,
    narration: `Now let’s try ${lessonPlan.retryPlan.workedExample.problem} together.`,
    visualCue: 'New example problem',
    sceneHint: 'retry_example_intro',
  })
  retryCheckpoints.forEach(({ checkpoint, index }) => {
    segments.push({
      id: `seg-retry-checkpoint-${index + 1}`,
      kind: 'check',
      durationSeconds: 6,
      narration: checkpoint.question,
      visualCue: `Retry checkpoint ${index + 1}`,
      sceneHint: 'retry_checkpoint_prompt',
    })
  })
  segments.push({
    id: 'seg-retry-final',
    kind: 'wrap',
    durationSeconds: 6,
    narration: `Try the original problem again: ${lessonPlan.targetQuestion.prompt}`,
    visualCue: 'Try original again',
    sceneHint: 'retry_final_prompt',
  })
  return segments
}

function normalizeInteractiveLessonPlan(raw, intake) {
  const fallbackPrompt = String(raw?.targetQuestion?.prompt || intake?.normalizedProblem || '').trim()
  const lessonPlan = {
    title: String(raw?.title || 'Math lesson').trim(),
    estimatedMinutes: Math.min(8, Math.max(3, Math.round(Number(raw?.estimatedMinutes) || 5))),
    conceptSummary: {
      restatedPrompt: String(raw?.conceptSummary?.restatedPrompt || `You want help with ${fallbackPrompt}.`).trim(),
      briefExplanation: String(
        raw?.conceptSummary?.briefExplanation ||
          'We will learn the idea, try one example, and then you will solve the original problem.'
      ).trim(),
    },
    workedExample: normalizeWorkedExample(raw?.workedExample, '3 + 2'),
    targetQuestion: {
      prompt: fallbackPrompt,
      answer: String(raw?.targetQuestion?.answer || '').trim(),
      successMessage: String(raw?.targetQuestion?.successMessage || 'Nice job — you got it right.').trim(),
      failureMessage: String(raw?.targetQuestion?.failureMessage || "That's not quite right. Try again!").trim(),
    },
    retryPlan: {
      alternateExplanation: String(
        raw?.retryPlan?.alternateExplanation ||
          'Let’s look at the same idea in a new way and try another example.'
      ).trim(),
      workedExample: normalizeWorkedExample(raw?.retryPlan?.workedExample, '4 + 1'),
    },
    teacherNotes: String(
      raw?.teacherNotes || 'Pause after each prompt so the learner can answer by voice before continuing.'
    ).trim(),
  }
  lessonPlan.segments = buildInteractiveSegments(lessonPlan)
  return lessonPlan
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

    const lessonPlan = normalizeInteractiveLessonPlan(
      await agentInteractiveLessonPlan(intake, topic, objectives),
      intake
    )
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
