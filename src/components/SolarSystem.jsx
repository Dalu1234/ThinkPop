import { useRef, useState, useEffect, useMemo } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js'

// Planet definitions
const PLANET_DEFS = [
  { name: 'Mercury', size: 0.12, path: '/models/mercury.glb', color: '#b6ada4' },
  { name: 'Venus',   size: 0.18, path: '/models/venus.glb', color: '#d8b47a' },
  { name: 'Earth',   size: 0.20, path: '/models/earth.glb', color: '#4b98fc' },
  { name: 'Mars',    size: 0.15, path: '/models/mars.glb', color: '#e27b58' },
  { name: 'Jupiter', size: 0.35, path: '/models/jupiter.glb', color: '#c99b75' },
  { name: 'Saturn',  size: 0.32, path: '/models/saturn.glb', color: '#eaddb0' },
  { name: 'Uranus',  size: 0.25, path: '/models/uranus.glb', color: '#c2edf2' },
  { name: 'Neptune', size: 0.24, path: '/models/neptune.glb', color: '#3e66f9' },
]

export default function SolarSystem({ aiState }) {
  const [targetPlanetIndex, setTargetPlanetIndex] = useState(null)
  const [hoveredPlanetIndex, setHoveredPlanetIndex] = useState(null)
  const prevAiState = useRef(aiState)
  const spinBoostRef = useRef(Array(PLANET_DEFS.length).fill(0))
  
  const planetRefs = useRef([])
  const planetModels = useLoader(GLTFLoader, PLANET_DEFS.map(def => def.path))
  const fittedPlanets = useMemo(() => {
    const models = Array.isArray(planetModels) ? planetModels : [planetModels]
    return models.map((gltf, index) => {
      const root = gltf?.scene ? clone(gltf.scene) : new THREE.Group()
      const tint = new THREE.Color(PLANET_DEFS[index].color)
      const box = new THREE.Box3().setFromObject(root)
      const size = new THREE.Vector3()
      const center = new THREE.Vector3()
      box.getSize(size)
      box.getCenter(center)
      const maxDimension = Math.max(size.x || 0, size.y || 0, size.z || 0, 1)
      const scale = 2 / maxDimension
      root.scale.setScalar(scale)
      root.position.set(-center.x * scale, -center.y * scale, -center.z * scale)
      root.traverse(child => {
        if (child.isMesh || child.isSkinnedMesh) {
          child.castShadow = true
          child.receiveShadow = false
          child.frustumCulled = false
          const materialList = Array.isArray(child.material) ? child.material : [child.material]
          const nextMaterials = materialList.map((sourceMaterial) => {
            const material = sourceMaterial.clone()
            if (material.color) {
              material.color.copy(tint)
            }
            if ('emissive' in material) {
              material.emissive = tint.clone()
              material.emissiveIntensity = 0.18
            }
            material.needsUpdate = true
            return material
          })
          child.material = Array.isArray(child.material) ? nextMaterials : nextMaterials[0]
        }
      })
      return root
    })
  }, [planetModels])

  // Layout parameters
  const LINE_WIDTH = 4.8
  const Y_IDLE = 1.65
  const Z_IDLE = -0.5
  
  const Y_FOCUS = -1.92
  const Z_FOCUS = -0.62
  const FOCUS_PLATFORM_SCALE = 0.82

  useEffect(() => {
    // Detect transition from null to non-null
    if (prevAiState.current === null && aiState !== null) {
      const rand = Math.floor(Math.random() * PLANET_DEFS.length)
      setTargetPlanetIndex(rand)
    } 
    // Detect return to null
    else if (prevAiState.current !== null && aiState === null) {
      setTargetPlanetIndex(null)
    }
    prevAiState.current = aiState
  }, [aiState])

  useFrame((state, delta) => {
    const t = state.clock.getElapsedTime()
    // Ease-out
    const k = 1 - Math.exp(-5 * delta)

    PLANET_DEFS.forEach((def, i) => {
      const pMesh = planetRefs.current[i]
      if (!pMesh) return

      const isTarget = targetPlanetIndex === i
      const isIdle = targetPlanetIndex === null
      const isHovered = hoveredPlanetIndex === i
      spinBoostRef.current[i] = Math.max(0, spinBoostRef.current[i] - delta * 1.5)
      const spinBoost = spinBoostRef.current[i]

      // Target position / scale
      let tX = 0, tY = Y_IDLE, tZ = Z_IDLE, tScale = def.size

      if (isIdle) {
        // Form a line
        tX = ((i / (PLANET_DEFS.length - 1)) -  0.5) * LINE_WIDTH
      } else if (isTarget) {
        // Normalize all selected planets to the same "platform" size under Baymax.
        tX = 0
        tY = Y_FOCUS
        tZ = Z_FOCUS
        tScale = FOCUS_PLATFORM_SCALE
      } else {
        // Non-target shrinks out of sight
        tX = ((i / (PLANET_DEFS.length - 1)) - 0.5) * LINE_WIDTH
        tScale = 0.0001
      }

      // Smooth interpolation using exponential framerate-independent easing
      pMesh.position.x += (tX - pMesh.position.x) * k
      pMesh.position.y += (tY - pMesh.position.y) * k
      pMesh.position.z += (tZ - pMesh.position.z) * k
      
      const currentScale = pMesh.scale.x
      const nextScale = currentScale + (tScale - currentScale) * k
      pMesh.scale.setScalar(Math.max(0.0001, nextScale))

      // Spin and bobbing animations
      const baseSpin = isTarget ? 0.2 : 0.4
      const hoverSpin = isHovered ? 0.45 : 0
      const clickSpin = spinBoost * 2.2
      const spinRate = baseSpin + hoverSpin + clickSpin
      if (isIdle) {
        pMesh.rotation.y += delta * spinRate
        pMesh.position.y += Math.sin(t * 1.5 + i) * 0.001
      } else if (isTarget) {
        pMesh.rotation.y += delta * spinRate
        pMesh.position.y += Math.sin(t * 1.0) * 0.002
      } else {
        pMesh.rotation.y += delta * (0.16 + clickSpin * 0.5)
      }
      
    })
  })

  // Start initialization at invisible size
  return (
    <group position={[0,0,0]}>
      {PLANET_DEFS.map((def, i) => {
        return (
          <group 
            key={def.name} 
            ref={el => planetRefs.current[i] = el}
            scale={0.0001}
            onPointerOver={(event) => {
              event.stopPropagation()
              setHoveredPlanetIndex(i)
              document.body.style.cursor = 'pointer'
            }}
            onPointerOut={(event) => {
              event.stopPropagation()
              setHoveredPlanetIndex(current => (current === i ? null : current))
              document.body.style.cursor = 'default'
            }}
            onClick={(event) => {
              event.stopPropagation()
              spinBoostRef.current[i] = 1.5
            }}
          >
            <primitive object={clone(fittedPlanets[i])} />
          </group>
        )
      })}
    </group>
  )
}
