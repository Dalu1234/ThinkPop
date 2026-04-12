import { useState, useCallback, useRef, useEffect } from 'react'
import LandingPage from './LandingPage'
import CharacterScene from './components/CharacterScene'
import TopicCard from './components/TopicCard'
import ChatPanel from './components/ChatPanel'
import HistorySidebar from './components/HistorySidebar'
import AIStatus from './components/AIStatus'
import PipelineProgress from './components/PipelineProgress'
import Skyline from './components/Skyline'
import { textToSpeechBlob, playAudioBlob } from './lib/elevenlabs'
import {
  streamLessonPipeline,
  formatLessonPlanMessage,
  emojiForTopic,
  extractVisualization,
} from './lib/lessonApi'
import { requestMotion, MOTION_PROMPTS, generateProceduralMotion } from './lib/motionApi'

const MDM_TEST_ACTIONS = [
  { label: 'Wave',      prompt: MOTION_PROMPTS.wave },
  { label: 'Point',     prompt: MOTION_PROMPTS.point },
  { label: 'Open',      prompt: MOTION_PROMPTS.open },
  { label: 'Emphasize', prompt: MOTION_PROMPTS.emphasize },
  { label: 'Count',     prompt: MOTION_PROMPTS.count },
  { label: 'Rest',      prompt: MOTION_PROMPTS.rest },
]

function MDMTestPanel({ onFrames, disabled }) {
  const [busy, setBusy] = useState(null)   // label of running action
  const [lastMode, setLastMode] = useState(null)

  async function run(label, prompt) {
    if (busy) return
    setBusy(label)
    try {
      const data = await requestMotion(prompt, 80)
      setLastMode(data.mode)
      onFrames(data.frames)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mdm-test-panel">
      <p className="mdm-test-title">MDM Test</p>
      <div className="mdm-test-grid">
        {MDM_TEST_ACTIONS.map(({ label, prompt }) => (
          <button
            key={label}
            className={`mdm-test-btn${busy === label ? ' mdm-test-btn--busy' : ''}`}
            disabled={!!busy || disabled}
            onClick={() => run(label, prompt)}
          >
            {busy === label ? '...' : label}
          </button>
        ))}
      </div>
      {lastMode && (
        <p className="mdm-test-mode">
          {lastMode.startsWith('procedural') ? 'local fallback' : 'MDM server'}
        </p>
      )}
    </div>
  )
}

/** Stable key for segment motion map (ids from LLM are strings; avoid ref misses). */
function segmentMotionKey(seg, index) {
  return String(seg?.id != null ? seg.id : `segment-${index}`)
}

const INITIAL_TOPIC = { label: 'Elementary math', emoji: '🔢' }

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

const REST_GESTURE = { motion: 'rest', hand: 'both' }

function BaymaxSpeakingBars({ levels, active }) {
  const bars = levels?.length ? levels : new Array(32).fill(0.04)

  return (
    <div className={`baymax-speaking-overlay ${active ? 'is-active' : ''}`}>
      <div className="baymax-speaking-line" aria-hidden="true">
        {bars.map((level, index) => {
          const normalized = Math.max(active ? 0.16 : 0.08, Math.min(1, level || 0))
          return (
            <span
              key={index}
              className="baymax-speaking-bar"
              style={{
                height: `${16 + normalized * 46}px`,
                opacity: active ? 1 : 0.38,
              }}
            />
          )
        })}
      </div>
    </div>
  )
}

function BaymaxExperience() {
  const [aiState, setAiState] = useState(null)
  const [aiError, setAiError] = useState('')
  const [aiAudioLevels, setAiAudioLevels] = useState([])
  const [aiAudioActive, setAiAudioActive] = useState(false)
  const [topicDisplay, setTopicDisplay] = useState(INITIAL_TOPIC)
  const [playGesture, setPlayGesture] = useState(REST_GESTURE)
  const [currentVisualization, setCurrentVisualization] = useState(null)
  const [visualizationStepIndex, setVisualizationStepIndex] = useState(0)
  // Looping wave on load — verifies retarget + FBX without running the lesson pipeline
  const [currentMotionFrames, setCurrentMotionFrames] = useState(() =>
    generateProceduralMotion(MOTION_PROMPTS.wave, 96).frames
  )
  const [messages, setMessages] = useState([
    {
      id: 1,
      from: 'ai',
      text: "Hi! I'm your AI teacher. Ask me anything — I'll build a full lesson, move to illustrate it, and speak the answer. 🤗",
    },
  ])
  const pipelineResultRef  = useRef(null)
  // Stores pre-generated MDM frames per segment: { [segmentId]: frames[] }
  const segmentMotionsRef  = useRef({})

  const nextVisualizationStep = useCallback(() => {
    setVisualizationStepIndex(prev => prev + 1)
  }, [])

  const speakAiText = useCallback(async (text) => {
    const spokenText = String(text || '').trim()
    if (!spokenText) return
    const audioBlob = await textToSpeechBlob(spokenText)
    await playAudioBlob(audioBlob, {
      onStart: () => {
        setAiAudioActive(true)
        setAiAudioLevels([])
      },
      onLevels: (levels) => {
        setAiAudioLevels(Array.isArray(levels) ? levels : [])
      },
      onEnd: () => {
        setAiAudioActive(false)
        setAiAudioLevels([])
      },
    })
  }, [])

  const deliverAiMessage = useCallback(async (text) => {
    const spokenText = String(text || '').trim()
    if (!spokenText) return

    const aiMsg = { id: Date.now() + 1, from: 'ai', text: spokenText }
    setMessages(prev => [...prev, aiMsg])
    setAiError('')

    try {
      await speakAiText(spokenText)
    } catch (error) {
      console.error('ElevenLabs text-to-speech failed:', error)
      const detail = error instanceof Error ? error.message : String(error)
      const normalized = detail.toLowerCase()
      if (normalized.includes('402') || normalized.includes('payment required')) {
        setAiError('TTS unavailable on current ElevenLabs plan.')
      } else {
        setAiError(detail || 'Text-to-speech failed.')
      }
      await delay(2800)
    }
  }, [speakAiText])

  // Pre-generate MDM motion clips for every lesson segment.
  // Runs sequentially (one GPU at a time) in the background — doesn't block TTS.
  const generateSegmentMotions = useCallback(async (result) => {
    const segments = result?.lessonPlan?.segments || []
    const gestures = result?.gesturePlan?.gestures || []
    segmentMotionsRef.current = {}

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]
      const key = segmentMotionKey(seg, i)
      const g =
        gestures.find(x => String(x.segmentId) === String(seg.id)) || gestures[i]
      const prompt = g?.mdmPrompt || MOTION_PROMPTS[g?.motion] || MOTION_PROMPTS.rest
      try {
        console.log(`[motion] Generating segment ${i + 1}/${segments.length} [${key}]: "${prompt}"`)
        const data = await requestMotion(prompt, 80)
        segmentMotionsRef.current[key] = data.frames
        console.log(`[motion] Segment ${i + 1} ready (${data.frames.length} frames, ${data.mode})`)
      } catch (e) {
        console.warn(`[motion] Segment ${i + 1} failed:`, e.message)
        segmentMotionsRef.current[key] = generateProceduralMotion(prompt, 80).frames
      }
    }
  }, [])

  useEffect(() => {
    if (aiState !== 'speaking') {
      setPlayGesture(REST_GESTURE)
      return
    }

    const result = pipelineResultRef.current
    const segments = result?.lessonPlan?.segments
    if (!segments?.length) return

    let idx = 0
    let timerId
    const cancelled = { v: false }

    const step = () => {
      if (cancelled.v) return
      if (idx >= segments.length) {
        setPlayGesture(REST_GESTURE)
        setCurrentMotionFrames([])
        return
      }
      const seg = segments[idx]
      const g =
        result.gesturePlan?.gestures?.find(x => String(x.segmentId) === String(seg.id)) ||
        result.gesturePlan?.gestures?.[idx]

      setPlayGesture({
        motion: g?.motion || 'emphasize',
        hand: g?.hand || 'right',
      })

      const key = segmentMotionKey(seg, idx)
      let frames = segmentMotionsRef.current[key]
      if (!frames?.length) {
        frames = segmentMotionsRef.current[String(seg.id)]
      }
      if (!frames?.length) {
        const prompt = g?.mdmPrompt || MOTION_PROMPTS[g?.motion] || MOTION_PROMPTS.rest
        frames = generateProceduralMotion(prompt, 80).frames
      }
      setCurrentMotionFrames(frames)

      const ms = Math.min(60000, Math.max(600, (seg.durationSeconds || 5) * 1000))
      idx += 1
      timerId = setTimeout(step, ms)
    }

    step()
    return () => {
      cancelled.v = true
      clearTimeout(timerId)
    }
  }, [aiState])

  useEffect(() => {
    if (aiState !== 'speaking' || !currentVisualization?.steps) return

    const stageCounts = {
      addition: 3,
      subtraction: 4,
      multiplication: 3,
      division: 4,
    }
    const maxSteps = stageCounts[currentVisualization.type] || 1
    if (visualizationStepIndex >= maxSteps - 1) return

    const timerId = setTimeout(() => {
      setVisualizationStepIndex(prev => Math.min(prev + 1, maxSteps - 1))
    }, 1400)

    return () => clearTimeout(timerId)
  }, [aiState, currentVisualization, visualizationStepIndex])

  const sendMessage = useCallback(
    async (text) => {
      if (aiState !== null) return
      setAiError('')

      const userMsg = { id: Date.now(), from: 'user', text }
      setMessages(prev => [...prev, userMsg])

      pipelineResultRef.current = null
      setCurrentVisualization(null)
      setVisualizationStepIndex(0)
      setAiState('intake')

      let result
      try {
        result = await streamLessonPipeline(text, {
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
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        // Surface quota / auth errors more clearly
        const normalized = msg.toLowerCase()
        let friendly = msg
        if (normalized.includes('429') || normalized.includes('quota') || normalized.includes('billing')) {
          friendly = 'OpenAI quota exceeded — add credits at platform.openai.com/billing'
        } else if (normalized.includes('401') || normalized.includes('invalid') || normalized.includes('api key')) {
          friendly = 'OpenAI API key is invalid — check OPENAI_API_KEY in .env'
        }
        setAiError(friendly)
        setMessages(prev => [
          ...prev,
          {
            id: Date.now() + 1,
            from: 'ai',
            text: `Pipeline error: ${friendly}`,
          },
        ])
        setAiState(null)
        await delay(4000)
        setAiError('')
        return
      }

      if (!result) {
        setMessages(prev => [
          ...prev,
          {
            id: Date.now() + 1,
            from: 'ai',
            text: 'Lesson pipeline finished without a result. Is the dev server running?',
          },
        ])
        setAiState(null)
        return
      }

      setAiState('building')
      pipelineResultRef.current = result
      setCurrentVisualization(extractVisualization(result))
      setVisualizationStepIndex(0)

      // Must finish before "speaking" — otherwise the speaking effect reads empty segmentMotionsRef.
      await generateSegmentMotions(result)

      setAiState('speaking')
      const body = formatLessonPlanMessage(result)
      await deliverAiMessage(body)
      setCurrentMotionFrames(generateProceduralMotion(MOTION_PROMPTS.wave, 96).frames)
      setCurrentVisualization(null)
      setVisualizationStepIndex(0)
      setAiState(null)
    },
    [aiState, deliverAiMessage, generateSegmentMotions]
  )

  return (
    <div className="app-root">
      <CharacterScene
        aiState={aiState}
        motionFrames={currentMotionFrames}
        visualization={currentVisualization}
        visualizationStepIndex={visualizationStepIndex}
      />

      <div className="edge-bloom edge-bloom-left" />
      <div className="edge-bloom edge-bloom-right" />

      <Skyline />
      <HistorySidebar />

      <BaymaxSpeakingBars
        levels={aiAudioLevels}
        active={aiAudioActive || aiState === 'speaking'}
      />

      <AIStatus state={aiError ? 'error' : aiState} message={aiError} />
      <PipelineProgress state={aiError ? null : aiState} />
      {currentVisualization?.steps && (
        <button
          className="viz-step-btn"
          onClick={nextVisualizationStep}
          disabled={aiState !== 'speaking'}
        >
          Next Step
        </button>
      )}
      <MDMTestPanel onFrames={frames => setCurrentMotionFrames(frames)} disabled={aiState !== null} />
      <TopicCard topic={topicDisplay} />
      <ChatPanel messages={messages} onSend={sendMessage} aiState={aiState} />
    </div>
  )
}

export default function App() {
  const [route, setRoute] = useState(() => window.location.hash || '#/')

  useEffect(() => {
    const syncRoute = () => setRoute(window.location.hash || '#/')
    window.addEventListener('hashchange', syncRoute)
    return () => window.removeEventListener('hashchange', syncRoute)
  }, [])

  if (route === '#/baymax') {
    return <BaymaxExperience />
  }

  return <LandingPage />
}
