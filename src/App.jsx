import { useState, useCallback, useRef, useEffect } from 'react'
import LandingPage from './LandingPage'
import CharacterScene from './components/CharacterScene'
import TopicCard from './components/TopicCard'
import ChatPanel from './components/ChatPanel'
import HistorySidebar from './components/HistorySidebar'
import AIStatus from './components/AIStatus'
import PipelineProgress from './components/PipelineProgress'
import AiAudioBackdropSync from './components/AiAudioBackdropSync'
import { textToSpeechBlob, playAudioBlob, getBlobDurationMs } from './lib/elevenlabs'
import {
  streamLessonPipeline,
  formatLessonPlanMessage,
  flattenSentences,
  emojiForTopic,
  extractVisualization,
} from './lib/lessonApi'
import { enrichVisualizationForClient } from './lib/vizVisualItem'
import {
  requestMotion,
  DEFAULT_TEACHING_MOTION_PROMPT,
  SAMPLE_MDM_TEST_PROMPTS,
  restHoldFrames,
  onRigReady,
} from './lib/motionApi'
import { ANIMATION_NAMES } from './lib/boneAnimations'
import { saveSession, createSession } from './lib/sessions'
import {
  predictPerformance,
  recordPredictionResult,
  recordLessonOutcome,
  normalizeTopicKey,
} from './lib/userModel'
import { BaymaxVoiceFirstExperience } from './AppVoice2'

/** Dev animation picker — set `true` to show again. */
const SHOW_ANIMATION_PANEL = false

function AnimationPanel({ current, onSelect, disabled }) {
  return (
    <div className="mdm-test-panel">
      <p className="mdm-test-title">Animations</p>
      <div className="mdm-test-grid">
        {ANIMATION_NAMES.map(name => (
          <button
            key={name}
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

/** Stable key for sentence motion map (ids from LLM are strings; avoid ref misses). */
function sentenceMotionKey(sent, index) {
  return String(sent?.id != null ? sent.id : `sent-${index}`)
}

const INITIAL_TOPIC = { label: 'Elementary math', emoji: '🔢' }

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

const REST_GESTURE = { motion: 'rest', hand: 'both' }
/** 2D background character while the 3D tutor is driven by MDM — not tied to motion labels. */
const SPEAKING_GESTURE = { motion: 'expressive', hand: 'both' }

function BaymaxExperience() {
  const [aiState, setAiState] = useState(null)
  const [aiError, setAiError] = useState('')
  const aiAudioLevelsRef = useRef([])
  const [aiAudioActive, setAiAudioActive] = useState(false)
  const [topicDisplay, setTopicDisplay] = useState(INITIAL_TOPIC)
  useEffect(() => { topicDisplayRef.current = topicDisplay }, [topicDisplay])
  const [playGesture, setPlayGesture] = useState(REST_GESTURE)
  const [currentMotionFrames, setCurrentMotionFrames] = useState(null)
  const [currentAnimation, setCurrentAnimation] = useState('idle')
  const [messages, setMessages] = useState([
    {
      id: 1,
      from: 'ai',
      text: "Hi! I'm your AI teacher. Ask me anything — I'll build a full lesson, move to illustrate it, and speak the answer. 🤗",
    },
  ])
  const pipelineResultRef  = useRef(null)
  const topicDisplayRef    = useRef(INITIAL_TOPIC)
  const pendingLessonPredictionRef = useRef(null)
  // Stores pre-generated MDM frames per sentence: { [sentenceId]: frames[] }
  const sentenceMotionsRef = useRef({})
  /** Actual TTS clip length — gesture steps are spaced to finish with the audio. */
  const lessonAudioDurationMsRef = useRef(0)

  const [userModelHint, setUserModelHint] = useState(null)
  const [neonXVisible, setNeonXVisible] = useState(false)
  const [neonTickVisible, setNeonTickVisible] = useState(false)
  /** Set from AI later; Alt+M toggles a demo string in dev. */
  const [mathExpression3d, setMathExpression3d] = useState(null)
  const [currentVisualization, setCurrentVisualization] = useState(null)
  const [visualizationStepIndex, setVisualizationStepIndex] = useState(0)
  useEffect(() => {
    const toggler = (e) => {
      const el = e.target
      if (el instanceof HTMLElement && el.closest('input, textarea, [contenteditable="true"]')) return
      if (e.code === 'F9' || (e.altKey && e.code === 'KeyX')) {
        e.preventDefault()
        setNeonXVisible((v) => !v)
        return
      }
      if (e.code === 'F10' || (e.altKey && e.code === 'KeyT')) {
        e.preventDefault()
        setNeonTickVisible((v) => !v)
        return
      }
      if (e.altKey && e.code === 'KeyM') {
        e.preventDefault()
        setMathExpression3d((prev) => (prev ? null : '9 - 10 = -1'))
      }
    }
    window.addEventListener('keydown', toggler)
    return () => window.removeEventListener('keydown', toggler)
  }, [])

  const nextVisualizationStep = useCallback(() => {
    setVisualizationStepIndex(prev => prev + 1)
  }, [])

  useEffect(() => {
    const lessonSpeaking = aiState === 'speaking'
    if (!lessonSpeaking || !currentVisualization?.steps) return

    const stageCounts = {
      addition: 3,
      subtraction: 4,
      multiplication: 2,
      division: 4,
    }
    const maxSteps = stageCounts[currentVisualization.type] || 1
    if (visualizationStepIndex >= maxSteps - 1) return

    const timerId = setTimeout(() => {
      setVisualizationStepIndex(prev => Math.min(prev + 1, maxSteps - 1))
    }, 1400)

    return () => clearTimeout(timerId)
  }, [aiState, currentVisualization, visualizationStepIndex])

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
        if (Array.isArray(levels)) aiAudioLevelsRef.current = levels
        else aiAudioLevelsRef.current = []
      },
      onEnd: () => {
        aiAudioLevelsRef.current = []
        setAiAudioActive(false)
      },
    })
  }, [])

  const deliverAiMessage = useCallback(async (text, opts = {}) => {
    const spokenText = String(text || '').trim()
    if (!spokenText) return
    const { preloadedBlob } = opts

    const aiMsg = { id: Date.now() + 1, from: 'ai', text: spokenText }
    setMessages(prev => [...prev, aiMsg])
    setAiError('')

    const playOpts = {
      onStart: () => {
        aiAudioLevelsRef.current = []
        setAiAudioActive(true)
      },
      onLevels: (levels) => {
        if (Array.isArray(levels)) aiAudioLevelsRef.current = levels
        else aiAudioLevelsRef.current = []
      },
      onEnd: () => {
        aiAudioLevelsRef.current = []
        setAiAudioActive(false)
      },
    }

    try {
      if (preloadedBlob) {
        await playAudioBlob(preloadedBlob, playOpts)
      } else {
        await speakAiText(spokenText)
      }
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

  // Pre-generate MDM motion clips for every sentence in the lesson.
  const generateSentenceMotions = useCallback(async (result) => {
    const sentences = flattenSentences(result?.lessonPlan)
    const gestures = result?.gesturePlan?.gestures || []
    sentenceMotionsRef.current = {}

    for (let i = 0; i < sentences.length; i++) {
      const sent = sentences[i]
      const key = sentenceMotionKey(sent, i)
      const g =
        gestures.find(x => String(x.sentenceId) === String(sent.id)) || gestures[i]
      const raw = typeof g?.mdmPrompt === 'string' ? g.mdmPrompt.trim() : ''
      const prompt = raw.length >= 12 ? raw : DEFAULT_TEACHING_MOTION_PROMPT
      try {
        console.log(`[motion] MDM sentence ${i + 1}/${sentences.length} [${key}]: "${prompt}"`)
        const data = await requestMotion(prompt, 80)
        sentenceMotionsRef.current[key] = data.frames
        console.log(`[motion] Sentence ${i + 1} ready (${data.frames.length} frames, ${data.mode})`)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.warn(`[motion] Sentence ${i + 1} MDM failed, holding rest:`, msg)
        sentenceMotionsRef.current[key] = restHoldFrames(80).frames
      }
    }
  }, [])

  useEffect(() => {
    if (aiState !== 'speaking') {
      setPlayGesture(REST_GESTURE)
      return
    }

    const result = pipelineResultRef.current
    const sentences = flattenSentences(result?.lessonPlan)
    const gestures = result?.gesturePlan?.gestures || []
    if (!sentences.length) return

    let idx = 0
    let timerId
    const cancelled = { v: false }

    const step = () => {
      if (cancelled.v) return
      if (idx >= sentences.length) {
        setPlayGesture(REST_GESTURE)
        setCurrentAnimation('idle')
        return
      }
      const sent = sentences[idx]
      setPlayGesture(SPEAKING_GESTURE)
      setCurrentAnimation('explain')

      const audioMs = lessonAudioDurationMsRef.current
      const n = sentences.length
      let ms
      if (audioMs >= 800 && n > 0) {
        const weights = sentences.map(s => Math.max(1, String(s.text || '').trim().length))
        const tw = weights.reduce((a, b) => a + b, 0)
        const w = Math.max(1, weights[idx])
        ms = Math.max(450, Math.round((w / tw) * audioMs))
      } else {
        ms = Math.min(60000, Math.max(600, (sent.durationSeconds || 4) * 1000))
      }
      idx += 1
      timerId = setTimeout(step, ms)
    }

    step()
    return () => {
      cancelled.v = true
      clearTimeout(timerId)
      lessonAudioDurationMsRef.current = 0
    }
  }, [aiState])

  const sendMessage = useCallback(
    async (text) => {
      if (aiState !== null) return
      setAiError('')

      const userMsg = { id: Date.now(), from: 'user', text }
      setMessages(prev => [...prev, userMsg])

      pipelineResultRef.current = null
      pendingLessonPredictionRef.current = null
      setUserModelHint(null)
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
        setCurrentVisualization(null)
        setVisualizationStepIndex(0)
        setAiState(null)
        pendingLessonPredictionRef.current = null
        setUserModelHint(null)
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
        setCurrentVisualization(null)
        setVisualizationStepIndex(0)
        setAiState(null)
        pendingLessonPredictionRef.current = null
        setUserModelHint(null)
        return
      }

      setAiState('building')
      pipelineResultRef.current = result
      setCurrentVisualization(enrichVisualizationForClient(extractVisualization(result)))
      setVisualizationStepIndex(0)

      const topicKey = normalizeTopicKey(
        result.topic?.topicTitle || topicDisplayRef.current?.label || ''
      )
      const pred = predictPerformance(topicKey || topicDisplayRef.current?.label || 'lesson', 'lesson')
      pendingLessonPredictionRef.current = {
        predicted: pred.predicted_score,
        features: pred.features,
        topicKey,
      }
      setUserModelHint({
        predictedPct: Math.round(pred.predicted_score * 100),
        confidencePct: Math.round(pred.confidence * 100),
      })

      // Must finish before "speaking" — otherwise the speaking effect reads empty sentenceMotionsRef.
      await generateSentenceMotions(result)

      const body = formatLessonPlanMessage(result)
      let audioBlob
      try {
        audioBlob = await textToSpeechBlob(body)
        lessonAudioDurationMsRef.current = await getBlobDurationMs(audioBlob)
      } catch (e) {
        console.error('Lesson TTS prefetch failed:', e)
        lessonAudioDurationMsRef.current = 0
        setCurrentVisualization(null)
        setVisualizationStepIndex(0)
        setAiState(null)
        const detail = e instanceof Error ? e.message : String(e)
        setAiError(detail || 'Text-to-speech failed.')
        setMessages(prev => [
          ...prev,
          { id: Date.now() + 1, from: 'ai', text: `Could not read the lesson aloud: ${detail}` },
        ])
        const pend = pendingLessonPredictionRef.current
        if (pend) {
          recordPredictionResult(pend.predicted, 0, pend.features, pend.topicKey)
          recordLessonOutcome(pend.topicKey, false)
          pendingLessonPredictionRef.current = null
        }
        setUserModelHint(null)
        await delay(3200)
        setAiError('')
        return
      }

      setAiState('speaking')
      try {
        await deliverAiMessage(body, { preloadedBlob: audioBlob })
      } catch (e) {
        console.error('Lesson playback failed:', e)
        const detail = e instanceof Error ? e.message : String(e)
        setAiError(detail || 'Playback failed.')
        const pendPlay = pendingLessonPredictionRef.current
        if (pendPlay) {
          recordPredictionResult(pendPlay.predicted, 0, pendPlay.features, pendPlay.topicKey)
          recordLessonOutcome(pendPlay.topicKey, false)
          pendingLessonPredictionRef.current = null
        }
        setUserModelHint(null)
        setCurrentAnimation('idle')
        setCurrentVisualization(null)
        setVisualizationStepIndex(0)
        setAiState(null)
        await delay(3200)
        setAiError('')
        return
      }
      setCurrentAnimation('idle')
      setCurrentVisualization(null)
      setVisualizationStepIndex(0)
      setAiState(null)

      const pendOk = pendingLessonPredictionRef.current
      if (pendOk) {
        recordPredictionResult(pendOk.predicted, 1, pendOk.features, pendOk.topicKey)
        recordLessonOutcome(pendOk.topicKey, true)
        pendingLessonPredictionRef.current = null
      }
      setUserModelHint(null)

      // ── Persist this session so the sidebar can restore it ───────────────
      setMessages(prev => {
        const session = createSession({
          topic: topicDisplayRef.current,
          messages: prev,
          lessonResult: result,
        })
        saveSession(session)
        window.dispatchEvent(new Event('thinkpop:session-saved'))
        return prev
      })
    },
    [aiState, deliverAiMessage, generateSentenceMotions]
  )

  // ── Restore a saved session from the sidebar ─────────────────────────────
  const loadSession = useCallback((session) => {
    if (aiState !== null) return   // don't interrupt an active lesson
    setMessages(session.messages || [])
    if (session.topic) setTopicDisplay(session.topic)
    // Regenerate motions from stored gesture plan in the background
    const result = session.lessonResult
    if (result) {
      pipelineResultRef.current = result
      setCurrentVisualization(enrichVisualizationForClient(extractVisualization(result)))
      setVisualizationStepIndex(0)
      setCurrentAnimation('idle')
    } else {
      pipelineResultRef.current = null
      setCurrentVisualization(null)
      setVisualizationStepIndex(0)
    }
  }, [aiState, generateSentenceMotions])

  return (
    <div className="app-root">
      <CharacterScene
        aiState={aiState}
        motionFrames={currentMotionFrames}
        animation={currentAnimation}
        showNeonX={neonXVisible}
        showNeonTick={neonTickVisible}
        mathExpression={mathExpression3d}
        visualization={currentVisualization}
        visualizationStepIndex={visualizationStepIndex}
      />

      <AiAudioBackdropSync
        levelsRef={aiAudioLevelsRef}
        active={aiAudioActive}
      />
      <div className="edge-bloom edge-bloom-left" />
      <div className="edge-bloom edge-bloom-right" />

      <HistorySidebar onLoadSession={loadSession} />

      <AIStatus state={aiError ? 'error' : aiState} message={aiError} />
      <PipelineProgress state={aiError ? null : aiState} />
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
        <AnimationPanel current={currentAnimation} onSelect={setCurrentAnimation} disabled={aiState !== null} />
      )}
      <TopicCard topic={topicDisplay} userModelHint={userModelHint} />
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

  if (route === '#/baymax-voice2' || route === '#/baymax') {
    return <BaymaxVoiceFirstExperience />
  }

  return <LandingPage />
}
