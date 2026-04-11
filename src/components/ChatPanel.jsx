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

export default function ChatPanel({ messages, onSend, aiState }) {
  const [input, setInput]       = useState('')
  const [focused, setFocused]   = useState(false)
  const [recording, setRecording] = useState(false)
  const [sttBusy, setSttBusy]   = useState(false)
  const [sttError, setSttError] = useState('')
  const [bounce, setBounce]     = useState(false)
  const messagesEndRef = useRef(null)
  const inputRef       = useRef(null)
  const mediaStreamRef = useRef(null)
  const recorderRef    = useRef(null)
  const chunksRef      = useRef([])
  const recordingStartedAtRef = useRef(0)
  const visualizerCanvasRef = useRef(null)
  const visualizerFrameRef = useRef(0)
  const visualizerAudioContextRef = useRef(null)
  const visualizerSourceRef = useRef(null)
  const visualizerAnalyserRef = useRef(null)
  const visualizerDataRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const isDisabled = aiState !== null

  useEffect(() => {
    return () => {
      if (visualizerFrameRef.current) {
        window.cancelAnimationFrame(visualizerFrameRef.current)
      }
      visualizerSourceRef.current?.disconnect()
      visualizerAnalyserRef.current?.disconnect()
      visualizerAudioContextRef.current?.close().catch(() => {})
      mediaStreamRef.current?.getTracks().forEach(t => t.stop())
      mediaStreamRef.current = null
      recorderRef.current = null
    }
  }, [])

  const clearVisualizer = useCallback(() => {
    const canvas = visualizerCanvasRef.current
    const ctx = canvas?.getContext('2d')
    if (canvas && ctx) {
      const { width, height } = canvas
      ctx.clearRect(0, 0, width, height)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.06)'
      ctx.fillRect(0, 0, width, height)
    }
  }, [])

  const stopVisualizer = useCallback(() => {
    if (visualizerFrameRef.current) {
      window.cancelAnimationFrame(visualizerFrameRef.current)
      visualizerFrameRef.current = 0
    }
    visualizerSourceRef.current?.disconnect()
    visualizerSourceRef.current = null
    visualizerAnalyserRef.current?.disconnect()
    visualizerAnalyserRef.current = null
    visualizerDataRef.current = null
    visualizerAudioContextRef.current?.close().catch(() => {})
    visualizerAudioContextRef.current = null
    clearVisualizer()
  }, [clearVisualizer])

  const stopMedia = useCallback(() => {
    mediaStreamRef.current?.getTracks().forEach(t => t.stop())
    mediaStreamRef.current = null
    stopVisualizer()
  }, [stopVisualizer])

  const startVisualizer = useCallback(async (stream) => {
    stopVisualizer()

    const canvas = visualizerCanvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.max(1, Math.floor(rect.width * dpr))
    canvas.height = Math.max(1, Math.floor(rect.height * dpr))

    const AC = window.AudioContext || window.webkitAudioContext
    const audioContext = new AC()
    if (audioContext.state === 'suspended') {
      await audioContext.resume()
    }

    const source = audioContext.createMediaStreamSource(stream)
    const analyser = audioContext.createAnalyser()
    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.82
    source.connect(analyser)

    const dataArray = new Uint8Array(analyser.frequencyBinCount)
    visualizerAudioContextRef.current = audioContext
    visualizerSourceRef.current = source
    visualizerAnalyserRef.current = analyser
    visualizerDataRef.current = dataArray

    const draw = () => {
      const ctx = canvas.getContext('2d')
      const analyserNode = visualizerAnalyserRef.current
      const buffer = visualizerDataRef.current
      if (!ctx || !analyserNode || !buffer) return

      analyserNode.getByteFrequencyData(buffer)
      const { width, height } = canvas
      ctx.clearRect(0, 0, width, height)

      const gradient = ctx.createLinearGradient(0, 0, width, 0)
      gradient.addColorStop(0, 'rgba(255, 110, 180, 0.95)')
      gradient.addColorStop(0.5, 'rgba(255, 209, 102, 0.95)')
      gradient.addColorStop(1, 'rgba(0, 229, 255, 0.95)')

      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)'
      ctx.fillRect(0, 0, width, height)

      const barCount = 32
      const gap = width * 0.008
      const barWidth = (width - gap * (barCount - 1)) / barCount
      for (let i = 0; i < barCount; i++) {
        const value = buffer[Math.min(buffer.length - 1, Math.floor((i / barCount) * buffer.length))]
        const normalized = value / 255
        const barHeight = Math.max(height * 0.12, normalized * height * 0.92)
        const x = i * (barWidth + gap)
        const y = (height - barHeight) / 2
        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.roundRect(x, y, barWidth, barHeight, barWidth / 2)
        ctx.fill()
      }

      visualizerFrameRef.current = window.requestAnimationFrame(draw)
    }

    draw()
  }, [stopVisualizer])

  const startRecording = useCallback(async () => {
    if (isDisabled || sttBusy) return
    setSttError('')
    const mime =
      typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : ''
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    })
    mediaStreamRef.current = stream
    await startVisualizer(stream)
    chunksRef.current = []
    const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
    recorderRef.current = rec
    rec.ondataavailable = e => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }
    rec.start(250)
    recordingStartedAtRef.current = Date.now()
    setRecording(true)
  }, [isDisabled, sttBusy, startVisualizer])

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
    const recordingDurationMs = Math.max(0, Date.now() - recordingStartedAtRef.current)

    const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' })
    chunksRef.current = []
    if (blob.size < 32 || recordingDurationMs < 700) {
      setSttError('Recording too short. Hold the mic for a moment before stopping.')
      return
    }

    setSttBusy(true)
    try {
      const ext = extensionForMime(rec.mimeType)
      const result = await speechToText(blob, `recording.${ext}`)
      const text = String(result?.text || '').trim()
      if (text) {
        onSend(text)
        setInput('')
      } else {
        setSttError('No speech detected. Try speaking louder or closer to the mic.')
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      setSttError(detail || 'Speech-to-text failed.')
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
      <div className={`chat-visualizer-shell ${recording ? 'is-live' : ''}`}>
        <canvas
          ref={visualizerCanvasRef}
          className="chat-visualizer-canvas"
          aria-hidden="true"
        />
      </div>

      <div className="chat-input-row">
        <motion.button
          type="button"
          className={`mic-btn ${recording ? 'mic-active' : ''} ${sttBusy ? 'mic-busy' : ''}`}
          onClick={() => void toggleMic()}
          disabled={isDisabled || sttBusy}
          title={recording ? 'Stop and transcribe' : 'Speak your question'}
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

      {sttError && <div className="chat-inline-error">{sttError}</div>}
    </motion.div>
  )
}
