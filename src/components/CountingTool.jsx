import { useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

function buildDots(count) {
  return Array.from({ length: count }, (_, index) => index)
}

export default function CountingTool({
  visible = false,
  totalDots = 0,
  lastAdded = 0,
  prompt = 'Ask to practice counting with dots.',
  title = 'Say The Number You See',
  kicker = 'Counting Lab',
}) {
  const dots = useMemo(() => buildDots(totalDots), [totalDots])
  const ready = totalDots > 0

  return (
    <div className="counting-tool-shell">
      <div className="counting-tool-card">
        <div className="counting-tool-header">
          <div>
            <p className="counting-tool-kicker">Counting Lab</p>
            <h2 className="counting-tool-title">Say The Number You See</h2>
          </div>
          <div className="counting-tool-status">
            <span className="counting-tool-status-label">Added</span>
            <span className="counting-tool-status-value">{ready ? `+${lastAdded}` : 'Ready'}</span>
          </div>
        </div>

        <p className="counting-tool-copy">
          The dots appear in sequence: one more, one more, one more, then a random group of up to five.
        </p>

        <div className="counting-tool-stage">
          <AnimatePresence mode="popLayout">
            {dots.map(dot => (
              <motion.span
                key={dot}
                className="counting-tool-dot"
                initial={{ opacity: 0, scale: 0.2, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.2 }}
                transition={{ type: 'spring', stiffness: 320, damping: 22 }}
              />
            ))}
          </AnimatePresence>
          {!ready && <div className="counting-tool-empty">Tap “Add Dots” to begin.</div>}
        </div>

        <div className="counting-tool-footer">
          <p className="counting-tool-prompt">
            {ready
              ? 'Say the total number of dots on the screen.'
              : 'Start the sequence, then answer out loud.'}
          </p>

          <div className="counting-tool-actions">
            <button className="counting-tool-btn counting-tool-btn-secondary" onClick={handleReset}>
              Reset
            </button>
            <button className="counting-tool-btn counting-tool-btn-primary" onClick={handleAdvance}>
              {ready ? `Add ${nextAmount === 1 ? '1 Dot' : `${nextAmount} Dots`}` : 'Add 1 Dot'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
