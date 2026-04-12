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

// Sampled via: node scripts/sample-wave.mjs public/assets/Waving.fbx
// Two extremes of the waving cycle (forearm straight vs forearm bent)
const WAVE_A = {
  'mixamorigHips': [0.033764, 0.0065, -0.001593, 0.999407],
  'mixamorigSpine': [-0.005019, -0.000099, -0.001841, 0.999986],
  'mixamorigSpine1': [-0.024481, -0.000219, -0.005053, 0.999687],
  'mixamorigSpine2': [-0.024481, -0.000219, -0.005053, 0.999687],
  'mixamorigNeck': [0.0518, 0.020732, -0.033986, 0.997864],
  'mixamorigHead': [-0.103567, -0.072007, 0.07193, 0.989401],
  'mixamorigLeftShoulder': [0.479842, 0.545164, -0.459746, 0.511059],
  'mixamorigLeftArm': [-0.373643, -0.299418, 0.311572, 0.82077],
  'mixamorigLeftForeArm': [0.000034, -0.047933, 0.000002, 0.998851],
  'mixamorigLeftHand': [-0.27699, -0.120881, 0.015169, 0.953118],
  'mixamorigRightShoulder': [0.477111, -0.568352, 0.400791, 0.537315],
  'mixamorigRightArm': [-0.325741, 0.188981, -0.191858, 0.906294],
  'mixamorigRightForeArm': [0.000034, 0.098537, -0.000005, 0.995133],
  'mixamorigRightHand': [-0.324071, 0.368792, 0.060839, 0.869062],
  'mixamorigRightHandIndex1': [0.219395, -0.028425, -0.041237, 0.97435],
  'mixamorigLeftUpLeg': [0.081484, 0.026182, -0.994831, 0.054645],
  'mixamorigLeftLeg': [-0.02623, 0.007801, 0.029596, 0.999187],
  'mixamorigLeftFoot': [0.414141, -0.16837, 0.051418, 0.893026],
  'mixamorigRightUpLeg': [-0.16518, 0.045465, 0.985174, 0.008961],
  'mixamorigRightLeg': [-0.112732, -0.000546, -0.028875, 0.993206],
  'mixamorigRightFoot': [0.453629, -0.001364, -0.058497, 0.889267],
}

const WAVE_B = {
  'mixamorigHips': [0.039785, 0.008122, 0.017613, 0.99902],
  'mixamorigSpine': [-0.001968, 0.001997, 0.003692, 0.999989],
  'mixamorigSpine1': [-0.018377, 0.003937, 0.001245, 0.999823],
  'mixamorigSpine2': [-0.018377, 0.003937, 0.001245, 0.999823],
  'mixamorigNeck': [0.103489, 0.020405, -0.016802, 0.994279],
  'mixamorigHead': [-0.138476, -0.067306, 0.025508, 0.987747],
  'mixamorigLeftShoulder': [0.507191, 0.527435, -0.453089, 0.509195],
  'mixamorigLeftArm': [0.245411, -0.126321, 0.110086, 0.954829],
  'mixamorigLeftForeArm': [-0.031699, -0.045769, 0.585643, 0.808655],
  'mixamorigLeftHand': [-0.115556, 0.223367, 0.00782, 0.967829],
  'mixamorigRightShoulder': [0.512139, -0.540641, 0.401389, 0.533206],
  'mixamorigRightArm': [0.147002, -0.056747, -0.130688, 0.978821],
  'mixamorigRightForeArm': [-0.079628, 0.083574, -0.597736, 0.793339],
  'mixamorigRightHand': [-0.022538, 0.072083, 0.033687, 0.996575],
  'mixamorigRightHandIndex1': [0.153258, -0.05227, -0.083034, 0.983303],
  'mixamorigLeftUpLeg': [0.016676, -0.033629, -0.998378, 0.042803],
  'mixamorigLeftLeg': [-0.089085, 0.011215, 0.028131, 0.995564],
  'mixamorigLeftFoot': [0.404859, -0.094303, 0.043546, 0.90846],
  'mixamorigRightUpLeg': [-0.176837, 0.098485, 0.979103, 0.019659],
  'mixamorigRightLeg': [-0.188314, -0.00225, -0.026082, 0.98176],
  'mixamorigRightFoot': [0.485124, -0.018826, -0.072709, 0.871214],
}

// Sampled via: node scripts/sample-fbx-quats.mjs public/assets/Thinking.fbx
// Frame at 50% — hand on chin thinking pose
const THINK_QUATS = {
  'mixamorigHips': [-0.037667, 0.040138, -0.065771, 0.996315],
  'mixamorigSpine': [0.028642, 0.035848, 0.023186, 0.998678],
  'mixamorigSpine1': [0.007459, 0.001676, -0.031019, 0.99949],
  'mixamorigSpine2': [0.008772, 0.000657, -0.030783, 0.999487],
  'mixamorigNeck': [0.0466, -0.032599, 0.050048, 0.997126],
  'mixamorigHead': [0.012588, -0.259755, 0.2499, 0.932694],
  'mixamorigLeftShoulder': [0.596354, 0.436577, -0.431849, 0.516981],
  'mixamorigLeftArm': [0.411884, 0.51508, -0.091523, 0.746102],
  'mixamorigLeftForeArm': [-0.00955, 0.000009, 0.729048, 0.684396],
  'mixamorigLeftHand': [-0.392897, 0.405341, 0.087343, 0.820794],
  'mixamorigRightShoulder': [0.678565, -0.323378, 0.474747, 0.457812],
  'mixamorigRightArm': [0.387817, 0.062416, -0.041147, 0.9187],
  'mixamorigRightForeArm': [-0.012892, -0.000019, -0.96504, 0.261786],
  'mixamorigRightHand': [0.238662, 0.174974, -0.051871, 0.9538],
  'mixamorigRightHandIndex1': [0.143991, -0.139625, -0.006835, 0.979655],
  'mixamorigRightHandIndex2': [0.658239, 0.005334, -0.096246, 0.746612],
  'mixamorigLeftUpLeg': [0.263305, -0.169886, -0.942707, 0.114512],
  'mixamorigLeftLeg': [-0.477416, 0.054729, 0.035452, 0.876254],
  'mixamorigLeftFoot': [0.50132, -0.045411, -0.031771, 0.863485],
  'mixamorigRightUpLeg': [0.001658, 0.075261, -0.984101, 0.160865],
  'mixamorigRightLeg': [-0.030715, 0.023041, 0.022027, 0.99902],
  'mixamorigRightFoot': [0.423343, 0.0387, -0.23697, 0.873572],
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

/**
 * Slerp all bones between two baked poses.
 * @param {number} blend 0→quatsA, 1→quatsB
 */
function slerpBetween(boneMap, quatsA, quatsB, blend) {
  for (const [name, arrA] of Object.entries(quatsA)) {
    const bone = boneMap[name]
    if (!bone) continue
    const arrB = quatsB[name]
    if (!arrB) continue
    _q.set(arrA[0], arrA[1], arrA[2], arrA[3])
    _q2.set(arrB[0], arrB[1], arrB[2], arrB[3])
    bone.quaternion.copy(_q).slerp(_q2, blend)
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
  const ease = smoothstep(Math.min(t * 2, 1))
  const osc = sin(t * 4.5) * 0.5 + 0.5 // 0→1 oscillation for the wave cycle
  // Ease into the wave pose, then oscillate between the two extremes
  if (ease < 0.999) {
    // Blending from rest to the midpoint of the wave
    setBoneQuats(B, R, WAVE_A, ease)
    if (ease > 0.01) slerpBetween(B, WAVE_A, WAVE_B, osc * ease)
  } else {
    slerpBetween(B, WAVE_A, WAVE_B, osc)
  }
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
  const ease = smoothstep(Math.min(t * 2, 1))
  setBoneQuats(B, R, THINK_QUATS, ease)
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

function breathe(B, R, t) {
  const rate = t * 1.05
  const inhale = sin(rate)
  const exhale = sin(rate * 2 + 0.5) * 0.35

  // Chest rises and expands on inhale
  const chest = inhale * 0.022 + exhale * 0.008
  rotBone(B, R, 'mixamorig:Spine', chest + 1.5 * DEG, 0, 0)
  rotBone(B, R, 'mixamorig:Spine1', chest * 0.8 + 1 * DEG, 0, 0)
  rotBone(B, R, 'mixamorig:Spine2', chest * 0.5, 0, 0)

  // Shoulders lift slightly on inhale
  const shLift = inhale * 1.2 * DEG
  rotBone(B, R, 'mixamorig:LeftShoulder', shLift, 0, shLift * 0.6)
  rotBone(B, R, 'mixamorig:RightShoulder', shLift, 0, -shLift * 0.6)

  // Arms hang down, just breathing drift
  rotBone(B, R, 'mixamorig:LeftArm', inhale * 0.5 * DEG, 0, inhale * 0.8 * DEG)
  rotBone(B, R, 'mixamorig:LeftForeArm', 0, 0, inhale * 0.4 * DEG)
  rotBone(B, R, 'mixamorig:RightArm', inhale * 0.5 * DEG, 0, -inhale * 0.8 * DEG)
  rotBone(B, R, 'mixamorig:RightForeArm', 0, 0, -inhale * 0.4 * DEG)
  rotBone(B, R, 'mixamorig:LeftHand', sin(t * 0.6) * 0.5 * DEG, 0, 0)
  rotBone(B, R, 'mixamorig:RightHand', sin(t * 0.65) * 0.5 * DEG, 0, 0)

  // Hips stay planted, slight weight shift
  const shift = sin(t * 0.22) * 1 * DEG
  rotBone(B, R, 'mixamorig:Hips', 0, shift, 0)

  // Legs stable
  rotBone(B, R, 'mixamorig:LeftUpLeg', shift * 0.3, 0, 2 * DEG)
  rotBone(B, R, 'mixamorig:RightUpLeg', -shift * 0.3, 0, -2 * DEG)
  rotBone(B, R, 'mixamorig:LeftLeg', 2 * DEG, 0, 0)
  rotBone(B, R, 'mixamorig:RightLeg', 2 * DEG, 0, 0)

  // Head drifts gently — slow, decoupled from breath
  rotBone(B, R, 'mixamorig:Neck', -6 * DEG + inhale * 1 * DEG, sin(t * 0.35) * 1.5 * DEG, 0)
  rotBone(B, R, 'mixamorig:Head', -3 * DEG + sin(t * 0.28) * 1.5 * DEG, sin(t * 0.19) * 2 * DEG, sin(t * 0.24) * 0.8 * DEG)
}

// ─── Registry ──────────────────────────────────────────────────────────────

const ANIMATIONS = { idle, wave, explain, point, pointLeft, think, walk, present, breathe }

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
