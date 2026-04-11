import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { speechToText } from '../lib/elevenlabs'

const SUGGESTIONS = [
  'What is the Pythagorean theorem?',
  'How does photosynthesis work?',
  'Tell me about the solar system',
  'What is DNA?',
  'Explain gravity',
]

function extensionForMime(mime) {
  if (!mime) return 'webm'
  if (mime.includes('webm')) return 'webm'
  if (mime.includes('mp4')) return 'm4a'
  if (mime.includes('ogg')) return 'ogg'
  return 'webm'
}

export default function ChatPanel({ messages, onSend, aiState, voiceChatActive, voiceSlot }) {
  const [input, setInput]       = useState('')
  const [focused, setFocused]   = useState(false)
  const [recording, setRecording] = useState(false)
  const [sttBusy, setSttBusy]   = useState(false)
  const [bounce, setBounce]     = useState(false)
  const messagesEndRef = useRef(null)
  const inputRef       = useRef(null)
  const mediaStreamRef = useRef(null)
  const recorderRef    = useRef(null)
  const chunksRef      = useRef([])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const isDisabled = aiState !== null || voiceChatActive

  useEffect(() => {
    return () => {
      mediaStreamRef.current?.getTracks().forEach(t => t.stop())
      mediaStreamRef.current = null
      recorderRef.current = null
    }
  }, [])

  const stopMedia = useCallback(() => {
    mediaStreamRef.current?.getTracks().forEach(t => t.stop())
    mediaStreamRef.current = null
  }, [])

  const startRecording = useCallback(async () => {
    if (isDisabled || sttBusy) return
    const mime =
      typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : ''
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    mediaStreamRef.current = stream
    chunksRef.current = []
    const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
    recorderRef.current = rec
    rec.ondataavailable = e => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }
    rec.start(250)
    setRecording(true)
  }, [isDisabled, sttBusy])

  const finishRecording = useCallback(async () => {
    const rec = recorderRef.current
    if (!rec || rec.state === 'inactive') {
      stopMedia()
      setRecording(false)
      return
    }
    await new Promise(resolve => {
      rec.onstop = resolve
      rec.stop()
    })
    stopMedia()
    recorderRef.current = null
    setRecording(false)

    const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' })
    chunksRef.current = []
    if (blob.size < 32) return

    setSttBusy(true)
    try {
      const ext = extensionForMime(rec.mimeType)
      const text = await speechToText(blob, `recording.${ext}`)
      if (text) {
        onSend(text)
        setInput('')
      }
    } catch {
    } finally {
      setSttBusy(false)
    }
  }, [onSend, stopMedia])

  const toggleMic = useCallback(async () => {
    if (isDisabled || sttBusy) return
    if (!recording) {
      try {
        await startRecording()
      } catch {
        setRecording(false)
      }
      return
    }
    await finishRecording()
  }, [isDisabled, sttBusy, recording, startRecording, finishRecording])

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
      {voiceSlot}

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
          {(aiState === 'thinking' || aiState === 'building') && (
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
          type="button"
          className={`mic-btn ${recording ? 'mic-active' : ''} ${sttBusy ? 'mic-busy' : ''}`}
          onClick={() => void toggleMic()}
          disabled={isDisabled || sttBusy}
          title={
            voiceChatActive
              ? 'Use voice chat above'
              : recording
                ? 'Stop and transcribe'
                : 'Speak your question'
          }
          whileHover={!isDisabled && !sttBusy ? { scale: 1.07 } : {}}
          whileTap={!isDisabled && !sttBusy ? { scale: 0.93 } : {}}
        >
          {sttBusy ? '…' : '🎤'}
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
