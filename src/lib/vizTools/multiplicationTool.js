import * as THREE from 'three'
import {
  CYAN, PINK, GOLD,
  BOUNDS_W, BOUNDS_H,
  gridGap,
  fitsGridLayout, overflowFallback,
  paletteFromAgentColor,
} from './helpers.js'

const multiplicationTool = {
  name: 'multiplication',
  description: 'Visualize multiplication as an array/grid of objects arranged in rows and columns.',

  schema: {
    a: { type: 'number', required: true, min: 1, max: 12, description: 'First factor — columns (items per row)' },
    b: { type: 'number', required: true, min: 1, max: 12, description: 'Second factor — rows (number of groups)' },
  },

  validate(params) {
    const a = Number(params?.a)
    const b = Number(params?.b)
    if (!Number.isFinite(a) || a < 1) return { valid: false, error: '"a" must be a positive integer' }
    if (!Number.isFinite(b) || b < 1) return { valid: false, error: '"b" must be a positive integer' }
    const hints = {}
    if (typeof params?.itemShape === 'string' && params.itemShape.trim()) hints.itemShape = params.itemShape.trim()
    if (typeof params?.itemColor === 'string' && params.itemColor.startsWith('#')) hints.itemColor = params.itemColor
    if (typeof params?.itemLabel === 'string' && params.itemLabel.trim()) hints.itemLabel = params.itemLabel.trim()
    return { valid: true, a, b, ...hints }
  },

  execute({ a, b, itemColor }, { now, createAssetToken }) {
    if (!fitsGridLayout(a, b)) return overflowFallback(a * b, now)

    const colGap = gridGap(a, BOUNDS_W, 0.36)
    const rowGap = gridGap(b, BOUNDS_H, 0.3)
    const Pal = paletteFromAgentColor(itemColor)
    const baseCol = new THREE.Color(Pal.primary || CYAN)
    const altCol = new THREE.Color(Pal.b || PINK)

    const objects = []
    for (let col = 0; col < a; col++) {
      const colColor = baseCol.clone().lerp(altCol, a <= 1 ? 0 : col / (a - 1))
      const hex = `#${colColor.getHexString()}`
      for (let row = 0; row < b; row++) {
        const { mesh, materials } = createAssetToken(hex)
        const x = (col - (a - 1) / 2) * colGap
        const y = ((b - 1) / 2 - row) * rowGap
        objects.push({
          mesh,
          materials,
          role: 'cube',
          appearAt: now + col * 0.3 + row * 0.04,
          targetScale: 1,
          basePosition: new THREE.Vector3(x, y, 0),
          stagePositions: {
            0: new THREE.Vector3(x, y, 0),
            1: new THREE.Vector3(x, y, 0),
          },
          colors: {
            0: hex,
            1: Pal.merge || GOLD,
          },
          visibleFromStage: 0,
          bobPhase: Math.random() * Math.PI * 2,
        })
      }
    }

    return { maxStages: 2, autoTimes: [0, a * 0.3 + 0.35], objects }
  },
}

export default multiplicationTool
