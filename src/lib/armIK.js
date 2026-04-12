/**
 * armIK.js — 2-bone IK solver for HumanML3D position arrays.
 *
 * Operates in HumanML3D space (+X=left, −X=right, +Y=up, +Z=forward).
 * All returned vectors are new THREE.Vector3 instances — do NOT cache them
 * across frames without cloning.
 */

import * as THREE from 'three'

// Module-level scratch — avoids per-call allocations inside solveArm
const _toTarget  = new THREE.Vector3()
const _perp      = new THREE.Vector3()
const _axis      = new THREE.Vector3()
const _q         = new THREE.Quaternion()
const _elbowDir  = new THREE.Vector3()

/**
 * Solve a 2-bone IK chain (shoulder → elbow → wrist).
 *
 * The elbow bends in the direction of `poleHint` (projected perpendicular
 * to the shoulder→target line).  A poleHint of (0,−1,0) keeps the elbow
 * pointing downward, which looks natural for arm control.
 *
 * @param {{ root: THREE.Vector3, target: THREE.Vector3,
 *            upperLen: number, forearmLen: number,
 *            poleHint: THREE.Vector3 }} params
 * @returns {{ elbow: THREE.Vector3, wrist: THREE.Vector3 }}
 */
export function solveArm({ root, target, upperLen, forearmLen, poleHint }) {
  _toTarget.subVectors(target, root)
  const dist = _toTarget.length()

  // Keep target within 99.9% of full reach to avoid gimbal at full extension
  const maxReach = (upperLen + forearmLen) * 0.999
  const clampedTarget = dist > maxReach
    ? root.clone().addScaledVector(_toTarget.clone().normalize(), maxReach)
    : target.clone()

  _toTarget.subVectors(clampedTarget, root)
  const clampedDist = _toTarget.length()

  // Law of cosines: angle at shoulder between (shoulder→wrist) and (shoulder→elbow)
  const cosA = THREE.MathUtils.clamp(
    (upperLen * upperLen + clampedDist * clampedDist - forearmLen * forearmLen) /
    (2 * upperLen * clampedDist),
    -1, 1
  )
  const angleA = Math.acos(cosA)

  // Project poleHint onto the plane perpendicular to shoulder→wrist
  const toTargetDir = _toTarget.clone().normalize()
  _perp.copy(poleHint).addScaledVector(toTargetDir, -poleHint.dot(toTargetDir))

  // Fallback when pole is (nearly) parallel to toTargetDir
  if (_perp.lengthSq() < 1e-8) {
    _perp.set(0, -1, 0).addScaledVector(toTargetDir, toTargetDir.y)
  }
  _perp.normalize()

  // Rotate toTargetDir toward _perp by angleA — right-hand rule gives correct bend
  _axis.crossVectors(toTargetDir, _perp).normalize()
  _q.setFromAxisAngle(_axis, angleA)
  _elbowDir.copy(toTargetDir).applyQuaternion(_q)

  return {
    elbow: root.clone().addScaledVector(_elbowDir, upperLen),
    wrist: clampedTarget,
  }
}

/**
 * Measure upper-arm and forearm lengths from a reference HML position frame.
 *
 * HML arm joint indices:
 *   left  — shoulder=16, elbow=18, wrist=20
 *   right — shoulder=17, elbow=19, wrist=21
 */
export function getArmLengths(refFrame, side) {
  const [si, ei, wi] = side === 'left' ? [16, 18, 20] : [17, 19, 21]
  const shoulder = new THREE.Vector3(...refFrame[si])
  const elbow    = new THREE.Vector3(...refFrame[ei])
  const wrist    = new THREE.Vector3(...refFrame[wi])
  return {
    upperLen:    shoulder.distanceTo(elbow),
    forearmLen:  elbow.distanceTo(wrist),
    shoulderIdx: si,
    elbowIdx:    ei,
    wristIdx:    wi,
  }
}
