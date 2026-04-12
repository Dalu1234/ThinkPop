/**
 * Sample bone quaternions from a Mixamo FBX animation clip, then produce
 * mirror data for pointLeft by computing rest-relative deltas, mirroring
 * them (negate qy,qz for L↔R swap), and recomposing with the opposite
 * side's rest quaternion.
 *
 * Run:  node scripts/sample-fbx-quats.mjs public/assets/Pointing.fbx
 */
import { readFileSync } from 'fs'
import { Blob } from 'buffer'

globalThis.window = globalThis
globalThis.document = {
  createElementNS: () => ({ style: {} }),
  createElement: () => ({ style: {} }),
}
globalThis.self = globalThis
globalThis.Blob = Blob
globalThis.URL = globalThis.URL || {}
globalThis.URL.createObjectURL = globalThis.URL.createObjectURL || (() => '')
Object.defineProperty(globalThis, 'navigator', {
  value: { userAgent: '' },
  writable: true,
  configurable: true,
})
globalThis.performance = globalThis.performance || { now: () => Date.now() }
globalThis.DOMParser = globalThis.DOMParser || class {
  parseFromString() { return { documentElement: {} } }
}
globalThis.atob = globalThis.atob || ((str) => Buffer.from(str, 'base64').toString('binary'))
globalThis.TextDecoder = globalThis.TextDecoder || (await import('util')).TextDecoder

const THREE = await import('three')

THREE.ImageLoader.prototype.load = function (url, onLoad) {
  const fakeImage = { width: 1, height: 1, data: new Uint8Array(4), addEventListener: () => {} }
  if (onLoad) setTimeout(() => onLoad(fakeImage), 0)
  return fakeImage
}

const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js')

const fbxPath = process.argv[2]
if (!fbxPath) {
  console.error('Usage: node scripts/sample-fbx-quats.mjs <path-to-fbx>')
  process.exit(1)
}

const data = readFileSync(fbxPath)
const loader = new FBXLoader()
const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
const fbx = loader.parse(arrayBuffer, '')

if (!fbx.animations || !fbx.animations.length) {
  console.error('No animations found')
  process.exit(1)
}

const clip = fbx.animations[0]
console.log(`Animation: "${clip.name}", duration: ${clip.duration.toFixed(3)}s`)

const mixer = new THREE.AnimationMixer(fbx)
const action = mixer.clipAction(clip)
action.play()

// ── Helper: extract all bone quaternions ──
function sampleBones(fbxRoot) {
  const quats = {}
  fbxRoot.traverse(obj => {
    if (obj.isBone && obj.name.startsWith('mixamorig')) {
      quats[obj.name] = obj.quaternion.clone()
    }
  })
  return quats
}

function fmt(q) {
  return [
    parseFloat(q.x.toFixed(6)),
    parseFloat(q.y.toFixed(6)),
    parseFloat(q.z.toFixed(6)),
    parseFloat(q.w.toFixed(6)),
  ]
}

// ── Sample the rest pose (t=0 before animation influence) ──
// Reset mixer to get bind pose - actually, we need the bind pose BEFORE animation.
// The FBX bind pose is baked into the skeleton. We'll sample at t=0 as our "rest" baseline.
mixer.setTime(0)
mixer.update(0)
fbx.updateMatrixWorld(true)
const restQuats = sampleBones(fbx)

// ── Sample the peak pointing frame ──
// Try multiple times to find the best frame. Based on initial sampling,
// frame at 50% (t≈1.38s) looks like the peak pointing pose.
const PEAK_TIME = clip.duration * 0.5
mixer.setTime(0)
mixer.update(0)
mixer.setTime(PEAK_TIME)
fbx.updateMatrixWorld(true)
const peakQuats = sampleBones(fbx)

// ── Output: POINT_QUATS (raw frame data, right-hand pointing forward) ──
console.log('\n// ═══════════════════════════════════════════════════════')
console.log('// POINT_QUATS — frame 50% absolute bone quaternions')
console.log('// Use these directly: bone.quaternion.set(...values)')
console.log('// ═══════════════════════════════════════════════════════')
console.log('const POINT_QUATS = {')
for (const [name, q] of Object.entries(peakQuats)) {
  if (q.w < 0) q.set(-q.x, -q.y, -q.z, -q.w)
  const a = fmt(q)
  console.log(`  '${name}': [${a.join(', ')}],`)
}
console.log('}')

// ── Compute mirrored version for pointLeft ──
// Strategy:
//   For each right-side bone, compute delta = rest^-1 * pose.
//   Mirror the delta: (qx, -qy, -qz, qw) to flip the rotation for the opposite side.
//   Apply to the opposite side's rest: leftPose = leftRest * mirroredDelta
//   For center bones (Spine, Hips, Neck, Head): mirror delta as (-qx, qy, qz, -qw)
//   to flip the lateral lean/turn direction.

const LR_PAIRS = [
  ['mixamorigLeftShoulder', 'mixamorigRightShoulder'],
  ['mixamorigLeftArm', 'mixamorigRightArm'],
  ['mixamorigLeftForeArm', 'mixamorigRightForeArm'],
  ['mixamorigLeftHand', 'mixamorigRightHand'],
  ['mixamorigLeftHandThumb1', 'mixamorigRightHandThumb1'],
  ['mixamorigLeftHandThumb2', 'mixamorigRightHandThumb2'],
  ['mixamorigLeftHandThumb3', 'mixamorigRightHandThumb3'],
  ['mixamorigLeftHandThumb4', 'mixamorigRightHandThumb4'],
  ['mixamorigLeftHandIndex1', 'mixamorigRightHandIndex1'],
  ['mixamorigLeftHandIndex2', 'mixamorigRightHandIndex2'],
  ['mixamorigLeftHandIndex3', 'mixamorigRightHandIndex3'],
  ['mixamorigLeftHandIndex4', 'mixamorigRightHandIndex4'],
  ['mixamorigLeftUpLeg', 'mixamorigRightUpLeg'],
  ['mixamorigLeftLeg', 'mixamorigRightLeg'],
  ['mixamorigLeftFoot', 'mixamorigRightFoot'],
  ['mixamorigLeftToeBase', 'mixamorigRightToeBase'],
  ['mixamorigLeftToe_End', 'mixamorigRightToe_End'],
]

const CENTER_BONES = [
  'mixamorigHips', 'mixamorigSpine', 'mixamorigSpine1', 'mixamorigSpine2',
  'mixamorigNeck', 'mixamorigHead', 'mixamorigHeadTop_End',
]

const _invRest = new THREE.Quaternion()
const _delta = new THREE.Quaternion()
const _mirrored = new THREE.Quaternion()
const _result = new THREE.Quaternion()

function computeMirroredQuat(srcBoneName, dstBoneName) {
  const srcRest = restQuats[srcBoneName]
  const srcPose = peakQuats[srcBoneName]
  const dstRest = restQuats[dstBoneName]
  if (!srcRest || !srcPose || !dstRest) return null

  // delta = rest^-1 * pose
  _invRest.copy(srcRest).invert()
  _delta.copy(_invRest).multiply(srcPose)

  // Reflect delta across the sagittal (YZ) plane:
  // negate qy and qz — this preserves rx (pitch/abduction) and
  // negates ry (yaw/twist) and rz (roll/lateral).
  _mirrored.set(_delta.x, -_delta.y, -_delta.z, _delta.w)
  _mirrored.normalize()

  // result = dstRest * mirroredDelta
  _result.copy(dstRest).multiply(_mirrored)

  // Normalize to positive w hemisphere to avoid slerp issues
  if (_result.w < 0) {
    _result.set(-_result.x, -_result.y, -_result.z, -_result.w)
  }
  return _result.clone()
}

const pointLeftQuats = {}

// Center bones: mirror their own deltas (body turns the other way)
for (const name of CENTER_BONES) {
  const r = computeMirroredQuat(name, name)
  if (r) pointLeftQuats[name] = r
}

// L↔R swap: right arm data → left arm, left arm data → right arm
for (const [leftName, rightName] of LR_PAIRS) {
  const leftResult = computeMirroredQuat(rightName, leftName)
  if (leftResult) pointLeftQuats[leftName] = leftResult

  const rightResult = computeMirroredQuat(leftName, rightName)
  if (rightResult) pointLeftQuats[rightName] = rightResult
}

console.log('\n// ═══════════════════════════════════════════════════════')
console.log('// POINT_LEFT_QUATS — mirrored: left hand pointing left')
console.log('// Computed via delta mirroring from the right-hand pose')
console.log('// ═══════════════════════════════════════════════════════')
console.log('const POINT_LEFT_QUATS = {')
for (const [name, q] of Object.entries(pointLeftQuats)) {
  const a = fmt(q)
  console.log(`  '${name}': [${a.join(', ')}],`)
}
console.log('}')

// ── Also output the Euler deltas for reference ──
console.log('\n// ═══════════════════════════════════════════════════════')
console.log('// Euler deltas (rest^-1 * pose → toEuler) for reference')
console.log('// ═══════════════════════════════════════════════════════')
const _e = new THREE.Euler()
for (const name of ['mixamorigRightArm', 'mixamorigRightForeArm', 'mixamorigRightHand',
                     'mixamorigLeftArm', 'mixamorigLeftForeArm', 'mixamorigLeftHand',
                     'mixamorigRightShoulder', 'mixamorigLeftShoulder',
                     'mixamorigSpine', 'mixamorigSpine1', 'mixamorigSpine2',
                     'mixamorigNeck', 'mixamorigHead', 'mixamorigHips']) {
  const r = restQuats[name]
  const p = peakQuats[name]
  if (!r || !p) continue
  _invRest.copy(r).invert()
  _delta.copy(_invRest).multiply(p)
  _e.setFromQuaternion(_delta, 'XYZ')
  const deg = (v) => (v * 180 / Math.PI).toFixed(1)
  console.log(`  ${name}: rx=${deg(_e.x)}° ry=${deg(_e.y)}° rz=${deg(_e.z)}°`)
}

mixer.stopAllAction()
console.log('\nDone.')
