/**
 * Finger counting logic + skeleton drawing (from fingerCount/src/main.js).
 * MediaPipe Hand Landmarker → per-hand 0–5, two hands → 0–10 total.
 */

export const THUMB_TIP = 4
export const THUMB_IP = 3

export const FINGER_JOINTS = [
  { name: 'index', tip: 8, pip: 6 },
  { name: 'middle', tip: 12, pip: 10 },
  { name: 'ring', tip: 16, pip: 14 },
  { name: 'pinky', tip: 20, pip: 18 },
]

export const HAND_CONNECTIONS = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [0, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [0, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [0, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [5, 9],
  [9, 13],
  [13, 17],
]

export const COUNT_COLORS = [
  '#444455',
  '#ff3355',
  '#ff7722',
  '#ffcc00',
  '#33cc66',
  '#44aaff',
  '#8855ff',
  '#ff44bb',
  '#00eebb',
  '#ffaa00',
  '#ffffff',
]

export const COUNT_LABELS = [
  'no hands detected',
  'one finger up',
  'two fingers up',
  'three fingers up',
  'four fingers up',
  'five fingers up',
  'six fingers up',
  'seven fingers up',
  'eight fingers up',
  'nine fingers up',
  'all ten fingers up!',
]

/**
 * @param {Array<{x:number,y:number,z?:number}>} lm
 * @param {string} handedness "Left" | "Right" (image perspective)
 */
export function countFingers(lm, handedness) {
  let count = 0
  const extended = []

  for (const f of FINGER_JOINTS) {
    const up = lm[f.tip].y < lm[f.pip].y
    extended.push(up)
    if (up) count++
  }

  const thumbUp =
    handedness === 'Left'
      ? lm[THUMB_TIP].x < lm[THUMB_IP].x
      : lm[THUMB_TIP].x > lm[THUMB_IP].x

  if (thumbUp) count++

  return { count, thumbUp, extended }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<{x:number,y:number}>} lm
 * @param {{ thumbUp: boolean, extended: boolean[] }} fingerState
 */
export function drawHand(ctx, lm, W, H, fingerState) {
  const px = p => p.x * W
  const py = p => p.y * H

  ctx.strokeStyle = 'rgba(80, 200, 255, 0.65)'
  ctx.lineWidth = 2
  for (const [a, b] of HAND_CONNECTIONS) {
    ctx.beginPath()
    ctx.moveTo(px(lm[a]), py(lm[a]))
    ctx.lineTo(px(lm[b]), py(lm[b]))
    ctx.stroke()
  }

  const extendedTips = new Set()
  if (fingerState.thumbUp) extendedTips.add(4)
  if (fingerState.extended[0]) extendedTips.add(8)
  if (fingerState.extended[1]) extendedTips.add(12)
  if (fingerState.extended[2]) extendedTips.add(16)
  if (fingerState.extended[3]) extendedTips.add(20)

  for (let i = 0; i < lm.length; i++) {
    const isTip = [4, 8, 12, 16, 20].includes(i)
    const isExtendedTip = extendedTips.has(i)

    ctx.beginPath()
    ctx.arc(px(lm[i]), py(lm[i]), isTip ? 6 : 3, 0, Math.PI * 2)
    ctx.fillStyle = isExtendedTip ? '#ffd700' : '#55ccff'
    ctx.fill()
  }
}
