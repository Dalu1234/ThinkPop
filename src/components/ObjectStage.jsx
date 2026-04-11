import { useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { motion, AnimatePresence } from 'framer-motion'
// Note: AnimatePresence is only used for DOM-layer elements below,
// not inside the Canvas renderer.

function SpinningCube({ color }) {
  const meshRef = useRef()
  const glowRef = useRef()

  useFrame((state, delta) => {
    if (!meshRef.current) return
    meshRef.current.rotation.x += delta * 0.45
    meshRef.current.rotation.y += delta * 0.72
    // Subtle pulse
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
      {/* Wireframe overlay */}
      <mesh ref={glowRef}>
        <boxGeometry args={[1.12, 1.12, 1.12]} />
        <meshBasicMaterial color={color} wireframe transparent opacity={0.12} />
      </mesh>
    </>
  )
}

export default function ObjectStage({ object, visible, active }) {
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
        <Canvas camera={{ position: [0, 0, 2.8], fov: 50 }}>
          <ambientLight intensity={0.7} />
          <pointLight position={[3, 3, 3]} color="white" intensity={3} />
          <pointLight position={[-3, -2, 2]} color={object.color} intensity={2.5} />
          {visible && <SpinningCube color={object.color} />}
          <OrbitControls
            enableZoom
            enablePan={false}
            minDistance={1.5}
            maxDistance={5}
          />
        </Canvas>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={object.label}
          className="object-label"
          initial={{ opacity: 0, x: 28, scale: 0.85 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: -28, scale: 0.85 }}
          transition={{ duration: 0.38, ease: [0.34, 1.56, 0.64, 1] }}
          style={{ color: object.color, borderColor: `${object.color}44` }}
        >
          {object.label}
        </motion.div>
      </AnimatePresence>

      {/* Active glow burst */}
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
