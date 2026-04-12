import * as THREE from 'three'
import {
  BOUNDS_W,
  linearGap,
  fitsLinearLayout, overflowFallback,
  paletteFromAgentColor,
} from './helpers.js'

const additionTool = {
  name: 'addition',
  description: 'Visualize addition by combining two groups of objects into a total.',

  schema: {
    a: { type: 'number', required: true, min: 0, max: 50, description: 'First addend (number of objects in group A)' },
    b: { type: 'number', required: true, min: 0, max: 50, description: 'Second addend (number of objects in group B)' },
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
    const total = a + b
    if (total === 0) return null
    if (!fitsLinearLayout(total)) return overflowFallback(total, now)

    const Pal = paletteFromAgentColor(itemColor)
    const cA = Pal.a
    const cB = Pal.b
    const cMerge = Pal.merge

    const mergedGap = linearGap(total, BOUNDS_W)
    const halfW = BOUNDS_W * 0.44
    const centerMargin = mergedGap * 0.6
    const groupAGap = a > 1 ? linearGap(a, halfW - centerMargin) : mergedGap
    const groupBGap = b > 1 ? linearGap(b, halfW - centerMargin) : mergedGap
    const groupAWidth = Math.max(0, (a - 1) * groupAGap)
    const groupBWidth = Math.max(0, (b - 1) * groupBGap)
    const groupACenter = -(groupAWidth * 0.5 + centerMargin)
    const groupBCenter = groupBWidth * 0.5 + centerMargin

    const objects = []

    for (let i = 0; i < total; i++) {
      const { mesh, materials } = createAssetToken(i < a ? cA : cB)
      const startX = i < a
        ? groupACenter - groupAWidth * 0.5 + i * groupAGap
        : groupBCenter - groupBWidth * 0.5 + (i - a) * groupBGap
      const resultX = -(total - 1) * mergedGap * 0.5 + i * mergedGap

      objects.push({
        mesh,
        materials,
        role: 'token',
        appearAt: now + (i < a ? i * 0.06 : 0.45 + (i - a) * 0.06),
        targetScale: 1,
        basePosition: new THREE.Vector3(startX, 0, 0),
        stagePositions: {
          0: new THREE.Vector3(startX, 0, 0),
          1: new THREE.Vector3(startX, 0, 0),
          2: new THREE.Vector3(resultX, 0, 0),
        },
        colors: {
          0: i < a ? cA : cB,
          1: i < a ? cA : cB,
          2: cMerge,
        },
        visibleFromStage: i < a ? 0 : 1,
        bobPhase: Math.random() * Math.PI * 2,
      })
    }

    return { maxStages: 3, autoTimes: [0, 0.55, 1.5], objects }
  },
}

export default additionTool
