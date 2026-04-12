import * as THREE from 'three'

export const CYAN = '#00e5ff'
export const PINK = '#ff6eb4'
export const GOLD = '#ffd166'
export const RED = '#ff5a5f'

/**
 * Hidden boundary — every token layout MUST fit inside this box.
 * Tools receive these as the hard constraint; MathVisualization positions
 * the group so the box sits to the left of the character.
 */
export const BOUNDS_W = 1.8
export const BOUNDS_H = 1.2

export const MAX_OBJECTS_PER_ROW = 10
export const MAX_OBJECT_COLUMNS = 5
export const TOKEN_FOOTPRINT = 0.2

export function paletteFromAgentColor(baseHex, fallbackA = CYAN, fallbackB = PINK, fallbackMerge = GOLD) {
  if (typeof baseHex !== 'string' || !baseHex.startsWith('#')) {
    return { a: fallbackA, b: fallbackB, merge: fallbackMerge, primary: fallbackA }
  }
  try {
    const c = new THREE.Color(baseHex)
    return {
      a: `#${c.clone().lerp(new THREE.Color(0xffffff), 0.32).getHexString()}`,
      b: `#${c.clone().lerp(new THREE.Color(0x1a1a1a), 0.28).getHexString()}`,
      merge: `#${c.clone().lerp(new THREE.Color(0xffeecc), 0.55).getHexString()}`,
      primary: baseHex,
    }
  } catch {
    return { a: fallbackA, b: fallbackB, merge: fallbackMerge, primary: fallbackA }
  }
}

export function createGlowMaterial(color) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 1.15,
    roughness: 0.22,
    metalness: 0.18,
    transparent: true,
    opacity: 1,
  })
}

export function createSpriteLabel(text, color, scale = [0.95, 0.38, 1]) {
  const canvas = document.createElement('canvas')
  const ctx0 = canvas.getContext('2d')
  ctx0.font = '700 72px Arial'
  const textWidth = ctx0.measureText(text).width

  canvas.width = Math.max(512, textWidth + 120)
  canvas.height = 192
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.font = '700 72px Arial'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.shadowColor = color
    ctx.shadowBlur = 28
    ctx.fillStyle = color
    ctx.fillText(text, canvas.width / 2, canvas.height / 2)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  })
  const sprite = new THREE.Sprite(material)
  const aspect = canvas.width / canvas.height
  sprite.scale.set(scale[1] * aspect, scale[1], scale[2])
  return sprite
}

export function createSphere(color) {
  return new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 20), createGlowMaterial(color))
}

export function applyTintToObject(object, color) {
  const tint = new THREE.Color(color)
  const materials = []

  object.traverse(child => {
    if (!child.isMesh) return
    const materialList = Array.isArray(child.material) ? child.material : [child.material]
    const nextMaterials = materialList.map((sourceMaterial) => {
      const material = sourceMaterial.clone()
      material.color = material.color ? material.color.clone() : new THREE.Color(0xffffff)
      material.color.multiply(tint)
      if ('emissive' in material) {
        material.emissive = tint.clone()
        material.emissiveIntensity = 0.85
      }
      material.transparent = true
      material.opacity = 1
      child.castShadow = true
      child.receiveShadow = false
      materials.push(material)
      return material
    })
    child.material = Array.isArray(child.material) ? nextMaterials : nextMaterials[0]
  })

  return materials
}

/** Compute gap so `count` items fit inside `maxWidth` with comfortable spacing. */
export function linearGap(count, maxWidth = BOUNDS_W, ideal = 0.34) {
  if (count <= 1) return ideal
  return Math.min(ideal, maxWidth / (count - 1))
}

/** Compute gap for a grid column or row dimension. */
export function gridGap(slots, maxDim, ideal) {
  if (slots <= 1) return ideal
  return Math.min(ideal, maxDim / (slots - 1))
}

export function fitsLinearLayout(count) {
  return count <= MAX_OBJECTS_PER_ROW
}

export function fitsGridLayout(cols, rows) {
  return cols <= MAX_OBJECTS_PER_ROW && rows <= MAX_OBJECT_COLUMNS
}

export function overflowFallback(_result, _now) {
  return null
}
