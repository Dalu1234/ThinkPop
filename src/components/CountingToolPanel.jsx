import { useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

function buildDots(count) {
  return Array.from({ length: count }, (_, index) => index)
}

export default function CountingToolPanel({
  visible = false,
  totalDots = 0,
  lastAdded = 0,
  prompt = 'Ask to practice counting with dots.',
  title = 'Say The Number You See',
  kicker = 'Counting Lab',
}) {
  const dots = useMemo(() => buildDots(totalDots), [totalDots])
  const ready = totalDots > 0
  const newStart = lastAdded > 0 ? totalDots - lastAdded : -1

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="counting-tool-shell"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="counting-tool-card">
            <header className="counting-tool-header">
              <span className="counting-tool-kicker">{kicker}</span>
              <h2 className="counting-tool-title">{title}</h2>
            </header>

            <div className="counting-tool-stage" aria-label="Dot workspace">
              <AnimatePresence mode="popLayout">
                {dots.map(dot => (
                  <motion.span
                    key={dot}
                    className={`counting-tool-dot${dot >= newStart && newStart >= 0 ? ' counting-tool-dot--new' : ''}`}
                    initial={{ opacity: 0, scale: 0.2, y: 12 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.2 }}
                    transition={{ type: 'spring', stiffness: 320, damping: 22 }}
                  />
                ))}
              </AnimatePresence>
              {!ready && (
                <div className="counting-tool-empty">Objects appear here as the activity runs.</div>
              )}
            </div>

            <footer className="counting-tool-footer">
              <p className="counting-tool-prompt">{prompt}</p>
            </footer>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
