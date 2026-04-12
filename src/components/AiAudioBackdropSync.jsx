import { useEffect, useRef } from 'react'

/**
 * Maps Web Audio analyser bins (see playAudioBlob in elevenlabs.js) to CSS vars on `.app-root`:
 * --ai-bloom-pink / --ai-bloom-blue (hue strength) and --ai-bg-spread (gradient “spread”).
 */
function aggregateBins(levels) {
  if (!levels?.length) return { pink: 0, blue: 0, spread: 0 }
  const n = levels.length
  const mid = Math.max(1, Math.floor(n / 2))
  let left = 0
  let right = 0
  for (let i = 0; i < mid; i++) left += levels[i]
  for (let i = mid; i < n; i++) right += levels[i]
  left /= mid
  right /= n - mid
  let sum = 0
  for (let i = 0; i < n; i++) sum += levels[i]
  const mean = sum / n
  const pink = Math.min(1, left * 1.45 + mean * 0.35)
  const blue = Math.min(1, right * 1.45 + mean * 0.35)
  const spread = Math.min(1, mean * 1.15 + Math.max(left, right) * 0.4)
  return { pink, blue, spread }
}

export default function AiAudioBackdropSync({ levelsRef, active }) {
  const activeRef = useRef(active)
  useEffect(() => {
    activeRef.current = active
  }, [active])

  const smoothRef = useRef({ pink: 0, blue: 0, spread: 0 })

  useEffect(() => {
    const root = document.querySelector('.app-root')
    if (!root) return undefined

    let raf = 0
    const UP = 0.38
    const DOWN = 0.1

    const tick = () => {
      raf = requestAnimationFrame(tick)
      const levels = levelsRef?.current
      const on = activeRef.current
      const s = smoothRef.current
      const target = on && levels?.length ? aggregateBins(levels) : { pink: 0, blue: 0, spread: 0 }
      const t = on && levels?.length ? UP : DOWN
      s.pink += (target.pink - s.pink) * t
      s.blue += (target.blue - s.blue) * t
      s.spread += (target.spread - s.spread) * t

      root.style.setProperty('--ai-bloom-pink', String(s.pink))
      root.style.setProperty('--ai-bloom-blue', String(s.blue))
      root.style.setProperty('--ai-bg-spread', String(s.spread))
    }

    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      root.style.removeProperty('--ai-bloom-pink')
      root.style.removeProperty('--ai-bloom-blue')
      root.style.removeProperty('--ai-bg-spread')
    }
  }, [levelsRef])

  return null
}
