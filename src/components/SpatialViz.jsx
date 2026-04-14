/**
 * SpatialViz — R3F component that renders a mixed set of 3D objects (each from
 * a different GLB), floating name labels, a glowing hand cursor driven by
 * MediaPipe finger-tip position, and proximity-based touch detection.
 *
 * Props:
 *   items   — [{ name, path, position: [x,y,z] }]  objects to display
 *   active  — enable cursor tracking + touch detection
 *   onTouch — (index, name) => void   called once per object when cursor is close
 */
import { useFrame } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { fingerState } from '../lib/fingerBridge'

const TOKEN_SIZE = 0.28
const TOUCH_RADIUS = 0.32
const VIZ_ANCHOR = [-1.05, 0.22, 0.08]

const _cursorTarget = new THREE.Vector3()
const _objWorld = new THREE.Vector3()

function fingerToLocal(fx, fy) {
  const mx = 1 - fx
  const x = THREE.MathUtils.lerp(-0.85, 0.85, mx)
  const y = THREE.MathUtils.lerp(0.7, -0.5, fy)
  return new THREE.Vector3(x, y, 0.25)
}

function makeLabel(text) {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.clearRect(0, 0, 512, 128)
    ctx.font = '700 52px Arial'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.shadowColor = '#000000'
    ctx.shadowBlur = 14
    ctx.fillStyle = '#ffd166'
    ctx.fillText(text, 256, 64)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  const mat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  })
  const sprite = new THREE.Sprite(mat)
  sprite.scale.set(0.72, 0.18, 1)
  return sprite
}

function makeHighlightRing() {
  const geo = new THREE.RingGeometry(0.16, 0.2, 32)
  const mat = new THREE.MeshBasicMaterial({
    color: '#00ff88',
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.rotation.x = -Math.PI / 2
  mesh.position.y = 0.01
  return mesh
}

export default function SpatialViz({ items, active, onTouch }) {
  const rootRef = useRef()
  const cursorRef = useRef()
  const objectsRef = useRef([])
  const touchedSetRef = useRef(new Set())
  const lastFireRef = useRef({})

  useEffect(() => {
    if (!items?.length || !rootRef.current) return
    let cancelled = false
    const loader = new GLTFLoader()
    const root = rootRef.current

    while (root.children.length) root.remove(root.children[0])
    objectsRef.current = []
    touchedSetRef.current = new Set()
    lastFireRef.current = {}

    async function loadAll() {
      const now = performance.now() / 1000
      for (let i = 0; i < items.length; i++) {
        if (cancelled) return
        try {
          const gltf = await loader.loadAsync(items[i].path)
          if (cancelled) return
          const scene = gltf?.scene ? clone(gltf.scene) : new THREE.Group()

          const box = new THREE.Box3().setFromObject(scene)
          const size = new THREE.Vector3()
          const center = new THREE.Vector3()
          box.getSize(size)
          box.getCenter(center)
          const maxDim = Math.max(size.x || 1, size.y || 1, size.z || 1, 1)
          const scale = TOKEN_SIZE / maxDim
          scene.scale.setScalar(scale)
          scene.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale)

          const group = new THREE.Group()
          group.add(scene)

          const pos = new THREE.Vector3(...items[i].position)
          group.position.copy(pos)
          group.scale.setScalar(0.001)

          const label = makeLabel(items[i].name)
          label.position.set(0, TOKEN_SIZE + 0.14, 0)
          group.add(label)

          const ring = makeHighlightRing()
          group.add(ring)

          root.add(group)
          objectsRef.current.push({
            mesh: group,
            ring,
            name: items[i].name,
            index: i,
            localPos: pos.clone(),
            appearAt: now + i * 0.18,
            touched: false,
          })
        } catch (e) {
          console.warn(`[SpatialViz] Failed to load ${items[i].path}:`, e)
        }
      }
    }

    loadAll()
    return () => {
      cancelled = true
    }
  }, [items])

  useFrame(() => {
    if (!rootRef.current) return
    const now = performance.now() / 1000

    for (const obj of objectsRef.current) {
      const elapsed = now - obj.appearAt
      const popT = Math.min(1, Math.max(0, elapsed / 0.45))
      const ease = 1 - Math.pow(1 - popT, 3)
      const bob = Math.sin(now * 1.8 + obj.index * 2.1) * 0.018
      const pulse = obj.touched ? 1 + Math.sin(now * 5) * 0.06 : 1
      obj.mesh.scale.setScalar(ease * pulse)
      obj.mesh.position.y = obj.localPos.y + bob

      if (obj.ring) {
        const targetOpacity = obj.touched ? 0.85 : 0
        obj.ring.material.opacity += (targetOpacity - obj.ring.material.opacity) * 0.12
        obj.ring.rotation.z = now * 1.5
      }
    }

    const cursor = cursorRef.current
    if (!cursor) return

    if (active && fingerState.active && fingerState.x >= 0) {
      const ft = fingerToLocal(fingerState.x, fingerState.y)
      _cursorTarget.copy(ft)
      cursor.position.lerp(_cursorTarget, 0.2)
      cursor.visible = true
      const cs = 0.055 + Math.sin(now * 9) * 0.012
      cursor.scale.setScalar(cs)

      for (const obj of objectsRef.current) {
        _objWorld.copy(obj.localPos)
        const dist = cursor.position.distanceTo(_objWorld)
        if (dist < TOUCH_RADIUS) {
          obj.touched = true
          touchedSetRef.current.add(obj.index)
          const lastFire = lastFireRef.current[obj.index] || 0
          if (now - lastFire > 0.8) {
            lastFireRef.current[obj.index] = now
            onTouch?.(obj.index, obj.name)
          }
        }
      }
    } else {
      cursor.visible = false
    }
  })

  return (
    <group position={VIZ_ANCHOR}>
      <group ref={rootRef} />
      <mesh ref={cursorRef} visible={false}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshStandardMaterial
          color="#ffd700"
          emissive="#ffd700"
          emissiveIntensity={2.5}
          transparent
          opacity={0.8}
        />
      </mesh>
    </group>
  )
}
