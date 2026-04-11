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

      // Mix cyan and pink particles
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

function BaymaxCharacter({ aiState }) {
  const groupRef  = useRef()
  const headRef   = useRef()
  const chestRef  = useRef()
  const rippleRef = useRef()
  const armsRef   = useRef()

  const prevStateRef   = useRef(aiState)
  const nodding        = useRef(false)
  const nodProgress    = useRef(0)
  const idleTimer      = useRef(0)
  const lookDir        = useRef(1)
  const lookAmount     = useRef(0)

  useEffect(() => {
    if (prevStateRef.current === 'speaking' && aiState === null) {
      nodding.current = true
      nodProgress.current = 0
    }
    prevStateRef.current = aiState
  }, [aiState])

  const isSpeaking   = aiState === 'speaking'
  const isGenerating = aiState === 'building'

  useFrame((state) => {
    const t = state.clock.getElapsedTime()
    if (!groupRef.current) return

    // Bobbing
    groupRef.current.position.y = -0.4 + Math.sin(t * 1.3) * 0.09

    // Idle look-around — pause when AI is active
    if (aiState === null) {
      idleTimer.current += 0.016
      if (idleTimer.current > 3) {
        lookAmount.current += 0.018 * lookDir.current
        if (Math.abs(lookAmount.current) > 0.28) lookDir.current *= -1
        groupRef.current.rotation.y = lookAmount.current
      }
    } else {
      // Face forward when active
      groupRef.current.rotation.y *= 0.92
      idleTimer.current = 0
      lookAmount.current *= 0.92
    }

    // Satisfied nod
    if (nodding.current && headRef.current) {
      nodProgress.current += 0.04
      headRef.current.rotation.x = Math.sin(nodProgress.current * Math.PI * 1.5) * 0.28
      if (nodProgress.current >= 1) {
        nodding.current = false
        headRef.current.rotation.x = 0
      }
    }

    // Chest glow pulse when speaking
    if (chestRef.current) {
      const intensity = isSpeaking
        ? 0.25 + Math.sin(t * 5) * 0.25
        : 0.08
      chestRef.current.material.opacity = intensity
      chestRef.current.material.emissiveIntensity = intensity * 3
    }

    // Ripple when generating
    if (rippleRef.current) {
      if (isGenerating) {
        const phase = (t * 0.6) % 1
        rippleRef.current.scale.setScalar(1 + phase * 2.5)
        rippleRef.current.material.opacity = (1 - phase) * 0.6
      } else {
        rippleRef.current.material.opacity = 0
      }
    }

    // Subtle arm sway
    if (armsRef.current) {
      armsRef.current.rotation.z = Math.sin(t * 1.3 + 0.5) * 0.06
    }
  })

  return (
    <group ref={groupRef} position={[0, -0.4, 0]}>
      {/* Body */}
      <mesh scale={[1.0, 1.05, 0.88]}>
        <sphereGeometry args={[0.68, 48, 48]} />
        <meshStandardMaterial color="white" roughness={0.15} metalness={0.02} />
      </mesh>

      {/* Neck connector */}
      <mesh position={[0, 0.62, 0]}>
        <cylinderGeometry args={[0.18, 0.22, 0.2, 24]} />
        <meshStandardMaterial color="#e8e8e8" roughness={0.3} />
      </mesh>

      {/* Head */}
      <group ref={headRef} position={[0, 1.0, 0]}>
        <mesh>
          <sphereGeometry args={[0.48, 48, 48]} />
          <meshStandardMaterial color="white" roughness={0.12} metalness={0.02} />
        </mesh>
        {/* Eyes */}
        <mesh position={[-0.14, 0.04, 0.44]}>
          <sphereGeometry args={[0.07, 24, 24]} />
          <meshBasicMaterial color="#111122" />
        </mesh>
        <mesh position={[0.14, 0.04, 0.44]}>
          <sphereGeometry args={[0.07, 24, 24]} />
          <meshBasicMaterial color="#111122" />
        </mesh>
        {/* Eye shine */}
        <mesh position={[-0.11, 0.07, 0.495]}>
          <sphereGeometry args={[0.025, 12, 12]} />
          <meshBasicMaterial color="white" />
        </mesh>
        <mesh position={[0.17, 0.07, 0.495]}>
          <sphereGeometry args={[0.025, 12, 12]} />
          <meshBasicMaterial color="white" />
        </mesh>
      </group>

      {/* Chest hex glow */}
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

      {/* Arms */}
      <group ref={armsRef}>
        <mesh position={[-0.78, 0.1, 0]} rotation={[0, 0, 0.35]}>
          <capsuleGeometry args={[0.16, 0.42, 8, 16]} />
          <meshStandardMaterial color="white" roughness={0.2} />
        </mesh>
        <mesh position={[0.78, 0.1, 0]} rotation={[0, 0, -0.35]}>
          <capsuleGeometry args={[0.16, 0.42, 8, 16]} />
          <meshStandardMaterial color="white" roughness={0.2} />
        </mesh>
        {/* Hands */}
        <mesh position={[-0.98, -0.15, 0]}>
          <sphereGeometry args={[0.19, 24, 24]} />
          <meshStandardMaterial color="white" roughness={0.2} />
        </mesh>
        <mesh position={[0.98, -0.15, 0]}>
          <sphereGeometry args={[0.19, 24, 24]} />
          <meshStandardMaterial color="white" roughness={0.2} />
        </mesh>
      </group>

      {/* Ripple ring */}
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

export default function ThreeBackground({ aiState }) {
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
        <BaymaxCharacter aiState={aiState} />
      </Canvas>
    </div>
  )
}
