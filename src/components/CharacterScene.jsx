/**
 * CharacterScene.jsx
 *
 * Props:
 *  motionFrames            - array of (22 x [x,y,z]) position arrays (HumanML3D)
 *  aiState                 - string pipeline state
 *  visualization           - optional visualization payload
 *  visualizationStepIndex  - external step index for step-mode visualizations
 */

import { Canvas, useFrame } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useFBX } from '@react-three/drei'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js'

import { createRetargeter } from '../lib/retarget'
import assetsDatabase from '../data/assetsDatabase.json'
import SolarSystem from './SolarSystem'

const PARTICLE_COUNT = 130
const FRAME_MS = 50
const CYAN = '#00e5ff'
const PINK = '#ff6eb4'
const GOLD = '#ffd166'
const RED = '#ff5a5f'
const MAX_OBJECTS_PER_ROW = 10
const MAX_OBJECT_COLUMNS = 5
const VISUAL_MAX_WIDTH = 2.9
const VISUAL_MAX_HEIGHT = 2.1
const TOKEN_FOOTPRINT = 0.2
const COUNTING_ASSET_IDS = new Set([
  'model_01', // Apple
  'model_02', // Avocado
  'model_09', // Gift box
  'model_11', // Mini pumpkin
  'model_14', // Party hat
])

function createGlowMaterial(color) {
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

function createSpriteLabel(text, color, scale = [0.95, 0.38, 1]) {
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

function createSphere(color) {
  return new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 20), createGlowMaterial(color))
}

function createCube(color) {
  return new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), createGlowMaterial(color))
}

function createTokenBase(color) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.12, 0.028, 24),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.55,
      roughness: 0.35,
      metalness: 0.1,
      transparent: true,
      opacity: 0.95,
    })
  )
  mesh.position.y = 0.014
  return mesh
}

function applyTintToObject(object, color) {
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

function createColumnOutline(height, color) {
  const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(0.42, height, 0.42))
  return new THREE.LineSegments(
    edges,
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0 })
  )
}

function computeLinearGap(count, maxWidth = VISUAL_MAX_WIDTH, defaultGap = 0.4) {
  if (count <= 1) return defaultGap
  return Math.min(defaultGap, maxWidth / Math.max(1, count - 1))
}

function computeTokenGap(count, footprint, maxWidth = VISUAL_MAX_WIDTH, defaultGap = 0.4) {
  const linear = computeLinearGap(count, maxWidth, defaultGap)
  return Math.max(linear, footprint * 1.9)
}

function fitsLinearLayout(count) {
  return count <= MAX_OBJECTS_PER_ROW
}

function fitsGridLayout(cols, rows) {
  return cols <= MAX_OBJECTS_PER_ROW && rows <= MAX_OBJECT_COLUMNS
}

function elasticOut(t) {
  if (t <= 0) return 0
  if (t >= 1) return 1
  const c4 = (2 * Math.PI) / 3
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1
}

function Particles() {
  const pointsRef = useRef()
  const [positions, speeds, colors] = useMemo(() => {
    const pos = new Float32Array(PARTICLE_COUNT * 3)
    const spd = new Float32Array(PARTICLE_COUNT)
    const col = new Float32Array(PARTICLE_COUNT * 3)
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 22
      pos[i * 3 + 1] = (Math.random() - 0.5) * 12
      pos[i * 3 + 2] = -2 - Math.random() * 4
      spd[i] = 0.003 + Math.random() * 0.008
      if (Math.random() > 0.5) {
        col[i * 3] = 0
        col[i * 3 + 1] = 0.9
        col[i * 3 + 2] = 1
      } else {
        col[i * 3] = 1
        col[i * 3 + 1] = 0.43
        col[i * 3 + 2] = 0.71
      }
    }
    return [pos, spd, col]
  }, [])

  useFrame(() => {
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      positions[i * 3 + 1] += speeds[i]
      if (positions[i * 3 + 1] > 6) {
        positions[i * 3 + 1] = -6
        positions[i * 3] = (Math.random() - 0.5) * 22
      }
    }
    if (pointsRef.current) {
      pointsRef.current.geometry.attributes.position.needsUpdate = true
    }
  })

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={PARTICLE_COUNT} array={positions} itemSize={3} />
        <bufferAttribute attach="attributes-color" count={PARTICLE_COUNT} array={colors} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial size={0.045} vertexColors transparent opacity={0.65} sizeAttenuation />
    </points>
  )
}

function NeonGrid() {
  return (
    <group position={[0, -1.1, 0]}>
      <gridHelper args={[20, 30, CYAN, '#0a1a2a']} />
    </group>
  )
}

function FBXCharacter({ motionFrames }) {
  const retargeterRef = useRef(null)
  const frameRef = useRef(0)
  const carryMs = useRef(0)
  const sourceFbx = useFBX('/assets/character.fbx')
  const fbx = useMemo(() => clone(sourceFbx), [sourceFbx])

  useEffect(() => {
    fbx.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(fbx)
    const size = new THREE.Vector3()
    const center = new THREE.Vector3()
    box.getSize(size)
    box.getCenter(center)

    const measuredHeight = size.y > 0 ? size.y : 1
    const targetHeight = 2.45
    const fittedScale = targetHeight / measuredHeight

    fbx.scale.setScalar(fittedScale)
    fbx.updateMatrixWorld(true)

    const fittedBox = new THREE.Box3().setFromObject(fbx)
    const fittedCenter = new THREE.Vector3()
    const fittedSize = new THREE.Vector3()
    fittedBox.getCenter(fittedCenter)
    fittedBox.getSize(fittedSize)

    fbx.position.set(-fittedCenter.x, -1.1 - fittedBox.min.y, -0.15)
    fbx.rotation.y = 0

    fbx.traverse(child => {
      if (child.isMesh || child.isSkinnedMesh) {
        child.castShadow = true
        child.receiveShadow = false
        child.frustumCulled = false
      }
    })

    console.info('[CharacterScene] FBX loaded', {
      sourceSize: { x: size.x, y: size.y, z: size.z },
      fittedSize: { x: fittedSize.x, y: fittedSize.y, z: fittedSize.z },
      fittedScale,
    })

    try {
      retargeterRef.current = createRetargeter(fbx)
    } catch (e) {
      console.error('[CharacterScene] Retargeter setup failed:', e)
    }

    return () => {
      retargeterRef.current?.resetPose()
      retargeterRef.current = null
    }
  }, [fbx])

  useEffect(() => {
    frameRef.current = 0
    carryMs.current = FRAME_MS
  }, [motionFrames])

  useFrame((_, delta) => {
    const r = retargeterRef.current
    if (!r) return

    if (!motionFrames?.length) {
      r.resetPose()
      carryMs.current = 0
      return
    }

    carryMs.current += delta * 1000
    while (carryMs.current >= FRAME_MS) {
      carryMs.current -= FRAME_MS
      const frame = motionFrames[frameRef.current]
      if (Array.isArray(frame) && frame.length === 22) r.applyFrame(frame)
      frameRef.current = (frameRef.current + 1) % motionFrames.length
    }
  })

  return <primitive object={fbx} />
}

function LoadingStand() {
  const meshRef = useRef()
  useFrame(({ clock }) => {
    if (meshRef.current) meshRef.current.rotation.y = clock.getElapsedTime() * 0.5
  })
  return (
    <group position={[0, -0.3, 0]}>
      <mesh ref={meshRef} castShadow>
        <capsuleGeometry args={[0.25, 0.8, 4, 8]} />
        <meshStandardMaterial color={CYAN} wireframe opacity={0.4} transparent />
      </mesh>
    </group>
  )
}

function Lighting() {
  return (
    <>
      <ambientLight intensity={1.2} color="#b0c0e0" />
      <directionalLight
        position={[2, 4, 5]}
        intensity={2.8}
        color="#ffffff"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={0.5}
        shadow-camera-far={20}
        shadow-camera-left={-4}
        shadow-camera-right={4}
        shadow-camera-top={6}
        shadow-camera-bottom={-2}
      />
      <directionalLight position={[-3, 2, 3]} intensity={1} color="#d0e8ff" />
      <directionalLight position={[-3, 3, -5]} intensity={1.5} color={CYAN} />
      <directionalLight position={[3, 2, -5]} intensity={0.9} color={PINK} />
    </>
  )
}

function MathVisualization({ visualization, stepIndex }) {
  const rootRef = useRef()
  const vizObjectsRef = useRef([])
  const vizStateRef = useRef({
    key: null,
    viz: null,
    stage: 0,
    stageChangedAt: 0,
    autoTimes: [],
    maxStages: 1,
    lastExternalStep: 0,
    pendingViz: null,
    pendingAt: 0,
    assetIndex: 0,
  })
  const assetPaths = useMemo(
    () => assetsDatabase
      .filter(asset => COUNTING_ASSET_IDS.has(asset.id))
      .map(asset => asset.path)
      .filter(path => typeof path === 'string' && path.endsWith('.glb')),
    []
  )
  const [assetTemplates, setAssetTemplates] = useState([])

  useEffect(() => {
    let cancelled = false
    const loader = new GLTFLoader()

    async function loadAssets() {
      try {
        const gltfs = await Promise.all(assetPaths.map(path => loader.loadAsync(path)))
        if (cancelled) return
        const templates = gltfs.map((gltf, index) => {
          const scene = gltf?.scene ? clone(gltf.scene) : new THREE.Group()
          const box = new THREE.Box3().setFromObject(scene)
          const size = new THREE.Vector3()
          const center = new THREE.Vector3()
          box.getSize(size)
          box.getCenter(center)
          const maxDimension = Math.max(size.x || 0, size.y || 0, size.z || 0, 1)
          const targetSize = TOKEN_FOOTPRINT
          const scale = targetSize / maxDimension
          scene.scale.setScalar(scale)
          scene.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale)
          scene.updateMatrixWorld(true)
          return {
            id: assetPaths[index] || `asset-${index}`,
            scene,
            footprint: Math.max((size.x || 0) * scale, (size.z || 0) * scale, TOKEN_FOOTPRINT),
          }
        })
        setAssetTemplates(templates)
      } catch (error) {
        console.warn('[CharacterScene] Counting assets failed to load, using fallback shapes.', error)
        if (!cancelled) setAssetTemplates([])
      }
    }

    loadAssets()
    return () => {
      cancelled = true
    }
  }, [assetPaths])

  function chooseAssetIndex(viz) {
    if (!assetTemplates.length) return 0
    const source = JSON.stringify(viz || {})
    let hash = 0
    for (let i = 0; i < source.length; i++) {
      hash = (hash * 31 + source.charCodeAt(i)) >>> 0
    }
    return hash % assetTemplates.length
  }

  function createAssetToken(color) {
    if (!assetTemplates.length) {
      const group = new THREE.Group()
      const token = createSphere(color)
      token.position.y = 0.14
      group.add(token)
      return { mesh: group, materials: [token.material], footprint: 0.3 }
    }
    const template = assetTemplates[vizStateRef.current.assetIndex % assetTemplates.length]
    const asset = clone(template.scene)
    const materials = applyTintToObject(asset, color)
    const group = new THREE.Group()
    asset.position.y = 0.045
    group.add(asset)
    return { mesh: group, materials: [...materials], footprint: Math.max(template.footprint || TOKEN_FOOTPRINT, 0.3) }
  }

  function addObject(object) {
    if (!rootRef.current) return
    rootRef.current.add(object.mesh)
    vizObjectsRef.current.push(object)
  }

  function clearVisualization() {
    const now = performance.now() / 1000
    vizObjectsRef.current.forEach(obj => {
      obj.clearing = true
      obj.clearStartedAt = now
    })
    vizStateRef.current.viz = null
    vizStateRef.current.stage = 0
  }

  function createAddition(a, b, now) {
    const total = a + b
    if (!fitsLinearLayout(total)) {
      addObject({
        mesh: createSpriteLabel(`Too many objects to show`, PINK, [1.45, 0.34, 1]),
        role: 'label',
        appearAt: now + 0.15,
        targetScale: 1,
        basePosition: new THREE.Vector3(0, 0.18, 0),
        stagePositions: { 0: new THREE.Vector3(0, 0.18, 0) },
        visibleFromStage: 0,
        bobPhase: 0.7,
      })
      addObject({
        mesh: createSpriteLabel(`= ${total}`, GOLD, [1.1, 0.42, 1]),
        role: 'label',
        appearAt: now + 0.45,
        targetScale: 1,
        basePosition: new THREE.Vector3(0, 0.72, 0),
        stagePositions: { 0: new THREE.Vector3(0, 0.72, 0) },
        visibleFromStage: 0,
        bobPhase: 1.6,
      })
      return { maxStages: 1, autoTimes: [0] }
    }

    const referenceFootprint = assetTemplates[vizStateRef.current.assetIndex]?.footprint || 0.26
    const gap = computeTokenGap(total, referenceFootprint)
    const groupAWidth = Math.max(0, (a - 1) * gap)
    const groupBWidth = Math.max(0, (b - 1) * gap)
    const groupAShift = -0.35 - groupAWidth * 0.5
    const groupBShift = 0.35 - groupBWidth * 0.5
    const resultShift = -(total - 1) * gap * 0.5

    for (let i = 0; i < total; i++) {
      const { mesh, materials } = createAssetToken(i < a ? CYAN : PINK)
      const startX = i < a ? groupAShift + i * gap : groupBShift + (i - a) * gap
      const resultX = resultShift + i * gap
      addObject({
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
          0: i < a ? CYAN : PINK,
          1: i < a ? CYAN : PINK,
          2: GOLD,
        },
        visibleFromStage: i < a ? 0 : 1,
        bobPhase: Math.random() * Math.PI * 2,
      })
    }

    addObject({
      mesh: createSpriteLabel('+', PINK, [0.34, 0.34, 1]),
      role: 'symbol',
      appearAt: now + 0.2,
      targetScale: 1,
      basePosition: new THREE.Vector3(0.02, 0.1, 0),
      stagePositions: {
        0: new THREE.Vector3(0.02, 0.1, 0),
        1: new THREE.Vector3(0.02, 0.1, 0),
      },
      visibleFromStage: 0,
      visibleUntilStage: 1,
      bobPhase: 1.2,
    })

    addObject({
      mesh: createSpriteLabel(`= ${total}`, GOLD, [1.1, 0.42, 1]),
      role: 'label',
      appearAt: now + 1.1,
      targetScale: 1,
      basePosition: new THREE.Vector3(0, 0.72, 0),
      stagePositions: { 2: new THREE.Vector3(0, 0.72, 0) },
      visibleFromStage: 2,
      bobPhase: 2.1,
    })

    return { maxStages: 3, autoTimes: [0, 0.55, 1.5] }
  }

  function createSubtraction(a, b, now) {
    const total = a
    if (!fitsLinearLayout(total)) {
      addObject({
        mesh: createSpriteLabel(`Too many objects to show`, PINK, [1.45, 0.34, 1]),
        role: 'label',
        appearAt: now + 0.15,
        targetScale: 1,
        basePosition: new THREE.Vector3(0, 0.18, 0),
        stagePositions: { 0: new THREE.Vector3(0, 0.18, 0) },
        visibleFromStage: 0,
        bobPhase: 0.8,
      })
      addObject({
        mesh: createSpriteLabel(`= ${Math.max(0, a - b)}`, GOLD, [1.05, 0.42, 1]),
        role: 'label',
        appearAt: now + 0.45,
        targetScale: 1,
        basePosition: new THREE.Vector3(0, 0.72, 0),
        stagePositions: { 0: new THREE.Vector3(0, 0.72, 0) },
        visibleFromStage: 0,
        bobPhase: 1.5,
      })
      return { maxStages: 1, autoTimes: [0] }
    }

    const referenceFootprint = assetTemplates[vizStateRef.current.assetIndex]?.footprint || 0.26
    const gap = computeTokenGap(total, referenceFootprint)
    const startX = -((total - 1) * gap) / 2
    const remaining = Math.max(0, a - b)

    for (let i = 0; i < total; i++) {
      const removed = i >= remaining
      const { mesh, materials } = createAssetToken(removed ? PINK : CYAN)
      addObject({
        mesh,
        materials,
        role: removed ? 'removed' : 'remaining',
        appearAt: now + i * 0.06,
        targetScale: 1,
        basePosition: new THREE.Vector3(startX + i * gap, 0, 0),
        stagePositions: {
          0: new THREE.Vector3(startX + i * gap, 0, 0),
          1: new THREE.Vector3(startX + i * gap, 0, 0),
          2: new THREE.Vector3(startX + i * gap, 0, removed ? 0.2 : 0),
          3: new THREE.Vector3(startX + i * gap, 0, 0),
        },
        colors: {
          0: removed ? PINK : CYAN,
          1: removed ? RED : CYAN,
          2: removed ? RED : CYAN,
          3: removed ? RED : GOLD,
        },
        visibleFromStage: 0,
        bobPhase: Math.random() * Math.PI * 2,
        removed,
        explodeVector: removed
          ? new THREE.Vector3((Math.random() - 0.5) * 1.2, Math.random() * 0.9 + 0.2, (Math.random() - 0.5) * 0.5)
          : null,
      })
    }

    addObject({
      mesh: createSpriteLabel(`take away ${b}`, PINK, [1.05, 0.34, 1]),
      role: 'label',
      appearAt: now + 0.25,
      targetScale: 1,
      basePosition: new THREE.Vector3(0, 0.72, 0),
      stagePositions: {
        0: new THREE.Vector3(0, 0.72, 0),
        1: new THREE.Vector3(0, 0.72, 0),
      },
      visibleFromStage: 0,
      visibleUntilStage: 1,
      bobPhase: 0.9,
    })

    addObject({
      mesh: createSpriteLabel(`= ${Math.max(0, a - b)}`, GOLD, [1.05, 0.42, 1]),
      role: 'label',
      appearAt: now + 1.2,
      targetScale: 1,
      basePosition: new THREE.Vector3(0, 0.72, 0),
      stagePositions: { 3: new THREE.Vector3(0, 0.72, 0) },
      visibleFromStage: 3,
      bobPhase: 1.5,
    })

    return { maxStages: 4, autoTimes: [0, 0.5, 1.05, 1.55] }
  }

  function createMultiplication(a, b, now) {
    if (!fitsGridLayout(a, b)) {
      addObject({
        mesh: createSpriteLabel(`Too many objects to show`, PINK, [1.45, 0.34, 1]),
        role: 'label',
        appearAt: now + 0.15,
        targetScale: 1,
        basePosition: new THREE.Vector3(0, 0.18, 0),
        stagePositions: { 0: new THREE.Vector3(0, 0.18, 0) },
        visibleFromStage: 0,
        bobPhase: 0.7,
      })
      addObject({
        mesh: createSpriteLabel(`= ${a * b}`, GOLD, [1.08, 0.42, 1]),
        role: 'label',
        appearAt: now + 0.45,
        targetScale: 1,
        basePosition: new THREE.Vector3(0, 0.72, 0),
        stagePositions: { 0: new THREE.Vector3(0, 0.72, 0) },
        visibleFromStage: 0,
        bobPhase: 1.4,
      })
      return { maxStages: 1, autoTimes: [0] }
    }

    const referenceFootprint = assetTemplates[vizStateRef.current.assetIndex]?.footprint || 0.26
    const colGap = Math.max(referenceFootprint * 1.9, Math.min(0.52, VISUAL_MAX_WIDTH / Math.max(1, a - 1 || 1)))
    const rowGap = Math.max(referenceFootprint * 1.7, Math.min(0.32, VISUAL_MAX_HEIGHT / Math.max(1, b - 1 || 1)))

    for (let col = 0; col < a; col++) {
      const colColor = new THREE.Color(CYAN).lerp(new THREE.Color(PINK), a <= 1 ? 0 : col / (a - 1))
      for (let row = 0; row < b; row++) {
        const { mesh, materials } = createAssetToken(`#${colColor.getHexString()}`)
        addObject({
          mesh,
          materials,
          role: 'cube',
          appearAt: now + col * 0.3 + row * 0.04,
          targetScale: 1,
          basePosition: new THREE.Vector3(
            (col - (a - 1) / 2) * colGap,
            ((b - 1) / 2 - row) * rowGap,
            0
          ),
          stagePositions: {
            0: new THREE.Vector3((col - (a - 1) / 2) * colGap, ((b - 1) / 2 - row) * rowGap, 0),
            1: new THREE.Vector3((col - (a - 1) / 2) * colGap, ((b - 1) / 2 - row) * rowGap, 0),
            2: new THREE.Vector3((col - (a - 1) / 2) * colGap, ((b - 1) / 2 - row) * rowGap, 0),
          },
          colors: {
            0: `#${colColor.getHexString()}`,
            1: `#${colColor.getHexString()}`,
            2: GOLD,
          },
          visibleFromStage: 0,
          bobPhase: Math.random() * Math.PI * 2,
        })
      }

      const outline = createColumnOutline(Math.max(0.38, b * rowGap + 0.16), PINK)
      outline.position.set((col - (a - 1) / 2) * colGap, 0, 0)
      addObject({
        mesh: outline,
        role: 'outline',
        appearAt: now + a * 0.3 + 0.1,
        targetScale: 1,
        basePosition: outline.position.clone(),
        stagePositions: {
          1: outline.position.clone(),
          2: outline.position.clone(),
        },
        visibleFromStage: 1,
        bobPhase: col * 0.3,
      })
    }

    addObject({
      mesh: createSpriteLabel(`= ${a * b}`, GOLD, [1.08, 0.42, 1]),
      role: 'label',
      appearAt: now + a * 0.3 + 0.8,
      targetScale: 1,
      basePosition: new THREE.Vector3(0, Math.max(0.72, b * 0.18 + 0.38), 0),
      stagePositions: { 2: new THREE.Vector3(0, Math.max(0.72, b * 0.18 + 0.38), 0) },
      visibleFromStage: 2,
      bobPhase: 1.7,
    })

    return { maxStages: 3, autoTimes: [0, a * 0.3 + 0.35, a * 0.3 + 1.2] }
  }

  function createDivision(total, groupSize, quotient, remainder, now) {
    if (!fitsGridLayout(groupSize, Math.max(1, quotient + (remainder > 0 ? 1 : 0))) || total > MAX_OBJECTS_PER_ROW * MAX_OBJECT_COLUMNS) {
      addObject({
        mesh: createSpriteLabel(`Too many objects to show`, PINK, [1.45, 0.34, 1]),
        role: 'label',
        appearAt: now + 0.15,
        targetScale: 1,
        basePosition: new THREE.Vector3(0, 0.18, 0),
        stagePositions: { 0: new THREE.Vector3(0, 0.18, 0) },
        visibleFromStage: 0,
        bobPhase: 0.9,
      })
      addObject({
        mesh: createSpriteLabel(
          remainder > 0 ? `= ${quotient} R${remainder}` : `= ${quotient}`,
          GOLD,
          [1.08, 0.42, 1]
        ),
        role: 'label',
        appearAt: now + 0.45,
        targetScale: 1,
        basePosition: new THREE.Vector3(0, 0.72, 0),
        stagePositions: { 0: new THREE.Vector3(0, 0.72, 0) },
        visibleFromStage: 0,
        bobPhase: 1.8,
      })
      return { maxStages: 1, autoTimes: [0] }
    }

    const palette = [CYAN, PINK, '#8cff66', '#b794ff', '#ff9f68', '#7bdff2']
    const referenceFootprint = assetTemplates[vizStateRef.current.assetIndex]?.footprint || 0.26
    const initialGap = computeTokenGap(total, referenceFootprint, VISUAL_MAX_WIDTH, 0.28)
    const groupedGap = Math.max(referenceFootprint * 1.75, Math.min(0.24, VISUAL_MAX_WIDTH / Math.max(1, groupSize)))
    const groupGap = 0.18
    const startX = -((total - 1) * initialGap) / 2
    const visibleGroups = Math.max(1, quotient + (remainder > 0 ? 1 : 0))

    for (let i = 0; i < total; i++) {
      const groupIndex = Math.floor(i / groupSize)
      const indexInGroup = i % groupSize
      const groupCenterOffset = (groupIndex - (visibleGroups - 1) / 2) * (groupSize * groupedGap + groupGap)
      const groupedX = groupCenterOffset + (indexInGroup - (groupSize - 1) / 2) * groupedGap
      const groupedY = groupIndex < quotient ? (0.2 - groupIndex * 0.5) : -0.75
      const isRemainder = groupIndex >= quotient
      const { mesh, materials } = createAssetToken(CYAN)
      addObject({
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
          0: CYAN,
          1: palette[groupIndex % palette.length],
          2: isRemainder ? RED : palette[groupIndex % palette.length],
          3: isRemainder ? RED : GOLD,
        },
        visibleFromStage: 0,
        bobPhase: Math.random() * Math.PI * 2,
      })
    }

    addObject({
      mesh: createSpriteLabel(`groups of ${groupSize}`, PINK, [1.25, 0.34, 1]),
      role: 'label',
      appearAt: now + 0.3,
      targetScale: 1,
      basePosition: new THREE.Vector3(0, 0.78, 0),
      stagePositions: {
        1: new THREE.Vector3(0, 0.78, 0),
        2: new THREE.Vector3(0, 0.78, 0),
      },
      visibleFromStage: 1,
      visibleUntilStage: 2,
      bobPhase: 1.1,
    })

    addObject({
      mesh: createSpriteLabel(
        remainder > 0 ? `= ${quotient} R${remainder}` : `= ${quotient}`,
        GOLD,
        [1.08, 0.42, 1]
      ),
      role: 'label',
      appearAt: now + 1.15,
      targetScale: 1,
      basePosition: new THREE.Vector3(0, 1.02, 0),
      stagePositions: {
        3: new THREE.Vector3(0, 1.02, 0),
      },
      visibleFromStage: 3,
      bobPhase: 2.4,
    })

    return { maxStages: 4, autoTimes: [0, 0.45, 1.05, 1.55] }
  }

  function spawnVisualization(viz) {
    if (!rootRef.current || !viz?.type) return
    const now = performance.now() / 1000
    let spec = null
    vizStateRef.current.assetIndex = chooseAssetIndex(viz)

    if (viz.type === 'addition') spec = createAddition(Number(viz.a) || 0, Number(viz.b) || 0, now)
    if (viz.type === 'subtraction') spec = createSubtraction(Number(viz.a) || 0, Number(viz.b) || 0, now)
    if (viz.type === 'multiplication') spec = createMultiplication(Number(viz.a) || 0, Number(viz.b) || 0, now)
    if (viz.type === 'division') {
      spec = createDivision(
        Number(viz.total) || 0,
        Number(viz.groupSize) || 0,
        Number(viz.quotient) || 0,
        Number(viz.remainder) || 0,
        now
      )
    }
    if (!spec) return

    vizStateRef.current.viz = viz
    vizStateRef.current.stage = 0
    vizStateRef.current.stageChangedAt = now
    vizStateRef.current.autoTimes = spec.autoTimes
    vizStateRef.current.maxStages = spec.maxStages
    vizStateRef.current.lastExternalStep = stepIndex
  }

  useEffect(() => {
    const key = visualization ? JSON.stringify(visualization) : null
    if (vizStateRef.current.key === key) return
    vizStateRef.current.key = key

    if (!visualization) {
      clearVisualization()
      return
    }

    if (vizObjectsRef.current.length) {
      clearVisualization()
      vizStateRef.current.pendingViz = visualization
      vizStateRef.current.pendingAt = performance.now() / 1000 + 0.32
    } else {
      spawnVisualization(visualization)
    }
  }, [visualization, stepIndex])

  useFrame(({ clock }) => {
    const now = performance.now() / 1000
    const vizState = vizStateRef.current

    if (vizState.pendingViz && now >= vizState.pendingAt && vizObjectsRef.current.length === 0) {
      const pending = vizState.pendingViz
      vizState.pendingViz = null
      spawnVisualization(pending)
    }

    if (vizState.viz?.steps && stepIndex !== vizState.lastExternalStep) {
      vizState.lastExternalStep = stepIndex
      vizState.stage = Math.min(stepIndex, vizState.maxStages - 1)
      vizState.stageChangedAt = now
    } else if (vizState.viz && !vizState.viz.steps) {
      const nextStage = vizState.stage + 1
      if (nextStage < vizState.maxStages) {
        const wait = (vizState.autoTimes[nextStage] || 0) - (vizState.autoTimes[vizState.stage] || 0)
        if (now - vizState.stageChangedAt >= wait) {
          vizState.stage = nextStage
          vizState.stageChangedAt = now
        }
      }
    }

    const stageProgress = Math.min(1, Math.max(0, (now - vizState.stageChangedAt) / 0.6))
    const survivors = []

    for (const obj of vizObjectsRef.current) {
      const { mesh } = obj
      const materials = obj.materials || (mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [])
      const primaryMaterial = materials[0] || null

      if (obj.clearing) {
        const t = Math.min(1, (now - obj.clearStartedAt) / 0.3)
        const s = Math.max(0.0001, 1 - t)
        mesh.scale.setScalar(s)
        materials.forEach(material => {
          if (material && 'opacity' in material) material.opacity = 1 - t
        })
        if (t >= 1) {
          rootRef.current?.remove(mesh)
          if (mesh.geometry) mesh.geometry.dispose?.()
          materials.forEach(material => {
            material?.map?.dispose?.()
            material?.dispose?.()
          })
          continue
        }
        survivors.push(obj)
        continue
      }

      const visibleFromStage = obj.visibleFromStage ?? 0
      const visibleUntilStage = obj.visibleUntilStage ?? Infinity
      const stageVisible = vizState.stage >= visibleFromStage && vizState.stage <= visibleUntilStage
      const spawnT = Math.min(1, Math.max(0, (now - (obj.appearAt ?? 0)) / 0.5))
      const baseScale = stageVisible ? elasticOut(spawnT) * (obj.targetScale || 1) : 0.0001
      mesh.scale.setScalar(baseScale)
      materials.forEach(material => {
        if (material && 'opacity' in material) material.opacity = stageVisible ? 1 : 0
      })

      const currentStagePos =
        obj.stagePositions?.[vizState.stage] ||
        obj.stagePositions?.[Math.max(...Object.keys(obj.stagePositions || { 0: 0 }).map(Number))] ||
        obj.basePosition
      const prevStagePos = obj.stagePositions?.[Math.max(0, vizState.stage - 1)] || currentStagePos
      const pos = prevStagePos.clone().lerp(currentStagePos, stageProgress)

      if (obj.role === 'removed' && vizState.stage >= 2 && obj.explodeVector) {
        const explodeT = Math.min(1, (now - vizState.stageChangedAt) / 0.45)
        pos.addScaledVector(obj.explodeVector, explodeT)
        mesh.scale.setScalar(Math.max(0.0001, 1 - explodeT))
        materials.forEach(material => {
          if (material && 'opacity' in material) material.opacity = 1 - explodeT
        })
      }

      if (obj.role === 'removed' && vizState.stage === 1) {
        pos.x += Math.sin(now * 38 + obj.bobPhase) * 0.03
      }

      const bob = 0
      mesh.position.set(pos.x, pos.y + bob, pos.z)

      const targetColor = obj.colors?.[vizState.stage]
      if (targetColor) {
        const target = new THREE.Color(targetColor)
        materials.forEach(material => {
          if (material?.color) material.color.lerp(target, 0.16)
          if (material?.emissive) material.emissive.lerp(target, 0.16)
        })
      }
      if (obj.role === 'outline' && primaryMaterial) primaryMaterial.opacity = vizState.stage >= 1 ? 0.9 : 0

      if ((obj.role === 'token' || obj.role === 'cube' || obj.role === 'remaining') && vizState.stage === vizState.maxStages - 1) {
        // no pulse — keep consistent size
      }

      survivors.push(obj)
    }

    vizObjectsRef.current = survivors
  })

  return <group ref={rootRef} position={[1.95, 0.45, 0]} />
}

function SceneContent({ motionFrames, aiState, visualization, visualizationStepIndex }) {
  return (
    <>
      <Lighting />
      <Particles />
      <NeonGrid />
      <SolarSystem aiState={aiState} />
      <Suspense fallback={null}>
        <MathVisualization visualization={visualization} stepIndex={visualizationStepIndex} />
      </Suspense>
      <Suspense fallback={<LoadingStand />}>
        <FBXCharacter motionFrames={motionFrames} aiState={aiState} />
      </Suspense>
    </>
  )
}

export default function CharacterScene({
  motionFrames,
  aiState,
  visualization,
  visualizationStepIndex,
}) {
  return (
    <Canvas
      style={{ position: 'fixed', inset: 0, zIndex: 0 }}
      camera={{ position: [0, 0.5, 5.2], fov: 45, near: 0.01, far: 100 }}
      gl={{
        antialias: true,
        outputColorSpace: THREE.SRGBColorSpace,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.4,
      }}
      shadows
    >
      <color attach="background" args={['#06080f']} />
      <fog attach="fog" args={['#06080f', 8, 30]} />
      <SceneContent
        motionFrames={motionFrames}
        aiState={aiState}
        visualization={visualization}
        visualizationStepIndex={visualizationStepIndex}
      />
    </Canvas>
  )
}
