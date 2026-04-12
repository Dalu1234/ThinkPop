/**
 * CharacterScene.jsx — Three.js canvas for ThinkPop.
 *
 * Props:
 *  motionFrames  — array of (22 x [x,y,z]) position arrays (HumanML3D)
 *  aiState       — string pipeline state
 *  audioLevelsRef — ref to latest TTS analyser buckets (playAudioBlob, e.g. 28 bins), updated every frame
 *  audioActive   — whether AI speech / pipeline speaking is driving the meter
 */

import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useLayoutEffect, useRef, useMemo } from 'react'
import { useFBX } from '@react-three/drei'
import * as THREE from 'three'

import { createRetargeter } from '../lib/retarget'

const SPEAKING_BAR_COUNT = 32

/** ElevenLabs playAudioBlob emits 28 buckets; map any length to bar count. */
function resampleLevels(raw, count) {
  if (!raw?.length) return null
  if (raw.length === count) return raw
  const n = raw.length
  const out = new Array(count)
  for (let i = 0; i < count; i++) {
    const t = count <= 1 ? 0 : i / (count - 1)
    const pos = t * (n - 1)
    const lo = Math.floor(pos)
    const hi = Math.min(lo + 1, n - 1)
    const f = pos - lo
    const a = Number(raw[lo]) || 0
    const b = Number(raw[hi]) || 0
    out[i] = a + f * (b - a)
  }
  return out
}

/** TTS level meters in world space — slightly past the character toward the back wall so the mesh occludes them. */
function SpeakingVisualizer3D({ levelsRef, active }) {
  const meshes = useRef([])
  const activeRef = useRef(active)
  useLayoutEffect(() => {
    activeRef.current = active
  }, [active])

  const fallback = useMemo(() => new Array(SPEAKING_BAR_COUNT).fill(0.04), [])
  const { camera } = useThree()

  const groupPosition = useMemo(() => {
    const mid = new THREE.Vector3(0, -0.28, 0)
    const dir = new THREE.Vector3().subVectors(mid, camera.position).normalize()
    return mid.clone().addScaledVector(dir, 0.28)
  }, [camera])

  /** Symmetric neon: same hue at equal distance from center (edges vivid, center pair hot). */
  const palette = useMemo(
    () =>
      Array.from({ length: SPEAKING_BAR_COUNT }, (_, i) => {
        const half = SPEAKING_BAR_COUNT / 2
        const dist = Math.min(i, SPEAKING_BAR_COUNT - 1 - i)
        const t = half > 1 ? dist / (half - 1) : 0
        const hue = 0.86 + t * 0.78
        return new THREE.Color().setHSL(hue % 1, 0.97, 0.52)
      }),
    []
  )

  const colorScratch = useRef(new THREE.Color())

  const layout = useMemo(() => {
    const totalW = 2.85
    const gap = 0.012
    const barW = (totalW - gap * (SPEAKING_BAR_COUNT - 1)) / SPEAKING_BAR_COUNT
    const half = SPEAKING_BAR_COUNT / 2
    const step = barW + gap
    const halfSpan = step * 0.5
    return { barW, gap, half, step, halfSpan }
  }, [])

  useFrame(() => {
    const raw = levelsRef?.current
    const isActive = activeRef.current
    const data = resampleLevels(raw, SPEAKING_BAR_COUNT) ?? fallback
    const { barW, half, step, halfSpan } = layout
    const dim = isActive ? 1 : 0.42
    const punch = isActive ? 1.75 : 0.38
    for (let i = 0; i < SPEAKING_BAR_COUNT; i++) {
      const mesh = meshes.current[i]
      if (!mesh) continue
      const rawLevel = data[i] ?? 0.04
      const boosted = Math.min(1, Number(rawLevel) * (isActive ? 1.45 : 1))
      const normalized = Math.max(isActive ? 0.16 : 0.08, Math.min(1, boosted))
      const h = 0.065 + normalized * 0.42
      mesh.scale.set(barW * 0.88, h, 1)
      if (i < half) {
        const depth = half - 1 - i
        mesh.position.x = -halfSpan - depth * step
      } else {
        const depth = i - half
        mesh.position.x = halfSpan + depth * step
      }
      mesh.position.y = h / 2
      mesh.position.z = 0
      const mat = mesh.material
      const c = colorScratch.current.copy(palette[i])
      c.offsetHSL(0, 0, (normalized - 0.45) * 0.14)
      mat.color.copy(c).multiplyScalar(0.28 + 0.62 * normalized * dim)
      mat.emissive.copy(palette[i])
      const emMul = punch * dim * (0.55 + 0.55 * normalized)
      mat.emissive.multiplyScalar(emMul)
      mat.emissiveIntensity = isActive ? 1.15 + normalized * 0.95 : 0.32
    }
  })

  return (
    <group position={groupPosition}>
      {palette.map((col, i) => (
        <mesh
          key={i}
          ref={(el) => {
            meshes.current[i] = el
          }}
        >
          <boxGeometry args={[1, 1, 0.035]} />
          <meshStandardMaterial
            color={col}
            emissive={col}
            emissiveIntensity={1.25}
            roughness={0.22}
            metalness={0.28}
            toneMapped
          />
        </mesh>
      ))}
    </group>
  )
}

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
    <group position={[0, -0.9, 0]}>
      <gridHelper args={[20, 30, '#00e5ff', '#0a1a2a']} />
    </group>
  )
}

// FBX Character driven by MDM frames
const FRAME_MS = 50

function FBXCharacter({ motionFrames }) {
  const { scene } = useThree()
  const retargeterRef = useRef(null)
  const frameRef      = useRef(0)
  const carryMs       = useRef(0)
  const fbx = useFBX('/assets/character.fbx')

  useEffect(() => {
    if (!fbx) return
    const clone = fbx.clone(true)
    clone.scale.setScalar(0.01)
    clone.position.set(0, -0.9, 0)
    clone.rotation.y = 0

    clone.traverse(child => {
      if (child.isMesh || child.isSkinnedMesh) {
        child.castShadow    = true
        child.receiveShadow = false
        child.frustumCulled = false
      }
    })

    scene.add(clone)

    // _collectBones now prioritises skeleton.bones (what SkinnedMesh renders)
    // over isBone clone nodes, so applyFrame drives the correct bones.
    try {
      const r = createRetargeter(clone)
      retargeterRef.current = r
      const n = Object.keys(r.boneMap).length
      console.log('[CharacterScene] Retargeter ready —', n, 'bones mapped')
      if (n === 0) console.warn('[CharacterScene] 0 bones — check FBX export includes skeleton')
    } catch (e) {
      console.error('[CharacterScene] Retargeter setup failed:', e)
    }

    return () => {
      scene.remove(clone)
      retargeterRef.current = null
    }
  }, [fbx, scene])

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

  return null
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

function SceneContent({ motionFrames, aiState, audioLevelsRef, audioActive }) {
  return (
    <>
      <Lighting />
      <Particles />
      <NeonGrid />
      <SpeakingVisualizer3D levelsRef={audioLevelsRef} active={audioActive} />
      <Suspense fallback={<LoadingStand />}>
        <FBXCharacter motionFrames={motionFrames} aiState={aiState} />
      </Suspense>
    </>
  )
}

export default function CharacterScene({ motionFrames, aiState, audioLevelsRef, audioActive }) {
  return (
    <Canvas
      style={{ position: 'fixed', inset: 0, zIndex: 0 }}
      camera={{ position: [0, 0.2, 3.5], fov: 48, near: 0.01, far: 100 }}
      gl={{ antialias: true, outputColorSpace: THREE.SRGBColorSpace, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.4 }}
      shadows
    >
      <color attach="background" args={['#06080f']} />
      <fog attach="fog" args={['#06080f', 8, 30]} />
      <SceneContent
        motionFrames={motionFrames}
        aiState={aiState}
        audioLevelsRef={audioLevelsRef}
        audioActive={audioActive}
      />
    </Canvas>
  )
}
