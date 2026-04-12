import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  COUNT_COLORS,
  COUNT_LABELS,
  countFingers,
  drawHand,
} from '../lib/fingerCountCore'

const MEDIAPIPE_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
const HAND_MODEL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

function stopStream(stream) {
  if (!stream) return
  for (const t of stream.getTracks()) t.stop()
}

export default function FingerCountToolPanel({
  visible = false,
  /** When true, the lesson (not the learner) requests camera + tracking as soon as the panel opens. */
  autoStartCamera = false,
  /** Live total finger count 0–10 */
  onCountChange,
  /** Camera running (used to enable finger-matched answers in parent) */
  onCameraActiveChange,
}) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const landmarkerRef = useRef(null)
  const rafRef = useRef(0)
  const streamRef = useRef(null)
  const autoStartAttemptedRef = useRef(false)

  const [phase, setPhase] = useState('idle')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [total, setTotal] = useState(0)
  const [handData, setHandData] = useState([])

  const teardown = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = 0
    landmarkerRef.current = null
    stopStream(streamRef.current)
    streamRef.current = null
    const v = videoRef.current
    if (v) {
      v.srcObject = null
    }
    const c = canvasRef.current
    if (c) {
      const ctx = c.getContext('2d')
      if (ctx) ctx.clearRect(0, 0, c.width, c.height)
    }
    setTotal(0)
    setHandData([])
    setStatus('')
    onCountChange?.(-1)
    onCameraActiveChange?.(false)
  }, [onCountChange, onCameraActiveChange])

  useEffect(() => {
    if (!visible) {
      autoStartAttemptedRef.current = false
      teardown()
      setPhase('idle')
      setError('')
    }
  }, [visible, teardown])

  const detectLoop = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    const landmarker = landmarkerRef.current
    if (!video || !canvas || !landmarker) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const tick = () => {
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        const results = landmarker.detectForVideo(video, performance.now())
        const nextHandData = []
        let nextTotal = 0

        for (let i = 0; i < results.landmarks.length; i++) {
          const lm = results.landmarks[i]
          const handedness = results.handednesses[i]?.[0]?.categoryName ?? 'Right'
          const state = countFingers(lm, handedness)
          drawHand(ctx, lm, canvas.width, canvas.height, state)
          nextHandData.push({ side: handedness, count: state.count })
          nextTotal += state.count
        }

        setTotal(nextTotal)
        setHandData(nextHandData)
        onCountChange?.(nextTotal)
        setStatus(
          results.landmarks.length === 0
            ? 'No hand detected'
            : `${results.landmarks.length} hand${results.landmarks.length > 1 ? 's' : ''} detected`
        )
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
  }, [onCountChange])

  const startSession = useCallback(async () => {
    setError('')
    setPhase('loading')
    setStatus('Loading…')

    try {
      const { HandLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision')

      setStatus('Downloading hand model…')
      const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM)

      let landmarker
      for (const delegate of ['GPU', 'CPU']) {
        try {
          landmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: HAND_MODEL,
              delegate,
            },
            runningMode: 'VIDEO',
            numHands: 2,
          })
          break
        } catch (e) {
          if (delegate === 'CPU') throw e
        }
      }

      landmarkerRef.current = landmarker

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      })
      streamRef.current = stream

      const video = videoRef.current
      if (!video) throw new Error('Video element missing')
      video.srcObject = stream
      await video.play()

      setPhase('live')
      onCameraActiveChange?.(true)
      setStatus('Detecting…')
      detectLoop()
    } catch (err) {
      console.error('Finger counter setup failed:', err)
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      setPhase('idle')
      autoStartAttemptedRef.current = false
      teardown()
    }
  }, [detectLoop, onCameraActiveChange, teardown])

  const startSessionRef = useRef(startSession)
  startSessionRef.current = startSession

  useEffect(() => {
    if (!visible || !autoStartCamera) return
    if (autoStartAttemptedRef.current) return
    autoStartAttemptedRef.current = true
    void startSessionRef.current()
  }, [visible, autoStartCamera])

  const color = COUNT_COLORS[Math.min(total, 10)]
  const label = COUNT_LABELS[Math.min(total, 10)]

  const left = handData.find(h => h.side === 'Left')
  const right = handData.find(h => h.side === 'Right')

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="finger-count-tool-shell"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="finger-count-tool-card">
            <header className="finger-count-tool-header">
              <span className="finger-count-tool-kicker">Finger Lab</span>
              <h2 className="finger-count-tool-title">Count on your hands</h2>
            </header>

            <div className="finger-count-tool-readout" style={{ color }}>
              <span className="finger-count-tool-number">{total}</span>
              <p className="finger-count-tool-label">{label}</p>
            </div>

            <div className="finger-count-tool-dots" style={{ color }}>
              {Array.from({ length: 10 }, (_, i) => (
                <span key={i} className={`finger-count-dot${i < total ? ' finger-count-dot--up' : ''}`} />
              ))}
            </div>

            {handData.length > 0 && (
              <div className="finger-count-tool-hands">
                <span className="finger-count-hand-badge">Left: {left != null ? left.count : '–'}</span>
                <span className="finger-count-hand-badge">Right: {right != null ? right.count : '–'}</span>
              </div>
            )}

            <div className={`finger-count-cam-wrap${phase === 'live' ? ' finger-count-cam-wrap--on' : ''}`}>
              <video ref={videoRef} className="finger-count-video" playsInline muted autoPlay />
              <canvas ref={canvasRef} className="finger-count-canvas" />
              <span className="finger-count-cam-tag">Live</span>
            </div>

            {phase !== 'live' && (
              <button
                type="button"
                className="finger-count-start-btn"
                disabled={phase === 'loading'}
                onClick={() => {
                  autoStartAttemptedRef.current = true
                  void startSession()
                }}
              >
                {phase === 'loading' ? 'Starting camera…' : error ? 'Retry camera' : 'Enable camera'}
              </button>
            )}

            {error ? (
              <p className="finger-count-tool-error">{error}</p>
            ) : (
              <p className="finger-count-tool-status">{status}</p>
            )}

            <p className="finger-count-tool-hint">
              When the tutor asks, hold up that many fingers and keep them still for a moment. You can say the number
              instead if you need to.
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
