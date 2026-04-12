import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'

/** Same math as former 3D ridge; 2D canvas sized/positioned via `.ai-speaking-bars-2d` to match on-screen. */
const SPEAKING_BAR_COUNT = 32
const SPEAKING_RIDGE_TOTAL_WIDTH = 19.5

/** Gradient anchors (aligned with app cyan / magenta accents). */
const GRAD_BLUE = { r: 0, g: 200, b: 255 }
const GRAD_PINK = { r: 255, g: 110, b: 180 }
const GRAD_MUTED = { r: 38, g: 44, b: 62 }

function rgbStr(c) {
  return `rgb(${c.r | 0},${c.g | 0},${c.b | 0})`
}

/** `strength` 0..1 — vivid blue/pink vs flat; `t` 0=blue … 1=pink along the ramp. */
function gradColor(strength, t) {
  const s = Math.max(0, Math.min(1, strength))
  const base = {
    r: GRAD_BLUE.r * (1 - t) + GRAD_PINK.r * t,
    g: GRAD_BLUE.g * (1 - t) + GRAD_PINK.g * t,
    b: GRAD_BLUE.b * (1 - t) + GRAD_PINK.b * t,
  }
  return {
    r: GRAD_MUTED.r * (1 - s) + base.r * s,
    g: GRAD_MUTED.g * (1 - s) + base.g * s,
    b: GRAD_MUTED.b * (1 - s) + base.b * s,
  }
}

function resampleLevels(raw, count) {
  if (!raw?.length) return null
  if (raw.length === count) return raw
  const n = raw.length
  const out = new Array(count)
  for (let i = 0; i < count; i++) {
    const t = count <= 1 ? 0 : i / (count - 1)
    const pos = t * (n - 1)
    const lo = Math.floor(pos)
    const hi = Math.min(lo + 1, n - 1)
    const f = pos - lo
    const a = Number(raw[lo]) || 0
    const b = Number(raw[hi]) || 0
    out[i] = a + f * (b - a)
  }
  return out
}

function mountainSilhouetteSymmetric(ring, half) {
  const u = half > 1 ? ring / (half - 1) : 0
  return (
    0.38 +
    0.34 * Math.sin(u * Math.PI * 3.1 + 0.7) +
    0.22 * Math.sin(u * Math.PI * 6.4 + 2.1) +
    0.14 * Math.sin(ring * 0.52 + 0.3)
  )
}

/**
 * 2D mirror of the 3D AI level ridge — same data & layout; does not move the WebGL scene.
 */
export default function SpeakingVisualizer2D({ levelsRef, active }) {
  const canvasRef = useRef(null)
  const activeRef = useRef(active)
  useLayoutEffect(() => {
    activeRef.current = active
  }, [active])

  const fallback = useMemo(() => new Array(SPEAKING_BAR_COUNT).fill(0.04), [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    const dpr = () => window.devicePixelRatio || 1

    const resize = () => {
      const el = canvas.parentElement
      if (!el) return
      const rect = el.getBoundingClientRect()
      const ratio = dpr()
      const w = Math.max(1, Math.floor(rect.width * ratio))
      const h = Math.max(1, Math.floor(rect.height * ratio))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
    }

    resize()
    const ro = new ResizeObserver(() => resize())
    ro.observe(canvas.parentElement)

    const layout = () => {
      const totalW = SPEAKING_RIDGE_TOTAL_WIDTH
      const barW = totalW / SPEAKING_BAR_COUNT
      const half = SPEAKING_BAR_COUNT / 2
      const step = barW
      const halfSpan = step * 0.5
      return { totalW, barW, half, step, halfSpan }
    }

    const tick = () => {
      raf = requestAnimationFrame(tick)
      const raw = levelsRef?.current
      const isActive = activeRef.current
      const data = resampleLevels(raw, SPEAKING_BAR_COUNT) ?? fallback
      const { totalW, barW, half, step, halfSpan } = layout()
      const ratio = dpr()
      const cssW = canvas.width / ratio
      const cssH = canvas.height / ratio
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)

      ctx.clearRect(0, 0, cssW, cssH)

      const dim = isActive ? 1 : 0.48
      const centerY = cssH * 0.5
      const maxHalf = Math.max(8, centerY - 8)
      const n = SPEAKING_BAR_COUNT
      const barWPx = (barW / totalW) * cssW

      for (let i = 0; i < n; i++) {
        const ring = Math.min(i, n - 1 - i)
        const rawLevel =
          0.5 * (Number(data[i] ?? 0.04) + Number(data[n - 1 - i] ?? 0.04))
        const boosted = Math.min(1, Number(rawLevel) * (isActive ? 1.35 : 1))
        const normalized = Math.max(isActive ? 0.12 : 0.06, Math.min(1, boosted))
        const ridge = mountainSilhouetteSymmetric(ring, half)
        const peakH = 0.55 + ridge * 1.05 + normalized * (isActive ? 1.85 : 0.55)
        const halfPx = Math.min(maxHalf, (peakH / 2.85) * maxHalf)

        let xWorld
        if (i < half) {
          const depth = half - 1 - i
          xWorld = -halfSpan - depth * step
        } else {
          const depth = i - half
          xWorld = halfSpan + depth * step
        }
        const cx = (xWorld / totalW + 0.5) * cssW

        const bright = isActive
          ? 0.78 + 0.22 * normalized * dim
          : 0.55 + 0.25 * normalized * dim
        // Strength: how much the blue↔pink contrast pops with this bin’s level.
        const gradientStrength = Math.max(
          0.08,
          Math.min(1, 0.12 + 0.88 * Math.pow(normalized, 0.85) * dim)
        )
        // Spread: wider soft blend between blue and pink when the band is louder (sound-driven).
        const gradientSpread = 0.06 + 0.78 * Math.pow(normalized, 0.7)

        const left = cx - barWPx * 0.5
        const right = cx + barWPx * 0.5
        const top = centerY - halfPx
        const bot = centerY + halfPx
        const g = ctx.createLinearGradient(left, top, right, bot)
        const mid = 0.5
        const halfBlend = (1 - gradientSpread) * 0.42 + 0.04
        const s = gradientStrength
        g.addColorStop(0, rgbStr(gradColor(s, 0)))
        g.addColorStop(Math.max(0, mid - halfBlend), rgbStr(gradColor(s, 0.28)))
        g.addColorStop(mid, rgbStr(gradColor(s, 0.5)))
        g.addColorStop(Math.min(1, mid + halfBlend), rgbStr(gradColor(s, 0.72)))
        g.addColorStop(1, rgbStr(gradColor(s, 1)))

        ctx.globalAlpha = Math.min(1, 0.42 + 0.58 * bright)
        ctx.fillStyle = g
        ctx.fillRect(left, top, barWPx, halfPx * 2)
      }
      ctx.globalAlpha = 1
    }

    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [levelsRef, fallback])

  return (
    <div className="ai-speaking-bars-2d" aria-hidden="true">
      <canvas ref={canvasRef} className="ai-speaking-bars-2d__canvas" />
    </div>
  )
}
