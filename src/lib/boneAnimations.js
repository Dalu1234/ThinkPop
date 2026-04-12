/**
 * boneAnimations.js — Direct Mixamo bone animations for video demo.
 *
 * Bypasses the HumanML3D retargeter entirely. Uses two approaches:
 * 1. rotBone(): Euler angles applied on top of rest quaternions (procedural anims)
 * 2. setBoneQuats(): Baked quaternions sampled from real Mixamo FBX clips (ground truth)
 */

import * as THREE from 'three'

const _q = new THREE.Quaternion()
const _q2 = new THREE.Quaternion()
const _euler = new THREE.Euler()
const _axis = new THREE.Vector3()

// ─── Baked quaternions sampled from Mixamo FBX clips ────────────────────────
// Sampled via: node scripts/sample-fbx-quats.mjs public/assets/Pointing.fbx
// Frame at 50% of "Pointing" animation (right-hand forward point)

const POINT_QUATS = {
  'mixamorigHips': [0.003443, -0.000568, -0.01463, 0.999887],
  'mixamorigSpine': [-0.002915, 0.016774, 0.001481, 0.999854],
  'mixamorigSpine1': [-0.013732, 0.013337, 0.000837, 0.999816],
  'mixamorigSpine2': [-0.013786, 0.013302, 0.000454, 0.999816],
  'mixamorigNeck': [-0.070964, -0.00296, 0.001427, 0.997473],
  'mixamorigHead': [0.028279, -0.014477, 0.01847, 0.999325],
  'mixamorigLeftShoulder': [0.511599, 0.460572, -0.593455, 0.417075],
  'mixamorigLeftArm': [0.313565, 0.472977, 0.444614, 0.693029],
  'mixamorigLeftForeArm': [-0.002037, 0.000013, 0.155511, 0.987832],
  'mixamorigLeftHand': [-0.006593, 0.014137, -0.053335, 0.998455],
  'mixamorigRightShoulder': [0.602901, -0.422796, 0.521171, 0.431433],
  'mixamorigRightArm': [0.115555, 0.09791, -0.505322, 0.849535],
  'mixamorigRightForeArm': [-0.006065, -0.000064, -0.45397, 0.890996],
  'mixamorigRightHand': [-0.125024, 0.139, 0.197046, 0.962404],
  'mixamorigRightHandIndex1': [-0.022825, -0.145902, -0.03061, 0.988562],
  'mixamorigLeftUpLeg': [-0.092527, -0.110397, -0.984879, 0.096255],
  'mixamorigLeftLeg': [-0.205734, -0.05611, 0.067484, 0.974665],
  'mixamorigLeftFoot': [0.426858, -0.058039, -0.016928, 0.902296],
  'mixamorigRightUpLeg': [-0.207795, 0.063778, 0.975582, 0.031518],
  'mixamorigRightLeg': [-0.193992, -0.065523, -0.058026, 0.977091],
  'mixamorigRightFoot': [0.47662, 0.045007, -0.031003, 0.877409],
}

// Mirrored version: left-hand pointing left (delta-mirrored from right-hand pose)
const POINT_LEFT_QUATS = {
  'mixamorigHips': [0.001738, -0.115285, -0.007823, 0.9933],
  'mixamorigSpine': [-0.00251, -0.03367, 0.021028, 0.999209],
  'mixamorigSpine1': [-0.013506, -0.025849, 0.014947, 0.999463],
  'mixamorigSpine2': [-0.013561, -0.025109, 0.015685, 0.99947],
  'mixamorigNeck': [-0.070849, 0.033511, -0.0305, 0.996457],
  'mixamorigHead': [0.026161, 0.126831, -0.031733, 0.991071],
  'mixamorigLeftShoulder': [0.515696, 0.422146, -0.65273, 0.36027],
  'mixamorigLeftArm': [0.100894, 0.134721, 0.70547, 0.688464],
  'mixamorigLeftForeArm': [-0.006269, -0.000007, 0.471936, 0.88161],
  'mixamorigLeftHand': [-0.247121, -0.060344, -0.228822, 0.939644],
  'mixamorigLeftHandIndex1': [0.011728, -0.013645, 0.06321, 0.997838],
  'mixamorigRightShoulder': [0.590377, -0.448626, 0.458212, 0.490134],
  'mixamorigRightArm': [0.449154, -0.19459, -0.335388, 0.804929],
  'mixamorigRightForeArm': [-0.001826, -0.000067, -0.135457, 0.990782],
  'mixamorigRightHand': [0.097828, 0.073552, -0.009854, 0.992433],
  'mixamorigRightHandIndex1': [0.165605, -0.138936, -0.039306, 0.975565],
  'mixamorigLeftUpLeg': [-0.140823, -0.069558, -0.98511, 0.069915],
  'mixamorigLeftLeg': [-0.209573, -0.101624, 0.087342, 0.968567],
  'mixamorigLeftFoot': [0.453884, -0.087656, -0.010195, 0.88668],
  'mixamorigRightUpLeg': [-0.161505, 0.104838, 0.979409, 0.060688],
  'mixamorigRightLeg': [-0.190464, -0.111202, -0.037708, 0.974646],
  'mixamorigRightFoot': [0.448146, 0.016587, -0.026302, 0.893419],
}

/**
 * Slerp all bones from their rest quaternion toward baked target quaternions.
 * @param {number} blend 0→rest, 1→full baked pose
 */
function setBoneQuats(boneMap, restQuats, bakedQuats, blend) {
  for (const [name, arr] of Object.entries(bakedQuats)) {
    const bone = boneMap[name]
    if (!bone) continue
    const rq = restQuats[name]
    if (!rq) continue
    _q.set(arr[0], arr[1], arr[2], arr[3])
    if (blend >= 0.999) {
      bone.quaternion.copy(_q)
    } else {
      bone.quaternion.copy(rq).slerp(_q, blend)
    }
  }
}

/** Find a bone from the map, trying canonical then alternate prefix. */
function getBone(boneMap, name) {
  return boneMap[name] || null
}

/**
 * Set a bone's rotation as Euler angles applied ON TOP of its rest pose.
 * restQuats stores the original bind-pose quaternion for each bone.
 */
function rotBone(boneMap, restQuats, name, rx, ry, rz) {
  const b = getBone(boneMap, name)
  if (!b) return
  const rq = restQuats[name]
  if (!rq) {
    _euler.set(rx, ry, rz, 'XYZ')
    b.quaternion.setFromEuler(_euler)
    return
  }
  _euler.set(rx, ry, rz, 'XYZ')
  _q.setFromEuler(_euler)
  _q2.copy(rq).multiply(_q)
  b.quaternion.copy(_q2)
}


function lerp(a, b, t) { return a + (b - a) * t }
function sin(t) { return Math.sin(t) }
function cos(t) { return Math.cos(t) }
const DEG = Math.PI / 180
function smoothstep(t) { const c = Math.min(Math.max(t, 0), 1); return c * c * (3 - 2 * c) }

// ─── Shared subtle motion layer ────────────────────────────────────────────
function applyBreathing(B, R, t) {
  const breath = sin(t * 1.8) * 0.008
  const sway = sin(t * 0.7) * 0.012
  rotBone(B, R, 'mixamorig:Spine', breath + 2 * DEG, sway, 0)
  rotBone(B, R, 'mixamorig:Spine1', breath * 0.7 + 1 * DEG, sway * 0.5, 0)
  rotBone(B, R, 'mixamorig:Spine2', breath * 0.4, sway * 0.3, 0)
  rotBone(B, R, 'mixamorig:Neck', -8 * DEG + sin(t * 0.9) * 1 * DEG, sin(t * 0.6) * 1.5 * DEG, 0)
  rotBone(B, R, 'mixamorig:Head', -5 * DEG + sin(t * 1.1) * 0.8 * DEG, sin(t * 0.5) * 1 * DEG, 0)
}

function applyIdleLegs(B, R, t) {
  const shift = sin(t * 0.5) * 1.5 * DEG
  rotBone(B, R, 'mixamorig:LeftUpLeg', shift, 0, 2 * DEG)
  rotBone(B, R, 'mixamorig:RightUpLeg', -shift, 0, -2 * DEG)
  rotBone(B, R, 'mixamorig:LeftLeg', 3 * DEG, 0, 0)
  rotBone(B, R, 'mixamorig:RightLeg', 3 * DEG, 0, 0)
}

/**
 * Full-body standing idle: layered breathing, slow weight transfer, relaxed tutor arms,
 * and incommensurate sines on head/hands so motion stays organic (not one metronome).
 */
function applyIdlePose(B, R, t) {
  const breath = t * 1.32
  const inhale = sin(breath)
  const rib = sin(breath * 2 + 0.6) * 0.4

  const weight = t * 0.38
  const sway = t * 0.29
  const lean = sin(weight)
  const lean2 = sin(sway + 1.7)

  const chest = inhale * 0.018 + rib * 0.006
  const lateral = lean * 0.014 + lean2 * 0.008
  const roll = sin(weight * 0.85) * 0.9 * DEG

  rotBone(B, R, 'mixamorig:Hips', lean2 * 1.1 * DEG, lean * 1.8 * DEG, lean * 1.1 * DEG)

  rotBone(B, R, 'mixamorig:Spine', chest + 2.2 * DEG, lateral, roll * 0.35)
  rotBone(B, R, 'mixamorig:Spine1', chest * 0.72 + 1.1 * DEG + rib * 0.004, lateral * 0.62, roll * 0.25)
  rotBone(B, R, 'mixamorig:Spine2', chest * 0.48 + rib * 0.003, lateral * 0.38, roll * 0.18)

  const stance = lean * 2.8 * DEG
  rotBone(B, R, 'mixamorig:LeftUpLeg', stance * 0.45 + sin(t * 0.41) * 0.6 * DEG, 0, 2 * DEG)
  rotBone(B, R, 'mixamorig:RightUpLeg', -stance * 0.45 - sin(t * 0.39) * 0.6 * DEG, 0, -2 * DEG)
  rotBone(B, R, 'mixamorig:LeftLeg', 2.8 * DEG + stance * 0.25, 0, 0)
  rotBone(B, R, 'mixamorig:RightLeg', 2.8 * DEG - stance * 0.25, 0, 0)
  rotBone(B, R, 'mixamorig:LeftFoot', sin(t * 0.48) * 0.35 * DEG, 0, 0)
  rotBone(B, R, 'mixamorig:RightFoot', sin(t * 0.51 + 2.1) * 0.35 * DEG, 0, 0)

  const sh = sin(sway * 1.2) * 1.8 * DEG
  rotBone(B, R, 'mixamorig:LeftShoulder', sin(weight + 0.4) * 1.2 * DEG, sin(weight) * 1.4 * DEG, sh)
  rotBone(B, R, 'mixamorig:RightShoulder', sin(weight + 1.1) * 1.2 * DEG, sin(weight + 0.8) * 1.4 * DEG, -sh)

  const armS = sin(t * 0.52) * 1.8 * DEG
  rotBone(B, R, 'mixamorig:LeftArm', -2.5 * DEG + sin(sway) * 1.8 * DEG, 3.5 * DEG + armS, 11 * DEG + sin(t * 0.61) * 2.5 * DEG)
  rotBone(B, R, 'mixamorig:LeftForeArm', sin(t * 0.86) * 1.5 * DEG, 0, 9 * DEG + sin(t * 0.71) * 1.8 * DEG)
  rotBone(B, R, 'mixamorig:RightArm', -2.5 * DEG + sin(sway + 0.9) * 1.8 * DEG, -3.5 * DEG - armS, -11 * DEG - sin(t * 0.59) * 2.5 * DEG)
  rotBone(B, R, 'mixamorig:RightForeArm', sin(t * 0.84) * 1.5 * DEG, 0, -9 * DEG - sin(t * 0.69) * 1.8 * DEG)

  rotBone(B, R, 'mixamorig:LeftHand', sin(t * 0.63) * 1.8 * DEG, sin(t * 0.55) * 1.2 * DEG, sin(t * 0.47) * 0.8 * DEG)
  rotBone(B, R, 'mixamorig:RightHand', sin(t * 0.61) * 1.8 * DEG, sin(t * 0.57) * 1.2 * DEG, sin(t * 0.49) * 0.8 * DEG)

  rotBone(B, R, 'mixamorig:Neck', -7 * DEG + inhale * 1.1 * DEG, sin(t * 0.74) * 1.6 * DEG, lean * 0.7 * DEG)
  rotBone(B, R, 'mixamorig:Head', -4 * DEG + sin(t * 0.31) * 1.8 * DEG, sin(t * 0.27) * 2.2 * DEG, sin(t * 0.23) * 1 * DEG)
}

// ─── Animations ────────────────────────────────────────────────────────────

function idle(B, R, t) {
  applyIdlePose(B, R, t)
}

function wave(B, R, t) {
  applyBreathing(B, R, t)
  applyIdleLegs(B, R, t)

  const sway = sin(t * 0.8) * 2 * DEG
  rotBone(B, R, 'mixamorig:LeftArm', 0, 0, 15 * DEG + sway)
  rotBone(B, R, 'mixamorig:LeftForeArm', 0, 0, 8 * DEG)

  const ease = smoothstep(Math.min(t * 2, 1))
  const waveOsc = sin(t * 4.5) * 25 * DEG
  rotBone(B, R, 'mixamorig:RightShoulder', 0, 0, ease * -8 * DEG)
  rotBone(B, R, 'mixamorig:RightArm', ease * -15 * DEG, 0, ease * -120 * DEG)
  rotBone(B, R, 'mixamorig:RightForeArm', 0, ease * waveOsc * 0.5, -45 * DEG * ease + waveOsc)
  rotBone(B, R, 'mixamorig:RightHand', 0, waveOsc * 0.4, 0)

  rotBone(B, R, 'mixamorig:Head', -5 * DEG, ease * -8 * DEG + sin(t * 0.5) * 1 * DEG, ease * 5 * DEG)
}

function explain(B, R, t) {
  applyBreathing(B, R, t)
  applyIdleLegs(B, R, t)

  const cycle = t * 1.2
  const gesture = sin(cycle * Math.PI * 2)
  const ga = Math.abs(gesture)

  const spread = 35 + ga * 25
  const bend = 25 + gesture * 15
  const fwd = -20 - ga * 10

  rotBone(B, R, 'mixamorig:LeftShoulder', 0, 0, 5 * DEG * ga)
  rotBone(B, R, 'mixamorig:LeftArm', fwd * DEG, 0, spread * DEG)
  rotBone(B, R, 'mixamorig:LeftForeArm', -10 * DEG * ga, 0, bend * DEG)
  rotBone(B, R, 'mixamorig:LeftHand', 0, gesture * 10 * DEG, 10 * DEG)

  rotBone(B, R, 'mixamorig:RightShoulder', 0, 0, -5 * DEG * ga)
  rotBone(B, R, 'mixamorig:RightArm', fwd * DEG, 0, -spread * DEG)
  rotBone(B, R, 'mixamorig:RightForeArm', -10 * DEG * ga, 0, -bend * DEG)
  rotBone(B, R, 'mixamorig:RightHand', 0, -gesture * 10 * DEG, -10 * DEG)

  rotBone(B, R, 'mixamorig:Head', -5 * DEG + gesture * 3 * DEG, gesture * 5 * DEG, -gesture * 2 * DEG)
}

function point(B, R, t) {
  const ease = smoothstep(Math.min(t * 2.5, 1))
  setBoneQuats(B, R, POINT_QUATS, ease)
}

function think(B, R, t) {
  applyBreathing(B, R, t)
  applyIdleLegs(B, R, t)

  rotBone(B, R, 'mixamorig:LeftArm', 0, 0, 15 * DEG + sin(t * 0.8) * 2 * DEG)
  rotBone(B, R, 'mixamorig:LeftForeArm', 0, 0, 8 * DEG)

  const ease = smoothstep(Math.min(t * 2, 1))
  rotBone(B, R, 'mixamorig:RightShoulder', 0, 0, ease * -8 * DEG)
  rotBone(B, R, 'mixamorig:RightArm', ease * -55 * DEG, ease * 30 * DEG, ease * -50 * DEG)
  rotBone(B, R, 'mixamorig:RightForeArm', ease * 15 * DEG, 0, ease * -95 * DEG)
  rotBone(B, R, 'mixamorig:RightHand', ease * 10 * DEG, 0, ease * 5 * DEG)

  const headBob = sin(t * 0.6) * 2 * DEG
  rotBone(B, R, 'mixamorig:Head', -5 * DEG + ease * -5 * DEG + headBob, ease * 10 * DEG + sin(t * 0.4) * 3 * DEG, ease * 8 * DEG)
}

function celebrate(B, R, t, opts) {
  const hips = getBone(B, 'mixamorig:Hips')
  const rest = opts?.hipsRestPos
  // Continuous vertical hop: peaks line up with arm pump
  const phase = t * 6.5
  const hop = Math.abs(sin(phase))
  const air = hop * hop
  if (hips && rest) {
    hips.position.copy(rest)
    hips.position.y += air * 28
  }

  // Light spine counter so the jump reads in the torso
  rotBone(B, R, 'mixamorig:Spine', air * 4 * DEG, sin(t * 3) * 2 * DEG, 0)
  rotBone(B, R, 'mixamorig:Spine1', air * 2 * DEG, 0, 0)

  const legB = (1 - air) * 12 * DEG
  rotBone(B, R, 'mixamorig:LeftUpLeg', legB * 0.4, 0, 2 * DEG)
  rotBone(B, R, 'mixamorig:RightUpLeg', legB * 0.4, 0, -2 * DEG)
  rotBone(B, R, 'mixamorig:LeftLeg', legB * 0.8, 0, 0)
  rotBone(B, R, 'mixamorig:RightLeg', legB * 0.8, 0, 0)

  const pump = sin(phase)
  const raise = -100 - pump * 22

  rotBone(B, R, 'mixamorig:LeftShoulder', 0, 0, 10 * DEG)
  rotBone(B, R, 'mixamorig:LeftArm', -12 * DEG, 0, -raise * DEG)
  rotBone(B, R, 'mixamorig:LeftForeArm', 0, 0, (42 + pump * 18) * DEG)

  rotBone(B, R, 'mixamorig:RightShoulder', 0, 0, -10 * DEG)
  rotBone(B, R, 'mixamorig:RightArm', -12 * DEG, 0, raise * DEG)
  rotBone(B, R, 'mixamorig:RightForeArm', 0, 0, -(42 + pump * 18) * DEG)

  rotBone(B, R, 'mixamorig:Neck', air * -3 * DEG, 0, 0)
  rotBone(B, R, 'mixamorig:Head', -5 * DEG + air * 5 * DEG + pump * 4 * DEG, sin(t * 1.8) * 6 * DEG, 0)
}

function walk(B, R, t) {
  applyBreathing(B, R, t)

  const stride = sin(t * 3.0)
  const sa = Math.abs(stride)

  rotBone(B, R, 'mixamorig:Spine', 2 * DEG, stride * 3 * DEG, 0)

  rotBone(B, R, 'mixamorig:LeftUpLeg', stride * 25 * DEG, 0, 2 * DEG)
  rotBone(B, R, 'mixamorig:LeftLeg', Math.max(0, -stride) * 35 * DEG + 5 * DEG, 0, 0)
  rotBone(B, R, 'mixamorig:RightUpLeg', -stride * 25 * DEG, 0, -2 * DEG)
  rotBone(B, R, 'mixamorig:RightLeg', Math.max(0, stride) * 35 * DEG + 5 * DEG, 0, 0)

  rotBone(B, R, 'mixamorig:LeftArm', stride * 20 * DEG, 0, 15 * DEG)
  rotBone(B, R, 'mixamorig:LeftForeArm', 0, 0, (15 + sa * 10) * DEG)
  rotBone(B, R, 'mixamorig:RightArm', -stride * 20 * DEG, 0, -15 * DEG)
  rotBone(B, R, 'mixamorig:RightForeArm', 0, 0, -(15 + sa * 10) * DEG)

  rotBone(B, R, 'mixamorig:Head', -5 * DEG, -stride * 2 * DEG, 0)
}

function pointLeft(B, R, t) {
  const ease = smoothstep(Math.min(t * 2.5, 1))
  setBoneQuats(B, R, POINT_LEFT_QUATS, ease)
}

/** Left-arm sweep toward the viz area + slight body turn — "look over here" gesture. */
function present(B, R, t) {
  applyBreathing(B, R, t)
  applyIdleLegs(B, R, t)

  const ease = smoothstep(Math.min(t * 3, 1))
  const hold = sin(t * 1.0) * 2 * DEG * ease

  rotBone(B, R, 'mixamorig:Spine', 2 * DEG, ease * 12 * DEG, 0)
  rotBone(B, R, 'mixamorig:Spine1', 1 * DEG, ease * 6 * DEG, 0)

  rotBone(B, R, 'mixamorig:LeftShoulder', 0, 0, ease * 12 * DEG)
  rotBone(B, R, 'mixamorig:LeftArm', ease * -60 * DEG + hold, ease * 20 * DEG, ease * 55 * DEG)
  rotBone(B, R, 'mixamorig:LeftForeArm', ease * -8 * DEG, 0, ease * 15 * DEG)
  rotBone(B, R, 'mixamorig:LeftHand', 0, ease * 15 * DEG, ease * -20 * DEG)

  rotBone(B, R, 'mixamorig:RightArm', 0, 0, -15 * DEG + sin(t * 0.8) * 2 * DEG)
  rotBone(B, R, 'mixamorig:RightForeArm', 0, 0, -8 * DEG)

  rotBone(B, R, 'mixamorig:Head', -5 * DEG + hold, ease * 10 * DEG, ease * -3 * DEG)
}

// ─── Registry ──────────────────────────────────────────────────────────────

const ANIMATIONS = { idle, wave, explain, point, pointLeft, think, celebrate, walk, present }

export const ANIMATION_NAMES = Object.keys(ANIMATIONS)

/**
 * @param {{ hipsRestPos?: THREE.Vector3 }} opts — hipsRestPos resets root Y each frame (needed for jump)
 */
export function applyBoneAnimation(boneMap, restQuats, name, time, opts = {}) {
  const fn = ANIMATIONS[name] || idle

  for (const [boneName, rq] of Object.entries(restQuats)) {
    const b = boneMap[boneName]
    if (b) b.quaternion.copy(rq)
  }

  const hips = boneMap['mixamorig:Hips']
  if (hips && opts.hipsRestPos) {
    hips.position.copy(opts.hipsRestPos)
  }

  fn(boneMap, restQuats, time, opts)
}
