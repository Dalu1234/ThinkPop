import { useState, useCallback, useRef, useEffect } from 'react'
import LandingPage from './LandingPage'
import ThreeBackground from './components/ThreeBackground'
import TopicCard from './components/TopicCard'
import ChatPanel from './components/ChatPanel'

import AIStatus from './components/AIStatus'
import Skyline from './components/Skyline'
import { textToSpeechBlob, playAudioBlob } from './lib/elevenlabs'

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
  const indexRef = useRef({ topic: 0, object: 0 })

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

    // Building 3D object
    setAiState('building')
    await delay(900)
    const nextObj = (indexRef.current.object + 1) % OBJECTS.length
    indexRef.current.object = nextObj
    setObjectVisible(false)
    await delay(100)
    setObjectIndex(nextObj)
    setObjectVisible(true)

    // Speaking + response
    setAiState('speaking')
    const responseIdx = nextObj % FAKE_RESPONSES.length
    const responseText = FAKE_RESPONSES[responseIdx]
    const nextTopic = (indexRef.current.topic + 1) % TOPICS.length
    indexRef.current.topic = nextTopic
    setTopicIndex(nextTopic)

    await deliverAiMessage(responseText)
    setAiState(null)
  }, [aiState, deliverAiMessage])

  return (
    <div className="app-root">
      <ThreeBackground aiState={aiState} />

      {/* Edge bloom overlays */}
      <div className="edge-bloom edge-bloom-left" />
      <div className="edge-bloom edge-bloom-right" />

      <Skyline />

      <BaymaxSpeakingBars
        levels={aiAudioLevels}
        active={aiAudioActive || aiState === 'speaking'}
      />

      <div className="baymax-welcome-text">
        Hi! I'm Baymax. Ask me anything — I'll explain it, show you a 3D model, and make learning fun!
      </div>
      <AIStatus state={aiError ? 'error' : aiState} message={aiError} />
      <TopicCard topic={TOPICS[topicIndex]} />





      <ChatPanel
        messages={messages}
        onSend={sendMessage}
        aiState={aiState}
      />
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
