import * as THREE from 'three'
import {
  CYAN, RED,
  BOUNDS_W, BOUNDS_H, MAX_OBJECTS_PER_ROW, MAX_OBJECT_COLUMNS,
  linearGap, gridGap,
  fitsGridLayout, overflowFallback,
  paletteFromAgentColor,
} from './helpers.js'

const PINK = '#ff6eb4'

const divisionTool = {
  name: 'division',
  description: 'Visualize division by sorting a total into equal groups, showing quotient and remainder.',

  schema: {
    total:     { type: 'number', required: true, min: 1, max: 36, description: 'Dividend (total objects to divide)' },
    groupSize: { type: 'number', required: true, min: 1, max: 12, description: 'Divisor (objects per group)' },
    quotient:  { type: 'number', required: true, min: 0, description: 'Number of complete groups' },
    remainder: { type: 'number', required: true, min: 0, description: 'Leftover objects after grouping' },
  },

  validate(params) {
    const total = Number(params?.total)
    const groupSize = Number(params?.groupSize)
    let quotient = Number(params?.quotient)
    let remainder = Number(params?.remainder)
    if (!Number.isFinite(total) || total < 1) return { valid: false, error: '"total" must be at least 1' }
    if (!Number.isFinite(groupSize) || groupSize < 1) return { valid: false, error: '"groupSize" must be at least 1' }
    if (!Number.isFinite(quotient) || quotient < 0) return { valid: false, error: '"quotient" must be non-negative' }
    if (!Number.isFinite(remainder) || remainder < 0) return { valid: false, error: '"remainder" must be non-negative' }
    if (quotient * groupSize + remainder !== total) {
      quotient = Math.floor(total / groupSize)
      remainder = total % groupSize
    }
    const hints = {}
    if (typeof params?.itemShape === 'string' && params.itemShape.trim()) hints.itemShape = params.itemShape.trim()
    if (typeof params?.itemColor === 'string' && params.itemColor.startsWith('#')) hints.itemColor = params.itemColor
    if (typeof params?.itemLabel === 'string' && params.itemLabel.trim()) hints.itemLabel = params.itemLabel.trim()
    return { valid: true, total, groupSize, quotient, remainder, ...hints }
  },

  execute({ total, groupSize, quotient, remainder, itemColor }, { now, createAssetToken }) {
    if (!fitsGridLayout(groupSize, Math.max(1, quotient + (remainder > 0 ? 1 : 0))) || total > MAX_OBJECTS_PER_ROW * MAX_OBJECT_COLUMNS) {
      const label = remainder > 0 ? `${quotient} R${remainder}` : `${quotient}`
      return overflowFallback(label, now)
    }

    const Pal = paletteFromAgentColor(itemColor)
    const baseHue = new THREE.Color(Pal.primary || CYAN)
    const palette = [
      `#${baseHue.clone().lerp(new THREE.Color(0xffffff), 0.15).getHexString()}`,
      `#${baseHue.clone().lerp(new THREE.Color(PINK), 0.35).getHexString()}`,
      `#${baseHue.clone().lerp(new THREE.Color(0x88ff66), 0.25).getHexString()}`,
      `#${baseHue.clone().lerp(new THREE.Color(0xb794ff), 0.3).getHexString()}`,
      `#${baseHue.clone().lerp(new THREE.Color(0xff9f68), 0.35).getHexString()}`,
      `#${baseHue.clone().lerp(new THREE.Color(0x7bdff2), 0.3).getHexString()}`,
    ]

    const initialGap = linearGap(total, BOUNDS_W, 0.28)
    const visibleGroups = Math.max(1, quotient + (remainder > 0 ? 1 : 0))
    const groupedItemGap = gridGap(groupSize, BOUNDS_W / Math.max(2, visibleGroups) * 0.8, 0.22)
    const groupBlockW = groupSize * groupedItemGap
    const groupGap = gridGap(visibleGroups, BOUNDS_W, groupBlockW + 0.12)
    const rowStep = gridGap(visibleGroups, BOUNDS_H, 0.4)
    const startX = -((total - 1) * initialGap) / 2

    const objects = []
    for (let i = 0; i < total; i++) {
      const groupIndex = Math.floor(i / groupSize)
      const indexInGroup = i % groupSize
      const groupCenterX = (groupIndex - (visibleGroups - 1) / 2) * groupGap
      const groupedX = groupCenterX + (indexInGroup - (groupSize - 1) / 2) * groupedItemGap
      const groupedY = groupIndex < quotient
        ? (0.15 - groupIndex * rowStep)
        : (0.15 - quotient * rowStep - 0.2)
      const isRemainder = groupIndex >= quotient
      const { mesh, materials } = createAssetToken(Pal.primary || CYAN)
      objects.push({
        mesh,
        materials,
        role: isRemainder ? 'remainder' : 'token',
        appearAt: now + i * 0.04,
        targetScale: 1,
        basePosition: new THREE.Vector3(startX + i * initialGap, 0, 0),
        stagePositions: {
          0: new THREE.Vector3(startX + i * initialGap, 0, 0),
          1: new THREE.Vector3(startX + i * initialGap, 0, 0),
          2: new THREE.Vector3(groupedX, groupedY, 0),
          3: new THREE.Vector3(groupedX, groupedY, 0),
        },
        colors: {
          0: Pal.primary || CYAN,
          1: palette[groupIndex % palette.length],
          2: isRemainder ? RED : palette[groupIndex % palette.length],
          3: isRemainder ? RED : (Pal.merge || '#ffd166'),
        },
        visibleFromStage: 0,
        bobPhase: Math.random() * Math.PI * 2,
      })
    }

    return { maxStages: 4, autoTimes: [0, 0.45, 1.05, 1.55], objects }
  },
}

export default divisionTool
