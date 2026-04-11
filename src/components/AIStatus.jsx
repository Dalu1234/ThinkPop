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
}

export default function AIStatus({ state }) {
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
              {config.label}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
