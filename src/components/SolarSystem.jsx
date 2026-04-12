/**
 * Solar system backdrop — merged from `vis`. When aiState becomes non-null, one planet
 * eases forward as a focal “platform”; when idle, planets sit in a horizontal line.
 *
 * Planet meshes: `public/models/planets/*.glb` (textures preserved; no flat tint).
 */
import { useRef, useState, useEffect, useMemo, Suspense } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import * as THREE from 'three'

/** Order: Mercury → Neptune (matches solar order). */
const PLANET_URLS = [
  '/models/planets/mercury.glb',
  '/models/planets/venus.glb',
  '/models/planets/earth.glb',
  '/models/planets/mars.glb',
  '/models/planets/jupiter.glb',
  '/models/planets/saturn.glb',
  '/models/planets/uranus.glb',
  '/models/planets/neptune.glb',
]

const PLANET_DEFS = [
  { name: 'Mercury', size: 0.12 },
  { name: 'Venus', size: 0.18 },
  { name: 'Earth', size: 0.2 },
  { name: 'Mars', size: 0.15 },
  { name: 'Jupiter', size: 0.35 },
  { name: 'Saturn', size: 0.32 },
  { name: 'Uranus', size: 0.25 },
  { name: 'Neptune', size: 0.24 },
]

function Planets({ aiState }) {
  const [targetPlanetIndex, setTargetPlanetIndex] = useState(null)
  const [hoveredPlanetIndex, setHoveredPlanetIndex] = useState(null)
  const prevAiState = useRef(aiState)
  const lastTargetPlanetIndexRef = useRef(null)
  const spinBoostRef = useRef(Array(PLANET_DEFS.length).fill(0))

  const planetRefs = useRef([])

  const planetModels = useLoader(GLTFLoader, PLANET_URLS)
  const fittedPlanets = useMemo(() => {
    const models = Array.isArray(planetModels) ? planetModels : [planetModels]
    return models.map((gltf) => {
      const root = gltf?.scene ? clone(gltf.scene) : new THREE.Group()
      const box = new THREE.Box3().setFromObject(root)
      const size = new THREE.Vector3()
      const center = new THREE.Vector3()
      box.getSize(size)
      box.getCenter(center)
      const maxDimension = Math.max(size.x || 0, size.y || 0, size.z || 0, 1)
      const scale = 2 / maxDimension
      root.scale.setScalar(scale)
      root.position.set(-center.x * scale, -center.y * scale, -center.z * scale)
      root.updateMatrixWorld(true)
      root.traverse((child) => {
        if (child.isMesh || child.isSkinnedMesh) {
          child.castShadow = true
          child.receiveShadow = false
          child.frustumCulled = false
        }
      })
      return root
    })
  }, [planetModels])

  /** One scene clone per planet slot (stable; avoid cloning in render). */
  const planetInstances = useMemo(() => fittedPlanets.map((template) => clone(template)), [fittedPlanets])

  const LINE_WIDTH = 4.8
  const Y_IDLE = 1.65
  const Z_IDLE = -0.5

  const Y_FOCUS = 0.22
  const Z_FOCUS = -2.35
  const FOCUS_PLATFORM_SCALE = 1.18

  const lineIndex = (i) => {
    const n = PLANET_DEFS.length
    if (n <= 1) return 0
    return (i / (n - 1) - 0.5) * LINE_WIDTH
  }

  useEffect(() => {
    if (prevAiState.current === null && aiState !== null) {
      let nextIndex = Math.floor(Math.random() * PLANET_DEFS.length)
      if (PLANET_DEFS.length > 1 && nextIndex === lastTargetPlanetIndexRef.current) {
        nextIndex = (nextIndex + 1 + Math.floor(Math.random() * (PLANET_DEFS.length - 1))) % PLANET_DEFS.length
      }
      lastTargetPlanetIndexRef.current = nextIndex
      setTargetPlanetIndex(nextIndex)
    } else if (prevAiState.current !== null && aiState === null) {
      setTargetPlanetIndex(null)
    }
    prevAiState.current = aiState
  }, [aiState])

  useFrame((state, delta) => {
    const k = 1 - Math.exp(-5 * delta)

    PLANET_DEFS.forEach((def, i) => {
      const pMesh = planetRefs.current[i]
      if (!pMesh) return

      const isTarget = targetPlanetIndex === i
      const isIdle = targetPlanetIndex === null
      const isHovered = hoveredPlanetIndex === i
      spinBoostRef.current[i] = Math.max(0, spinBoostRef.current[i] - delta * 1.5)
      const spinBoost = spinBoostRef.current[i]

      let tX = 0
      let tY = Y_IDLE
      let tZ = Z_IDLE
      let tScale = def.size

      if (isIdle) {
        tX = lineIndex(i)
      } else if (isTarget) {
        tX = 0
        tY = Y_FOCUS
        tZ = Z_FOCUS
        tScale = FOCUS_PLATFORM_SCALE
      } else {
        tX = lineIndex(i)
        tScale = 0.0001
      }

      pMesh.position.x += (tX - pMesh.position.x) * k
      pMesh.position.y += (tY - pMesh.position.y) * k
      pMesh.position.z += (tZ - pMesh.position.z) * k

      const currentScale = pMesh.scale.x
      const nextScale = currentScale + (tScale - currentScale) * k
      pMesh.scale.setScalar(Math.max(0.0001, nextScale))

      const baseSpin = isTarget ? 0.2 : 0.4
      const hoverSpin = isHovered ? 0.45 : 0
      const clickSpin = spinBoost * 2.2
      const spinRate = baseSpin + hoverSpin + clickSpin
      if (isIdle) {
        pMesh.rotation.y += delta * spinRate
      } else if (isTarget) {
        pMesh.rotation.y += delta * spinRate
      } else {
        pMesh.rotation.y += delta * (0.16 + clickSpin * 0.5)
      }
    })
  })

  return (
    <group position={[0, 0, 0]}>
      {PLANET_DEFS.map((def, i) => (
        <group
          key={def.name}
          ref={(el) => {
            planetRefs.current[i] = el
          }}
          scale={0.0001}
          onPointerOver={(event) => {
            event.stopPropagation()
            setHoveredPlanetIndex(i)
            document.body.style.cursor = 'pointer'
          }}
          onPointerOut={(event) => {
            event.stopPropagation()
            setHoveredPlanetIndex((current) => (current === i ? null : current))
            document.body.style.cursor = 'default'
          }}
          onClick={(event) => {
            event.stopPropagation()
            spinBoostRef.current[i] = 1.5
          }}
        >
          <primitive object={planetInstances[i]} />
        </group>
      ))}
    </group>
  )
}

export default function SolarSystem({ aiState }) {
  return (
    <Suspense fallback={null}>
      <Planets aiState={aiState} />
    </Suspense>
  )
}
