/**
 * motionApi.js — POST /api/motion → motion gateway (forwards to MDM_SERVICE_URL when configured).
 *
 * Production path: server returns real MDM (or forwarded) HumanML3D frames only.
 * Optional VITE_MOTION_CLIENT_STUB=true recreates legacy in-browser procedural motion when the API fails (dev only).
 */

/** Used when Agent 5 omits or shortens a prompt; still natural language for MDM. */
export const DEFAULT_TEACHING_MOTION_PROMPT =
  'a person stands naturally and gestures smoothly with their whole body while explaining an idea clearly to students'

/** Sample prompts for the MDM test panel — natural language only, no discrete labels. */
export const SAMPLE_MDM_TEST_PROMPTS = [
  { label: 'Greet', prompt: 'a person waves their right hand warmly and steps slightly toward the viewer' },
  { label: 'Point', prompt: 'a person raises their right arm and points forward with a steady teaching gesture' },
  { label: 'Walk', prompt: 'a person walks forward two steps with relaxed shoulders and light arm swing' },
  { label: 'Explain', prompt: 'a tutor shifts weight and opens both hands outward while emphasizing a key idea' },
  { label: 'Count', prompt: 'a person raises one hand in front of their chest and taps fingers rhythmically while counting' },
  { label: 'Jump', prompt: 'a person bends their knees slightly then jumps upward and lands softly with bent knees' },
]

const FALLBACK_REST_POSE = [
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
  [0.1, 1.48, 0.04],
  [-0.1, 1.48, 0.04],
  [0.0, 1.72, 0.02],
  [0.28, 1.42, 0.04],
  [-0.28, 1.42, 0.04],
  [0.46, 1.18, 0.06],
  [-0.46, 1.18, 0.06],
  [0.56, 0.95, 0.08],
  [-0.56, 0.95, 0.08],
]

let activeRestPose = FALLBACK_REST_POSE

export function setRigRestPose(pose) {
  if (Array.isArray(pose) && pose.length === 22 && Array.isArray(pose[0]) && pose[0].length === 3) {
    activeRestPose = pose.map((j) => [+j[0], +j[1], +j[2]])
    console.log('[motionApi] Active rest pose updated from rig')
  }
}

export function getActiveRestPose() {
  return activeRestPose
}

function clonePose() {
  return activeRestPose.map((j) => [...j])
}

function styleFromPromptDevStub(prompt) {
  const p = String(prompt || '').toLowerCase()
  if (p.includes('jump') || p.includes('leap') || p.includes('hop')) return 'jump'
  if (p.includes('wave')) return 'wave'
  if (p.includes('point')) return 'point'
  if (p.includes('count')) return 'count'
  if (p.includes('walk') || p.includes('step') || p.includes('stride')) return 'walk'
  if (p.includes('rest') || p.includes('neutral') || p.includes('relaxed')) return 'rest'
  return 'emphasize'
}

function proceduralFrame(t, style) {
  const pose = clonePose()
  const phase = t * Math.PI * 2
  const breathe = 0.012 * Math.sin(phase * 2)
  pose[0][1] += breathe
  pose[3][1] += breathe * 0.6

  if (style === 'wave') {
    const wave = Math.sin(phase * 3)
    pose[17][0] -= 0.06
    pose[17][1] += 0.14
    pose[19][0] += 0.1
    pose[19][1] += 0.5
    pose[19][2] -= 0.04
    pose[21][0] += 0.2 + 0.12 * wave
    pose[21][1] += 0.8 + 0.08 * wave
    pose[21][2] -= 0.04 + 0.06 * Math.sin(phase * 3 - 0.4)
  } else if (style === 'point') {
    const bob = Math.sin(phase) * 0.04
    pose[17][0] -= 0.04
    pose[17][1] += 0.1
    pose[19][0] -= 0.1
    pose[19][1] += 0.15 + bob
    pose[19][2] -= 0.18
    pose[21][0] -= 0.06
    pose[21][1] += 0.12 + bob
    pose[21][2] -= 0.45
  } else if (style === 'count') {
    const tap = Math.sin(phase * 4)
    pose[17][0] -= 0.04
    pose[17][1] += 0.1
    pose[19][0] -= 0.08
    pose[19][1] += 0.2 + 0.06 * tap
    pose[19][2] -= 0.12
    pose[21][0] -= 0.04
    pose[21][1] += 0.18 + 0.1 * tap
    pose[21][2] -= 0.2
  } else if (style === 'walk') {
    const stride = Math.sin(phase * 2)
    const arm = Math.sin(phase * 2 + Math.PI)
    pose[1][2] += stride * 0.18
    pose[4][2] += stride * 0.22
    pose[7][2] += stride * 0.12
    pose[2][2] -= stride * 0.18
    pose[5][2] -= stride * 0.22
    pose[8][2] -= stride * 0.12
    pose[0][0] += Math.sin(phase * 4) * 0.02
    pose[0][1] += Math.abs(Math.sin(phase * 2)) * 0.03
    pose[16][1] += 0.04
    pose[16][2] += arm * 0.12
    pose[18][1] += 0.03
    pose[18][2] += arm * 0.16
    pose[20][2] += arm * 0.18
    pose[17][1] += 0.04
    pose[17][2] -= arm * 0.12
    pose[19][1] += 0.03
    pose[19][2] -= arm * 0.16
    pose[21][2] -= arm * 0.18
  } else if (style === 'jump') {
    const jumpCycle = (t * 2) % 1
    if (jumpCycle < 0.2) {
      const c = jumpCycle / 0.2
      const dip = 0.1 * Math.sin(c * Math.PI)
      pose[0][1] -= dip
      pose[4][2] += dip * 2.0
      pose[5][2] += dip * 2.0
    } else if (jumpCycle < 0.5) {
      const a = (jumpCycle - 0.2) / 0.3
      const lift = 0.2 * Math.sin(a * Math.PI)
      for (let j = 0; j < pose.length; j++) pose[j][1] += lift
      const arm = Math.sin(a * Math.PI) * 0.12
      pose[16][1] += arm
      pose[17][1] += arm
      pose[18][1] += arm * 0.7
      pose[19][1] += arm * 0.7
    } else if (jumpCycle < 0.66) {
      const l = (jumpCycle - 0.5) / 0.16
      const impact = 0.08 * Math.sin(l * Math.PI)
      pose[0][1] -= impact
      pose[4][2] += impact * 1.8
      pose[5][2] += impact * 1.8
    }
  } else if (style === 'rest') {
    /* hold */
  } else {
    const s = Math.sin(phase * 2)
    pose[16][0] += 0.08 * Math.abs(s)
    pose[16][1] += 0.06 * s
    pose[18][0] += 0.1 * Math.abs(s)
    pose[18][1] += 0.1 * s
    pose[20][0] += 0.12 * Math.abs(s)
    pose[20][1] += 0.14 * s
    pose[17][0] -= 0.08 * Math.abs(s)
    pose[17][1] += 0.06 * s
    pose[19][0] -= 0.1 * Math.abs(s)
    pose[19][1] += 0.1 * s
    pose[21][0] -= 0.12 * Math.abs(s)
    pose[21][1] += 0.14 * s
  }
  return pose
}

/** Dev-only: mirrors MOTION_DEV_STUB keyword routing; not MDM output. */
export function generateProceduralMotion(prompt, numFrames = 80) {
  const style = styleFromPromptDevStub(prompt)
  const frames = []
  const n = Math.max(8, Math.min(300, numFrames))
  for (let i = 0; i < n; i++) {
    const t = i / Math.max(n - 1, 1)
    frames.push(proceduralFrame(t, style))
  }
  return { frames, fps: 20, mode: `client-dev-stub-${style}` }
}

/** Hold rest pose — used when MDM fails so the rig does not snap to garbage. */
export function restHoldFrames(numFrames = 80) {
  const pose = getActiveRestPose().map((j) => [...j])
  const n = Math.max(8, Math.min(300, numFrames))
  const frames = []
  for (let i = 0; i < n; i++) {
    frames.push(pose.map((j) => [...j]))
  }
  return { frames, fps: 20, mode: 'rest-hold' }
}

function isValidFrames(frames) {
  if (!Array.isArray(frames) || frames.length < 1) return false
  const f0 = frames[0]
  return Array.isArray(f0) && f0.length === 22 && Array.isArray(f0[0]) && f0[0].length === 3
}

function parseMotionJson(data) {
  if (!data || !isValidFrames(data.frames)) return null
  return {
    frames: data.frames,
    fps: typeof data.fps === 'number' && data.fps > 0 ? data.fps : 20,
    mode: typeof data.mode === 'string' ? data.mode : 'mdm',
  }
}

const clientStub =
  typeof import.meta !== 'undefined' && import.meta.env?.VITE_MOTION_CLIENT_STUB === 'true'

/**
 * Fetch motion from the gateway. Throws if the response is not valid MDM-shaped data,
 * unless VITE_MOTION_CLIENT_STUB=true (then falls back to local procedural).
 */
export async function requestMotion(prompt, numFrames = 80) {
  try {
    const res = await fetch('/api/motion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, num_frames: numFrames }),
    })
    const text = await res.text().catch(() => '')
    let data = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = null
    }
    if (res.ok) {
      const parsed = parseMotionJson(data)
      if (parsed) return parsed
      throw new Error('Motion API returned OK but frames were invalid')
    }
    const detail = data?.detail != null ? JSON.stringify(data.detail) : text.slice(0, 200)
    throw new Error(`Motion API ${res.status}: ${detail}`)
  } catch (e) {
    if (clientStub) {
      console.warn('[motion] API error — VITE_MOTION_CLIENT_STUB using local procedural:', e)
      return generateProceduralMotion(prompt, numFrames)
    }
    throw e instanceof Error ? e : new Error(String(e))
  }
}
