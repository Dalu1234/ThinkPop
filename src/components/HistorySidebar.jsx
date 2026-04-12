import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { loadSessions, deleteSession, groupSessionsByDate } from '../lib/sessions'

export default function HistorySidebar({ onLoadSession }) {
  const [isOpen, setIsOpen]     = useState(false)
  const [sessions, setSessions] = useState([])

  // Reload from localStorage whenever sidebar opens
  useEffect(() => {
    if (isOpen) setSessions(loadSessions())
  }, [isOpen])

  // Also listen for the custom event App fires when a new session is saved
  useEffect(() => {
    const handler = () => setSessions(loadSessions())
    window.addEventListener('thinkpop:session-saved', handler)
    return () => window.removeEventListener('thinkpop:session-saved', handler)
  }, [])

  function handleDelete(e, id) {
    e.stopPropagation()
    deleteSession(id)
    setSessions(prev => prev.filter(s => s.id !== id))
  }

  function handleLoad(session) {
    onLoadSession(session)
    setIsOpen(false)
  }

  const grouped = groupSessionsByDate(sessions)

  return (
    <>
      <button
        className="history-toggle-btn"
        onClick={() => setIsOpen(prev => !prev)}
        title={isOpen ? 'Close History' : 'Open History'}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="6"  x2="21" y2="6"  />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            {/* backdrop — click outside to close */}
            <motion.div
              className="history-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
            />

            <motion.div
              className="history-sidebar"
              initial={{ x: '-100%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '-100%', opacity: 0.5 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            >
              <div className="history-header">
                <h2>Conversations</h2>
              </div>

              <div className="history-content">
                {grouped.length === 0 ? (
                  <p className="history-empty">No conversations yet. Ask a question to get started!</p>
                ) : (
                  grouped.map(([group, items]) => (
                    <div key={group} className="history-group">
                      <h3 className="history-group-title">{group}</h3>
                      <ul className="history-list">
                        {items.map(session => (
                          <li
                            key={session.id}
                            className="history-item"
                            onClick={() => handleLoad(session)}
                            title="Resume this conversation"
                          >
                            <span className="history-item-emoji">
                              {session.topic?.emoji || '💬'}
                            </span>
                            <span className="history-title">
                              {session.topic?.label || 'Lesson'}
                            </span>
                            <button
                              className="history-delete-btn"
                              onClick={e => handleDelete(e, session.id)}
                              title="Delete"
                            >
                              ✕
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
