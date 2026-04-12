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
          initial={{ opacity: 0, y: 18, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 18, scale: 0.97 }}
          transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="counting-tool-card">
            <div className="counting-tool-header">
              <div>
                <p className="counting-tool-kicker">{kicker}</p>
                <h2 className="counting-tool-title">{title}</h2>
              </div>
              <div className="counting-tool-status">
                <span className="counting-tool-status-label">Added</span>
                <span className="counting-tool-status-value">{ready ? `+${lastAdded}` : 'Ready'}</span>
              </div>
            </div>

            <p className="counting-tool-copy">
              The dots build one at a time first, then the tutor adds a small group and asks for the total.
            </p>

            <div className="counting-tool-stage">
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
              {!ready && <div className="counting-tool-empty">Ask to practice counting, then watch the dots appear.</div>}
            </div>

            <div className="counting-tool-footer">
              <p className="counting-tool-prompt">{prompt}</p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
