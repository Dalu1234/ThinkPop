/**
 * Lesson flow (voice + chat):
 * 1) Topic — intro + optional Agent 2 brief; hook/model lesson lines with 3D viz (Agent 6 visual model).
 * 2) Counting checkpoint — exactly one lab at random (50% Counting Lab dots, 50% Finger Lab). Never both in the same round.
 * 3) Reinforcement — practice + wrap lines with 3D viz again.
 * Multiplication / subtraction checkpoints stay dot-only. Finger Lab: tutor asks “show N fingers,” then hold steady.
 * Route: #/baymax-voice2
 */
import { useState, useCallback, useRef, useEffect } from 'react'
import CharacterScene from './components/CharacterScene'
import AiAudioBackdropSync from './components/AiAudioBackdropSync'
import TopicCard from './components/TopicCard'
import ChatPanel from './components/ChatPanel'
import HistorySidebar from './components/HistorySidebar'
import AIStatus from './components/AIStatus'
import PipelineProgress from './components/PipelineProgress'
import CountingToolPanel from './components/CountingToolPanel'
import FingerCountToolPanel from './components/FingerCountToolPanel'
import MathDragToolPanel from './components/MathDragToolPanel'
import { textToSpeechBlob, playAudioBlob } from './lib/elevenlabs'
import {
  streamLessonPipeline,
  emojiForTopic,
  extractVisualization,
  getConceptAndRestSentences,
} from './lib/lessonApi'
import { enrichVisualizationForClient } from './lib/vizVisualItem'
import {
  predictPerformance,
  recordPredictionResult,
  recordLessonOutcome,
  normalizeTopicKey,
} from './lib/userModel'
import { ANIMATION_NAMES } from './lib/boneAnimations'

const NUMBER_WORDS = {
  zero: '0',
  oh: '0',
  o: '0',
  one: '1',
  won: '1',
  two: '2',
  to: '2',
  too: '2',
  three: '3',
  four: '4',
  for: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  ate: '8',
  nine: '9',
  ten: '10',
  eleven: '11',
  twelve: '12',
  thirteen: '13',
  fourteen: '14',
  fifteen: '15',
  sixteen: '16',
  seventeen: '17',
  eighteen: '18',
  nineteen: '19',
  twenty: '20',
}

const INITIAL_TOPIC = { label: 'Elementary math', emoji: '🔢' }
const COUNTING_TOPIC = { label: 'Counting with dots', emoji: '🔢' }
const FINGER_COUNT_TOPIC = { label: 'Counting with fingers', emoji: '🖐️' }
const MULTIPLICATION_DOTS_TOPIC = { label: 'Multiplication with dots', emoji: '✖️' }
const SUBTRACTION_DOTS_TOPIC = { label: 'Subtraction with dots', emoji: '➖' }
const SPATIAL_LAB_TOPIC = { label: 'Spatial Lab', emoji: '🧊' }

const SPATIAL_OBJECT_POOL = [
  { id: 'planet_earth',   name: 'Earth',   path: '/models/planets/earth.glb' },
  { id: 'planet_mars',    name: 'Mars',    path: '/models/planets/mars.glb' },
  { id: 'planet_saturn',  name: 'Saturn',  path: '/models/planets/saturn.glb' },
  { id: 'planet_jupiter', name: 'Jupiter', path: '/models/planets/jupiter.glb' },
  { id: 'planet_venus',   name: 'Venus',   path: '/models/planets/venus.glb' },
  { id: 'planet_neptune', name: 'Neptune', path: '/models/planets/neptune.glb' },
  { id: 'planet_mercury', name: 'Mercury', path: '/models/planets/mercury.glb' },
  { id: 'planet_uranus',  name: 'Uranus',  path: '/models/planets/uranus.glb' },
]

const SPATIAL_POSITIONS = [
  [-0.55, 0.3, 0],
  [0.55, 0.3, 0],
  [-0.55, -0.25, 0],
  [0.55, -0.25, 0],
  [0, 0.05, 0],
]

function pickSpatialItems(count = 4) {
  const shuffled = [...SPATIAL_OBJECT_POOL].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, count).map((obj, i) => ({
    ...obj,
    position: SPATIAL_POSITIONS[i] || [0, 0, 0],
  }))
}

function shuffleArray(arr) {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
const COUNTING_ACTIVITY_INITIAL = {
  visible: false,
  totalDots: 0,
  lastAdded: 0,
  prompt: 'Ask to practice counting with dots.',
  title: 'Say The Number You See',
  kicker: 'Counting Lab',
}

/** Dev animation picker — set `true` to show again. */
const SHOW_ANIMATION_PANEL = false

function AnimationPanel({ current, onSelect, disabled }) {
  return (
    <div className="mdm-test-panel">
      <p className="mdm-test-title">Animations</p>
      <div className="mdm-test-grid">
        {ANIMATION_NAMES.map((name) => (
          <button
            key={name}
            type="button"
            className={`mdm-test-btn${current === name ? ' mdm-test-btn--busy' : ''}`}
            disabled={disabled}
            onClick={() => onSelect(name)}
          >
            {name}
          </button>
        ))}
      </div>
      {current && <p className="mdm-test-mode">Playing: {current}</p>}
    </div>
  )
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function normalizeAnswerText(text) {
  let value = String(text || '').toLowerCase().trim()
  value = value.replace(/\b(it is|it's|the answer is|answer is|i think|maybe|um|uh|so)\b/g, ' ')
  value = value.replace(/[^\w\s/.-]+/g, ' ')
  value = value.replace(/\s+/g, ' ').trim()
  if (NUMBER_WORDS[value]) return NUMBER_WORDS[value]
  return value
}

function extractNumericValue(text) {
  const normalized = normalizeAnswerText(text)
  if (!normalized) return null

  const direct = Number(normalized)
  if (!Number.isNaN(direct)) return direct

  const tokens = normalized.replace(/-/g, ' ').split(/\s+/).filter(Boolean)
  if (!tokens.length) return null

  let total = 0
  let current = 0
  let sawNumberWord = false

  for (const token of tokens) {
    if (/^-?\d+(\.\d+)?$/.test(token)) return Number(token)
    if (NUMBER_WORDS[token] != null) {
      current += Number(NUMBER_WORDS[token])
      sawNumberWord = true
      continue
    }
    if (token === 'thirty') { current += 30; sawNumberWord = true; continue }
    if (token === 'forty') { current += 40; sawNumberWord = true; continue }
    if (token === 'fifty') { current += 50; sawNumberWord = true; continue }
    if (token === 'sixty') { current += 60; sawNumberWord = true; continue }
    if (token === 'seventy') { current += 70; sawNumberWord = true; continue }
    if (token === 'eighty') { current += 80; sawNumberWord = true; continue }
    if (token === 'ninety') { current += 90; sawNumberWord = true; continue }
    if (token === 'hundred') {
      current = (current || 1) * 100
      sawNumberWord = true
      continue
    }
    if (token === 'thousand') {
      total += (current || 1) * 1000
      current = 0
      sawNumberWord = true
      continue
    }
    if (token === 'and') continue
    if (sawNumberWord) break
  }

  if (!sawNumberWord) return null
  return total + current
}

function answerContainsExpectedNumber(actual, expected) {
  const normalized = normalizeAnswerText(actual)
  const expectedNum = extractNumericValue(expected)
  if (!normalized || expectedNum == null) return false

  const expectedDigits = String(expectedNum)
  const digitWordSet = new Set(
    Object.entries(NUMBER_WORDS)
      .filter(([, n]) => String(n) === expectedDigits)
      .map(([word]) => word)
  )

  const tokens = normalized.split(/\s+/).filter(Boolean)
  for (const token of tokens) {
    if (token === expectedDigits) return true
    if (NUMBER_WORDS[token] != null && String(NUMBER_WORDS[token]) === expectedDigits) return true
  }

  if (new RegExp(`(^|\\D)${expectedDigits}(\\D|$)`).test(normalized)) return true

  for (const w of digitWordSet) {
    if (new RegExp(`\\b${w}\\b`).test(normalized)) return true
  }
  return false
}

function answersMatch(actual, expected) {
  const a = normalizeAnswerText(actual)
  const e = normalizeAnswerText(expected)
  if (!a || !e) return false
  if (a === e) return true

  const aNum = extractNumericValue(a)
  const eNum = extractNumericValue(e)
  if (aNum != null && eNum != null) return aNum === eNum
  if (answerContainsExpectedNumber(a, e)) return true

  return a.replace(/\s+/g, '') === e.replace(/\s+/g, '')
}

function randomCountIncrement() {
  return Math.floor(Math.random() * 5) + 1
}

function isCountingPracticeRequest(text) {
  const value = String(text || '').toLowerCase()
  if (!value) return false
  const hasCountingCue = /\b(count|counting|dots?|how many dots|number of dots)\b/.test(value)
  const hasArithmeticCue = /[+\-*/=]|\bplus\b|\bminus\b|\btimes\b|\bx\b|\bdivided\b|\bfraction\b/.test(value)
  return hasCountingCue && !hasArithmeticCue
}

function isMultiplicationDotsRequest(text) {
  const value = String(text || '').toLowerCase()
  if (!value) return false
  const hasDotsCue = /\b(dots?|dot)\b/.test(value)
  const hasMultiplicationCue = /\bmultiply\b|\bmultiplication\b|\btimes\b|\bx\b|\bequal groups\b/.test(value)
  return hasDotsCue && hasMultiplicationCue
}

function isMultiplicationPrompt(text) {
  const value = String(text || '').toLowerCase()
  if (!value) return false
  if (/\bmultiply\b|\bmultiplication\b|\btimes\b|\bproduct\b|\bequal groups\b/.test(value)) {
    return true
  }
  return /(\d{1,2})\s*[x×*]\s*(\d{1,2})/.test(value)
}

function isSubtractionDotsRequest(text) {
  const value = String(text || '').toLowerCase()
  if (!value) return false
  const hasDotsCue = /\b(dots?|dot)\b/.test(value)
  const hasSubtractionCue = /\bsubtract\b|\bsubtraction\b|\bminus\b|\btake away\b|\bremove\b/.test(value)
  return hasDotsCue && hasSubtractionCue
}

function isSubtractionPrompt(text) {
  const value = String(text || '').toLowerCase()
  if (!value) return false
  if (/\bsubtract\b|\bsubtraction\b|\bminus\b|\btake away\b|\bdifference\b/.test(value)) {
    return true
  }
  return /(\d{1,2})\s*[-−]\s*(\d{1,2})/.test(value)
}

function isSpatialLabRequest(text) {
  const value = String(text || '').toLowerCase()
  if (!value) return false
  return /\b(spatial|identify|find\s+objects?|name\s+the|touch\s+the|point\s+at|what\s+object|3d\s+objects?|object\s+lab)\b/.test(value)
}

function inferRequestedLab(text) {
  const value = String(text || '').toLowerCase()
  if (!value) return 'none'
  if (isSpatialLabRequest(value)) return 'spatial'
  if (isSubtractionPrompt(value)) return 'subtraction'
  if (isMultiplicationPrompt(value)) return 'multiplication'
  if (isCountingPracticeRequest(value)) return 'counting'
  return 'none'
}

function isAdditionPrompt(text) {
  const v = String(text || '').toLowerCase()
  if (!v) return false
  return /\badd(ition)?\b|\bplus\b|\bsum\b/.test(v)
}

function chooseCheckpointLab(questionText, result) {
  const intake = String(result?.intake?.normalizedProblem || '')
  const domain = String(result?.intake?.mathDomain || '')
  const topic = String(result?.topic?.topicTitle || '')
  const summary = String(result?.topic?.briefSummary || '')
  const combined = [questionText, intake, domain, topic, summary].join(' ')
  const requested = inferRequestedLab(combined)

  if (requested === 'subtraction')    return 'subtraction'
  if (requested === 'multiplication') return 'multiplication'
  if (isAdditionPrompt(combined))     return 'addition'
  return 'counting'
}

function pluralizeItem(shape) {
  if (!shape) return 'objects'
  const s = shape.trim().toLowerCase()
  if (s.endsWith('s')) return s
  if (s.endsWith('sh') || s.endsWith('ch') || s.endsWith('x') || s.endsWith('z')) return s + 'es'
  return s + 's'
}

/**
 * Build stage-synced narration sentences for a visualization so the tutor
 * walks through the 3D scene step-by-step ("here are 3 apples … now add 2 …").
 * Returns { sentences: [{ text, stage }], maxStage } or null if viz type is unknown.
 */
function buildVizNarration(viz) {
  if (!viz?.type) return null
  const item = viz.speechLabel || pluralizeItem(viz.itemShape)

  switch (viz.type) {
    case 'addition': {
      const { a, b } = viz
      const total = a + b
      return {
        sentences: [
          { text: `Look at the screen. Here are ${a} ${item}.`, stage: 0 },
          { text: `Now let's add ${b} more ${item}. Watch them appear.`, stage: 1 },
          { text: `Count them all together. ${a} plus ${b} equals ${total} ${item}.`, stage: 2 },
        ],
        maxStage: 2,
      }
    }
    case 'subtraction': {
      const { a, b } = viz
      const remaining = Math.max(0, a - b)
      return {
        sentences: [
          { text: `We start with ${a} ${item}. See them on screen.`, stage: 0 },
          { text: `Now let's take ${b} away. Watch the red ones.`, stage: 1 },
          { text: `They disappear!`, stage: 2 },
          { text: `We have ${remaining} ${item} left. ${a} minus ${b} equals ${remaining}.`, stage: 3 },
        ],
        maxStage: 3,
      }
    }
    case 'multiplication': {
      const { a, b } = viz
      const product = a * b
      return {
        sentences: [
          { text: `Look — ${b} rows with ${a} ${item} in each row. That's ${b} groups of ${a} ${item} each.`, stage: 0 },
          { text: `Count every single one. ${a} times ${b} equals ${product} ${item} total.`, stage: 1 },
        ],
        maxStage: 1,
      }
    }
    case 'division': {
      const { total, groupSize, quotient, remainder } = viz
      const remText = remainder > 0 ? ` with ${remainder} left over` : ''
      return {
        sentences: [
          { text: `Here are ${total} ${item} all in a line.`, stage: 0 },
          { text: `Let's sort the ${item} into groups of ${groupSize}. Watch the colors change.`, stage: 1 },
          { text: `See? They form ${quotient} equal groups${remText}.`, stage: 2 },
          { text: `${total} divided by ${groupSize} equals ${quotient}${remainder > 0 ? ` remainder ${remainder}` : ''}.`, stage: 3 },
        ],
        maxStage: 3,
      }
    }
    default:
      return null
  }
}

/** Prefer full pipeline (hook/model + 3D tokens) before dot-lab shortcuts. */
function wantsTeachingPipelineFirst(text) {
  const v = String(text || '').toLowerCase()
  if (!v) return false
  if (/\b(teach|tutor|explaining|explain|lesson|understand|confused|lost|stuck)\b/.test(v)) return true
  if (/\b(help\s+me|show\s+me\s+how|walk\s+me|give\s+me\s+an?\s+example)\b/.test(v)) return true
  if (/\bwhat\s*(is|'s)\b/.test(v)) return true
  if (/\b(how\s+(do|does|can|is)|why\s+(is|are|do))\b/.test(v)) return true
  if (/\btell\s+me\b/.test(v)) return true
  if (/\b(can\s+you\s+explain|go\s+through|break\s+(it|this)\s+down)\b/.test(v)) return true
  return false
}

export function BaymaxVoiceFirstExperience() {
  const [aiState, setAiState] = useState(null)
  const [aiError, setAiError] = useState('')
  const aiAudioLevelsRef = useRef([])
  const [aiAudioActive, setAiAudioActive] = useState(false)
  const [topicDisplay, setTopicDisplay] = useState(INITIAL_TOPIC)
  /** null = use hardcoded bone animations (boneAnimations.js). Non-null = MDM retarget frames. */
  const [currentMotionFrames, setCurrentMotionFrames] = useState(null)
  /** When dev panel is on, optional clip override while not speaking. Otherwise: speaking → explain, else idle. */
  const [panelAnimOverride, setPanelAnimOverride] = useState(null)
  /** Temporary animation override for reactions (e.g. wave on correct answer). Auto-clears. */
  const [reactAnimation, setReactAnimation] = useState(null)
  const reactTimerRef = useRef(null)
  const [countingActivity, setCountingActivity] = useState(COUNTING_ACTIVITY_INITIAL)
  const [fingerToolVisible, setFingerToolVisible] = useState(false)
  const [mathDragActivity, setMathDragActivity] = useState({ visible: false, operation: 'addition', a: 3, b: 2 })
  /** 3D token viz from lesson pipeline (addition / subtraction / multiplication / division) */
  const [currentVisualization, setCurrentVisualization] = useState(null)
  const [visualizationStepIndex, setVisualizationStepIndex] = useState(0)
  /** Spatial Lab — array of { name, path, position } for mixed 3D objects */
  const [spatialItems, setSpatialItems] = useState(null)
  const [spatialActive, setSpatialActive] = useState(false)
  const spatialTouchResolverRef = useRef(null)
  const [messages, setMessages] = useState([
    {
      id: 1,
      from: 'ai',
      text: "I'm your math tutor. Ask me about addition, subtraction, multiplication — or say \"Spatial Lab\" to identify 3D objects with your hands!",
    },
  ])
  const [userModelHint, setUserModelHint] = useState(null)

  const pipelineResultRef = useRef(null)
  const pendingLessonPredictionRef = useRef(null)
  const awaitingUserRef = useRef(null)
  /** Clears finger-target wait interval on unmount */
  const fingerTargetPollRef = useRef(null)
  const initialCheckpointDoneRef = useRef(false)
  const lastFingerCountRef = useRef(-1)
  const fingerCameraActiveRef = useRef(false)
  const queuedUserInputRef = useRef('')
  const queuedNoticeShownRef = useRef(false)
  const drainingQueuedInputRef = useRef(false)
  const mathDragSolveRef = useRef(null)

  const ALL_LABS = ['dots', 'fingers', 'mathDrag', 'multiplicationDots', 'subtractionDots', 'spatial']
  const usedLabsRef = useRef([])

  /**
   * Pick a lab from `eligible` that hasn't been used yet this cycle.
   * Once every lab in the full roster has been played, the tracker resets.
   */
  const pickNextLab = useCallback((eligible) => {
    if (eligible.includes('mathDrag')) return 'mathDrag'
    const available = eligible.filter(l => !usedLabsRef.current.includes(l))
    const pool = available.length > 0 ? available : eligible
    if (pool === eligible) usedLabsRef.current = []
    const choice = pool[Math.floor(Math.random() * pool.length)]
    usedLabsRef.current = [...usedLabsRef.current, choice]
    return choice
  }, [])

  const onFingerCountChange = useCallback(n => {
    lastFingerCountRef.current = typeof n === 'number' ? n : -1
  }, [])

  const onFingerCameraActiveChange = useCallback(on => {
    fingerCameraActiveRef.current = on
  }, [])

  const onSpatialTouch = useCallback((index, name) => {
    if (spatialTouchResolverRef.current) {
      spatialTouchResolverRef.current(name)
    }
  }, [])

  const waitForSpatialTouch = useCallback((targetName) => {
    return new Promise(resolve => {
      spatialTouchResolverRef.current = (touchedName) => {
        if (touchedName.toLowerCase() === targetName.toLowerCase()) {
          spatialTouchResolverRef.current = null
          resolve()
        }
      }
    })
  }, [])

  const nextVisualizationStep = useCallback(() => {
    setVisualizationStepIndex(prev => prev + 1)
  }, [])

  const speakAiText = useCallback(async (text) => {
    const spokenText = String(text || '').trim()
    if (!spokenText) return
    const audioBlob = await textToSpeechBlob(spokenText)
    await playAudioBlob(audioBlob, {
      onStart: () => {
        aiAudioLevelsRef.current = []
        setAiAudioActive(true)
      },
      onLevels: (levels) => {
        aiAudioLevelsRef.current = Array.isArray(levels) ? levels : []
      },
      onEnd: () => {
        aiAudioLevelsRef.current = []
        setAiAudioActive(false)
      },
    })
  }, [])

  const deliverAiMessage = useCallback(
    async (text) => {
      const spokenText = String(text || '').trim()
      if (!spokenText) return
      setMessages(prev => [...prev, { id: Date.now() + Math.random(), from: 'ai', text: spokenText }])
      setAiError('')
      try {
        await speakAiText(spokenText)
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        const normalized = detail.toLowerCase()
        if (normalized.includes('402') || normalized.includes('payment required')) {
          setAiError('TTS unavailable on current ElevenLabs plan.')
        } else {
          setAiError(detail || 'Text-to-speech failed.')
        }
        await delay(2800)
      }
    },
    [speakAiText]
  )

  const speakSegment = useCallback(
    async (segmentId, text) => {
      setCurrentMotionFrames(null)
      setAiState('speaking')
      await deliverAiMessage(text)
    },
    [deliverAiMessage]
  )

  const playReaction = useCallback((animName, durationMs = 3500) => {
    if (reactTimerRef.current) clearTimeout(reactTimerRef.current)
    setReactAnimation(animName)
    reactTimerRef.current = setTimeout(() => {
      setReactAnimation(null)
      reactTimerRef.current = null
    }, durationMs)
  }, [])

  const updateCountingActivity = useCallback((patch) => {
    setCountingActivity(prev => ({ ...prev, ...patch }))
  }, [])

  const resetCountingActivity = useCallback(() => {
    setCountingActivity(COUNTING_ACTIVITY_INITIAL)
    setFingerToolVisible(false)
    setMathDragActivity({ visible: false, operation: 'addition', a: 3, b: 2 })
    lastFingerCountRef.current = -1
    fingerCameraActiveRef.current = false
  }, [])

  const onMathDragSolve = useCallback(() => {
    mathDragSolveRef.current?.()
  }, [])

  const waitForUserAnswer = useCallback(() => {
    setAiState('awaiting_user')
    return new Promise(resolve => {
      awaitingUserRef.current = text => {
        awaitingUserRef.current = null
        resolve(text)
      }
    })
  }, [])

  /**
   * Tutor asked for exactly `target` fingers (0–10). Resolves when hold is steady on camera.
   */
  const waitForShowNFingers = useCallback(
    target => {
      const t = Number(target)
      return new Promise(resolve => {
        let finished = false
        let intervalId = null

        const cleanup = () => {
          if (intervalId != null) {
            clearInterval(intervalId)
            intervalId = null
          }
          fingerTargetPollRef.current = null
        }

        const finish = () => {
          if (finished) return
          finished = true
          cleanup()
          awaitingUserRef.current = null
          resolve()
        }

        setAiState('awaiting_user')
        awaitingUserRef.current = text => {
          if (answersMatch(text, String(t))) finish()
        }

        let stableStart = null
        intervalId = setInterval(() => {
          if (finished) return
          if (fingerCameraActiveRef.current && lastFingerCountRef.current === t) {
            if (!stableStart) stableStart = Date.now()
            else if (Date.now() - stableStart >= 550) finish()
          } else {
            stableStart = null
          }
        }, 90)
        fingerTargetPollRef.current = intervalId
      })
    },
    []
  )

  const runFingerCountDrillSession = useCallback(
    async ({ checkpointMode = false, skipIntro = false } = {}) => {
      setFingerToolVisible(true)
      updateCountingActivity({ visible: false })

      if (!skipIntro) {
        await speakSegment(
          'finger-drill-intro',
          "Now let's use your hands. I'll ask for a number from one to ten. Show that many fingers and hold them still for a moment so I can see."
        )
      }

      await delay(skipIntro ? 500 : 900)

      const rounds = 5
      const picks = []
      for (let i = 0; i < rounds; i++) {
        picks.push(Math.floor(Math.random() * 10) + 1)
      }

      for (let r = 1; r <= rounds; r++) {
        const n = picks[r - 1]
        const word = n === 1 ? 'finger' : 'fingers'
        await speakSegment(`finger-drill-ask-${r}`, `Show me ${n} ${word}.`)
        await waitForShowNFingers(n)
        await speakSegment(`finger-drill-yes-${r}`, `Nice! That's ${n}.`)
        await delay(350)
      }

      await speakSegment(
        'finger-drill-wrap',
        checkpointMode
          ? "Great counting with your fingers. Let's keep going with the lesson."
          : 'Great job with your fingers. Come back any time to practice counting.'
      )
    },
    [speakSegment, updateCountingActivity, waitForShowNFingers]
  )

  const askQuestionWithRetries = useCallback(
    async ({
      segmentId,
      question,
      expectedAnswer,
      successMessage,
      failureMessage,
      hint,
      maxTries,
      revealOnFailure = true,
    }) => {
      for (let attempt = 1; attempt <= maxTries; attempt++) {
        await speakSegment(segmentId, attempt === 1 ? question : `Try again: ${question}`)
        const answer = await waitForUserAnswer()
        if (answersMatch(answer, expectedAnswer)) {
          playReaction('wave', 4000)
          await speakSegment(segmentId, successMessage || 'Correct. Nice job.')
          return true
        }

        const isLastTry = attempt === maxTries
        if (isLastTry) {
          if (revealOnFailure) {
            await speakSegment(segmentId, `That's incorrect. The answer is ${expectedAnswer}.`)
          } else {
            await speakSegment(segmentId, failureMessage || "That's incorrect.")
          }
          return false
        }

        await speakSegment(segmentId, failureMessage || "That's not quite right.")
        if (hint) await speakSegment(segmentId, hint)
      }

      return false
    },
    [speakSegment, waitForUserAnswer, playReaction]
  )

  const runCountingSession = useCallback(
    async ({ checkpointMode = false } = {}) => {
      setAiError('')
      setCurrentVisualization(null)
      setVisualizationStepIndex(0)
      setAiState('building')
      if (!checkpointMode) {
        pipelineResultRef.current = null
      }

      /** One lab per round — not both. Topic card matches which lab is active. */
      const countingChoice = pickNextLab(['dots', 'fingers'])
      const useDotLab = countingChoice === 'dots'

      if (useDotLab) {
        setTopicDisplay(COUNTING_TOPIC)
        setFingerToolVisible(false)
        updateCountingActivity({
          visible: true,
          totalDots: 0,
          lastAdded: 0,
          prompt: 'Watch the dots, then say how many you see.',
          title: 'Say The Number You See',
          kicker: 'Counting Lab',
        })

        await speakSegment(
          'counting-intro',
          "This round we're using Counting Lab with dots on the screen."
        )

        let total = 0
        const seedSteps = [
          { add: 1, line: 'Here is 1 dot.' },
          { add: 1, line: 'Now there are 2 dots.' },
          { add: 1, line: 'Now there are 3 dots.' },
        ]

        for (let i = 0; i < seedSteps.length; i++) {
          total += seedSteps[i].add
          updateCountingActivity({
            visible: true,
            totalDots: total,
            lastAdded: seedSteps[i].add,
            prompt: i < seedSteps.length - 1 ? 'Keep watching the dots.' : 'The next step will be your turn to count.',
          })
          await delay(500)
          await speakSegment(`counting-seed-${i + 1}`, seedSteps[i].line)
        }

        for (let round = 1; round <= 3; round++) {
          const increment = randomCountIncrement()
          total += increment
          updateCountingActivity({
            visible: true,
            totalDots: total,
            lastAdded: increment,
            prompt: 'Say the total number of dots on the screen.',
          })
          await delay(500)
          await askQuestionWithRetries({
            segmentId: `counting-round-${round}`,
            question:
              increment === 1
                ? 'I added 1 more dot. How many dots are on the screen now?'
                : `I added ${increment} more dots. How many dots are on the screen now?`,
            expectedAnswer: String(total),
            successMessage: `Correct. There are ${total} dots.`,
            failureMessage: "That's not quite right.",
            hint: 'Count all the dots on the screen from the beginning.',
            maxTries: 2,
          })
        }

        updateCountingActivity({
          visible: true,
          totalDots: total,
          lastAdded: 0,
          prompt: 'Nice counting. Ask another counting question to play again.',
        })
        await speakSegment(
          'counting-wrap',
          checkpointMode
            ? 'Nice counting with the dots. Checkpoint complete. Now we will continue with the lesson.'
            : 'Nice counting with the dots. Ask another counting question any time and we will do another round.'
        )
      } else {
        setTopicDisplay(FINGER_COUNT_TOPIC)
        setFingerToolVisible(false)
        updateCountingActivity({ visible: false })

        await speakSegment(
          'counting-finger-intro',
          "This round we're using Finger Lab only — no dots. I'll ask for amounts from one to ten on your fingers, then hold still."
        )

        await runFingerCountDrillSession({ checkpointMode, skipIntro: true })

        setFingerToolVisible(false)
        updateCountingActivity({
          ...COUNTING_ACTIVITY_INITIAL,
          prompt: 'Nice work. Ask another counting question to play again.',
        })
        await speakSegment(
          'counting-wrap-fingers',
          checkpointMode
            ? 'Great finger counting. Checkpoint complete. Now we will continue with the lesson.'
            : 'Great finger counting. Ask another counting question any time and we will do another round.'
        )
      }

      if (!checkpointMode) {
        setAiState(null)
      } else {
        setAiState('building')
      }
      setCurrentMotionFrames(null)
      initialCheckpointDoneRef.current = true
    },
    [askQuestionWithRetries, pickNextLab, runFingerCountDrillSession, speakSegment, updateCountingActivity]
  )

  const runMultiplicationDotsSession = useCallback(
    async ({ checkpointMode = false } = {}) => {
      setAiError('')
      setCurrentVisualization(null)
      setVisualizationStepIndex(0)
      setAiState('building')
      if (!checkpointMode) {
        pipelineResultRef.current = null
      }

      const fixedDots = randomCountIncrement()
      const rounds = 3

      setTopicDisplay(MULTIPLICATION_DOTS_TOPIC)
      setFingerToolVisible(false)
      updateCountingActivity({
        visible: true,
        totalDots: 0,
        lastAdded: 0,
        prompt: 'Say the total after each equal group is added.',
        title: 'Say The Total Dots',
        kicker: 'Multiplication Lab',
      })

      await speakSegment(
        'multiplication-intro',
        `Let's do multiplication with dots. Our fixed number is ${fixedDots}.`
      )

      let total = fixedDots
      updateCountingActivity({
        visible: true,
        totalDots: total,
        lastAdded: fixedDots,
        prompt: 'Start with the first group of dots.',
      })
      await delay(500)
      await speakSegment('multiplication-seed', `We start with ${fixedDots} dots.`)

      for (let round = 1; round <= rounds; round++) {
        total += fixedDots
        updateCountingActivity({
          visible: true,
          totalDots: total,
          lastAdded: fixedDots,
          prompt: 'Say the total number of dots on the screen.',
        })
        await delay(500)
        await askQuestionWithRetries({
          segmentId: `multiplication-round-${round}`,
          question: `I added ${fixedDots} more dots. How many dots are on the screen now?`,
          expectedAnswer: String(total),
          successMessage: `Correct. ${round + 1} groups of ${fixedDots} makes ${total}.`,
          failureMessage: "That's not quite right.",
          hint: `Count by ${fixedDots}s to find the new total.`,
          maxTries: 2,
        })
      }

      updateCountingActivity({
        visible: true,
        totalDots: total,
        lastAdded: 0,
        prompt: `Nice work. You built ${rounds + 1} groups of ${fixedDots} for a total of ${total}.`,
      })
      await speakSegment(
        'multiplication-wrap',
        checkpointMode
          ? `Great job. ${rounds + 1} times ${fixedDots} equals ${total}. Checkpoint complete. Now we will continue with the lesson.`
          : `Great job. ${rounds + 1} times ${fixedDots} equals ${total}. Ask for multiplication dots again to play another round.`
      )
      if (!checkpointMode) {
        setAiState(null)
      } else {
        setAiState('building')
      }
      setCurrentMotionFrames(null)
      initialCheckpointDoneRef.current = true
    },
    [askQuestionWithRetries, speakSegment, updateCountingActivity]
  )

  const runSubtractionDotsSession = useCallback(
    async ({ checkpointMode = false } = {}) => {
      setAiError('')
      setCurrentVisualization(null)
      setVisualizationStepIndex(0)
      setAiState('building')
      if (!checkpointMode) {
        pipelineResultRef.current = null
      }

      let total = 5 + Math.floor(Math.random() * 6)
      const rounds = 3

      setTopicDisplay(SUBTRACTION_DOTS_TOPIC)
      setFingerToolVisible(false)
      updateCountingActivity({
        visible: true,
        totalDots: total,
        lastAdded: total,
        prompt: 'Watch the dots — some will be removed. Say how many are left.',
        title: 'How Many Are Left?',
        kicker: 'Subtraction Lab',
      })

      await speakSegment(
        'subtraction-intro',
        `Let's practice subtraction with dots. We start with ${total} dots.`
      )
      await delay(500)

      for (let round = 1; round <= rounds; round++) {
        const remove = Math.max(1, Math.floor(Math.random() * total))
        total -= remove
        updateCountingActivity({
          visible: true,
          totalDots: total,
          lastAdded: 0,
          prompt: 'Say how many dots are left on the screen.',
        })
        await delay(500)
        await askQuestionWithRetries({
          segmentId: `subtraction-round-${round}`,
          question: `I removed ${remove} dot${remove === 1 ? '' : 's'}. How many dots are left?`,
          expectedAnswer: String(total),
          successMessage: `Correct. ${total} dot${total === 1 ? ' is' : 's are'} left.`,
          failureMessage: "That's not quite right.",
          hint: 'Count the remaining dots on the screen one by one.',
          maxTries: 2,
        })
      }

      updateCountingActivity({
        visible: true,
        totalDots: total,
        lastAdded: 0,
        prompt: `Great work. ${total} dot${total === 1 ? ' remains' : 's remain'}.`,
      })
      await speakSegment(
        'subtraction-wrap',
        checkpointMode
          ? `Well done. Checkpoint complete. Now we will continue with the lesson.`
          : `Great job. Ask for subtraction with dots any time to play another round.`
      )
      if (!checkpointMode) {
        setAiState(null)
      } else {
        setAiState('building')
      }
      setCurrentMotionFrames(null)
      initialCheckpointDoneRef.current = true
    },
    [askQuestionWithRetries, speakSegment, updateCountingActivity]
  )

  const runSpatialLabSession = useCallback(
    async () => {
      setAiError('')
      setCurrentVisualization(null)
      setVisualizationStepIndex(0)
      resetCountingActivity()
      pipelineResultRef.current = null
      setAiState('building')

      const items = pickSpatialItems(4)
      setSpatialItems(items)
      setSpatialActive(false)
      setTopicDisplay(SPATIAL_LAB_TOPIC)
      setFingerToolVisible(true)

      await delay(1200)

      await speakSegment(
        'spatial-intro',
        "Welcome to Spatial Lab! I've placed different planets in front of you. Each one has its name floating above it."
      )
      await delay(600)
      await speakSegment(
        'spatial-camera',
        'Enable your camera if it is not on yet, then point your finger at the planet I ask for.'
      )
      await delay(800)

      setSpatialActive(true)

      const order = shuffleArray(items)
      for (let i = 0; i < order.length; i++) {
        const target = order[i]
        await speakSegment(
          `spatial-find-${i}`,
          `Can you find ${target.name}? Point at it with your finger!`
        )
        setAiState('awaiting_user')
        await waitForSpatialTouch(target.name)
        playReaction('wave', 2500)
        await speakSegment(
          `spatial-found-${i}`,
          `You found the ${target.name}! Great job!`
        )
        await delay(350)
      }

      setSpatialActive(false)

      await askQuestionWithRetries({
        segmentId: 'spatial-count',
        question: `Now tell me, how many planets did we find in total?`,
        expectedAnswer: String(items.length),
        successMessage: `That's right! We found ${items.length} different planets!`,
        failureMessage: "Not quite.",
        hint: 'Think about how many planets I asked you to find.',
        maxTries: 2,
      })

      const nameList = items.map(it => it.name).join(', ')
      await speakSegment(
        'spatial-wrap',
        `Awesome work! You identified all the planets: ${nameList}. Come back any time to play Spatial Lab again!`
      )

      setSpatialItems(null)
      setSpatialActive(false)
      setFingerToolVisible(false)
      spatialTouchResolverRef.current = null
      setAiState(null)
      setCurrentMotionFrames(null)
    },
    [
      askQuestionWithRetries,
      playReaction,
      resetCountingActivity,
      speakSegment,
      waitForSpatialTouch,
    ]
  )

  const runMathDragSession = useCallback(
    async ({ checkpointMode = false, operation: op = 'addition', a: inputA, b: inputB } = {}) => {
      setAiError('')
      setCurrentVisualization(null)
      setVisualizationStepIndex(0)
      setAiState('building')
      if (!checkpointMode) pipelineResultRef.current = null

      // Generate random numbers if not supplied (direct-lab mode)
      const a = inputA ?? Math.floor(Math.random() * 9) + 1
      const b = inputB ?? (op === 'subtraction'
        ? Math.floor(Math.random() * a) + 1
        : Math.floor(Math.random() * 9) + 1)

      const opName  = op === 'subtraction' ? 'subtraction' : op === 'multiplication' ? 'multiplication' : 'addition'
      const opEmoji = op === 'subtraction' ? '➖' : op === 'multiplication' ? '✖️' : '➕'
      const opWord  = op === 'subtraction' ? 'minus' : op === 'multiplication' ? 'times' : 'plus'

      setTopicDisplay({ label: `${opName.charAt(0).toUpperCase() + opName.slice(1)} Practice`, emoji: opEmoji })
      setFingerToolVisible(false)
      updateCountingActivity({ visible: false })

      await speakSegment(
        'mathdrag-intro',
        `Let's practice ${opName}. Drag the correct answer tile into the drop zone to solve the problem!`
      )

      setMathDragActivity({ visible: true, operation: op, a, b })
      setAiState('awaiting_user')

      // Wait for student to drop the correct tile
      await new Promise(resolve => { mathDragSolveRef.current = resolve })
      mathDragSolveRef.current = null

      setMathDragActivity({ visible: false, operation: 'addition', a: 3, b: 2 })

      const answer = op === 'subtraction' ? Math.max(0, a - b) : op === 'multiplication' ? a * b : a + b
      await speakSegment(
        'mathdrag-wrap',
        checkpointMode
          ? `Well done! ${a} ${opWord} ${b} equals ${answer}. Checkpoint complete. Let's continue with the lesson.`
          : `Well done! ${a} ${opWord} ${b} equals ${answer}. Ask for more practice any time.`
      )

      if (!checkpointMode) setAiState(null)
      else setAiState('building')
      setCurrentMotionFrames(null)
      initialCheckpointDoneRef.current = true
    },
    [speakSegment, updateCountingActivity]
  )

  const runTutorSession = useCallback(
    async (questionText) => {
      initialCheckpointDoneRef.current = false
      pipelineResultRef.current = null
      pendingLessonPredictionRef.current = null
      setUserModelHint(null)
      setCurrentVisualization(null)
      setVisualizationStepIndex(0)
      resetCountingActivity()
      setAiState('intake')

      let result
      try {
        result = await streamLessonPipeline(questionText, {
          onEvent: evt => {
            if (evt.stage === 'intake') setAiState('topic')
            if (evt.stage === 'topic' && evt.data?.topicTitle) {
              setTopicDisplay({
                label: evt.data.topicTitle,
                emoji: emojiForTopic(evt.data.topicTitle),
              })
              setAiState('objectives')
            }
            if (evt.stage === 'objectives') setAiState('lesson_plan')
            if (evt.stage === 'lessonPlan') setAiState('gestures')
            if (evt.stage === 'gestures') setAiState('visual_model')
          },
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const normalized = message.toLowerCase()
        let friendly = message
        if (normalized.includes('429') || normalized.includes('quota') || normalized.includes('billing')) {
          friendly = 'OpenAI quota exceeded — add credits at platform.openai.com/billing'
        } else if (normalized.includes('401') || normalized.includes('invalid') || normalized.includes('api key')) {
          friendly = 'OpenAI API key is invalid — check OPENAI_API_KEY in .env'
        }
        setAiError(friendly)
        setMessages(prev => [...prev, { id: Date.now() + Math.random(), from: 'ai', text: `Pipeline error: ${friendly}` }])
        setCurrentVisualization(null)
        setVisualizationStepIndex(0)
        setAiState(null)
        pendingLessonPredictionRef.current = null
        setUserModelHint(null)
        await delay(4000)
        setAiError('')
        resetCountingActivity()
        return
      }

      if (!result) {
        setMessages(prev => [
          ...prev,
          {
            id: Date.now() + Math.random(),
            from: 'ai',
            text: 'Lesson pipeline finished without a result. Is the dev server running?',
          },
        ])
        setCurrentVisualization(null)
        setVisualizationStepIndex(0)
        setAiState(null)
        pendingLessonPredictionRef.current = null
        setUserModelHint(null)
        resetCountingActivity()
        return
      }

      setAiState('building')
      pipelineResultRef.current = result

      const topicKey = normalizeTopicKey(result.topic?.topicTitle || '')
      const pred = predictPerformance(topicKey || 'lesson', 'lesson')
      pendingLessonPredictionRef.current = {
        predicted: pred.predicted_score,
        features: pred.features,
        topicKey,
      }
      setUserModelHint({
        predictedPct: Math.round(pred.predicted_score * 100),
        confidencePct: Math.round(pred.confidence * 100),
      })

      const topicLine = result.topic?.topicTitle
        ? `Today we're working on ${result.topic.topicTitle}.`
        : "Let's work on this together."
      await speakSegment('voice2-intro', topicLine)

      const brief = String(result.topic?.briefSummary || '').trim()
      if (brief.length > 12) {
        await speakSegment('voice2-topic-brief', brief)
      }

      const { concept: topicTeachingSentences, rest: reinforcementSentences } = getConceptAndRestSentences(
        result.lessonPlan
      )
      const vizPayload = enrichVisualizationForClient(extractVisualization(result))
      const vizNarration = vizPayload ? buildVizNarration(vizPayload) : null

      // Phase 1 — Baymax presents first (gesture toward viz area), then objects appear + TTS
      if (vizNarration) {
        // Lead-in: Baymax sweeps arm toward the viz area before anything appears
        setCurrentMotionFrames(null)
        setAiState('presenting')
        await delay(650)

        setCurrentVisualization(vizPayload)
        setVisualizationStepIndex(0)

        for (const { text, stage } of vizNarration.sentences) {
          setVisualizationStepIndex(stage)
          setCurrentMotionFrames(null)
          setAiState('speaking')
          await deliverAiMessage(text)
        }
      } else {
        setCurrentVisualization(vizPayload)
        setVisualizationStepIndex(0)
        for (const sent of topicTeachingSentences) {
          setCurrentMotionFrames(null)
          setAiState('speaking')
          await deliverAiMessage(sent.text)
        }
      }

      // Phase 2 — hands-on tools + questions; clears 3D viz while the panel is active
      if (!initialCheckpointDoneRef.current) {
        const checkpointLab = chooseCheckpointLab(questionText, result)
        const va = vizPayload?.a ?? Math.floor(Math.random() * 9) + 1
        const vb = vizPayload?.b ?? Math.floor(Math.random() * 9) + 1

        const eligibleForSubtraction    = ['subtractionDots', 'mathDrag', 'dots', 'fingers']
        const eligibleForMultiplication  = ['multiplicationDots', 'mathDrag', 'dots', 'fingers']
        const eligibleForAddition       = ['dots', 'fingers', 'mathDrag']
        const eligibleDefault           = ['dots', 'fingers']

        let eligible
        if (checkpointLab === 'subtraction')         eligible = eligibleForSubtraction
        else if (checkpointLab === 'multiplication') eligible = eligibleForMultiplication
        else if (checkpointLab === 'addition')       eligible = eligibleForAddition
        else                                         eligible = eligibleDefault

        const lab = pickNextLab(eligible)

        if (lab === 'mathDrag') {
          const op = checkpointLab === 'subtraction' ? 'subtraction'
            : checkpointLab === 'multiplication' ? 'multiplication' : 'addition'
          await runMathDragSession({ checkpointMode: true, operation: op, a: va, b: vb })
        } else if (lab === 'subtractionDots') {
          await runSubtractionDotsSession({ checkpointMode: true })
        } else if (lab === 'multiplicationDots') {
          await runMultiplicationDotsSession({ checkpointMode: true })
        } else {
          await runCountingSession({ checkpointMode: true })
        }
        resetCountingActivity()
        if (result.topic?.topicTitle) {
          setTopicDisplay({
            label: result.topic.topicTitle,
            emoji: emojiForTopic(result.topic.topicTitle),
          })
        }
      }

      // Phase 3 — reinforcement: present gesture, then viz at final stage + wrap-up speech
      const finalStage = vizNarration ? vizNarration.maxStage : 0
      if (reinforcementSentences.length) {
        setCurrentMotionFrames(null)
        setAiState('presenting')
        await delay(500)
        setCurrentVisualization(vizPayload)
        setVisualizationStepIndex(finalStage)
      } else {
        setCurrentVisualization(vizPayload)
        setVisualizationStepIndex(finalStage)
      }
      for (const sent of reinforcementSentences) {
        setCurrentMotionFrames(null)
        setAiState('speaking')
        await deliverAiMessage(sent.text)
      }

      const pendOk = pendingLessonPredictionRef.current
      if (pendOk) {
        recordPredictionResult(pendOk.predicted, 1, pendOk.features, pendOk.topicKey)
        recordLessonOutcome(pendOk.topicKey, true)
        pendingLessonPredictionRef.current = null
      }
      setUserModelHint(null)

      setAiState(null)
      setCurrentVisualization(null)
      setVisualizationStepIndex(0)
      setCurrentMotionFrames(null)
    },
    [
      deliverAiMessage,
      pickNextLab,
      resetCountingActivity,
      runCountingSession,
      runMathDragSession,
      runMultiplicationDotsSession,
      runSubtractionDotsSession,
      speakSegment,
    ]
  )

  const handleUserInput = useCallback(
    async (text) => {
      const spokenText = String(text || '').trim()
      if (!spokenText) return

      setMessages(prev => [...prev, { id: Date.now() + Math.random(), from: 'user', text: spokenText }])

      if (awaitingUserRef.current) {
        awaitingUserRef.current(spokenText)
        return
      }

      if (aiState !== null) {
        queuedUserInputRef.current = spokenText
        if (!queuedNoticeShownRef.current) {
          queuedNoticeShownRef.current = true
          setMessages(prev => [
            ...prev,
            {
              id: Date.now() + Math.random(),
              from: 'ai',
              text: "I heard you. I'll switch to that topic as soon as this part finishes.",
            },
          ])
        }
        return
      }
      queuedNoticeShownRef.current = false
      setAiError('')

      const requestedLab = inferRequestedLab(spokenText)
      const toolsOnly =
        !wantsTeachingPipelineFirst(spokenText) &&
        (requestedLab === 'counting' || requestedLab === 'multiplication' || requestedLab === 'subtraction' || requestedLab === 'spatial')

      if (toolsOnly) {
        if (requestedLab === 'spatial') {
          pickNextLab(['spatial'])
          await runSpatialLabSession()
          return
        }
        if (requestedLab === 'counting') {
          pickNextLab(['dots', 'fingers'])
          await runCountingSession()
          return
        }
        if (requestedLab === 'multiplication') {
          const lab = pickNextLab(['multiplicationDots', 'mathDrag', 'dots', 'fingers'])
          if (lab === 'mathDrag') await runMathDragSession({ operation: 'multiplication' })
          else if (lab === 'multiplicationDots') await runMultiplicationDotsSession()
          else await runCountingSession()
          return
        }
        if (requestedLab === 'subtraction') {
          const lab = pickNextLab(['subtractionDots', 'mathDrag', 'dots', 'fingers'])
          if (lab === 'mathDrag') await runMathDragSession({ operation: 'subtraction' })
          else if (lab === 'subtractionDots') await runSubtractionDotsSession()
          else await runCountingSession()
          return
        }
      }

      await runTutorSession(spokenText)
    },
    [aiState, pickNextLab, runCountingSession, runMathDragSession, runMultiplicationDotsSession, runSubtractionDotsSession, runSpatialLabSession, runTutorSession]
  )

  useEffect(() => {
    if (aiState !== null) return
    if (drainingQueuedInputRef.current) return
    const queued = String(queuedUserInputRef.current || '').trim()
    if (!queued) return

    queuedUserInputRef.current = ''
    queuedNoticeShownRef.current = false
    drainingQueuedInputRef.current = true
    Promise.resolve(handleUserInput(queued)).finally(() => {
      drainingQueuedInputRef.current = false
    })
  }, [aiState, handleUserInput])

  useEffect(() => {
    return () => {
      if (fingerTargetPollRef.current != null) {
        clearInterval(fingerTargetPollRef.current)
        fingerTargetPollRef.current = null
      }
      awaitingUserRef.current = null
      spatialTouchResolverRef.current = null
      queuedUserInputRef.current = ''
      queuedNoticeShownRef.current = false
      drainingQueuedInputRef.current = false
    }
  }, [])

  const inputLocked = aiState !== null && aiState !== 'awaiting_user'

  const pipelineUiState =
    aiError || aiState === 'awaiting_user' ? null : aiState

  const sceneAnimation =
    reactAnimation != null
      ? reactAnimation
      : aiState === 'presenting'
        ? 'present'
        : aiState === 'speaking'
          ? 'explain'
          : SHOW_ANIMATION_PANEL && panelAnimOverride != null
            ? panelAnimOverride
            : 'idle'

  return (
    <div className="app-root">
      <a href="#/" className="home-btn" aria-label="Back to home" title="Home">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 10L10 3l7 7" />
          <path d="M5 8.5V16a1 1 0 001 1h3v-4h2v4h3a1 1 0 001-1V8.5" />
        </svg>
      </a>
      <a href="#/camera" className="camera-nav-btn" aria-label="Camera" title="Camera">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
      </a>
      <CharacterScene
        aiState={aiState}
        motionFrames={currentMotionFrames}
        animation={sceneAnimation}
        visualization={currentVisualization}
        visualizationStepIndex={visualizationStepIndex}
        spatialItems={spatialItems}
        spatialActive={spatialActive}
        onSpatialTouch={onSpatialTouch}
      />

      <AiAudioBackdropSync levelsRef={aiAudioLevelsRef} active={aiAudioActive} />
      <div className="edge-bloom edge-bloom-left" />
      <div className="edge-bloom edge-bloom-right" />

      <HistorySidebar onLoadSession={() => {}} />

      <AIStatus state={aiError ? 'error' : aiState} message={aiError} />
      <PipelineProgress state={pipelineUiState} />
      {currentVisualization?.steps && (
        <button
          type="button"
          className="viz-step-btn"
          onClick={nextVisualizationStep}
          disabled={!(aiState === 'speaking' || aiState === 'awaiting_user')}
        >
          Next step
        </button>
      )}
      {SHOW_ANIMATION_PANEL && (
        <AnimationPanel
          current={sceneAnimation}
          onSelect={(name) => {
            setCurrentMotionFrames(null)
            setPanelAnimOverride(name)
          }}
          disabled={aiState !== null}
        />
      )}
      <TopicCard topic={topicDisplay} userModelHint={userModelHint} />
      <CountingToolPanel
        visible={countingActivity.visible}
        totalDots={countingActivity.totalDots}
        lastAdded={countingActivity.lastAdded}
        prompt={countingActivity.prompt}
        title={countingActivity.title}
        kicker={countingActivity.kicker}
      />
      <FingerCountToolPanel
        visible={fingerToolVisible}
        autoStartCamera={fingerToolVisible}
        onCountChange={onFingerCountChange}
        onCameraActiveChange={onFingerCameraActiveChange}
      />
      <MathDragToolPanel
        visible={mathDragActivity.visible}
        operation={mathDragActivity.operation}
        a={mathDragActivity.a}
        b={mathDragActivity.b}
        onSolve={onMathDragSolve}
      />
      <ChatPanel
        messages={messages}
        onSend={handleUserInput}
        aiState={aiState}
        audioOnly
        inputLocked={inputLocked}
      />
    </div>
  )
}
