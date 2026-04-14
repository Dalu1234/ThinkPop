import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { HAND_CONNECTIONS } from '../lib/fingerCountCore'

const MEDIAPIPE_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
const HAND_MODEL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

const TILE_W     = 58
const TILE_H     = 58
const TILE_GAP   = 10
const TILE_COUNT = 5
const PINCH_CLOSE = 0.055
const PINCH_OPEN  = 0.085
const SMOOTH      = 0.32

// Dark glass tiles — each has a subtle hue via border + inner glow,
// matching the app's dark palette rather than saturated flat colours.
const TILE_STYLES = [
  { bg: 'rgba(28, 52, 115, 0.72)', border: 'rgba(68, 140, 255, 0.55)',  glow: 'rgba(68, 140, 255, 0.14)' },
  { bg: 'rgba(62, 32, 135, 0.72)', border: 'rgba(136, 85, 255, 0.55)',  glow: 'rgba(136, 85, 255, 0.14)' },
  { bg: 'rgba(14, 78, 92, 0.72)',  border: 'rgba(34, 195, 215, 0.55)',  glow: 'rgba(34, 195, 215, 0.14)' },
  { bg: 'rgba(72, 44, 18, 0.72)',  border: 'rgba(215, 135, 55, 0.55)',  glow: 'rgba(215, 135, 55, 0.14)' },
  { bg: 'rgba(18, 78, 58, 0.72)',  border: 'rgba(51, 195, 130, 0.55)',  glow: 'rgba(51, 195, 130, 0.14)' },
  { bg: 'rgba(82, 22, 68, 0.72)',  border: 'rgba(210, 70, 160, 0.55)',  glow: 'rgba(210, 70, 160, 0.14)' },
  { bg: 'rgba(28, 52, 115, 0.72)', border: 'rgba(100, 170, 255, 0.55)', glow: 'rgba(100, 170, 255, 0.14)' },
  { bg: 'rgba(48, 22, 108, 0.72)', border: 'rgba(165, 100, 255, 0.55)', glow: 'rgba(165, 100, 255, 0.14)' },
]

function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min }
function shuffle(arr) { return [...arr].sort(() => Math.random() - 0.5) }

function computeAnswer(operation, a, b) {
  if (operation === 'subtraction')    return Math.max(0, a - b)
  if (operation === 'multiplication') return a * b
  return a + b
}

function getOpSymbol(operation) {
  if (operation === 'subtraction')    return '−'
  if (operation === 'multiplication') return '×'
  return '+'
}

function makeChoices(answer) {
  const set = new Set([answer])
  const deltas = shuffle([1, -1, 2, -2, 3, -3, 4, -4, 5, -5])
  for (const d of deltas) {
    if (set.size >= TILE_COUNT) break
    const v = answer + d
    if (v >= 0 && v <= 99) set.add(v)
  }
  while (set.size < TILE_COUNT) set.add(rand(0, Math.max(answer + 8, 15)))
  return shuffle([...set])
}

function stopStream(stream) {
  if (!stream) return
  for (const t of stream.getTracks()) t.stop()
}

// Matches fingerCountCore.js visual style (flipped x for mirrored webcam)
function drawHand(ctx, lm, W, H) {
  const px = p => (1 - p.x) * W
  const py = p => p.y * H

  ctx.strokeStyle = 'rgba(80, 200, 255, 0.65)'
  ctx.lineWidth = 2
  for (const [a, b] of HAND_CONNECTIONS) {
    ctx.beginPath()
    ctx.moveTo(px(lm[a]), py(lm[a]))
    ctx.lineTo(px(lm[b]), py(lm[b]))
    ctx.stroke()
  }

  const tips = new Set([4, 8, 12, 16, 20])
  for (let i = 0; i < lm.length; i++) {
    ctx.beginPath()
    ctx.arc(px(lm[i]), py(lm[i]), tips.has(i) ? 6 : 3, 0, Math.PI * 2)
    // Pinch fingers (thumb tip + index tip) highlighted gold; rest cyan
    ctx.fillStyle = (i === 4 || i === 8) ? '#ffd700' : '#55ccff'
    ctx.fill()
  }
}

export default function MathDragToolPanel({
  visible = false,
  operation = 'addition',
  a = 3,
  b = 2,
  onSolve,
}) {
  const containerRef = useRef(null)
  const dropZoneRef  = useRef(null)
  const cursorRef    = useRef(null)
  const videoRef     = useRef(null)
  const canvasRef    = useRef(null)

  const tilesRef    = useRef([])
  const grabbedRef  = useRef(null)
  const pinchOnRef  = useRef(false)
  const smoothXRef  = useRef(0.5)
  const smoothYRef  = useRef(0.5)
  const busyRef     = useRef(false)
  const answerRef   = useRef(0)

  const rafRef        = useRef(0)
  const landmarkerRef = useRef(null)
  const streamRef     = useRef(null)
  const feedTimerRef  = useRef(null)

  const [phase, setPhase]           = useState('idle')
  const [cameraError, setCameraError] = useState('')
  const [feedback, setFeedback]     = useState(null)

  const showFeedback = useCallback((text, correct) => {
    clearTimeout(feedTimerRef.current)
    setFeedback({ text, correct })
    feedTimerRef.current = setTimeout(() => setFeedback(null), 1600)
  }, [])

  // Move grabbed tile; coords are in screen space, but tile positions are container-relative
  const moveTile = useCallback((tile, screenX, screenY) => {
    const c = containerRef.current
    if (!c) return
    const cr = c.getBoundingClientRect()
    tile.el.style.left = `${screenX - cr.left - TILE_W / 2}px`
    tile.el.style.top  = `${screenY - cr.top  - TILE_H / 2}px`
  }, [])

  const snapBack = useCallback((tile) => {
    tile.el.classList.remove('mdt-tile-grabbed')
    tile.el.classList.add('mdt-tile-snapping')
    tile.el.style.left = `${tile.sx}px`
    tile.el.style.top  = `${tile.sy}px`
    setTimeout(() => tile.el.classList.remove('mdt-tile-snapping'), 420)
  }, [])

  const overDropZone = useCallback((screenX, screenY) => {
    const dz = dropZoneRef.current
    if (!dz) return false
    const r = dz.getBoundingClientRect()
    return screenX >= r.left && screenX <= r.right && screenY >= r.top && screenY <= r.bottom
  }, [])

  const nearestTile = useCallback((screenX, screenY, thresh = 80) => {
    let best = null, bestD = thresh
    for (const t of tilesRef.current) {
      const r  = t.el.getBoundingClientRect()
      const cx = r.left + r.width  / 2
      const cy = r.top  + r.height / 2
      const d  = Math.hypot(cx - screenX, cy - screenY)
      if (d < bestD) { bestD = d; best = t }
    }
    return best
  }, [])

  const handleDrop = useCallback((tile, screenX, screenY) => {
    const dz = dropZoneRef.current
    if (!overDropZone(screenX, screenY)) {
      snapBack(tile)
      return
    }
    if (dz) dz.classList.remove('mdt-dz-hover')

    if (tile.value === answerRef.current) {
      if (dz) {
        dz.textContent = String(tile.value)
        dz.classList.add('mdt-dz-correct')
      }
      tile.el.classList.remove('mdt-tile-grabbed')
      tile.el.classList.add('mdt-tile-dissolve')
      showFeedback('Correct!', true)
      busyRef.current = true
      setTimeout(() => onSolve?.(), 950)
    } else {
      if (dz) {
        dz.classList.add('mdt-dz-wrong')
        setTimeout(() => dz.classList.remove('mdt-dz-wrong'), 500)
      }
      snapBack(tile)
      showFeedback('Try again', false)
    }
  }, [overDropZone, snapBack, showFeedback, onSolve])

  const tryGrab = useCallback((sx, sy) => {
    if (grabbedRef.current || busyRef.current) return
    const t = nearestTile(sx, sy)
    if (!t) return
    grabbedRef.current = t
    t.el.classList.add('mdt-tile-grabbed')
  }, [nearestTile])

  const doDrag = useCallback((sx, sy) => {
    const t = grabbedRef.current
    if (!t) return
    moveTile(t, sx, sy)
    const dz = dropZoneRef.current
    if (dz) dz.classList.toggle('mdt-dz-hover', overDropZone(sx, sy))
  }, [moveTile, overDropZone])

  const doRelease = useCallback((sx, sy) => {
    const t = grabbedRef.current
    if (!t) return
    grabbedRef.current = null
    const dz = dropZoneRef.current
    if (dz) dz.classList.remove('mdt-dz-hover')
    const r  = t.el.getBoundingClientRect()
    handleDrop(t, r.left + r.width / 2, r.top + r.height / 2)
  }, [handleDrop])

  // ── Build tiles imperatively inside the game area ───────────────────
  const buildTiles = useCallback((ans) => {
    const c = containerRef.current
    if (!c) return
    tilesRef.current.forEach(t => { try { t.el.remove() } catch (_) {} })
    tilesRef.current = []

    const values = makeChoices(ans)
    const cr     = c.getBoundingClientRect()
    const totalW = TILE_COUNT * TILE_W + (TILE_COUNT - 1) * TILE_GAP
    const x0     = (cr.width - totalW) / 2
    const y0     = cr.height - TILE_H - 18

    values.forEach((value, i) => {
      const el    = document.createElement('div')
      const style = TILE_STYLES[i % TILE_STYLES.length]
      el.className = 'mdt-tile'
      el.style.cssText = [
        `left:${x0 + i * (TILE_W + TILE_GAP)}px`,
        `top:${y0}px`,
        `background:${style.bg}`,
        `border:1.5px solid ${style.border}`,
        `box-shadow:0 0 10px ${style.glow},0 5px 18px rgba(0,0,0,0.5)`,
      ].join(';')
      el.textContent = String(value)
      c.appendChild(el)
      tilesRef.current.push({
        id: i, value, el,
        sx: x0 + i * (TILE_W + TILE_GAP),
        sy: y0,
      })
    })
  }, [])

  // ── Mouse fallback ──────────────────────────────────────────────────
  useEffect(() => {
    if (!visible) return
    const onDown = (e) => {
      const tileEl = e.target.closest('.mdt-tile')
      if (!tileEl) return
      const t = tilesRef.current.find(x => x.el === tileEl)
      if (!t || busyRef.current) return
      grabbedRef.current = t
      t.el.classList.add('mdt-tile-grabbed')
    }
    const onMove = (e) => {
      const t = grabbedRef.current
      if (!t) return
      moveTile(t, e.clientX, e.clientY)
      const dz = dropZoneRef.current
      if (dz) dz.classList.toggle('mdt-dz-hover', overDropZone(e.clientX, e.clientY))
    }
    const onUp = () => {
      const t = grabbedRef.current
      if (!t) return
      grabbedRef.current = null
      const dz = dropZoneRef.current
      if (dz) dz.classList.remove('mdt-dz-hover')
      const r = t.el.getBoundingClientRect()
      handleDrop(t, r.left + r.width / 2, r.top + r.height / 2)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [visible, moveTile, overDropZone, handleDrop])

  // ── MediaPipe detection loop ────────────────────────────────────────
  const startDetection = useCallback((landmarker) => {
    const tick = () => {
      const video  = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas) { rafRef.current = requestAnimationFrame(tick); return }

      const c  = containerRef.current
      const cr = c ? c.getBoundingClientRect() : { width: 360, height: 260, left: 0, top: 0 }

      canvas.width  = cr.width
      canvas.height = cr.height
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        const results = landmarker.detectForVideo(video, performance.now())

        if (results.landmarks.length > 0) {
          const lm = results.landmarks[0]

          // Smooth index-finger tip, flipped x for mirror
          smoothXRef.current = smoothXRef.current * (1 - SMOOTH) + (1 - lm[8].x) * SMOOTH
          smoothYRef.current = smoothYRef.current * (1 - SMOOTH) + lm[8].y         * SMOOTH

          // Map to screen coords using container bounding rect
          const sx = cr.left + smoothXRef.current * cr.width
          const sy = cr.top  + smoothYRef.current * cr.height

          // Pinch detection with hysteresis
          const dist      = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y)
          const prevPinch = pinchOnRef.current
          if ( pinchOnRef.current && dist > PINCH_OPEN)  pinchOnRef.current = false
          if (!pinchOnRef.current && dist < PINCH_CLOSE) pinchOnRef.current = true

          if ( pinchOnRef.current && !prevPinch) tryGrab(sx, sy)
          if ( pinchOnRef.current)               doDrag(sx, sy)
          if (!pinchOnRef.current &&  prevPinch) doRelease(sx, sy)

          // Cursor (container-relative coords)
          const cur = cursorRef.current
          if (cur) {
            cur.style.left    = `${smoothXRef.current * cr.width}px`
            cur.style.top     = `${smoothYRef.current * cr.height}px`
            cur.style.opacity = '1'
            cur.classList.toggle('mdt-cursor-pinch', pinchOnRef.current)
          }

          drawHand(ctx, lm, cr.width, cr.height)
        } else {
          if (grabbedRef.current) { snapBack(grabbedRef.current); grabbedRef.current = null }
          pinchOnRef.current = false
          const cur = cursorRef.current
          if (cur) cur.style.opacity = '0'
          const dz = dropZoneRef.current
          if (dz) dz.classList.remove('mdt-dz-hover')
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [tryGrab, doDrag, doRelease, snapBack])

  const startCamera = useCallback(async () => {
    setCameraError('')
    setPhase('loading')
    try {
      const { HandLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision')
      const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM)
      let landmarker
      for (const delegate of ['GPU', 'CPU']) {
        try {
          landmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: HAND_MODEL, delegate },
            runningMode: 'VIDEO',
            numHands: 1,
          })
          break
        } catch (e) {
          if (delegate === 'CPU') throw e
        }
      }
      landmarkerRef.current = landmarker
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
      streamRef.current = stream
      const v = videoRef.current
      if (!v) throw new Error('Video element missing')
      v.srcObject = stream
      await v.play()
      setPhase('live')
      startDetection(landmarker)
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : String(err))
      setPhase('idle')
    }
  }, [startDetection])

  const teardown = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0 }
    landmarkerRef.current = null
    stopStream(streamRef.current)
    streamRef.current = null
    const v = videoRef.current
    if (v) v.srcObject = null
    tilesRef.current.forEach(t => { try { t.el.remove() } catch (_) {} })
    tilesRef.current = []
    grabbedRef.current = null
    pinchOnRef.current = false
    busyRef.current    = false
    clearTimeout(feedTimerRef.current)
  }, [])

  useEffect(() => {
    if (!visible) {
      teardown()
      setPhase('idle')
      setCameraError('')
      setFeedback(null)
      return
    }
    answerRef.current  = computeAnswer(operation, a, b)
    busyRef.current    = false
    grabbedRef.current = null
    pinchOnRef.current = false
    const dz = dropZoneRef.current
    if (dz) { dz.className = 'mdt-drop-zone'; dz.textContent = 'Drop here' }
    // Brief delay so the container has rendered and has a measurable size
    const tid = setTimeout(() => buildTiles(answerRef.current), 80)
    return () => clearTimeout(tid)
  }, [visible, operation, a, b, teardown, buildTiles])

  const opSymbol = getOpSymbol(operation)
  const opLabel  = operation === 'subtraction' ? 'Subtraction'
                 : operation === 'multiplication' ? 'Multiplication'
                 : 'Addition'

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="mdt-shell"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="mdt-card">
            <header className="mdt-header">
              <span className="mdt-kicker">Math Drag · {opLabel}</span>
              <h2 className="mdt-title">
                {a}&thinsp;<span className="mdt-op">{opSymbol}</span>&thinsp;{b}&thinsp;
                <span className="mdt-eq">=</span>&thinsp;?
              </h2>
            </header>

            <div ref={containerRef} className="mdt-game-area">
              <div ref={dropZoneRef} className="mdt-drop-zone">Drop here</div>
              <canvas ref={canvasRef} className="mdt-hand-canvas" />
              <div ref={cursorRef} className="mdt-cursor" />
            </div>

            {feedback && (
              <div className={`mdt-feedback ${feedback.correct ? 'mdt-feedback-ok' : 'mdt-feedback-err'}`}>
                {feedback.text}
              </div>
            )}

            <video ref={videoRef} className="mdt-video" playsInline muted autoPlay />

            {phase !== 'live' && (
              <button
                type="button"
                className="mdt-cam-btn"
                disabled={phase === 'loading'}
                onClick={() => void startCamera()}
              >
                {phase === 'loading' ? 'Starting camera…' : cameraError ? 'Retry camera' : 'Enable hand tracking'}
              </button>
            )}
            {cameraError && <p className="mdt-error">{cameraError}</p>}

            <p className="mdt-hint">
              Drag the correct answer tile into the drop zone.
              {phase === 'idle' ? ' Use your mouse, or enable hand tracking above.' : ' Pinch to grab a tile.'}
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
