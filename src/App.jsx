import { useState, useCallback, useRef } from 'react'
import ThreeBackground from './components/ThreeBackground'
import TopicCard from './components/TopicCard'
import ChatPanel from './components/ChatPanel'
import ObjectStage from './components/ObjectStage'
import AIStatus from './components/AIStatus'
import Skyline from './components/Skyline'

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

export default function App() {
  const [aiState, setAiState] = useState(null)
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

  const sendMessage = useCallback(async (text) => {
    if (aiState !== null) return

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
    const aiMsg = { id: Date.now() + 1, from: 'ai', text: FAKE_RESPONSES[responseIdx] }
    setMessages(prev => [...prev, aiMsg])
    const nextTopic = (indexRef.current.topic + 1) % TOPICS.length
    indexRef.current.topic = nextTopic
    setTopicIndex(nextTopic)

    await delay(2800)
    setAiState(null)
  }, [aiState])

  return (
    <div className="app-root">
      <ThreeBackground aiState={aiState} />

      {/* Edge bloom overlays */}
      <div className="edge-bloom edge-bloom-left" />
      <div className="edge-bloom edge-bloom-right" />

      <Skyline />

      <AIStatus state={aiState} />
      <TopicCard topic={TOPICS[topicIndex]} />
      <ObjectStage
        object={OBJECTS[objectIndex]}
        visible={objectVisible}
        active={aiState === 'building'}
      />
      <ChatPanel messages={messages} onSend={sendMessage} aiState={aiState} />
    </div>
  )
}
