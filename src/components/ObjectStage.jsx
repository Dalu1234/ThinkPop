import { useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { motion, AnimatePresence } from 'framer-motion'

function SpinningCube({ color }) {
  const meshRef = useRef()

  useFrame((state, delta) => {
    if (!meshRef.current) return
    meshRef.current.rotation.x += delta * 0.45
    meshRef.current.rotation.y += delta * 0.72
    const t = state.clock.getElapsedTime()
    meshRef.current.material.emissiveIntensity = 0.18 + Math.sin(t * 2) * 0.08
  })

  return (
    <>
      <mesh ref={meshRef}>
        <boxGeometry args={[1.1, 1.1, 1.1]} />
        <meshStandardMaterial
          color={color}
          roughness={0.12}
          metalness={0.35}
          emissive={color}
          emissiveIntensity={0.18}
        />
      </mesh>
      <mesh>
        <boxGeometry args={[1.12, 1.12, 1.12]} />
        <meshBasicMaterial color={color} wireframe transparent opacity={0.12} />
      </mesh>
    </>
  )
}

function Apple({ position, color }) {
  return (
    <group position={position}>
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[0.14, 16, 16]} />
        <meshStandardMaterial color={color} roughness={0.35} metalness={0.05} />
      </mesh>
      <mesh position={[0, 0.14, 0]}>
        <cylinderGeometry args={[0.02, 0.03, 0.08, 8]} />
        <meshStandardMaterial color="#2d5a27" roughness={0.8} />
      </mesh>
      <mesh position={[0.04, 0.17, 0]} rotation={[0, 0, 0.6]}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshStandardMaterial color="#3d7c34" roughness={0.7} />
      </mesh>
    </group>
  )
}

function GridItem({ shape, position, color }) {
  if (shape === 'apple') {
    return <Apple position={position} color={color} />
  }
  if (shape === 'block') {
    return (
      <mesh position={position}>
        <boxGeometry args={[0.22, 0.22, 0.22]} />
        <meshStandardMaterial color={color} roughness={0.25} metalness={0.15} emissive={color} emissiveIntensity={0.08} />
      </mesh>
    )
  }
  return (
    <mesh position={position}>
      <sphereGeometry args={[0.13, 20, 20]} />
      <meshStandardMaterial color={color} roughness={0.2} metalness={0.2} emissive={color} emissiveIntensity={0.12} />
    </mesh>
  )
}

function ItemGrid({ rows, cols, itemShape, color }) {
  const groupRef = useRef()
  const layout = useMemo(() => {
    const gap = 0.36
    const items = []
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = (c - (cols - 1) / 2) * gap
        const y = ((rows - 1) / 2 - r) * gap
        items.push({ key: `${r}-${c}`, position: [x, y, 0] })
      }
    }
    return items
  }, [rows, cols])

  useFrame((state, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.15
    }
  })

  return (
    <group ref={groupRef}>
      {layout.map(it => (
        <GridItem key={it.key} shape={itemShape} position={it.position} color={color} />
      ))}
    </group>
  )
}

function StageContent({ visualModel, fallbackColor }) {
  if (
    visualModel &&
    visualModel.kind === 'grid' &&
    visualModel.rows > 0 &&
    visualModel.cols > 0
  ) {
    return (
      <ItemGrid
        rows={visualModel.rows}
        cols={visualModel.cols}
        itemShape={visualModel.itemShape || 'sphere'}
        color={visualModel.itemColor || fallbackColor}
      />
    )
  }
  return <SpinningCube color={fallbackColor} />
}

export default function ObjectStage({ object, visualModel, visible, active }) {
  const label =
    visualModel?.kind === 'grid' && visualModel.caption
      ? visualModel.caption
      : object.label
  const labelColor =
    visualModel?.kind === 'grid' && visualModel.itemColor
      ? visualModel.itemColor
      : object.color

  return (
    <motion.div
      className="object-stage"
      animate={{
        borderColor: active
          ? 'rgba(255, 110, 180, 0.7)'
          : 'rgba(255, 255, 255, 0.13)',
        boxShadow: active
          ? '0 0 28px rgba(255,110,180,0.22), inset 0 0 18px rgba(255,110,180,0.06)'
          : '0 8px 32px rgba(0,0,0,0.35)',
      }}
      transition={{ duration: 0.5 }}
    >
      <div className="object-canvas-wrapper">
        <Canvas camera={{ position: [0, 0, 3.4], fov: 48 }}>
          <ambientLight intensity={0.75} />
          <pointLight position={[3, 4, 4]} color="white" intensity={2.8} />
          <pointLight position={[-3, -2, 3]} color={labelColor} intensity={2} />
          <directionalLight position={[0, 2, 5]} intensity={0.6} />
          {visible && (
            <StageContent visualModel={visualModel} fallbackColor={object.color} />
          )}
          <OrbitControls
            enableZoom
            enablePan={false}
            minDistance={1.8}
            maxDistance={6}
          />
        </Canvas>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={label}
          className="object-label"
          initial={{ opacity: 0, x: 28, scale: 0.85 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: -28, scale: 0.85 }}
          transition={{ duration: 0.38, ease: [0.34, 1.56, 0.64, 1] }}
          style={{ color: labelColor, borderColor: `${labelColor}44` }}
        >
          {label}
        </motion.div>
      </AnimatePresence>

      <AnimatePresence>
        {active && (
          <motion.div
            className="object-glow-burst"
            initial={{ opacity: 0.6, scale: 0.6 }}
            animate={{ opacity: 0, scale: 2.2 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  )
}
