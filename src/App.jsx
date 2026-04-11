import { useState, useCallback, useRef, useEffect } from 'react'
import ThreeBackground from './components/ThreeBackground'
import TopicCard from './components/TopicCard'
import ChatPanel from './components/ChatPanel'
import ObjectStage from './components/ObjectStage'
import AIStatus from './components/AIStatus'
import Skyline from './components/Skyline'
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

export default function App() {
  const [aiState, setAiState] = useState(null)
  const [topicDisplay, setTopicDisplay] = useState(INITIAL_TOPIC)
  const [objectIndex, setObjectIndex] = useState(0)
  const [objectVisible, setObjectVisible] = useState(true)
  const [visualModel, setVisualModel] = useState(null)
  const [playGesture, setPlayGesture] = useState(REST_GESTURE)
  const [messages, setMessages] = useState([
    {
      id: 1,
      from: 'ai',
      text: "Hi! I'm Baymax, your AI math coach. Ask a question — six agents build the lesson, hand motions, and a 3D model (like a grid of apples for 3×4). 🤗",
    },
  ])
  const pipelineResultRef = useRef(null)

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

  const sendMessage = useCallback(async text => {
    if (aiState !== null) return

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
    const aiMsg = { id: Date.now() + 1, from: 'ai', text: body }
    setMessages(prev => [...prev, aiMsg])

    await delay(2200)
    setAiState(null)
  }, [aiState])

  return (
    <div className="app-root">
      <ThreeBackground aiState={aiState} gesture={playGesture} />

      <div className="edge-bloom edge-bloom-left" />
      <div className="edge-bloom edge-bloom-right" />

      <Skyline />

      <AIStatus state={aiState} />
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
