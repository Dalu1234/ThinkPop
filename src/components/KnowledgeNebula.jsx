import { Canvas, useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { loadUserModelProfile, getPredictionStats, seedProfileFromHistory } from '../lib/userModel'

const _color = new THREE.Color()

const COLOR_LOW = new THREE.Color('#ff6e40')
const COLOR_HIGH = new THREE.Color('#00e5ff')

const ROTATION_SPEED = 0.06
const POP_DURATION = 0.7

function clamp01(x) { return Math.max(0, Math.min(1, x)) }

function daysSince(iso) {
  if (!iso) return 7
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return 7
  return Math.max(0, (Date.now() - t) / 86400000)
}

function elasticOut(t) {
  if (t <= 0) return 0
  if (t >= 1) return 1
  const c = (2 * Math.PI) / 3
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c) + 1
}

function buildTopicNodes(profile) {
  const keys = Object.keys(profile.topics || {})
  if (!keys.length) return []
  return keys.map((key, i) => {
    const t = profile.topics[key]
    const correct = Number(t.correct) || 0
    const incorrect = Number(t.incorrect) || 0
    const total = correct + incorrect
    const mastery = total > 0 ? correct / total : 0.5
    const volume = total
    const recency = clamp01(daysSince(t.lastPlayed) / 7)

    const angle = (i / keys.length) * Math.PI * 2
    const radius = 0.6 + recency * 1.0
    const x = Math.cos(angle) * radius
    const z = Math.sin(angle) * radius
    const y = (mastery - 0.5) * 1.4

    const size = 0.08 + clamp01(volume / 20) * 0.14

    _color.copy(COLOR_LOW).lerp(COLOR_HIGH, mastery)
    const hex = '#' + _color.getHexString()

    return { key, x, y, z, size, mastery, hex, angle, index: i, label: key }
  })
}

function buildNucleus(stats) {
  const acc = (stats.accuracy_percent || 0) / 100
  return {
    size: 0.12 + acc * 0.1,
    emissiveIntensity: 0.6 + acc * 2.5,
  }
}

function TopicOrb({ node, popDelay }) {
  const meshRef = useRef()
  const matRef = useRef()
  const spawnT = useRef(null)

  useEffect(() => { spawnT.current = null }, [node.key])

  useFrame(({ clock }) => {
    if (!meshRef.current) return
    const t = clock.getElapsedTime()

    if (spawnT.current === null) spawnT.current = t + popDelay
    const elapsed = t - spawnT.current
    const popProgress = clamp01(elapsed / POP_DURATION)
    const scale = popProgress > 0 ? elasticOut(popProgress) * node.size : 0
    meshRef.current.scale.setScalar(scale)

    const bob = Math.sin(t * 1.4 + node.index * 1.7) * 0.03
    meshRef.current.position.set(node.x, node.y + bob, node.z)

    if (matRef.current) {
      const pulse = 0.6 + Math.sin(t * 2.0 + node.index * 2.3) * 0.4
      matRef.current.emissiveIntensity = 0.5 + node.mastery * 1.5 * pulse
    }
  })

  return (
    <mesh ref={meshRef} position={[node.x, node.y, node.z]}>
      <sphereGeometry args={[1, 24, 24]} />
      <meshStandardMaterial
        ref={matRef}
        color={node.hex}
        emissive={node.hex}
        emissiveIntensity={0.8}
        transparent
        opacity={0.92}
        roughness={0.25}
        metalness={0.1}
      />
    </mesh>
  )
}

function NucleusOrb({ nucleus }) {
  const meshRef = useRef()
  const matRef = useRef()
  const spawnT = useRef(null)

  useFrame(({ clock }) => {
    if (!meshRef.current) return
    const t = clock.getElapsedTime()
    if (spawnT.current === null) spawnT.current = t
    const elapsed = t - spawnT.current
    const pop = clamp01(elapsed / (POP_DURATION * 0.8))
    const scale = elasticOut(pop) * nucleus.size
    meshRef.current.scale.setScalar(scale)

    const breathe = 1.0 + Math.sin(t * 1.2) * 0.1
    meshRef.current.scale.multiplyScalar(breathe)

    if (matRef.current) {
      const pulse = 0.7 + Math.sin(t * 1.5) * 0.3
      matRef.current.emissiveIntensity = nucleus.emissiveIntensity * pulse
    }
  })

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[1, 32, 32]} />
      <meshStandardMaterial
        ref={matRef}
        color="#00e5ff"
        emissive="#00e5ff"
        emissiveIntensity={nucleus.emissiveIntensity}
        transparent
        opacity={0.88}
        roughness={0.15}
        metalness={0.2}
      />
    </mesh>
  )
}

function Filament({ node }) {
  const matRef = useRef()

  const positions = useMemo(() => {
    return new Float32Array([0, 0, 0, node.x, node.y, node.z])
  }, [node.x, node.y, node.z])

  useFrame(({ clock }) => {
    if (!matRef.current) return
    const t = clock.getElapsedTime()
    matRef.current.opacity = 0.14 + Math.sin(t * 1.0 + node.index * 1.5) * 0.1
  })

  return (
    <line>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={2} array={positions} itemSize={3} />
      </bufferGeometry>
      <lineBasicMaterial ref={matRef} color="#00e5ff" transparent opacity={0.18} linewidth={1} />
    </line>
  )
}

function GlowRing({ nucleus }) {
  const meshRef = useRef()
  const matRef = useRef()

  useFrame(({ clock }) => {
    if (!meshRef.current) return
    const t = clock.getElapsedTime()
    meshRef.current.rotation.x = Math.PI / 2
    meshRef.current.rotation.z = t * 0.25
    const breathe = nucleus.size * (2.2 + Math.sin(t * 0.8) * 0.2)
    meshRef.current.scale.setScalar(breathe)
    if (matRef.current) {
      matRef.current.opacity = 0.06 + Math.sin(t * 1.2) * 0.04
    }
  })

  return (
    <mesh ref={meshRef}>
      <ringGeometry args={[0.85, 1.0, 64]} />
      <meshBasicMaterial ref={matRef} color="#00e5ff" transparent opacity={0.08} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  )
}

function OuterRing({ nucleus }) {
  const meshRef = useRef()
  const matRef = useRef()

  useFrame(({ clock }) => {
    if (!meshRef.current) return
    const t = clock.getElapsedTime()
    meshRef.current.rotation.x = Math.PI / 2 + 0.3
    meshRef.current.rotation.z = -t * 0.15
    const breathe = nucleus.size * (3.5 + Math.sin(t * 0.5 + 1) * 0.3)
    meshRef.current.scale.setScalar(breathe)
    if (matRef.current) {
      matRef.current.opacity = 0.035 + Math.sin(t * 0.9 + 2) * 0.02
    }
  })

  return (
    <mesh ref={meshRef}>
      <ringGeometry args={[0.9, 1.0, 64]} />
      <meshBasicMaterial ref={matRef} color="#ff6eb4" transparent opacity={0.04} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  )
}

const DUST_COUNT = 60

function NebulaParticles() {
  const pointsRef = useRef()

  const [positions, speeds, colors] = useMemo(() => {
    const pos = new Float32Array(DUST_COUNT * 3)
    const spd = new Float32Array(DUST_COUNT)
    const col = new Float32Array(DUST_COUNT * 3)
    for (let i = 0; i < DUST_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2
      const r = 0.4 + Math.random() * 1.6
      pos[i * 3] = Math.cos(angle) * r
      pos[i * 3 + 1] = (Math.random() - 0.5) * 1.8
      pos[i * 3 + 2] = Math.sin(angle) * r
      spd[i] = 0.002 + Math.random() * 0.005
      if (Math.random() > 0.4) {
        col[i * 3] = 0; col[i * 3 + 1] = 0.9; col[i * 3 + 2] = 1.0
      } else {
        col[i * 3] = 1; col[i * 3 + 1] = 0.43; col[i * 3 + 2] = 0.71
      }
    }
    return [pos, spd, col]
  }, [])

  useFrame(() => {
    for (let i = 0; i < DUST_COUNT; i++) {
      positions[i * 3 + 1] += speeds[i]
      if (positions[i * 3 + 1] > 0.9) {
        positions[i * 3 + 1] = -0.9
        const angle = Math.random() * Math.PI * 2
        const r = 0.4 + Math.random() * 1.6
        positions[i * 3] = Math.cos(angle) * r
        positions[i * 3 + 2] = Math.sin(angle) * r
      }
    }
    if (pointsRef.current) pointsRef.current.geometry.attributes.position.needsUpdate = true
  })

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={DUST_COUNT} array={positions} itemSize={3} />
        <bufferAttribute attach="attributes-color" count={DUST_COUNT} array={colors} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial size={0.025} vertexColors transparent opacity={0.45} sizeAttenuation depthWrite={false} />
    </points>
  )
}

function NebulaScene() {
  const groupRef = useRef()
  const fadeRef = useRef({ current: 0 })

  const { nodes, nucleus } = useMemo(() => {
    seedProfileFromHistory()
    const profile = loadUserModelProfile()
    const stats = getPredictionStats()
    return { nodes: buildTopicNodes(profile), nucleus: buildNucleus(stats) }
  }, [])

  useFrame((_, delta) => {
    if (!groupRef.current) return
    const f = fadeRef.current
    f.current = Math.min(1, f.current + delta * 1.5)
    groupRef.current.scale.setScalar(f.current)
    groupRef.current.rotation.y += ROTATION_SPEED * delta
  })

  if (!nodes.length) return null

  return (
    <group ref={groupRef} scale={0}>
      <NucleusOrb nucleus={nucleus} />
      <GlowRing nucleus={nucleus} />
      <OuterRing nucleus={nucleus} />
      <NebulaParticles />
      {nodes.map((node, i) => (
        <TopicOrb key={node.key} node={node} popDelay={0.3 + i * 0.12} />
      ))}
      {nodes.map((node) => (
        <Filament key={`fil-${node.key}`} node={node} />
      ))}
    </group>
  )
}

function EmptyState() {
  const meshRef = useRef()
  const matRef = useRef()
  const ringRef = useRef()
  const ringMatRef = useRef()

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    if (meshRef.current) {
      const breathe = 0.12 + Math.sin(t * 1.2) * 0.015
      meshRef.current.scale.setScalar(breathe)
    }
    if (matRef.current) {
      matRef.current.emissiveIntensity = 0.4 + Math.sin(t * 1.5) * 0.3
    }
    if (ringRef.current) {
      ringRef.current.rotation.x = Math.PI / 2
      ringRef.current.rotation.z = t * 0.3
      ringRef.current.scale.setScalar(0.3 + Math.sin(t * 0.8) * 0.03)
    }
    if (ringMatRef.current) {
      ringMatRef.current.opacity = 0.06 + Math.sin(t * 1.0) * 0.03
    }
  })

  return (
    <>
      <mesh ref={meshRef}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshStandardMaterial
          ref={matRef}
          color="#00e5ff"
          emissive="#00e5ff"
          emissiveIntensity={0.5}
          transparent
          opacity={0.6}
          roughness={0.2}
          metalness={0.2}
        />
      </mesh>
      <mesh ref={ringRef}>
        <ringGeometry args={[0.85, 1.0, 64]} />
        <meshBasicMaterial ref={ringMatRef} color="#00e5ff" transparent opacity={0.06} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </>
  )
}

export default function KnowledgeNebula() {
  const [hasTopics, setHasTopics] = useState(false)

  useEffect(() => {
    seedProfileFromHistory()
    const profile = loadUserModelProfile()
    setHasTopics(Object.keys(profile.topics || {}).length > 0)
  }, [])

  return (
    <div className="nebula-canvas-wrap">
      <Canvas
        camera={{ position: [0, 0.3, 4], fov: 50 }}
        gl={{ antialias: true, alpha: true }}
        style={{ width: '100%', height: '100%' }}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[2, 3, 4]} intensity={0.8} />
        <pointLight position={[-3, 1, 3]} color="#ff6eb4" intensity={3} distance={12} />
        <pointLight position={[3, 1, 3]} color="#00e5ff" intensity={3} distance={12} />
        {hasTopics ? <NebulaScene /> : <EmptyState />}
      </Canvas>
      <div className="nebula-caption">
        <span className="nebula-caption-title">Your Knowledge</span>
        <span className="nebula-caption-sub">
          {hasTopics ? 'Topics you\'ve studied appear as orbs — brighter and higher means more mastery' : 'Start a lesson to see your knowledge grow here'}
        </span>
      </div>
    </div>
  )
}
