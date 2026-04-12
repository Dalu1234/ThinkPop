import * as THREE from 'three'
import {
  BOUNDS_W, RED,
  linearGap,
  fitsLinearLayout, overflowFallback,
  paletteFromAgentColor,
} from './helpers.js'

const subtractionTool = {
  name: 'subtraction',
  description: 'Visualize subtraction by removing objects from a group and showing the remainder.',

  schema: {
    a: { type: 'number', required: true, min: 0, max: 50, description: 'Minuend (starting amount)' },
    b: { type: 'number', required: true, min: 0, max: 50, description: 'Subtrahend (amount to remove)' },
  },

  validate(params) {
    const a = Number(params?.a)
    const b = Number(params?.b)
    if (!Number.isFinite(a) || a < 0) return { valid: false, error: '"a" must be a non-negative number' }
    if (!Number.isFinite(b) || b < 0) return { valid: false, error: '"b" must be a non-negative number' }
    const hints = {}
    if (typeof params?.itemShape === 'string' && params.itemShape.trim()) hints.itemShape = params.itemShape.trim()
    if (typeof params?.itemColor === 'string' && params.itemColor.startsWith('#')) hints.itemColor = params.itemColor
    if (typeof params?.itemLabel === 'string' && params.itemLabel.trim()) hints.itemLabel = params.itemLabel.trim()
    return { valid: true, a, b, ...hints }
  },

  execute({ a, b, itemColor }, { now, createAssetToken }) {
    const total = a
    if (total === 0) return null
    if (!fitsLinearLayout(total)) return overflowFallback(Math.max(0, a - b), now)

    const Pal = paletteFromAgentColor(itemColor)
    const stay = Pal.a
    const go = Pal.b
    const end = Pal.merge

    const gap = linearGap(total, BOUNDS_W)
    const startX = -((total - 1) * gap) / 2
    const remaining = Math.max(0, a - b)

    const objects = []
    for (let i = 0; i < total; i++) {
      const removed = i >= remaining
      const { mesh, materials } = createAssetToken(removed ? go : stay)
      objects.push({
        mesh,
        materials,
        role: removed ? 'removed' : 'remaining',
        appearAt: now + i * 0.06,
        targetScale: 1,
        basePosition: new THREE.Vector3(startX + i * gap, 0, 0),
        stagePositions: {
          0: new THREE.Vector3(startX + i * gap, 0, 0),
          1: new THREE.Vector3(startX + i * gap, 0, 0),
          2: new THREE.Vector3(startX + i * gap, 0, removed ? 0.15 : 0),
          3: new THREE.Vector3(startX + i * gap, 0, 0),
        },
        colors: {
          0: removed ? go : stay,
          1: removed ? RED : stay,
          2: removed ? RED : stay,
          3: removed ? RED : end,
        },
        visibleFromStage: 0,
        bobPhase: Math.random() * Math.PI * 2,
        removed,
        explodeVector: removed
          ? new THREE.Vector3((Math.random() - 0.5) * 0.8, Math.random() * 0.6 + 0.15, (Math.random() - 0.5) * 0.3)
          : null,
      })
    }

    return { maxStages: 4, autoTimes: [0, 0.5, 1.05, 1.55], objects }
  },
}

export default subtractionTool
