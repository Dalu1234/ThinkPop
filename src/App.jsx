import { useState, useCallback, useRef, useEffect } from 'react'
import LandingPage from './LandingPage'
import ThreeBackground from './components/ThreeBackground'
import TopicCard from './components/TopicCard'
import ChatPanel from './components/ChatPanel'
import HistorySidebar from './components/HistorySidebar'
import AIStatus from './components/AIStatus'
import Skyline from './components/Skyline'
import { textToSpeechBlob, playAudioBlob } from './lib/elevenlabs'
<<<<<<< Updated upstream
=======
import {
  streamLessonPipeline,
  formatLessonPlanMessage,
  emojiForTopic,
  findQuestionForSegment,
} from './lib/lessonApi'
import { requestMotion, MOTION_PROMPTS, generateProceduralMotion } from './lib/motionApi'
>>>>>>> Stashed changes

const TOPICS = [
  { label: 'Pythagorean Theorem', emoji: '📐' },
  { label: 'Photosynthesis', emoji: '🌿' },
  { label: 'Solar System', emoji: '🪐' },
  { label: 'DNA Structure', emoji: '🧬' },
  { label: 'Gravity & Motion', emoji: '🍎' },
  { label: 'The Water Cycle', emoji: '💧' },
  { label: 'Volcanic Activity', emoji: '🌋' },
]

const FAKE_RESPONSES = [
  "Great question! The Pythagorean theorem states a² + b² = c² for right triangles. I've generated a 3D model to help visualize it — the hypotenuse is always the longest side! 📐",
  "Photosynthesis is nature's solar power! Plants use chlorophyll to convert sunlight, CO₂, and water into glucose and oxygen. One large tree absorbs ~48 lbs of CO₂ per year! 🌿",
  "Our solar system has 8 planets orbiting the Sun. Jupiter is so massive you could fit 1,300 Earths inside it! Check out the 3D model — it shows their relative scales. 🪐",
  "DNA is a double helix with four bases: Adenine, Thymine, Cytosine, Guanine. A always pairs with T, C with G. Every cell in your body contains about 6 feet of DNA! 🧬",
  "Gravity pulls objects toward each other proportional to mass. On Earth, free-fall acceleration is 9.8 m/s². Einstein revealed gravity is actually curved spacetime! 🍎",
  "The water cycle moves water through evaporation, condensation, and precipitation — all driven by the Sun. A single water molecule can spend 3,000 years in the ocean! 💧",
  "Volcanoes form at tectonic plate boundaries or hot spots in Earth's mantle. The 3D model shows a cross-section with the magma chamber, conduit, and lava flows! 🌋",
]

const OBJECTS = [
  { label: 'Right Triangle', color: '#00e5ff' },
  { label: 'Chloroplast', color: '#4ade80' },
  { label: 'Solar Orrery', color: '#ffd166' },
  { label: 'DNA Helix', color: '#ff6eb4' },
  { label: 'Orbital Path', color: '#a78bfa' },
  { label: 'Water Molecule', color: '#60a5fa' },
  { label: 'Magma Chamber', color: '#f97316' },
]

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

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
  const [activeQuestion, setActiveQuestion] = useState(null)
  const [aiError, setAiError] = useState('')
  const [aiAudioLevels, setAiAudioLevels] = useState([])
  const [aiAudioActive, setAiAudioActive] = useState(false)
  const [topicIndex, setTopicIndex] = useState(0)
  const [objectIndex, setObjectIndex] = useState(0)
  const [objectVisible, setObjectVisible] = useState(true)
  const [messages, setMessages] = useState([
    {
      id: 1,
      from: 'ai',
      text: "Hi! I'm Baymax, your personal AI 3D teacher. Ask me anything — I'll explain it, show you a 3D model, and make learning fun! 🤗",
    },
  ])
<<<<<<< Updated upstream
  const indexRef = useRef({ topic: 0, object: 0 })
=======
  const pipelineResultRef  = useRef(null)
  const lessonSegmentIndexRef = useRef(0)
  const [activeChunkSegments, setActiveChunkSegments] = useState([])
  // Stores pre-generated MDM frames per segment: { [segmentId]: frames[] }
  const segmentMotionsRef  = useRef({})
>>>>>>> Stashed changes

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

  const sendMessage = useCallback(async (text) => {
    if (aiState !== null) return
    setAiError('')

    const userMsg = { id: Date.now(), from: 'user', text }
    setMessages(prev => [...prev, userMsg])

    // Thinking
    setAiState('thinking')
    await delay(1500)

<<<<<<< Updated upstream
    // Building 3D object
    setAiState('building')
    await delay(900)
    const nextObj = (indexRef.current.object + 1) % OBJECTS.length
    indexRef.current.object = nextObj
    setObjectVisible(false)
    await delay(100)
    setObjectIndex(nextObj)
    setObjectVisible(true)
=======
    const result = pipelineResultRef.current
    const segments = activeChunkSegments
    if (!segments?.length) return
>>>>>>> Stashed changes

    // Speaking + response
    setAiState('speaking')
    const responseIdx = nextObj % FAKE_RESPONSES.length
    const responseText = FAKE_RESPONSES[responseIdx]
    const nextTopic = (indexRef.current.topic + 1) % TOPICS.length
    indexRef.current.topic = nextTopic
    setTopicIndex(nextTopic)

<<<<<<< Updated upstream
    await deliverAiMessage(responseText)
    setAiState(null)
  }, [aiState, deliverAiMessage])
=======
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
  const playNextChunk = useCallback(async (result = pipelineResultRef.current) => {
    if (!result?.lessonPlan?.segments) return

    const segments = result.lessonPlan.segments
    let endIdx = lessonSegmentIndexRef.current

    if (endIdx >= segments.length) {
      setAiState(null)
      return
    }

    while (endIdx < segments.length) {
      const kind = segments[endIdx].kind
      endIdx++
      if (kind === 'check' || kind === 'wrap') {
        break
      }
    }

    const chunkSegments = segments.slice(lessonSegmentIndexRef.current, endIdx)
    const trailingSegment = chunkSegments[chunkSegments.length - 1]
    lessonSegmentIndexRef.current = endIdx

    setActiveChunkSegments(chunkSegments)
    setAiState('speaking')
    
    const body = formatLessonPlanMessage(result, chunkSegments)
    await deliverAiMessage(body)
    
    setCurrentMotionFrames(generateProceduralMotion(MOTION_PROMPTS.wave, 96).frames)
    setAiState(null)
    
    const questionData = findQuestionForSegment(result.lessonPlan, trailingSegment?.id)
    if (questionData) {
      setActiveQuestion({ ...questionData, failureCount: 0 })
    } else if (endIdx < segments.length) {
      await delay(500)
      playNextChunk(result)
    }
  }, [deliverAiMessage])

  const sendMessage = useCallback(
    async (text) => {
      if (aiState !== null) return
      setAiError('')

      const userMsg = { id: Date.now(), from: 'user', text }
      setMessages(prev => [...prev, userMsg])

      if (activeQuestion) {
        const normalizedUser = String(text).toLowerCase().trim()
        const normalizedTarget = String(activeQuestion.answer).toLowerCase().trim()
        
        if (normalizedUser.includes(normalizedTarget) || normalizedUser === normalizedTarget) {
          const praise = activeQuestion.successMessage || "Great job! That's correct."
          await deliverAiMessage(praise)
          const segId = activeQuestion.segmentId
          setActiveQuestion(null)
          await delay(500)
          
          if (segId === 'seg-final-question' || segId === 'seg-retry-final') {
            lessonSegmentIndexRef.current = pipelineResultRef.current?.lessonPlan?.segments?.length || 0
            setAiState(null)
          } else {
            playNextChunk()
          }
        } else {
          const newCount = (activeQuestion.failureCount || 0) + 1
          if (newCount >= 2) {
            await deliverAiMessage(`Actually, the answer is ${activeQuestion.answer}. Let's keep going.`)
            const segId = activeQuestion.segmentId
            setActiveQuestion(null)
            await delay(500)

            if (segId === 'seg-retry-final') {
              lessonSegmentIndexRef.current = pipelineResultRef.current?.lessonPlan?.segments?.length || 0
              setAiState(null)
            } else {
              playNextChunk()
            }
          } else {
            const failureMsg = activeQuestion.failureMessage || "That's not quite right. Try again!"
            await deliverAiMessage(failureMsg)
            setActiveQuestion({ ...activeQuestion, failureCount: newCount })
          }
        }
        return
      }

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

      // Must finish before "speaking" — otherwise the speaking effect reads empty segmentMotionsRef.
      await generateSegmentMotions(result)

      lessonSegmentIndexRef.current = 0
      setActiveQuestion(null)
      
      await playNextChunk(result)
    },
    [aiState, activeQuestion, deliverAiMessage, generateSegmentMotions, playNextChunk]
  )
>>>>>>> Stashed changes

  return (
    <div className="app-root">
      <ThreeBackground aiState={aiState} />

      {/* Edge bloom overlays */}
      <div className="edge-bloom edge-bloom-left" />
      <div className="edge-bloom edge-bloom-right" />

      <Skyline />
      <HistorySidebar />

      <BaymaxSpeakingBars
        levels={aiAudioLevels}
        active={aiAudioActive || aiState === 'speaking'}
      />

      <div className="baymax-welcome-text">
        Hi! I'm Baymax. Ask me anything — I'll explain it, show you a 3D model, and make learning fun!
      </div>
      <AIStatus state={aiError ? 'error' : aiState} message={aiError} />
<<<<<<< Updated upstream
      <TopicCard topic={TOPICS[topicIndex]} />





      <ChatPanel
        messages={messages}
        onSend={sendMessage}
        aiState={aiState}
      />
=======
      <PipelineProgress state={aiError ? null : aiState} />
      <MDMTestPanel onFrames={frames => setCurrentMotionFrames(frames)} disabled={aiState !== null} />
      <TopicCard topic={topicDisplay} />
      <ChatPanel messages={messages} onSend={sendMessage} aiState={aiState} audioOnly />
>>>>>>> Stashed changes
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
