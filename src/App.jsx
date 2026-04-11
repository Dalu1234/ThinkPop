import { useState, useCallback, useRef, useEffect } from 'react'
import LandingPage from './LandingPage'
import ThreeBackground from './components/ThreeBackground'
import TopicCard from './components/TopicCard'
import ChatPanel from './components/ChatPanel'
import HistorySidebar from './components/HistorySidebar'
import ObjectStage from './components/ObjectStage'
import AIStatus from './components/AIStatus'
import Skyline from './components/Skyline'
import { textToSpeechBlob, playAudioBlob } from './lib/elevenlabs'
import {
  streamLessonPipeline,
  formatLessonPlanMessage,
  emojiForTopic,
} from './lib/lessonApi'

const INITIAL_TOPIC = { label: 'Elementary math', emoji: '🔢' }

const OBJECTS = [
  { label: 'Number line', color: '#00e5ff' },
  { label: 'Fraction bars', color: '#ff6eb4' },
  { label: 'Base-ten blocks', color: '#a78bfa' },
  { label: 'Geometric solids', color: '#4ade80' },
  { label: 'Array model', color: '#ffd166' },
  { label: 'Clock face', color: '#60a5fa' },
]

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function objectIndexFromString(s) {
  if (!s) return 0
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h + s.charCodeAt(i) * (i + 1)) % OBJECTS.length
  return h
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
  const [objectIndex, setObjectIndex] = useState(0)
  const [objectVisible, setObjectVisible] = useState(true)
  const [visualModel, setVisualModel] = useState(null)
  const [playGesture, setPlayGesture] = useState(REST_GESTURE)
  const [messages, setMessages] = useState([
    {
      id: 1,
      from: 'ai',
      text: "Hi! I'm Baymax, your AI math coach. Ask a question — six agents build the lesson, hand motions, and a 3D model. I'll speak the answer too. 🤗",
    },
  ])
  const pipelineResultRef = useRef(null)

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
        return
      }
      const seg = segments[idx]
      const g =
        result.gesturePlan?.gestures?.find(x => x.segmentId === seg.id) ||
        result.gesturePlan?.gestures?.[idx]
      setPlayGesture({
        motion: g?.motion || 'emphasize',
        hand: g?.hand || 'right',
      })
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

  const sendMessage = useCallback(
    async (text) => {
      if (aiState !== null) return
      setAiError('')

      const userMsg = { id: Date.now(), from: 'user', text }
      setMessages(prev => [...prev, userMsg])

      setVisualModel(null)
      pipelineResultRef.current = null
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
        setMessages(prev => [
          ...prev,
          {
            id: Date.now() + 1,
            from: 'ai',
            text: `Something went wrong while running the lesson agents: ${msg}`,
          },
        ])
        setAiState(null)
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
      setVisualModel(result.visualModel || null)

      const nextIdx = objectIndexFromString(
        result.lessonPlan?.title || result.topic?.topicTitle || text
      )
      setObjectVisible(false)
      await delay(120)
      setObjectIndex(nextIdx)
      setObjectVisible(true)
      await delay(400)

      setAiState('speaking')
      const body = formatLessonPlanMessage(result)
      await deliverAiMessage(body)
      setAiState(null)
    },
    [aiState, deliverAiMessage]
  )

  return (
    <div className="app-root">
      <ThreeBackground aiState={aiState} gesture={playGesture} />

      <div className="edge-bloom edge-bloom-left" />
      <div className="edge-bloom edge-bloom-right" />

      <Skyline />
      <HistorySidebar />

      <BaymaxSpeakingBars
        levels={aiAudioLevels}
        active={aiAudioActive || aiState === 'speaking'}
      />

      <div className="baymax-welcome-text">
        Hi! I'm Baymax. Ask a math question — I'll build a lesson, show a 3D model, and speak the answer.
      </div>
      <AIStatus state={aiError ? 'error' : aiState} message={aiError} />
      <TopicCard topic={topicDisplay} />
      <ObjectStage
        object={OBJECTS[objectIndex]}
        visualModel={visualModel}
        visible={objectVisible}
        active={aiState === 'building'}
      />
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
