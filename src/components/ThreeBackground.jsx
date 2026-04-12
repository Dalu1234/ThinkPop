import { Canvas, useFrame } from '@react-three/fiber'
import { useRef, useMemo, useEffect } from 'react'
import * as THREE from 'three'

const PARTICLE_COUNT = 130

function Particles() {
  const pointsRef = useRef()

  const [positions, speeds, colors] = useMemo(() => {
    const pos = new Float32Array(PARTICLE_COUNT * 3)
    const spd = new Float32Array(PARTICLE_COUNT)
    const col = new Float32Array(PARTICLE_COUNT * 3)

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      pos[i * 3]     = (Math.random() - 0.5) * 22
      pos[i * 3 + 1] = (Math.random() - 0.5) * 12
      pos[i * 3 + 2] = -2 - Math.random() * 4
      spd[i] = 0.003 + Math.random() * 0.008

      if (Math.random() > 0.5) {
        col[i * 3]     = 0.0
        col[i * 3 + 1] = 0.9
        col[i * 3 + 2] = 1.0
      } else {
        col[i * 3]     = 1.0
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
        positions[i * 3]     = (Math.random() - 0.5) * 22
      }
    }
    if (pointsRef.current) {
      pointsRef.current.geometry.attributes.position.needsUpdate = true
    }
  })

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={PARTICLE_COUNT}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          count={PARTICLE_COUNT}
          array={colors}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.045}
        vertexColors
        transparent
        opacity={0.65}
        sizeAttenuation
      />
    </points>
  )
}

/** @param {{ motion?: string, hand?: string }} g */
function gestureTargets(g, t) {
  const motion = g?.motion || 'rest'
  const hand = g?.hand || 'both'
  const o = {
    lx: 0,
    lz: 0,
    rx: 0,
    rz: 0,
    lhy: 0,
    rhy: 0,
  }

  const left = hand === 'left' || hand === 'both'
  const right = hand === 'right' || hand === 'both'

  if (motion === 'wave') {
    if (right) {
      o.rz = Math.sin(t * 7) * 0.42
      o.rx = Math.sin(t * 7) * 0.1
    }
    if (left) {
      o.lz = Math.sin(t * 7 + 1) * -0.42
      o.lx = Math.sin(t * 7 + 1) * 0.1
    }
  } else if (motion === 'point') {
    if (right) {
      o.rx = -0.62
      o.rz = -0.12
    }
    if (left) {
      o.lx = -0.62
      o.lz = 0.12
    }
  } else if (motion === 'count') {
    if (right) o.rhy = Math.sin(t * 8) * 0.09
    if (left) o.lhy = Math.sin(t * 8 + 0.5) * 0.09
  } else if (motion === 'walk') {
    const stride = Math.sin(t * 4)
    if (right) {
      o.rx = stride * 0.15
      o.rz = -0.12
    }
    if (left) {
      o.lx = -stride * 0.15
      o.lz = 0.12
    }
  } else if (motion === 'emphasize') {
    const p = Math.sin(t * 5) * 0.2
    if (right) {
      o.rz = -0.35 - p
      o.rx = -0.15
    }
    if (left) {
      o.lz = 0.35 + p
      o.lx = -0.15
    }
  } else if (motion === 'expressive') {
    // Background Baymax: generic teaching energy while the FBX character is driven by MDM prompts.
    const p = Math.sin(t * 4.5) * 0.14
    if (right) {
      o.rz = -0.28 - p
      o.rx = -0.12 + Math.sin(t * 3) * 0.06
    }
    if (left) {
      o.lz = 0.28 + p
      o.lx = -0.12 + Math.sin(t * 3 + 0.8) * 0.06
    }
  }

  return o
}

function BaymaxCharacter({ aiState, gesture }) {
  const groupRef      = useRef()
  const headRef       = useRef()
  const chestRef      = useRef()
  const rippleRef     = useRef()
  const armsRootRef   = useRef()
  const leftArmRef    = useRef()
  const rightArmRef   = useRef()
  const leftHandRef   = useRef()
  const rightHandRef  = useRef()

  const prevStateRef   = useRef(aiState)
  const nodding        = useRef(false)
  const nodProgress    = useRef(0)
  const idleTimer      = useRef(0)
  const lookDir        = useRef(1)
  const lookAmount     = useRef(0)
  const smoothRef      = useRef({ lx: 0, lz: 0, rx: 0, rz: 0, lhy: 0, rhy: 0 })
  const gestureTime    = useRef(0)

  useEffect(() => {
    if (prevStateRef.current === 'speaking' && aiState === null) {
      nodding.current = true
      nodProgress.current = 0
    }
    prevStateRef.current = aiState
  }, [aiState])

  useEffect(() => {
    gestureTime.current = 0
  }, [gesture?.motion])

  const isSpeaking   = aiState === 'speaking'
  const isGenerating = aiState === 'building'

  useFrame((state, delta) => {
    const t = state.clock.getElapsedTime()
    if (!groupRef.current) return

    gestureTime.current += delta
    const g = isSpeaking && gesture ? gesture : { motion: 'rest', hand: 'both' }
    const tgt = gestureTargets(g, gestureTime.current)
    const k = 1 - Math.exp(-10 * delta)
    const s = smoothRef.current
    s.lx += (tgt.lx - s.lx) * k
    s.lz += (tgt.lz - s.lz) * k
    s.rx += (tgt.rx - s.rx) * k
    s.rz += (tgt.rz - s.rz) * k
    s.lhy += (tgt.lhy - s.lhy) * k
    s.rhy += (tgt.rhy - s.rhy) * k

    if (g.motion === 'rest' || !isSpeaking) {
      s.lx *= 0.9
      s.lz *= 0.9
      s.rx *= 0.9
      s.rz *= 0.9
      s.lhy *= 0.9
      s.rhy *= 0.9
    }

    groupRef.current.position.y = -0.4 + Math.sin(t * 1.3) * 0.09

    if (aiState === null) {
      idleTimer.current += delta
      if (idleTimer.current > 3) {
        lookAmount.current += 0.018 * lookDir.current
        if (Math.abs(lookAmount.current) > 0.28) lookDir.current *= -1
        groupRef.current.rotation.y = lookAmount.current
      }
    } else {
      groupRef.current.rotation.y *= 0.92
      idleTimer.current = 0
      lookAmount.current *= 0.92
    }

    if (nodding.current && headRef.current) {
      nodProgress.current += 0.04
      headRef.current.rotation.x = Math.sin(nodProgress.current * Math.PI * 1.5) * 0.28
      if (nodProgress.current >= 1) {
        nodding.current = false
        headRef.current.rotation.x = 0
      }
    }

    if (chestRef.current) {
      const intensity = isSpeaking
        ? 0.25 + Math.sin(t * 5) * 0.25
        : 0.08
      chestRef.current.material.opacity = intensity
      chestRef.current.material.emissiveIntensity = intensity * 3
    }

    if (rippleRef.current) {
      if (isGenerating) {
        const phase = (t * 0.6) % 1
        rippleRef.current.scale.setScalar(1 + phase * 2.5)
        rippleRef.current.material.opacity = (1 - phase) * 0.6
      } else {
        rippleRef.current.material.opacity = 0
      }
    }

    const idleSway = Math.sin(t * 1.3 + 0.5) * 0.05
    if (armsRootRef.current) {
      armsRootRef.current.rotation.z = idleSway
    }

    const BASE_LZ = 0.38
    const BASE_RZ = -0.38
    if (leftArmRef.current) {
      leftArmRef.current.rotation.x = s.lx
      leftArmRef.current.rotation.z = BASE_LZ + s.lz
    }
    if (rightArmRef.current) {
      rightArmRef.current.rotation.x = s.rx
      rightArmRef.current.rotation.z = BASE_RZ + s.rz
    }
    if (leftHandRef.current) {
      leftHandRef.current.position.y = -0.22 + s.lhy
    }
    if (rightHandRef.current) {
      rightHandRef.current.position.y = -0.22 + s.rhy
    }
  })

  return (
    <group ref={groupRef} position={[0, -0.4, 0]}>
      <mesh scale={[1.0, 1.05, 0.88]}>
        <sphereGeometry args={[0.68, 48, 48]} />
        <meshStandardMaterial color="white" roughness={0.15} metalness={0.02} />
      </mesh>

      <mesh position={[0, 0.62, 0]}>
        <cylinderGeometry args={[0.18, 0.22, 0.2, 24]} />
        <meshStandardMaterial color="#e8e8e8" roughness={0.3} />
      </mesh>

      <group ref={headRef} position={[0, 1.0, 0]}>
        <mesh>
          <sphereGeometry args={[0.48, 48, 48]} />
          <meshStandardMaterial color="white" roughness={0.12} metalness={0.02} />
        </mesh>
        <mesh position={[-0.14, 0.04, 0.44]}>
          <sphereGeometry args={[0.07, 24, 24]} />
          <meshBasicMaterial color="#111122" />
        </mesh>
        <mesh position={[0.14, 0.04, 0.44]}>
          <sphereGeometry args={[0.07, 24, 24]} />
          <meshBasicMaterial color="#111122" />
        </mesh>
        <mesh position={[-0.11, 0.07, 0.495]}>
          <sphereGeometry args={[0.025, 12, 12]} />
          <meshBasicMaterial color="white" />
        </mesh>
        <mesh position={[0.17, 0.07, 0.495]}>
          <sphereGeometry args={[0.025, 12, 12]} />
          <meshBasicMaterial color="white" />
        </mesh>
      </group>

      <mesh ref={chestRef} position={[0, 0.16, 0.62]}>
        <circleGeometry args={[0.18, 6]} />
        <meshStandardMaterial
          color="#00e5ff"
          emissive="#00e5ff"
          emissiveIntensity={0.5}
          transparent
          opacity={0.08}
        />
      </mesh>

      <group ref={armsRootRef}>
        <group ref={leftArmRef} position={[-0.78, 0.1, 0]} rotation={[0, 0, 0.38]}>
          <mesh position={[-0.12, -0.02, 0]} rotation={[0, 0, 0.15]}>
            <capsuleGeometry args={[0.15, 0.4, 8, 16]} />
            <meshStandardMaterial color="white" roughness={0.2} />
          </mesh>
          <group ref={leftHandRef} position={[-0.28, -0.22, 0]}>
            <mesh>
              <sphereGeometry args={[0.18, 22, 22]} />
              <meshStandardMaterial color="white" roughness={0.2} />
            </mesh>
          </group>
        </group>
        <group ref={rightArmRef} position={[0.78, 0.1, 0]} rotation={[0, 0, -0.38]}>
          <mesh position={[0.12, -0.02, 0]} rotation={[0, 0, -0.15]}>
            <capsuleGeometry args={[0.15, 0.4, 8, 16]} />
            <meshStandardMaterial color="white" roughness={0.2} />
          </mesh>
          <group ref={rightHandRef} position={[0.28, -0.22, 0]}>
            <mesh>
              <sphereGeometry args={[0.18, 22, 22]} />
              <meshStandardMaterial color="white" roughness={0.2} />
            </mesh>
          </group>
        </group>
      </group>

      <mesh ref={rippleRef} rotation={[-Math.PI * 0.1, 0, 0]}>
        <ringGeometry args={[0.85, 1.05, 64]} />
        <meshBasicMaterial
          color="white"
          transparent
          opacity={0}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  )
}

export default function ThreeBackground({ aiState, gesture, mode = 'full' }) {
  return (
    <div className="three-canvas">
      <Canvas
        camera={{ position: [0, 0, 5.5], fov: 58 }}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={0.9} />
        <directionalLight position={[0, 4, 5]} intensity={1.2} />
        <pointLight position={[-6, 2, 4]} color="#ff6eb4" intensity={4} />
        <pointLight position={[6, 2, 4]} color="#00e5ff" intensity={4} />

        <Particles />
        {mode !== 'space-only' && (
          <BaymaxCharacter aiState={aiState} gesture={gesture} />
        )}
      </Canvas>
    </div>
  )
}
