/**
 * Sample two keyframes from Waving.fbx for oscillating wave animation.
 * Run: node scripts/sample-wave.mjs public/assets/Waving.fbx
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
  const img = { width: 1, height: 1, data: new Uint8Array(4), addEventListener: () => {} }
  if (onLoad) setTimeout(() => onLoad(img), 0)
  return img
}
const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js')

const fbxPath = process.argv[2]
if (!fbxPath) { console.error('Usage: node scripts/sample-wave.mjs <fbx>'); process.exit(1) }

const data = readFileSync(fbxPath)
const loader = new FBXLoader()
const ab = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
const fbx = loader.parse(ab, '')
const clip = fbx.animations[0]
console.log(`Animation: "${clip.name}", duration: ${clip.duration.toFixed(3)}s`)

const mixer = new THREE.AnimationMixer(fbx)
const action = mixer.clipAction(clip)
action.play()

function sampleAt(t) {
  mixer.setTime(0); mixer.update(0); mixer.setTime(t)
  fbx.updateMatrixWorld(true)
  const quats = {}
  fbx.traverse(obj => {
    if (obj.isBone && obj.name.startsWith('mixamorig')) {
      const q = obj.quaternion
      if (q.w < 0) q.set(-q.x, -q.y, -q.z, -q.w)
      quats[obj.name] = [
        parseFloat(q.x.toFixed(6)),
        parseFloat(q.y.toFixed(6)),
        parseFloat(q.z.toFixed(6)),
        parseFloat(q.w.toFixed(6)),
      ]
    }
  })
  return quats
}

// Find the right forearm's Z-rotation extremes to identify wave peaks
// Sample densely and find the two frames with max/min forearm rotation
const SAMPLES = 20
const dur = clip.duration
let bestHi = { t: 0, val: -Infinity }
let bestLo = { t: 0, val: Infinity }

for (let i = 0; i < SAMPLES; i++) {
  const t = dur * (i / (SAMPLES - 1)) * 0.95 // stay within 95% of clip
  const quats = sampleAt(t)
  // Track the right forearm Z component as wave indicator
  const rf = quats['mixamorigRightForeArm']
  if (rf) {
    const val = rf[2] // z component
    if (val > bestHi.val) bestHi = { t, val }
    if (val < bestLo.val) bestLo = { t, val }
  }
}

console.log(`\nWave extremes: hi at t=${bestHi.t.toFixed(3)}s (z=${bestHi.val.toFixed(4)}), lo at t=${bestLo.t.toFixed(3)}s (z=${bestLo.val.toFixed(4)})`)

const frameA = sampleAt(bestHi.t)
const frameB = sampleAt(bestLo.t)

// Only output the bones that matter for the wave animation (skip toes/ends)
const IMPORTANT = [
  'mixamorigHips', 'mixamorigSpine', 'mixamorigSpine1', 'mixamorigSpine2',
  'mixamorigNeck', 'mixamorigHead',
  'mixamorigLeftShoulder', 'mixamorigLeftArm', 'mixamorigLeftForeArm', 'mixamorigLeftHand',
  'mixamorigRightShoulder', 'mixamorigRightArm', 'mixamorigRightForeArm', 'mixamorigRightHand',
  'mixamorigRightHandIndex1',
  'mixamorigLeftUpLeg', 'mixamorigLeftLeg', 'mixamorigLeftFoot',
  'mixamorigRightUpLeg', 'mixamorigRightLeg', 'mixamorigRightFoot',
]

function printQuats(name, quats) {
  console.log(`const ${name} = {`)
  for (const bone of IMPORTANT) {
    if (quats[bone]) console.log(`  '${bone}': [${quats[bone].join(', ')}],`)
  }
  console.log('}')
}

console.log('\n// Frame A — wave extreme (forearm one way)')
printQuats('WAVE_A', frameA)
console.log('\n// Frame B — wave extreme (forearm other way)')
printQuats('WAVE_B', frameB)

mixer.stopAllAction()
console.log('\nDone. Use slerp between WAVE_A and WAVE_B with sin(t * speed) to animate.')
