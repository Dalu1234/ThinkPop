/**
 * CharacterScene.jsx — Three.js canvas for ThinkPop.
 *
 * Props:
 *  motionFrames  — array of (22 x [x,y,z]) position arrays (HumanML3D)
 *  aiState       — string pipeline state
 */

import { Canvas, useFrame } from '@react-three/fiber'
import { Suspense, useEffect, useRef, useMemo } from 'react'
import { useFBX } from '@react-three/drei'
import * as THREE from 'three'

import { createRetargeter } from '../lib/retarget'

// Particles
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
        col[i * 3] = 0; col[i * 3 + 1] = 0.9; col[i * 3 + 2] = 1.0
      } else {
        col[i * 3] = 1; col[i * 3 + 1] = 0.43; col[i * 3 + 2] = 0.71
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
    if (pointsRef.current) pointsRef.current.geometry.attributes.position.needsUpdate = true
  })

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={PARTICLE_COUNT} array={positions} itemSize={3} />
        <bufferAttribute attach="attributes-color"    count={PARTICLE_COUNT} array={colors}    itemSize={3} />
      </bufferGeometry>
      <pointsMaterial size={0.045} vertexColors transparent opacity={0.65} sizeAttenuation />
    </points>
  )
}

function NeonGrid() {
  return (
    <group position={[0, -1.1, 0]}>
      <gridHelper args={[20, 30, '#00e5ff', '#0a1a2a']} />
    </group>
  )
}

// FBX Character driven by MDM frames
const FRAME_MS = 50

function FBXCharacter({ motionFrames }) {
  const retargeterRef = useRef(null)
  const frameRef      = useRef(0)
  const carryMs       = useRef(0)

  // useFBX suspends until the model is loaded.
  // We use <primitive object={fbx} /> so R3F owns scene add/remove,
  // and applyFrame modifies the exact same bones the SkinnedMesh reads —
  // no clone confusion.
  const fbx = useFBX('/assets/character.fbx')

  useEffect(() => {
    fbx.scale.setScalar(0.01)
    fbx.position.set(0, -1.1, 0)
    fbx.rotation.y = 0

    fbx.traverse(child => {
      if (child.isMesh || child.isSkinnedMesh) {
        child.castShadow    = true
        child.receiveShadow = false
        child.frustumCulled = false
      }
    })

    try {
      const r = createRetargeter(fbx)
      retargeterRef.current = r
      const n = Object.keys(r.boneMap).length
      console.log('[CharacterScene] Retargeter ready —', n, 'bones mapped')
      if (n === 0) console.warn('[CharacterScene] 0 bones — check FBX export includes skeleton')
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
    carryMs.current  = FRAME_MS
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
      const fr = motionFrames[frameRef.current]
      if (Array.isArray(fr) && fr.length === 22) r.applyFrame(fr)
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
        <meshStandardMaterial color="#00e5ff" wireframe opacity={0.4} transparent />
      </mesh>
    </group>
  )
}

function Lighting() {
  return (
    <>
      <ambientLight intensity={1.2} color="#b0c0e0" />
      <directionalLight
        position={[2, 4, 5]} intensity={2.8} color="#ffffff" castShadow
        shadow-mapSize={[2048, 2048]} shadow-camera-near={0.5} shadow-camera-far={20}
        shadow-camera-left={-4} shadow-camera-right={4} shadow-camera-top={6} shadow-camera-bottom={-2}
      />
      <directionalLight position={[-3, 2,  3]} intensity={1.0} color="#d0e8ff" />
      <directionalLight position={[-3, 3, -5]} intensity={1.5} color="#00e5ff" />
      <directionalLight position={[ 3, 2, -5]} intensity={0.9} color="#ff6eb4" />
    </>
  )
}

function SceneContent({ motionFrames, aiState }) {
  return (
    <>
      <Lighting />
      <Particles />
      <NeonGrid />
      <Suspense fallback={<LoadingStand />}>
        <FBXCharacter motionFrames={motionFrames} aiState={aiState} />
      </Suspense>
    </>
  )
}

export default function CharacterScene({ motionFrames, aiState }) {
  return (
    <Canvas
      style={{ position: 'fixed', inset: 0, zIndex: 0 }}
      camera={{ position: [0, 0.5, 3.2], fov: 45, near: 0.01, far: 100 }}
      gl={{ antialias: true, outputColorSpace: THREE.SRGBColorSpace, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.4 }}
      shadows
    >
      <color attach="background" args={['#06080f']} />
      <fog attach="fog" args={['#06080f', 8, 30]} />
      <SceneContent motionFrames={motionFrames} aiState={aiState} />
    </Canvas>
  )
}
