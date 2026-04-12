/**
 * CharacterScene.jsx — Three.js canvas for ThinkPop.
 *
 * Props:
 *  motionFrames  — array of (22 x [x,y,z]) position arrays (HumanML3D)
 *  aiState       — string pipeline state
 *  audioLevelsRef — ref to latest TTS analyser buckets (playAudioBlob, e.g. 28 bins), updated every frame
 *  audioActive   — whether AI speech / pipeline speaking is driving the meter
 *  mathExpression — optional string (e.g. "9 - 10 = -1") shown as extruded 3D text in front of the scene
 */

import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useLayoutEffect, useRef, useMemo } from 'react'
import { useFBX, Text3D, Center } from '@react-three/drei'
import * as THREE from 'three'

import { createRetargeter } from '../lib/retarget'
import { setRigRestPose } from '../lib/motionApi'

const SPEAKING_BAR_COUNT = 32

/** Distant “mountain” ridge: far on Z, wide on X, sits on horizon (fog silhouettes it). */
const SPEAKING_RIDGE_WORLD = { x: 0, y: -1.02, z: -6.4 }
const SPEAKING_RIDGE_TOTAL_WIDTH = 19.5

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

/** Organic ridge outline so idle still reads as distant peaks (not a flat line). */
function mountainSilhouette(i, count) {
  const u = i / Math.max(1, count - 1)
  return (
    0.38 +
    0.34 * Math.sin(u * Math.PI * 3.1 + 0.7) +
    0.22 * Math.sin(u * Math.PI * 6.4 + 2.1) +
    0.14 * Math.sin(i * 0.52 + 0.3)
  )
}

/** Distant neon ridge: wide horizon **rectangular** bars + silhouette + audio height; fog sells depth. */
function SpeakingVisualizer3D({ levelsRef, active }) {
  const meshes = useRef([])
  const activeRef = useRef(active)
  useLayoutEffect(() => {
    activeRef.current = active
  }, [active])

  const fallback = useMemo(() => new Array(SPEAKING_BAR_COUNT).fill(0.04), [])

  const groupPosition = useMemo(
    () => [SPEAKING_RIDGE_WORLD.x, SPEAKING_RIDGE_WORLD.y, SPEAKING_RIDGE_WORLD.z],
    []
  )

  const distantTint = useMemo(() => new THREE.Color('#1e3a5c'), [])
  const palette = useMemo(
    () =>
      Array.from({ length: SPEAKING_BAR_COUNT }, (_, i) => {
        const half = SPEAKING_BAR_COUNT / 2
        const dist = Math.min(i, SPEAKING_BAR_COUNT - 1 - i)
        const t = half > 1 ? dist / (half - 1) : 0
        const hue = 0.78 + t * 0.72
        const c = new THREE.Color().setHSL(hue % 1, 0.72, 0.48)
        return c.lerp(distantTint, 0.38)
      }),
    [distantTint]
  )

  const colorScratch = useRef(new THREE.Color())

  const layout = useMemo(() => {
    const totalW = SPEAKING_RIDGE_TOTAL_WIDTH
    const gap = 0.06
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
    const dim = isActive ? 1 : 0.48
    const punch = isActive ? 1.55 : 0.5
    for (let i = 0; i < SPEAKING_BAR_COUNT; i++) {
      const mesh = meshes.current[i]
      if (!mesh) continue
      const rawLevel = data[i] ?? 0.04
      const boosted = Math.min(1, Number(rawLevel) * (isActive ? 1.35 : 1))
      const normalized = Math.max(isActive ? 0.12 : 0.06, Math.min(1, boosted))
      const ridge = mountainSilhouette(i, SPEAKING_BAR_COUNT)
      const peakH = 0.55 + ridge * 1.05 + normalized * (isActive ? 1.85 : 0.55)
      const baseW = barW * 0.92
      const barDepth = 0.22
      mesh.scale.set(baseW, peakH, barDepth)
      if (i < half) {
        const depth = half - 1 - i
        mesh.position.x = -halfSpan - depth * step
      } else {
        const depth = i - half
        mesh.position.x = halfSpan + depth * step
      }
      mesh.position.y = peakH * 0.5
      mesh.position.z = 0
      const mat = mesh.material
      const c = colorScratch.current.copy(palette[i])
      c.offsetHSL(0, isActive ? 0.04 : -0.06, (normalized - 0.4) * 0.1)
      mat.color.copy(c).multiplyScalar(0.35 + 0.45 * normalized * dim)
      mat.emissive.copy(palette[i])
      const emMul = punch * dim * (0.4 + 0.6 * normalized)
      mat.emissive.multiplyScalar(emMul)
      mat.emissiveIntensity = isActive ? 0.85 + normalized * 0.75 : 0.28
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
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial
            color={col}
            emissive={col}
            emissiveIntensity={0.9}
            roughness={0.42}
            metalness={0.12}
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
      if (r.rigRestPose) {
        setRigRestPose(r.rigRestPose)
        console.log('[CharacterScene] Rig rest pose applied to motion system')
      }
      r.debugDump()
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

/** Large neon red X overlay — toggled from app (e.g. Alt+X). Additive glow + point light for red halo. */
function NeonXTool({ visible }) {
  if (!visible) return null
  const arm = 4.2
  const thick = 0.2
  const depth = 0.06
  const matProps = {
    color: '#9c0000',
    emissive: '#ff0000',
    emissiveIntensity: 3.35,
    roughness: 0.2,
    metalness: 0.1,
    toneMapped: true,
    depthTest: false,
    depthWrite: false,
  }
  const glow = {
    inner: { opacity: 0.42, color: '#ff1a1a' },
    outer: { opacity: 0.14, color: '#ff3030' },
  }
  return (
    <group position={[0, 0.12, 2.2]}>
      <pointLight color="#ff0a0a" intensity={10} distance={20} decay={1.85} position={[0, 0, 0.25]} />
      <mesh rotation={[0, 0, Math.PI / 4]} renderOrder={1998}>
        <boxGeometry args={[arm * 1.28, thick * 2.4, depth * 2.2]} />
        <meshBasicMaterial
          color={glow.inner.color}
          transparent
          opacity={glow.inner.opacity}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          depthTest={false}
          toneMapped={false}
        />
      </mesh>
      <mesh rotation={[0, 0, -Math.PI / 4]} renderOrder={1998}>
        <boxGeometry args={[arm * 1.28, thick * 2.4, depth * 2.2]} />
        <meshBasicMaterial
          color={glow.inner.color}
          transparent
          opacity={0.32}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          depthTest={false}
          toneMapped={false}
        />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 4]} renderOrder={1997}>
        <boxGeometry args={[arm * 1.55, thick * 3.2, depth * 2.8]} />
        <meshBasicMaterial
          color={glow.outer.color}
          transparent
          opacity={glow.outer.opacity}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          depthTest={false}
          toneMapped={false}
        />
      </mesh>
      <mesh rotation={[0, 0, -Math.PI / 4]} renderOrder={1997}>
        <boxGeometry args={[arm * 1.55, thick * 3.2, depth * 2.8]} />
        <meshBasicMaterial
          color={glow.outer.color}
          transparent
          opacity={glow.outer.opacity}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          depthTest={false}
          toneMapped={false}
        />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 4]} renderOrder={2000}>
        <boxGeometry args={[arm, thick, depth]} />
        <meshStandardMaterial {...matProps} />
      </mesh>
      <mesh rotation={[0, 0, -Math.PI / 4]} renderOrder={2000}>
        <boxGeometry args={[arm, thick, depth]} />
        <meshStandardMaterial {...matProps} />
      </mesh>
    </group>
  )
}

/**
 * Green ✓: both arms share one **bottom vertex** (classic check), not two crossing diagonals.
 * Short stroke up-left, longer stroke up-right from the same joint.
 */
function NeonTickTool({ visible }) {
  if (!visible) return null
  const thick = 0.2
  const depth = 0.06
  const shortL = 1.75
  const longL = 4.05
  const joint = { x: 0, y: -0.44, z: 0 }
  const angShort = 2.42
  const angLong = 0.52
  const cs = Math.cos(angShort)
  const ss = Math.sin(angShort)
  const cl = Math.cos(angLong)
  const sl = Math.sin(angLong)
  const shortPos = [joint.x + cs * (shortL * 0.5), joint.y + ss * (shortL * 0.5), joint.z]
  const longPos = [joint.x + cl * (longL * 0.5), joint.y + sl * (longL * 0.5), joint.z]
  const shortRot = angShort
  const longRot = angLong

  const matProps = {
    color: '#006b2e',
    emissive: '#00ff66',
    emissiveIntensity: 3.2,
    roughness: 0.2,
    metalness: 0.1,
    toneMapped: true,
    depthTest: false,
    depthWrite: false,
  }
  const glow = {
    inner: { opacity: 0.4, color: '#33ff99' },
    outer: { opacity: 0.13, color: '#66ffbb' },
  }
  const shortInner = [shortL * 1.28, thick * 2.4, depth * 2.2]
  const longInner = [longL * 1.28, thick * 2.4, depth * 2.2]
  const shortOuter = [shortL * 1.55, thick * 3.2, depth * 2.8]
  const longOuter = [longL * 1.55, thick * 3.2, depth * 2.8]

  return (
    <group position={[0, 0.12, 2.2]}>
      <pointLight color="#00ff88" intensity={9} distance={20} decay={1.85} position={[0.1, -0.15, 0.25]} />
      <mesh position={shortPos} rotation={[0, 0, shortRot]} renderOrder={1998}>
        <boxGeometry args={shortInner} />
        <meshBasicMaterial
          color={glow.inner.color}
          transparent
          opacity={glow.inner.opacity}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          depthTest={false}
          toneMapped={false}
        />
      </mesh>
      <mesh position={longPos} rotation={[0, 0, longRot]} renderOrder={1998}>
        <boxGeometry args={longInner} />
        <meshBasicMaterial
          color={glow.inner.color}
          transparent
          opacity={0.3}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          depthTest={false}
          toneMapped={false}
        />
      </mesh>
      <mesh position={shortPos} rotation={[0, 0, shortRot]} renderOrder={1997}>
        <boxGeometry args={shortOuter} />
        <meshBasicMaterial
          color={glow.outer.color}
          transparent
          opacity={glow.outer.opacity}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          depthTest={false}
          toneMapped={false}
        />
      </mesh>
      <mesh position={longPos} rotation={[0, 0, longRot]} renderOrder={1997}>
        <boxGeometry args={longOuter} />
        <meshBasicMaterial
          color={glow.outer.color}
          transparent
          opacity={glow.outer.opacity}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          depthTest={false}
          toneMapped={false}
        />
      </mesh>
      <mesh position={shortPos} rotation={[0, 0, shortRot]} renderOrder={2000}>
        <boxGeometry args={[shortL, thick, depth]} />
        <meshStandardMaterial {...matProps} />
      </mesh>
      <mesh position={longPos} rotation={[0, 0, longRot]} renderOrder={2000}>
        <boxGeometry args={[longL, thick, depth]} />
        <meshStandardMaterial {...matProps} />
      </mesh>
    </group>
  )
}

const MATH_FONT_URL = '/fonts/helvetiker_bold.typeface.json'

/** Extruded equation text; place above the character, facing camera. */
function MathExpression3D({ expression }) {
  const text = String(expression ?? '').trim()
  const size = useMemo(() => {
    const n = text.length
    if (n > 24) return 0.14
    if (n > 14) return 0.18
    return 0.24
  }, [text])

  if (!text) return null

  return (
    <group position={[0, 1.05, 1.35]}>
      <Suspense fallback={null}>
        <Center top>
          <Text3D
            font={MATH_FONT_URL}
            size={size}
            height={0.045}
            curveSegments={10}
            bevelEnabled
            bevelThickness={0.008}
            bevelSize={0.006}
            bevelSegments={2}
          >
            {text}
            <meshStandardMaterial
              color="#7af0ff"
              emissive="#003848"
              emissiveIntensity={0.55}
              metalness={0.25}
              roughness={0.4}
            />
          </Text3D>
        </Center>
      </Suspense>
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

function SceneContent({ motionFrames, aiState, audioLevelsRef, audioActive, showNeonX, showNeonTick, mathExpression }) {
  return (
    <>
      <Lighting />
      <Particles />
      <NeonGrid />
      <SpeakingVisualizer3D levelsRef={audioLevelsRef} active={audioActive} />
      <Suspense fallback={<LoadingStand />}>
        <FBXCharacter motionFrames={motionFrames} aiState={aiState} />
      </Suspense>
      <MathExpression3D expression={mathExpression} />
      <NeonXTool visible={showNeonX} />
      <NeonTickTool visible={showNeonTick} />
    </>
  )
}

export default function CharacterScene({ motionFrames, aiState, audioLevelsRef, audioActive, showNeonX, showNeonTick, mathExpression }) {
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
        showNeonX={showNeonX}
        showNeonTick={showNeonTick}
        mathExpression={mathExpression}
      />
    </Canvas>
  )
}
