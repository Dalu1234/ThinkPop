import { AnimatePresence, motion } from 'framer-motion'

const STATUS_CONFIG = {
  voice_connecting: {
    label: 'Connecting voice…',
    color: '#a78bfa',
    glow: 'rgba(167, 139, 250, 0.55)',
    dot: '#a78bfa',
  },
  voice_listening: {
    label: 'Listening…',
    color: '#4ade80',
    glow: 'rgba(74, 222, 128, 0.45)',
    dot: '#4ade80',
  },
  intake: {
    label: 'Agent 1 — Understanding the problem...',
    color: '#60a5fa',
    glow: 'rgba(96, 165, 250, 0.55)',
    dot: '#60a5fa',
  },
  topic: {
    label: 'Agent 2 — Shaping the topic...',
    color: '#a78bfa',
    glow: 'rgba(167, 139, 250, 0.55)',
    dot: '#a78bfa',
  },
  objectives: {
    label: 'Agent 3 — Writing learning goals...',
    color: '#4ade80',
    glow: 'rgba(74, 222, 128, 0.55)',
    dot: '#4ade80',
  },
  lesson_plan: {
    label: 'Agent 4 — Building the lesson plan...',
    color: '#ffd166',
    glow: 'rgba(255, 209, 102, 0.55)',
    dot: '#ffd166',
  },
  gestures: {
    label: 'Agent 5 — Planning hand motions...',
    color: '#f472b6',
    glow: 'rgba(244, 114, 182, 0.55)',
    dot: '#f472b6',
  },
  visual_model: {
    label: 'Agent 6 — Designing the 3D model...',
    color: '#38bdf8',
    glow: 'rgba(56, 189, 248, 0.55)',
    dot: '#38bdf8',
  },
  thinking: {
    label: 'Thinking...',
    color: '#60a5fa',
    glow: 'rgba(96, 165, 250, 0.55)',
    dot: '#60a5fa',
  },
  speaking: {
    label: 'Speaking...',
    color: '#f8fafc',
    glow: 'rgba(248, 250, 252, 0.4)',
    dot: '#f0f0ff',
  },
  generating: {
    label: 'Generating motion...',
    color: '#00e5ff',
    glow: 'rgba(0, 229, 255, 0.55)',
    dot: '#00e5ff',
  },
  building: {
    label: 'Building 3D object...',
    color: '#ff6eb4',
    glow: 'rgba(255, 110, 180, 0.55)',
    dot: '#ff6eb4',
  },
  error: {
    label: 'Audio error',
    color: '#fca5a5',
    glow: 'rgba(252, 165, 165, 0.45)',
    dot: '#f87171',
  },
}

export default function AIStatus({ state, message }) {
  const config = state ? STATUS_CONFIG[state] : null

  return (
    <div className="ai-status-wrapper">
      <AnimatePresence>
        {config && (
          <motion.div
            key={state}
            className="ai-status-pill"
            initial={{ opacity: 0, scale: 0.75, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.75, y: -8 }}
            transition={{ duration: 0.28, ease: 'backOut' }}
            style={{
              '--status-color': config.color,
              '--status-glow': config.glow,
            }}
          >
            <span
              className="status-dot"
              style={{ background: config.dot }}
            />
            <span className="status-label" style={{ color: config.color }}>
              {message || config.label}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
