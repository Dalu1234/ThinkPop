/**
 * motionApi.js — POST /api/motion (Vite → http://127.0.0.1:8000/generate) with local fallback.
 *
 * If the Python server is not running, the same procedural motion is generated in-browser
 * so the Mixamo retargeter always receives HumanML3D-shaped frames.
 */

/** Default fallback prompts when no mdmPrompt is provided. */
export const MOTION_PROMPTS = {
  wave: 'a person waves their right hand warmly at the audience',
  point: 'a person raises their right arm and points forward with their finger',
  count: 'a person counts on their fingers, raising one hand in front of their body',
  emphasize: 'a person gestures expressively with both hands while explaining something',
  open: 'a person opens both arms wide to their sides in a welcoming gesture',
  rest: 'a person stands in a relaxed neutral position with arms at their sides',
}

/** HumanML3D joint order — must match motion-server/app.py and src/lib/retarget.js */
const REST_POSE = [
  [0.0, 0.94, 0.0],
  [0.09, 0.86, 0.02],
  [-0.09, 0.86, 0.02],
  [0.0, 1.05, 0.02],
  [0.09, 0.5, 0.04],
  [-0.09, 0.5, 0.04],
  [0.0, 1.2, 0.02],
  [0.09, 0.1, 0.06],
  [-0.09, 0.1, 0.06],
  [0.0, 1.4, 0.02],
  [0.11, 0.02, 0.08],
  [-0.11, 0.02, 0.08],
  [0.0, 1.55, 0.02],
  [0.06, 1.48, 0.04],
  [-0.06, 1.48, 0.04],
  [0.0, 1.72, 0.02],
  [0.22, 1.42, 0.06],
  [-0.2, 1.42, 0.06],
  [0.38, 1.18, 0.1],
  [-0.36, 1.18, 0.1],
  [0.48, 0.95, 0.12],
  [-0.46, 0.95, 0.12],
]

function clonePose() {
  return REST_POSE.map(j => [...j])
}

function styleFromPrompt(prompt) {
  const p = String(prompt || '').toLowerCase()
  if (p.includes('wave')) return 'wave'
  if (p.includes('point')) return 'point'
  if (p.includes('count')) return 'count'
  if (p.includes('open') || p.includes('wide')) return 'open'
  if (p.includes('rest') || p.includes('neutral') || p.includes('relaxed')) return 'rest'
  if (p.includes('emphas') || p.includes('gestur') || p.includes('explain')) return 'emphasize'
  return 'emphasize'
}

/**
 * Same logic as motion-server/app.py — used when fetch fails or returns an error.
 * @returns {{ frames: number[][][], fps: number, mode: string }}
 */
export function generateProceduralMotion(prompt, numFrames = 80) {
  const style = styleFromPrompt(prompt)
  const frames = []
  const n = Math.max(8, Math.min(300, numFrames))
  for (let i = 0; i < n; i++) {
    const t = i / Math.max(n - 1, 1)
    frames.push(proceduralFrame(t, style))
  }
  return { frames, fps: 20, mode: `procedural-${style}-local` }
}

/** Retarget uses joint *directions*; small deltas read as invisible on Mixamo. Scale up for visible motion. */
const AMP = 3.2

function proceduralFrame(t, style) {
  const pose = clonePose()
  const phase = t * Math.PI * 2
  const breathe = 0.02 * Math.sin(phase * 2)
  pose[0][1] += breathe
  pose[3][1] += breathe * 0.8

  if (style === 'wave') {
    const w = 0.22 * AMP * Math.sin(phase * 3)
    pose[17][0] += 0.05 * AMP * Math.sin(phase * 3)
    pose[17][1] += 0.06 * AMP * Math.abs(Math.sin(phase * 3))
    pose[19][0] += w * 0.9
    pose[19][1] += 0.08 * AMP * Math.sin(phase * 3)
    pose[21][0] += w * 1.15
    pose[21][1] += 0.14 * AMP * Math.sin(phase * 3)
  } else if (style === 'point') {
    const k = (0.25 + 0.05 * Math.sin(phase)) * AMP
    pose[17][2] -= 0.08 * AMP
    pose[19][0] += k
    pose[19][1] -= 0.06 * AMP
    pose[19][2] -= 0.12 * AMP
    pose[21][0] += k * 1.15
    pose[21][1] -= 0.14 * AMP
    pose[21][2] -= 0.4 * AMP
  } else if (style === 'count') {
    const tap = 0.12 * AMP * Math.sin(phase * 5)
    pose[20][1] += tap
    pose[20][2] += tap * 0.5
    pose[18][1] += tap * 0.35
  } else if (style === 'open') {
    pose[16][0] += (0.2 + 0.05 * Math.sin(phase)) * AMP
    pose[17][0] -= (0.2 + 0.05 * Math.sin(phase)) * AMP
    pose[18][0] += 0.1 * AMP
    pose[19][0] -= 0.1 * AMP
    pose[20][1] += 0.08 * AMP * Math.sin(phase)
    pose[21][1] += 0.08 * AMP * Math.sin(phase)
  } else if (style === 'rest') {
    /* hold base */
  } else {
    pose[16][0] += 0.1 * AMP * Math.sin(phase * 2)
    pose[17][0] -= 0.1 * AMP * Math.sin(phase * 2)
    pose[18][1] += 0.08 * AMP * Math.sin(phase * 2)
    pose[19][1] += 0.08 * AMP * Math.sin(phase * 2)
    pose[20][0] += 0.07 * AMP * Math.sin(phase * 2.5)
    pose[21][0] -= 0.07 * AMP * Math.sin(phase * 2.5)
  }
  return pose
}

function isValidFrames(frames) {
  if (!Array.isArray(frames) || frames.length < 1) return false
  const f0 = frames[0]
  return Array.isArray(f0) && f0.length === 22 && Array.isArray(f0[0]) && f0[0].length === 3
}

/**
 * Ensure we always return usable HumanML3D-shaped frames (22×3 per frame).
 */
export function coerceMotionPayload(data, prompt, numFrames) {
  if (data && isValidFrames(data.frames)) {
    return data
  }
  console.warn('[motion] Bad or empty frames from server — using procedural clip')
  return generateProceduralMotion(prompt, numFrames)
}

/**
 * Request a motion clip from the local server, or generate the same motion in-process if unavailable.
 * @param {string} prompt
 * @param {number} numFrames
 * @returns {Promise<{ frames: number[][][], fps: number, mode: string }>}
 */
export async function requestMotion(prompt, numFrames = 80) {
  try {
    const res = await fetch('/api/motion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, num_frames: numFrames }),
    })
    if (res.ok) {
      const data = await res.json()
      return coerceMotionPayload(data, prompt, numFrames)
    }
    const text = await res.text().catch(() => '')
    console.warn('[motion] API returned', res.status, text.slice(0, 120), '— using in-browser procedural motion')
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn('[motion] Request failed — using in-browser procedural motion:', msg)
  }
  return generateProceduralMotion(prompt, numFrames)
}
