import { Suspense, useState, useMemo, useRef } from 'react'
import { Canvas, useLoader, useFrame } from '@react-three/fiber'
import { OrbitControls, ContactShadows } from '@react-three/drei'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader'
import { motion, AnimatePresence } from 'framer-motion'
import * as THREE from 'three'

// ─── UV map analysis (from OBJ files) ────────────────────────────────────────
//  Pine    trunk : U≈0.32  V≈0.18–0.25   → image pixel ~(20, 50) out of 64
//  Pine    leaves: U≈0.71  V≈0.52–0.62   → image pixel ~(45, 27)
//  Simple  trunk : U≈0.34  V≈0.35–0.49   → image pixel ~(22, 37)
//  Simple  leaves: U≈0.63  V≈0.51–0.59   → image pixel ~(40, 29)
//  Stylized stems: U≈0.38  V≈0.51–0.65   → image pixel ~(24, 28)
//  Stylized crown: U≈0.49  V≈0.68–0.75   → image pixel ~(31, 18)
//
//  Pattern: low-U/low-V  → dark bark brown
//           high-U/high-V → bright leaf green
//  → diagonal gradient lower-left (dark bark) → upper-right (bright leaf)
// ─────────────────────────────────────────────────────────────────────────────

function buildPaletteTexture() {
  const S = 64
  const canvas = document.createElement('canvas')
  canvas.width  = S
  canvas.height = S
  const ctx = canvas.getContext('2d')

  // Base: diagonal gradient lower-left dark bark → upper-right bright leaf
  //   In canvas coords Y is flipped vs UV V:  canvasY = (1 - V) * S
  //   lower-left  = canvas (0, S)   = UV (0, 0)  → very dark bark
  //   upper-right = canvas (S, 0)   = UV (1, 1)  → bright highlight green
  const diag = ctx.createLinearGradient(0, S, S, 0)
  diag.addColorStop(0.00, '#2a1508')   // dark bark (UV 0,0 corner)
  diag.addColorStop(0.20, '#5a3419')   // medium bark
  diag.addColorStop(0.38, '#7a5030')   // trunk brown — pine trunk region
  diag.addColorStop(0.50, '#8b6545')   // lighter trunk — simple trunk region
  diag.addColorStop(0.60, '#4a7233')   // dark foliage — transition
  diag.addColorStop(0.72, '#5a9233')   // forest green — pine leaves
  diag.addColorStop(0.82, '#6db845')   // medium leaf green — simple leaves
  diag.addColorStop(0.92, '#7dc952')   // bright leaf — stylized crown
  diag.addColorStop(1.00, '#a8e870')   // highlight tip
  ctx.fillStyle = diag
  ctx.fillRect(0, 0, S, S)

  // Subtle horizontal cool-shadow / warm-sun overlay
  const hGrad = ctx.createLinearGradient(0, 0, S, 0)
  hGrad.addColorStop(0,   'rgba(10, 10, 30, 0.18)')   // cooler/darker left
  hGrad.addColorStop(0.5, 'rgba(0,  0,  0,  0.00)')
  hGrad.addColorStop(1,   'rgba(255,220, 80, 0.08)')   // warm sunlight right
  ctx.fillStyle = hGrad
  ctx.fillRect(0, 0, S, S)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

// ─── Tree data ────────────────────────────────────────────────────────────────
const TREES = [
  {
    id: 'pine',
    label: 'Pine Tree',
    emoji: '🌲',
    url: '/trees/pine.obj',
    accent: '#4ade80',
    description: 'Tall conifer with layered tiered branches',
  },
  {
    id: 'simple',
    label: 'Simple Tree',
    emoji: '🌳',
    url: '/trees/simple.obj',
    accent: '#00e5ff',
    description: 'Classic rounded canopy deciduous tree',
  },
  {
    id: 'stylized',
    label: 'Stylized Tree',
    emoji: '🌴',
    url: '/trees/stylized.obj',
    accent: '#ff6eb4',
    description: 'Abstract geometric low-poly form',
  },
]

TREES.forEach(t => useLoader.preload(OBJLoader, t.url))

// ─── Components ───────────────────────────────────────────────────────────────

function TreeModel({ url, palette }) {
  const obj = useLoader(OBJLoader, url)

  const model = useMemo(() => {
    const clone = obj.clone(true)

    // Center + normalise scale
    const box    = new THREE.Box3().setFromObject(clone)
    const center = box.getCenter(new THREE.Vector3())
    const size   = box.getSize(new THREE.Vector3())
    clone.position.sub(center)
    const maxDim = Math.max(size.x, size.y, size.z)
    if (maxDim > 0) clone.scale.setScalar(3 / maxDim)

    // Apply palette texture — UVs in geometry already match the palette layout
    clone.traverse(child => {
      if (child.isMesh) {
        child.material = new THREE.MeshStandardMaterial({
          map:       palette,
          roughness: 0.6,
          metalness: 0.0,
        })
        child.castShadow    = true
        child.receiveShadow = true
      }
    })
    return clone
  }, [obj, palette])

  return <primitive object={model} />
}

function SpinnerFallback() {
  const ref = useRef()
  useFrame((_, delta) => { if (ref.current) ref.current.rotation.y += delta * 2 })
  return (
    <mesh ref={ref}>
      <torusGeometry args={[0.4, 0.06, 8, 32]} />
      <meshBasicMaterial color="#00e5ff" wireframe />
    </mesh>
  )
}

function SceneContent({ tree }) {
  // Build palette once per mount (same for all trees — they share the texture)
  const palette = useMemo(() => buildPaletteTexture(), [])

  return (
    <>
      <ambientLight intensity={0.85} />
      <directionalLight position={[4, 8, 4]} intensity={1.5} castShadow />
      <pointLight position={[-4, 3, 3]} color="#b8f4a8" intensity={2} />
      <pointLight position={[4, -1, 3]} color="#fff8e0"  intensity={1} />

      <Suspense fallback={<SpinnerFallback />}>
        <TreeModel key={tree.id} url={tree.url} palette={palette} />
      </Suspense>

      <ContactShadows
        position={[0, -1.6, 0]}
        opacity={0.32}
        scale={10}
        blur={2.5}
        far={4}
      />

      <OrbitControls
        enablePan={false}
        minDistance={2}
        maxDistance={9}
        minPolarAngle={Math.PI * 0.05}
        maxPolarAngle={Math.PI * 0.85}
        autoRotate
        autoRotateSpeed={0.9}
        enableDamping
        dampingFactor={0.07}
      />
    </>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TreeGallery() {
  const [selectedId, setSelectedId] = useState('pine')
  const tree = TREES.find(t => t.id === selectedId)

  return (
    <div className="tree-gallery">
      <div className="tree-gallery-header">
        <span className="tree-gallery-title">Tree Collection</span>
        <span className="tree-gallery-hint">Drag to orbit · Scroll to zoom</span>
      </div>

      <div className="tree-viewport">
        <Canvas
          key={selectedId}
          camera={{ position: [0, 0.5, 5.5], fov: 48 }}
          shadows
          gl={{ antialias: true, alpha: true }}
        >
          <SceneContent tree={tree} />
        </Canvas>

        <div
          className="tree-viewport-glow"
          style={{
            background: `radial-gradient(ellipse at 25% 80%, ${tree.accent}22 0%, transparent 60%)`,
          }}
        />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={selectedId}
          className="tree-info"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.28 }}
          style={{ borderColor: `${tree.accent}55` }}
        >
          <span className="tree-info-name" style={{ color: tree.accent }}>
            {tree.emoji} {tree.label}
          </span>
          <span className="tree-info-desc">{tree.description}</span>
        </motion.div>
      </AnimatePresence>

      <div className="tree-selector">
        {TREES.map(t => (
          <motion.button
            key={t.id}
            className={`tree-chip ${selectedId === t.id ? 'tree-chip-active' : ''}`}
            style={{
              borderColor: selectedId === t.id ? t.accent : 'rgba(255,255,255,0.15)',
              color:       selectedId === t.id ? t.accent : 'rgba(255,255,255,0.65)',
            }}
            onClick={() => setSelectedId(t.id)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.94 }}
          >
            {t.emoji} {t.label}
          </motion.button>
        ))}
      </div>
    </div>
  )
}
