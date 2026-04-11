import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const SUGGESTIONS = [
  'How do I add fractions with different denominators?',
  'Explain place value with tens and ones',
  'What is multiplication as repeated addition?',
  'Help me understand division with remainders',
  'How do I compare two fractions?',
]

export default function ChatPanel({ messages, onSend, aiState }) {
  const [input, setInput]       = useState('')
  const [focused, setFocused]   = useState(false)
  const [micActive, setMicActive] = useState(false)
  const [bounce, setBounce]     = useState(false)
  const messagesEndRef = useRef(null)
  const inputRef       = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const isDisabled = aiState !== null

  const showTyping =
    aiState === 'thinking' ||
    aiState === 'building' ||
    aiState === 'intake' ||
    aiState === 'topic' ||
    aiState === 'objectives' ||
    aiState === 'lesson_plan' ||
    aiState === 'gestures' ||
    aiState === 'visual_model'

  const handleSend = () => {
    if (!input.trim() || isDisabled) return
    onSend(input.trim())
    setInput('')
    setBounce(true)
    setTimeout(() => setBounce(false), 400)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleSuggestion = (text) => {
    if (isDisabled) return
    setInput(text)
    inputRef.current?.focus()
  }

  return (
    <motion.div
      className="chat-panel"
      animate={{ y: focused ? -18 : 0 }}
      transition={{ duration: 0.32, ease: [0.34, 1.2, 0.64, 1] }}
    >
      {/* Suggestion chips — show only when chat is fresh */}
      {messages.length <= 1 && (
        <div className="suggestions">
          {SUGGESTIONS.map(s => (
            <button
              key={s}
              className="suggestion-chip"
              onClick={() => handleSuggestion(s)}
              disabled={isDisabled}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Messages */}
      <div className="chat-messages">
        <AnimatePresence initial={false}>
          {messages.map(msg => (
            <motion.div
              key={msg.id}
              className={`chat-bubble ${msg.from === 'user' ? 'bubble-user' : 'bubble-ai'}`}
              initial={{ opacity: 0, y: 16, scale: 0.88 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.32, ease: [0.34, 1.56, 0.64, 1] }}
            >
              {msg.from === 'ai' && (
                <span className="bubble-avatar">🤖</span>
              )}
              <span>{msg.text}</span>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Thinking indicator */}
        <AnimatePresence>
          {showTyping && (
            <motion.div
              className="chat-bubble bubble-ai bubble-thinking"
              initial={{ opacity: 0, y: 12, scale: 0.88 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.88 }}
              transition={{ duration: 0.25 }}
            >
              <span className="bubble-avatar">🤖</span>
              <span className="typing-dots">
                <span /><span /><span />
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={messagesEndRef} />
      </div>

      {/* Input row */}
      <div className="chat-input-row">
        <motion.button
          className={`mic-btn ${micActive ? 'mic-active' : ''}`}
          onClick={() => setMicActive(v => !v)}
          whileHover={{ scale: 1.07 }}
          whileTap={{ scale: 0.93 }}
        >
          🎤
        </motion.button>

        <motion.div
          className="input-wrapper"
          animate={bounce ? { x: [0, -5, 5, -3, 3, 0] } : {}}
          transition={{ duration: 0.3 }}
        >
          <input
            ref={inputRef}
            className="chat-input"
            placeholder="Ask me anything..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            disabled={isDisabled}
          />
        </motion.div>

        <motion.button
          className="send-btn"
          onClick={handleSend}
          disabled={isDisabled || !input.trim()}
          whileHover={!isDisabled && input.trim() ? { scale: 1.1 } : {}}
          whileTap={!isDisabled && input.trim() ? { scale: 0.9 } : {}}
        >
          ✨
        </motion.button>
      </div>
    </motion.div>
  )
}
