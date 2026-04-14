/**
 * CharacterScene.jsx — Three.js canvas for ThinkPop.
 *
 * Props:
 *  motionFrames  — array of (22 x [x,y,z]) position arrays (HumanML3D)
 *  aiState       — string pipeline state
 *  mathExpression — optional string (e.g. "9 - 10 = -1") shown as extruded 3D text in front of the scene
 *  visualization — optional { type, steps, ... } for 3D token scenes (addition, subtraction, etc.)
 *  visualizationStepIndex — current step when visualization.steps is true
 */

import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useRef, useMemo } from 'react'
import { useFBX, Text3D, Center } from '@react-three/drei'
import * as THREE from 'three'

import { createRetargeter, DEFAULT_MIXAMO_MAP } from '../lib/retarget'
import { setRigRestPose } from '../lib/motionApi'
import { applyBoneAnimation } from '../lib/boneAnimations'
import { readGamepad } from '../lib/gamepad'
import { solveArm, getArmLengths } from '../lib/armIK'
import MathVisualization from './MathVisualization'
import SpatialViz from './SpatialViz'
import SolarSystem from './SolarSystem'

/** FBX root — scale + low Y so the figure sits in the lower half of the screen. */
const CHARACTER_SCALE = 0.051
const CHARACTER_POSITION = [0, -2.95, 0]

// ── Gamepad / IK scratch (module-level to avoid per-frame GC) ─────────────────
const _gpPole      = new THREE.Vector3(0, -1, 0)
const _gpShldrPos  = new THREE.Vector3()
const _gpElbowPos  = new THREE.Vector3()
const _gpWristPos  = new THREE.Vector3()
const _gpCurDir    = new THREE.Vector3()
const _gpDesDir    = new THREE.Vector3()
const _gpDeltaQ    = new THREE.Quaternion()
const _gpParentQ   = new THREE.Quaternion()
const _gpParentInv = new THREE.Quaternion()

/**
 * Apply world-space 2-bone IK to a shoulder→elbow→hand bone chain,
 * driven by a single (stickX, stickY) pair.
 * Only runs when the stick is outside the deadzone (|mag| > 0.01).
 *
 * stickX: +1 = move arm in world +X direction
 * stickY: +1 = move arm UP (browser Y-axis is already un-inverted by caller)
 */
function _applyBoneArmIK(shoulderBone, elbowBone, handBone, stickX, stickY) {
  if (!shoulderBone || !elbowBone || !handBone) return
  if (stickX * stickX + stickY * stickY < 0.0001) return  // stick at rest — leave animation alone

  shoulderBone.updateWorldMatrix(true, false)
  elbowBone.updateWorldMatrix(true, false)
  handBone.updateWorldMatrix(true, false)

  shoulderBone.getWorldPosition(_gpShldrPos)
  elbowBone.getWorldPosition(_gpElbowPos)
  handBone.getWorldPosition(_gpWristPos)

  const upperLen   = _gpShldrPos.distanceTo(_gpElbowPos)
  const forearmLen = _gpElbowPos.distanceTo(_gpWristPos)
  if (upperLen < 1e-6 || forearmLen < 1e-6) return

  const reach = (upperLen + forearmLen) * 0.85

  const wristTarget = new THREE.Vector3(
    _gpShldrPos.x + stickX * reach * 0.75,
    _gpShldrPos.y + stickY * reach * 0.60,
    _gpShldrPos.z + reach * 0.08,   // slight forward (toward camera)
  )

  const { elbow: newElbow } = solveArm({
    root: _gpShldrPos, target: wristTarget,
    upperLen, forearmLen, poleHint: _gpPole,
  })

  // Rotate shoulder so its elbow child lands on newElbow
  _gpCurDir.subVectors(_gpElbowPos, _gpShldrPos).normalize()
  _gpDesDir.subVectors(newElbow, _gpShldrPos).normalize()
  if (_gpCurDir.dot(_gpDesDir) < 0.9999) {
    _gpDeltaQ.setFromUnitVectors(_gpCurDir, _gpDesDir)
    _rotBoneByWorldDelta(shoulderBone, _gpDeltaQ)
    // Refresh positions after shoulder moved
    shoulderBone.updateWorldMatrix(true, false)
    elbowBone.updateWorldMatrix(true, false)
    elbowBone.getWorldPosition(_gpElbowPos)
  }

  // Rotate elbow so its wrist child lands on wristTarget
  handBone.updateWorldMatrix(true, false)
  handBone.getWorldPosition(_gpWristPos)
  _gpCurDir.subVectors(_gpWristPos, _gpElbowPos).normalize()
  _gpDesDir.subVectors(wristTarget, _gpElbowPos).normalize()
  if (_gpCurDir.dot(_gpDesDir) < 0.9999) {
    _gpDeltaQ.setFromUnitVectors(_gpCurDir, _gpDesDir)
    _rotBoneByWorldDelta(elbowBone, _gpDeltaQ)
  }
}

/** Apply a world-space rotation delta to a bone's local quaternion. */
function _rotBoneByWorldDelta(bone, worldDeltaQ) {
  if (bone.parent) {
    bone.parent.getWorldQuaternion(_gpParentQ)
    _gpParentInv.copy(_gpParentQ).invert()
    bone.quaternion.premultiply(
      _gpParentInv.clone().multiply(worldDeltaQ).multiply(_gpParentQ)
    )
  } else {
    bone.quaternion.premultiply(worldDeltaQ)
  }
}

// ── Head look ─────────────────────────────────────────────────────────────────
const _headQ = new THREE.Quaternion()
const _headE = new THREE.Euler(0, 0, 0, 'YXZ')

/**
 * Add pitch/yaw offset on top of whatever the base animation set.
 * Must be called AFTER applyBoneAnimation / r.applyFrame.
 * Split 50/50 across neck + head for a natural look.
 */
function _applyHeadLook(bones, pitch, yaw) {
  if (Math.abs(pitch) < 1e-5 && Math.abs(yaw) < 1e-5) return
  _headE.set(pitch * 0.5, yaw * 0.5, 0)
  _headQ.setFromEuler(_headE)
  const neck = bones['mixamorig:Neck']
  const head = bones['mixamorig:Head']
  if (neck) neck.quaternion.multiply(_headQ)
  if (head) head.quaternion.multiply(_headQ)
}

// ── Module-level drag state (singleton — one CharacterScene) ─────────────────
// Drag start/end driven by R3F raycasting on BackgroundPlane — the only approach
// that works because R3F calls stopPropagation() internally, blocking all
// window/document pointer listeners. Position tracking uses R3F's pointer (proven
// to work since head tracking uses it). Scroll uses a passive window listener
// (wheel events are not intercepted by R3F).
let   _mouseDown  = false
const _DRAG = { startX: 0, startY: 0, targetX: 0, targetY: 0,
                offsetX: 0, offsetY: 0, velX: 0, velY: 0,
                capturedX: false }
const _PUSH = { offsetZ: 0 }
const _NOD  = { trigger: false }

function _startDrag() {
  _mouseDown  = true
  _DRAG.capturedX = false
}
function _endDrag() {
  if (!_mouseDown) return
  _mouseDown = false
  if (Math.sqrt(_DRAG.targetX ** 2 + _DRAG.targetY ** 2) < 0.08) _NOD.trigger = true
  _DRAG.targetX = 0
  _DRAG.targetY = 0
}

let _wheelInited = false
function _initWheel() {
  if (_wheelInited) return
  _wheelInited = true
  window.addEventListener('wheel', e => {
    _PUSH.offsetZ = Math.max(-2.0, Math.min(1.2, _PUSH.offsetZ - e.deltaY * 0.004))
  }, { passive: true })
}

/**
 * BackgroundPlane — invisible plane covering the viewport.
 * onPointerDown/Up go through R3F's own raycasting (guaranteed to fire).
 */
function BackgroundPlane() {
  return (
    <mesh position={[0, 0, -1]} renderOrder={-1}
      onPointerDown={_startDrag}
      onPointerUp={_endDrag}
      onPointerLeave={_endDrag}
    >
      <planeGeometry args={[40, 40]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  )
}

/** Camera looks at this point (world). Higher Y = aim above the figure so it sits lower on screen. */
const CAMERA_POS = [0, 0.62, 3.55]
const CAMERA_LOOK_AT_Y = 0.15

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

const _lookTarget = new THREE.Vector3()

/** Keeps camera aimed at mid-body so the character reads in the lower half of the viewport. */
function SceneCameraFraming() {
  const { camera } = useThree()
  useFrame(() => {
    camera.position.set(CAMERA_POS[0], CAMERA_POS[1], CAMERA_POS[2])
    _lookTarget.set(0, CAMERA_LOOK_AT_Y, 0)
    camera.lookAt(_lookTarget)
  })
  return null
}

// FBX Character — supports direct bone animations (string) or retargeted MDM frames (array)
const FRAME_MS = 50

function FBXCharacter({ motionFrames, animation }) {
  const { scene, clock, pointer, gl } = useThree()
  const retargeterRef = useRef(null)
  const boneMapRef    = useRef({})
  const restQuatsRef  = useRef({})
  const hipsRestPosRef = useRef(null)
  const frameRef      = useRef(0)
  const carryMs       = useRef(0)
  const animStartRef  = useRef(0)
  const armLengthsRef = useRef(null)   // { left, right } — computed once per animation
  const fbxRootRef    = useRef(null)   // FBX root object — used for jump Y offset
  const headEulerRef  = useRef({ pitch: 0, yaw: 0 })
  const jumpRef       = useRef({ active: false, t: 0 })
  const gpPrevRef          = useRef({ a: false })  // A-button edge detection
  const clickReactionRef   = useRef({ active: false, t: 0 })
  const fbx = useFBX('/assets/character.fbx')

  useEffect(() => {
    if (!fbx) return
    const clone = fbx.clone(true)
    clone.scale.setScalar(CHARACTER_SCALE)
    clone.position.set(...CHARACTER_POSITION)
    clone.rotation.y = 0

    clone.traverse(child => {
      if (child.isMesh || child.isSkinnedMesh) {
        child.castShadow    = true
        child.receiveShadow = false
        child.frustumCulled = false
      }
    })

    scene.add(clone)
    fbxRootRef.current = clone

    try {
      const r = createRetargeter(clone)
      retargeterRef.current = r
      if (r.rigRestPose) {
        setRigRestPose(r.rigRestPose)
      }

      // Build normalized bone maps from the retargeter's verified bone references.
      // The retargeter's boneMap is keyed by ACTUAL names (e.g. "mixamorigSpine")
      // and its mixamoMap converts HML names to actual names. We invert this to get
      // a canonical "mixamorig:" keyed map that boneAnimations.js expects.
      const bones = {}
      const rQuats = {}
      // First, map all retargeter bones with their actual names
      for (const [actualName, boneObj] of Object.entries(r.boneMap)) {
        bones[actualName] = boneObj
        rQuats[actualName] = boneObj.quaternion.clone()
      }
      // Also add canonical mixamorig: aliases pointing to the same bone objects
      for (const [hmlName, actualName] of Object.entries(r.mixamoMap)) {
        const boneObj = r.boneMap[actualName]
        if (!boneObj) continue
        // DEFAULT_MIXAMO_MAP has hmlName → "mixamorig:BoneName", use that as canonical key
        const canonicalName = DEFAULT_MIXAMO_MAP[hmlName]
        if (canonicalName && !bones[canonicalName]) {
          bones[canonicalName] = boneObj
          rQuats[canonicalName] = boneObj.quaternion.clone()
        }
      }
      boneMapRef.current = bones
      restQuatsRef.current = rQuats
      const h = bones['mixamorig:Hips']
      if (h) hipsRestPosRef.current = h.position.clone()
      const hasSpine = !!bones['mixamorig:Spine']
      const hasArm = !!bones['mixamorig:RightArm']
      console.log('[CharacterScene] Bone anim map:', Object.keys(bones).length, 'bones, hasSpine=', hasSpine, 'hasArm=', hasArm)

    } catch (e) {
      console.error('[CharacterScene] Retargeter setup failed:', e)
    }

    return () => {
      scene.remove(clone)
      retargeterRef.current = null
      fbxRootRef.current = null
    }
  }, [fbx, scene])

  /** Hot reload / constant tweaks: setup effect only depends on [fbx, scene], so scale must be synced here. */
  useEffect(() => {
    if (!fbxRootRef.current) return
    fbxRootRef.current.scale.setScalar(CHARACTER_SCALE)
  }, [CHARACTER_SCALE])

  useEffect(() => {
    frameRef.current = 0
    carryMs.current = FRAME_MS
    armLengthsRef.current = null  // recompute arm lengths from new animation
  }, [motionFrames])

  useEffect(() => {
    animStartRef.current = clock.getElapsedTime()
  }, [animation, clock])

  // Log gamepad connect/disconnect so we can confirm the browser sees the controller
  useEffect(() => {
    function onConnect(e) {
      console.log('[Gamepad] Connected:', e.gamepad.id, '| mapping:', e.gamepad.mapping,
        '| axes:', e.gamepad.axes.length, '| buttons:', e.gamepad.buttons.length)
    }
    function onDisconnect(e) {
      console.log('[Gamepad] Disconnected:', e.gamepad.id)
    }
    window.addEventListener('gamepadconnected',    onConnect)
    window.addEventListener('gamepaddisconnected', onDisconnect)
    return () => {
      window.removeEventListener('gamepadconnected',    onConnect)
      window.removeEventListener('gamepaddisconnected', onDisconnect)
    }
  }, [])

  // Register scroll/wheel listener once (not intercepted by R3F)
  useEffect(() => { _initWheel() }, [])

  const animRef = useRef(animation)
  animRef.current = animation

  useFrame((state, delta) => {
    const anim  = animRef.current
    const r     = retargeterRef.current
    const bones = boneMapRef.current
    const gp    = readGamepad()

    // True whenever any stick / d-pad has input — used to cancel idle animation
    const gpInterrupting = gp.connected && (
      gp.lx !== 0 || gp.ly !== 0 ||
      gp.rx !== 0 || gp.ry !== 0 ||
      gp.dLeft || gp.dRight || gp.dUp || gp.dDown
    )

    // ── A button → jump (gamepad only) ───────────────────────────────────
    if (gp.connected) {
      if (gp.a && !gpPrevRef.current.a && !jumpRef.current.active) {
        jumpRef.current = { active: true, t: 0 }
      }
      gpPrevRef.current.a = gp.a
    }

    // ── Jump arc (contributes to Y — applied in unified position update below) ──
    let jumpLiftY = 0
    const JUMP_DUR = 0.65
    const JUMP_H   = 0.55
    if (jumpRef.current.active) {
      jumpRef.current.t += delta
      if (jumpRef.current.t >= JUMP_DUR) {
        jumpRef.current.active = false
      } else {
        jumpLiftY = JUMP_H * Math.sin(Math.PI * jumpRef.current.t / JUMP_DUR)
      }
    }

    // ── Drag target — driven by R3F's pointer (NDC) which is always current ─
    if (_mouseDown) {
      if (!_DRAG.capturedX) {
        // Snap start position on the first frame the button is held
        _DRAG.startX    = pointer.x
        _DRAG.startY    = pointer.y
        _DRAG.capturedX = true
      }
      _DRAG.targetX = (pointer.x - _DRAG.startX) * 1.4
      _DRAG.targetY = (pointer.y - _DRAG.startY) * 1.4
    }

    // ── Drag spring physics ───────────────────────────────────────────────
    const STIFFNESS = 0.10
    const DAMPING   = 0.74
    _DRAG.velX = (_DRAG.velX + (_DRAG.targetX - _DRAG.offsetX) * STIFFNESS) * DAMPING
    _DRAG.velY = (_DRAG.velY + (_DRAG.targetY - _DRAG.offsetY) * STIFFNESS) * DAMPING
    _DRAG.offsetX += _DRAG.velX
    _DRAG.offsetY += _DRAG.velY

    // ── Click-nod trigger from mouseup ───────────────────────────────────
    if (_NOD.trigger) {
      _NOD.trigger = false
      clickReactionRef.current = { active: true, t: 0 }
    }

    // ── Unified FBX root position (drag + jump + push) ───────────────────
    if (fbxRootRef.current) {
      fbxRootRef.current.position.x = CHARACTER_POSITION[0] + _DRAG.offsetX
      fbxRootRef.current.position.y = CHARACTER_POSITION[1] + _DRAG.offsetY + jumpLiftY
      fbxRootRef.current.position.z = CHARACTER_POSITION[2] + _PUSH.offsetZ
    }

    // ── Head look — D-pad takes priority, otherwise mouse tracks cursor ────
    const he = headEulerRef.current
    const dPadActive = gp.connected && (gp.dLeft || gp.dRight || gp.dUp || gp.dDown)

    if (dPadActive) {
      const HEAD_RATE = 0.028
      if (gp.dLeft)  he.yaw   -= HEAD_RATE
      if (gp.dRight) he.yaw   += HEAD_RATE
      if (gp.dUp)    he.pitch -= HEAD_RATE
      if (gp.dDown)  he.pitch += HEAD_RATE
    } else {
      // Smooth mouse tracking: pointer.x/y are NDC [-1,+1], +y = screen top
      const LERP = 0.04
      he.yaw   += (pointer.x * 0.65  - he.yaw)   * LERP
      he.pitch += (-pointer.y * 0.20 - he.pitch)  * LERP
    }
    he.pitch = THREE.MathUtils.clamp(he.pitch, -0.65, 0.45)
    he.yaw   = THREE.MathUtils.clamp(he.yaw,   -0.87, 0.87)

    // ── Click reaction — double nod over 0.5 s ────────────────────────────
    const T_NOD = 0.5
    if (clickReactionRef.current.active) {
      clickReactionRef.current.t += delta
      if (clickReactionRef.current.t >= T_NOD) clickReactionRef.current.active = false
    }
    // Extra pitch added on top of the mouse/D-pad head look
    const nodPitch = clickReactionRef.current.active
      ? -0.32 * Math.sin(4 * Math.PI * clickReactionRef.current.t / T_NOD)
      : 0

    // helper: force matrix rebuild up to root
    function _rebuildRoot() {
      const hips = bones['mixamorig:Hips']
      if (!hips) return
      let root = hips
      while (root.parent && root.parent.isObject3D) root = root.parent
      root.updateMatrixWorld(true)
    }

    // ── MDM retargeted frames ─────────────────────────────────────────────
    if (motionFrames?.length && r) {
      carryMs.current += (1 / 60) * 1000
      let lastFr = null
      while (carryMs.current >= FRAME_MS) {
        carryMs.current -= FRAME_MS
        const fr = motionFrames[frameRef.current]
        if (Array.isArray(fr) && fr.length === 22) lastFr = fr
        frameRef.current = (frameRef.current + 1) % motionFrames.length
      }

      if (lastFr) {
        if (!armLengthsRef.current) {
          armLengthsRef.current = {
            left:  getArmLengths(lastFr, 'left'),
            right: getArmLengths(lastFr, 'right'),
          }
        }

        const rMoved = gp.connected && (gp.rx * gp.rx + gp.ry * gp.ry > 0.0001)
        const lMoved = gp.connected && (gp.lx * gp.lx + gp.ly * gp.ly > 0.0001)

        if (rMoved || lMoved) {
          const pf = lastFr.map(j => [j[0], j[1], j[2]])

          if (rMoved) {
            // HML: right=−X so stick-right(+1) → negative X; stick Y inverted
            const rl = armLengthsRef.current.right
            const rs = new THREE.Vector3(...pf[rl.shoulderIdx])
            const { elbow: re, wrist: rw } = solveArm({
              root: rs,
              target: new THREE.Vector3(rs.x - gp.rx * 0.62, rs.y - gp.ry * 0.58, rs.z - 0.10),
              upperLen: rl.upperLen, forearmLen: rl.forearmLen, poleHint: _gpPole,
            })
            pf[rl.elbowIdx] = [re.x, re.y, re.z]
            pf[rl.wristIdx] = [rw.x, rw.y, rw.z]
          }

          if (lMoved) {
            const ll = armLengthsRef.current.left
            const ls = new THREE.Vector3(...pf[ll.shoulderIdx])
            const { elbow: le, wrist: lw } = solveArm({
              root: ls,
              target: new THREE.Vector3(ls.x - gp.lx * 0.62, ls.y - gp.ly * 0.58, ls.z - 0.10),
              upperLen: ll.upperLen, forearmLen: ll.forearmLen, poleHint: _gpPole,
            })
            pf[ll.elbowIdx] = [le.x, le.y, le.z]
            pf[ll.wristIdx] = [lw.x, lw.y, lw.z]
          }

          r.applyFrame(pf)
        } else {
          r.applyFrame(lastFr)
        }
      }

      _applyHeadLook(bones, he.pitch + nodPitch, he.yaw)
      _rebuildRoot()
      return
    }

    // ── Bone animation mode ───────────────────────────────────────────────
    if (typeof anim === 'string' && anim) {
      if (!gpInterrupting || anim === 'idle') {
        const t = clock.getElapsedTime() - animStartRef.current
        applyBoneAnimation(bones, restQuatsRef.current, anim, t, { hipsRestPos: hipsRestPosRef.current })
      }

      if (gp.connected) {
        _applyBoneArmIK(bones['mixamorig:RightArm'], bones['mixamorig:RightForeArm'], bones['mixamorig:RightHand'], gp.rx, -gp.ry)
        _applyBoneArmIK(bones['mixamorig:LeftArm'],  bones['mixamorig:LeftForeArm'],  bones['mixamorig:LeftHand'],  gp.lx, -gp.ly)
      }
      _applyHeadLook(bones, he.pitch + nodPitch, he.yaw)
      _rebuildRoot()
      return
    }

    // ── Idle fallback ─────────────────────────────────────────────────────
    if (!r) return
    const tIdle = clock.getElapsedTime()
    applyBoneAnimation(bones, restQuatsRef.current, 'idle', tIdle, { hipsRestPos: hipsRestPosRef.current })

    if (gp.connected) {
      _applyBoneArmIK(bones['mixamorig:RightArm'], bones['mixamorig:RightForeArm'], bones['mixamorig:RightHand'], gp.rx, -gp.ry)
      _applyBoneArmIK(bones['mixamorig:LeftArm'],  bones['mixamorig:LeftForeArm'],  bones['mixamorig:LeftHand'],  gp.lx, -gp.ly)
    }
    _applyHeadLook(bones, he.pitch, he.yaw)
    _rebuildRoot()
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

function SceneContent({
  motionFrames,
  animation,
  aiState,
  showNeonX,
  showNeonTick,
  mathExpression,
  visualization,
  visualizationStepIndex,
  spatialItems,
  spatialActive,
  onSpatialTouch,
}) {
  return (
    <>
      <BackgroundPlane />
      <SceneCameraFraming />
      <Lighting />
      <SolarSystem aiState={aiState} />
      <Particles />
      <Suspense fallback={null}>
        <MathVisualization visualization={visualization} stepIndex={visualizationStepIndex} />
      </Suspense>
      {spatialItems && (
        <Suspense fallback={null}>
          <SpatialViz items={spatialItems} active={spatialActive} onTouch={onSpatialTouch} />
        </Suspense>
      )}
      <Suspense fallback={<LoadingStand />}>
        <FBXCharacter motionFrames={motionFrames} animation={animation} aiState={aiState} />
      </Suspense>
      <MathExpression3D expression={mathExpression} />
      <NeonXTool visible={showNeonX} />
      <NeonTickTool visible={showNeonTick} />
    </>
  )
}

export default function CharacterScene({
  motionFrames,
  animation = 'idle',
  aiState,
  showNeonX,
  showNeonTick,
  mathExpression,
  visualization,
  visualizationStepIndex = 0,
  spatialItems,
  spatialActive,
  onSpatialTouch,
}) {
  return (
    <Canvas
      style={{ position: 'fixed', inset: 0, zIndex: 0 }}
      camera={{ position: CAMERA_POS, fov: 42, near: 0.01, far: 100 }}
      gl={{ antialias: true, outputColorSpace: THREE.SRGBColorSpace, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.4 }}
      shadows
    >
      <color attach="background" args={['#020304']} />
      <fog attach="fog" args={['#020304', 8, 30]} />
      <SceneContent
        motionFrames={motionFrames}
        animation={animation}
        aiState={aiState}
        showNeonX={showNeonX}
        showNeonTick={showNeonTick}
        mathExpression={mathExpression}
        visualization={visualization}
        visualizationStepIndex={visualizationStepIndex}
        spatialItems={spatialItems}
        spatialActive={spatialActive}
        onSpatialTouch={onSpatialTouch}
      />
    </Canvas>
  )
}
