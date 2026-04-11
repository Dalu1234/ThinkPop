/**
 * PipelineProgress.jsx
 * Vertical stepper showing which agent is currently running.
 * Appears on the right side while the pipeline is active.
 */
import { AnimatePresence, motion } from 'framer-motion'

const STEPS = [
  { id: 'intake',       label: 'Understanding',  num: '1', color: '#60a5fa' },
  { id: 'topic',        label: 'Topic',           num: '2', color: '#a78bfa' },
  { id: 'objectives',   label: 'Objectives',      num: '3', color: '#4ade80' },
  { id: 'lesson_plan',  label: 'Lesson Plan',     num: '4', color: '#ffd166' },
  { id: 'gestures',     label: 'Gestures',        num: '5', color: '#f472b6' },
  { id: 'visual_model', label: '3D Model',        num: '6', color: '#38bdf8' },
  { id: 'building',     label: 'Preparing',       num: '',  color: '#ff6eb4' },
  { id: 'speaking',     label: 'Speaking',        num: '',  color: '#e2e8f0' },
]

const ORDER = STEPS.map(s => s.id)

function stepStatus(id, active) {
  const ai = ORDER.indexOf(active)
  const si = ORDER.indexOf(id)
  if (ai < 0) return 'idle'
  if (si < ai) return 'done'
  if (si === ai) return 'active'
  return 'pending'
}

export default function PipelineProgress({ state }) {
  const visible = !!state

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="pipeline-panel"
          initial={{ opacity: 0, x: 28 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 28 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        >
          <p className="pipeline-title">Agents</p>

          <div className="pipeline-steps">
            {STEPS.map((step, i) => {
              const status = stepStatus(step.id, state)
              const isLast = i === STEPS.length - 1

              return (
                <div key={step.id} className="pipeline-row">
                  {/* Left column: node + connector */}
                  <div className="pipeline-track">
                    <motion.div
                      className={`pipeline-node pipeline-node--${status}`}
                      style={{
                        borderColor: status === 'active'
                          ? step.color
                          : status === 'done'
                          ? '#4ade80'
                          : 'rgba(255,255,255,0.12)',
                        background: status === 'done'
                          ? 'rgba(74,222,128,0.12)'
                          : status === 'active'
                          ? `${step.color}18`
                          : 'rgba(255,255,255,0.04)',
                      }}
                      animate={
                        status === 'active'
                          ? {
                              boxShadow: [
                                `0 0 0px ${step.color}00`,
                                `0 0 12px ${step.color}99`,
                                `0 0 0px ${step.color}00`,
                              ],
                            }
                          : { boxShadow: 'none' }
                      }
                      transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                    >
                      {status === 'done' && (
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                          <polyline points="1.5,5 4,7.5 8.5,2.5" stroke="#4ade80" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                      {status === 'active' && (
                        <motion.span
                          className="pipeline-spinner"
                          style={{ borderTopColor: step.color }}
                          animate={{ rotate: 360 }}
                          transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
                        />
                      )}
                      {(status === 'pending' || status === 'idle') && step.num && (
                        <span className="pipeline-num">{step.num}</span>
                      )}
                    </motion.div>

                    {!isLast && (
                      <div
                        className="pipeline-line"
                        style={{
                          background: status === 'done'
                            ? 'linear-gradient(to bottom, #4ade8066, #4ade8022)'
                            : 'rgba(255,255,255,0.07)',
                        }}
                      />
                    )}
                  </div>

                  {/* Right column: label */}
                  <div className="pipeline-info">
                    {step.num && (
                      <span
                        className="pipeline-agent-tag"
                        style={{
                          color:
                            status === 'active'
                              ? step.color
                              : status === 'done'
                              ? '#4ade8099'
                              : 'rgba(255,255,255,0.18)',
                        }}
                      >
                        A{step.num}
                      </span>
                    )}
                    <span
                      className="pipeline-label"
                      style={{
                        color:
                          status === 'active'
                            ? step.color
                            : status === 'done'
                            ? 'rgba(255,255,255,0.65)'
                            : 'rgba(255,255,255,0.22)',
                        fontWeight: status === 'active' ? 700 : 500,
                      }}
                    >
                      {step.label}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
