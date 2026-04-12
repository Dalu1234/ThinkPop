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

/**
 * HumanML3D joint order — must match motion-server/app.py and src/lib/retarget.js.
 *
 * Joint map:
 *   0  pelvis      1  left_hip     2  right_hip    3  spine1
 *   4  left_knee   5  right_knee   6  spine2       7  left_ankle
 *   8  right_ankle 9  spine3      10  left_foot   11  right_foot
 *  12  neck       13  left_collar 14  right_collar 15  head
 *  16  left_shoulder  17  right_shoulder
 *  18  left_elbow     19  right_elbow
 *  20  left_wrist     21  right_wrist
 *
 * IMPORTANT: The retargeter works on parent→child *directions*, so arms must
 * stay OUTWARD from the body.  Left side = positive X, right side = negative X.
 */
const REST_POSE = [
  [ 0.00, 0.94, 0.00],  //  0 pelvis
  [ 0.09, 0.86, 0.02],  //  1 left_hip
  [-0.09, 0.86, 0.02],  //  2 right_hip
  [ 0.00, 1.05, 0.02],  //  3 spine1
  [ 0.09, 0.50, 0.04],  //  4 left_knee
  [-0.09, 0.50, 0.04],  //  5 right_knee
  [ 0.00, 1.20, 0.02],  //  6 spine2
  [ 0.09, 0.10, 0.06],  //  7 left_ankle
  [-0.09, 0.10, 0.06],  //  8 right_ankle
  [ 0.00, 1.40, 0.02],  //  9 spine3
  [ 0.11, 0.02, 0.08],  // 10 left_foot
  [-0.11, 0.02, 0.08],  // 11 right_foot
  [ 0.00, 1.55, 0.02],  // 12 neck
  [ 0.10, 1.48, 0.04],  // 13 left_collar
  [-0.10, 1.48, 0.04],  // 14 right_collar
  [ 0.00, 1.72, 0.02],  // 15 head
  [ 0.28, 1.42, 0.04],  // 16 left_shoulder
  [-0.28, 1.42, 0.04],  // 17 right_shoulder
  [ 0.46, 1.18, 0.06],  // 18 left_elbow
  [-0.46, 1.18, 0.06],  // 19 right_elbow
  [ 0.56, 0.95, 0.08],  // 20 left_wrist
  [-0.56, 0.95, 0.08],  // 21 right_wrist
]

function clonePose() {
  return REST_POSE.map(j => [...j])
}

function styleFromPrompt(prompt) {
  const p = String(prompt || '').toLowerCase()
  if (p.includes('jump') || p.includes('leap') || p.includes('hop')) return 'jump'
  if (p.includes('wave')) return 'wave'
  if (p.includes('point')) return 'point'
  if (p.includes('count')) return 'count'
  if (p.includes('open') || p.includes('wide')) return 'open'
  if (p.includes('rest') || p.includes('neutral') || p.includes('relaxed')) return 'rest'
  if (p.includes('emphas') || p.includes('gestur') || p.includes('explain')) return 'emphasize'
  return 'emphasize'
}

/**
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

/**
 * Build one frame.  All arm offsets push joints AWAY from the body midline
 * (left = +X, right = −X) so parent→child directions always point outward
 * and the retargeter can never invert an arm into the torso.
 */
function proceduralFrame(t, style) {
  const pose = clonePose()
  const phase = t * Math.PI * 2

  // Subtle breathing on pelvis + spine
  const breathe = 0.012 * Math.sin(phase * 2)
  pose[0][1] += breathe
  pose[3][1] += breathe * 0.6

  if (style === 'wave') {
    // Raise the right arm HIGH so bone directions point upward, then wave the wrist.
    //
    // Rest positions — collar(14)=[-0.10, 1.48], shoulder(17)=[-0.28, 1.42],
    //   elbow(19)=[-0.46, 1.18], wrist(21)=[-0.56, 0.95]
    //
    // We SET absolute positions (not += offsets) so the chain clearly goes UP:
    //   collar → shoulder: outward + up  (upper arm raised)
    //   shoulder → elbow:  slightly inward + up  (forearm vertical)
    //   elbow → wrist:  oscillates side-to-side  (the wave)
    const wave = Math.sin(phase * 3)
    // Shoulder: out and ABOVE collar
    pose[17][0] = -0.34
    pose[17][1] = 1.58
    pose[17][2] = 0.02
    // Elbow: above shoulder, slightly inward (arm bends upward)
    pose[19][0] = -0.38
    pose[19][1] = 1.82
    pose[19][2] = 0.0
    // Wrist: highest point, waves side-to-side
    pose[21][0] = -0.32 + 0.12 * wave
    pose[21][1] = 2.02 + 0.06 * wave
    pose[21][2] = -0.02 + 0.06 * Math.sin(phase * 3 - 0.4)

  } else if (style === 'point') {
    // Right arm extends forward + slightly outward
    const bob = Math.sin(phase) * 0.04
    pose[17][0] -= 0.04                             // shoulder slightly outward
    pose[17][1] += 0.10                             // shoulder raised
    pose[19][0] -= 0.10                             // elbow outward
    pose[19][1] += 0.15 + bob                       // elbow raised
    pose[19][2] -= 0.18                             // elbow forward
    pose[21][0] -= 0.06                             // wrist outward
    pose[21][1] += 0.12 + bob                       // wrist slightly raised
    pose[21][2] -= 0.45                             // wrist far forward

  } else if (style === 'count') {
    // Right hand taps in front
    const tap = Math.sin(phase * 4)
    pose[17][0] -= 0.04                             // R shoulder out
    pose[17][1] += 0.10                             // R shoulder up
    pose[19][0] -= 0.08                             // R elbow out
    pose[19][1] += 0.20 + 0.06 * tap               // R elbow bobs
    pose[19][2] -= 0.12                             // R elbow forward
    pose[21][0] -= 0.04                             // R wrist out
    pose[21][1] += 0.18 + 0.10 * tap               // R wrist taps
    pose[21][2] -= 0.20                             // R wrist forward

  } else if (style === 'open') {
    // Both arms spread wide outward
    const sway = Math.sin(phase) * 0.06
    // Left arm (+X = outward)
    pose[16][0] += 0.15 + sway
    pose[16][1] += 0.10
    pose[18][0] += 0.22 + sway
    pose[18][1] += 0.12
    pose[20][0] += 0.28 + sway
    pose[20][1] += 0.08 + sway * 0.5
    // Right arm (−X = outward)
    pose[17][0] -= 0.15 + sway
    pose[17][1] += 0.10
    pose[19][0] -= 0.22 + sway
    pose[19][1] += 0.12
    pose[21][0] -= 0.28 + sway
    pose[21][1] += 0.08 + sway * 0.5

  } else if (style === 'jump') {
    const jumpCycle = (t * 2) % 1
    if (jumpCycle < 0.20) {
      const c = jumpCycle / 0.20
      const dip = 0.10 * Math.sin(c * Math.PI)
      pose[0][1] -= dip
      pose[4][2] += dip * 2.0
      pose[5][2] += dip * 2.0
    } else if (jumpCycle < 0.50) {
      const a = (jumpCycle - 0.20) / 0.30
      const lift = 0.20 * Math.sin(a * Math.PI)
      for (let j = 0; j < pose.length; j++) pose[j][1] += lift
      const arm = Math.sin(a * Math.PI) * 0.12
      pose[16][1] += arm
      pose[17][1] += arm
      pose[18][1] += arm * 0.7
      pose[19][1] += arm * 0.7
    } else if (jumpCycle < 0.66) {
      const l = (jumpCycle - 0.50) / 0.16
      const impact = 0.08 * Math.sin(l * Math.PI)
      pose[0][1] -= impact
      pose[4][2] += impact * 1.8
      pose[5][2] += impact * 1.8
    }

  } else if (style === 'rest') {
    /* hold base pose */

  } else {
    // emphasize — both arms gesture expressively, always outward
    const s = Math.sin(phase * 2)
    // Left (+X = outward)
    pose[16][0] += 0.08 * Math.abs(s)
    pose[16][1] += 0.06 * s
    pose[18][0] += 0.10 * Math.abs(s)
    pose[18][1] += 0.10 * s
    pose[20][0] += 0.12 * Math.abs(s)
    pose[20][1] += 0.14 * s
    // Right (−X = outward)
    pose[17][0] -= 0.08 * Math.abs(s)
    pose[17][1] += 0.06 * s
    pose[19][0] -= 0.10 * Math.abs(s)
    pose[19][1] += 0.10 * s
    pose[21][0] -= 0.12 * Math.abs(s)
    pose[21][1] += 0.14 * s
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
