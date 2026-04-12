/**
 * retarget.js — Position-based MDM → Mixamo FBX retargeting.
 *
 * Ported from brainpop/frontend/js/app.js.
 * Pure JS, no React. Pass a loaded Three.js Object3D (FBX root).
 *
 * Usage:
 *   const r = createRetargeter(fbxRoot)
 *   r.applyFrame(positions22)   // call every animation frame
 */

import * as THREE from 'three'

// ─── HumanML3D joint hierarchy ────────────────────────────────────────────────
export const HML_JOINT_NAMES = [
  'pelvis','left_hip','right_hip','spine1',
  'left_knee','right_knee','spine2',
  'left_ankle','right_ankle','spine3',
  'left_foot','right_foot','neck',
  'left_collar','right_collar','head',
  'left_shoulder','right_shoulder',
  'left_elbow','right_elbow',
  'left_wrist','right_wrist',
]
const HML_PARENTS = [-1,0,0,0,1,2,3,4,5,6,7,8,9,12,12,12,13,14,16,17,18,19]
const HML_PRIMARY_CHILD = {
  0:3,  1:4,  2:5,  3:6,  4:7,  5:8,  6:9,  7:10, 8:11, 9:12,
  12:15, 13:16, 14:17, 16:18, 17:19, 18:20, 19:21,
}

export const DEFAULT_MIXAMO_MAP = {
  pelvis:         'mixamorig:Hips',
  left_hip:       'mixamorig:LeftUpLeg',
  right_hip:      'mixamorig:RightUpLeg',
  spine1:         'mixamorig:Spine',
  left_knee:      'mixamorig:LeftLeg',
  right_knee:     'mixamorig:RightLeg',
  spine2:         'mixamorig:Spine1',
  left_ankle:     'mixamorig:LeftFoot',
  right_ankle:    'mixamorig:RightFoot',
  spine3:         'mixamorig:Spine2',
  left_foot:      'mixamorig:LeftToeBase',
  right_foot:     'mixamorig:RightToeBase',
  neck:           'mixamorig:Neck',
  left_collar:    'mixamorig:LeftShoulder',
  right_collar:   'mixamorig:RightShoulder',
  head:           'mixamorig:Head',
  left_shoulder:  'mixamorig:LeftArm',
  right_shoulder: 'mixamorig:RightArm',
  left_elbow:     'mixamorig:LeftForeArm',
  right_elbow:    'mixamorig:RightForeArm',
  left_wrist:     'mixamorig:LeftHand',
  right_wrist:    'mixamorig:RightHand',
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Create a retargeter for a loaded Three.js FBX scene.
 * Automatically detects Mixamo bone prefix variants (mixamorig: / mixamorig6: etc.)
 */
export function createRetargeter(character) {
  const mixamoMap    = { ...DEFAULT_MIXAMO_MAP }
  const boneMap      = {}
  const restLocalQ   = {}
  const restWorldQ   = {}
  const restBoneDir  = {}   // DIRECT mapped-parent → mapped-child world direction at rest
  let   restHipsLocalY = null

  // Scratch (reused every frame — avoids GC pressure)
  const _wq  = new THREE.Quaternion()
  const _wqi = new THREE.Quaternion()
  const _va  = new THREE.Vector3()
  const _vb  = new THREE.Vector3()
  const _vc  = new THREE.Vector3()
  const _vd  = new THREE.Vector3()
  const _ve  = new THREE.Vector3()
  const _dq  = new THREE.Quaternion()

  let retargetOrder = null
  let rigRestPose = null

  // ── Boot ────────────────────────────────────────────────────────────────────
  _collectBones()
  _detectPrefix()
  _captureRestLocalQ()
  _captureRestWorldQ()
  _buildOrder()
  rigRestPose = _computeRigRestPose()

  // ── Private ─────────────────────────────────────────────────────────────────
  function _collectBones() {
    character.traverse(child => {
      if (child.isSkinnedMesh) {
        child.frustumCulled = false
        child.skeleton?.bones.forEach(b => { boneMap[b.name] = b })
      }
    })
    character.traverse(child => {
      if (child.isBone && !boneMap[child.name]) boneMap[child.name] = child
    })
  }

  function _detectPrefix() {
    if (boneMap['mixamorig:Hips']) return  // standard — nothing to do
    const hip = Object.keys(boneMap).find(n => n.toLowerCase().includes('hip'))
    if (!hip) { console.warn('[retarget] No Hips bone found — bone map may be empty'); return }
    const prefix = hip.replace(/[Hh]ips?$/, '')
    for (const k of Object.keys(mixamoMap)) {
      mixamoMap[k] = mixamoMap[k].replace('mixamorig:', prefix)
    }
    console.log('[retarget] Detected bone prefix:', JSON.stringify(prefix))
  }

  function _captureRestLocalQ() {
    for (const mn of Object.values(mixamoMap)) {
      const b = boneMap[mn]
      if (b) restLocalQ[mn] = b.quaternion.clone()
    }
    const hb = boneMap[mixamoMap['pelvis']]
    if (hb) restHipsLocalY = hb.position.y
  }

  /**
   * Capture rest-pose world quaternions and bone directions.
   * Uses HML_PRIMARY_CHILD to compute DIRECT mapped-parent → mapped-child
   * directions (skipping twist/helper bones), matching brainpop's approach.
   */
  function _captureRestWorldQ() {
    character.updateMatrixWorld(true)
    const wp = new THREE.Vector3(), wc = new THREE.Vector3()

    // First pass: capture world quaternions and set default direction
    for (const mn of Object.values(mixamoMap)) {
      const bone = boneMap[mn]
      if (!bone) continue
      restWorldQ[mn] = new THREE.Quaternion()
      bone.getWorldQuaternion(restWorldQ[mn])
      restBoneDir[mn] = new THREE.Vector3(0, 1, 0)
    }

    // Second pass: overwrite with DIRECT mapped-parent → mapped-child directions.
    // This skips intermediate twist/helper bones so directions match the
    // full anatomical segments MDM uses.
    for (const [pIdx, cIdx] of Object.entries(HML_PRIMARY_CHILD)) {
      const pMn = mixamoMap[HML_JOINT_NAMES[pIdx]]
      const cMn = mixamoMap[HML_JOINT_NAMES[cIdx]]
      const pBone = pMn && boneMap[pMn]
      const cBone = cMn && boneMap[cMn]
      if (!pBone || !cBone) continue
      pBone.getWorldPosition(wp)
      cBone.getWorldPosition(wc)
      const d = wc.clone().sub(wp)
      if (d.length() > 1e-5) restBoneDir[cMn] = d.normalize()
    }

    // Head: neck → head (direct)
    const neckBone = boneMap[mixamoMap.neck]
    const headBone = boneMap[mixamoMap.head]
    if (neckBone && headBone) {
      neckBone.getWorldPosition(wp)
      headBone.getWorldPosition(wc)
      const d = wc.clone().sub(wp)
      if (d.length() > 1e-5) restBoneDir[mixamoMap.head] = d.normalize()
    }

    // Log arm diagnostics
    const armChainHml = ['left_collar','left_shoulder','left_elbow','left_wrist',
                          'right_collar','right_shoulder','right_elbow','right_wrist']
    for (const hml of armChainHml) {
      const mn = mixamoMap[hml]
      const rd = mn && restBoneDir[mn]
      console.log(`[retarget-arm] ${hml} → "${mn}" restDir=${rd ? rd.toArray().map(v => v.toFixed(3)) : 'MISSING'}`)
    }
  }

  function _depth(j) {
    let bone = boneMap[mixamoMap[HML_JOINT_NAMES[j]]]
    let d = 0
    while (bone?.isBone) { d++; bone = bone.parent; if (d > 96) break }
    return d
  }

  function _buildOrder() {
    const order = []
    for (let j = 1; j < 22; j++) {
      if (boneMap[mixamoMap[HML_JOINT_NAMES[j]]]) order.push(j)
    }
    order.sort((a, b) => _depth(a) - _depth(b))
    retargetOrder = order
  }

  function _getRestDir(mn, out) {
    const seg = restBoneDir[mn]
    if (!seg) return null
    out.copy(seg)
    return out
  }

  /**
   * Swing limits matching brainpop: spine/neck capped, limbs uncapped (Math.PI).
   * This gives arms and legs full range of motion while preventing spine hyperextension.
   */
  function _maxSwing(p) {
    if (p === 3) return THREE.MathUtils.degToRad(35)   // spine1 (waist)
    if (p === 6) return THREE.MathUtils.degToRad(45)   // spine2
    if (p === 9) return THREE.MathUtils.degToRad(55)   // spine3
    if (p === 12) return THREE.MathUtils.degToRad(15)  // neck
    if (p === 13 || p === 14) return THREE.MathUtils.degToRad(40) // collars
    return Math.PI                                      // all limbs: uncapped
  }

  function _clampDir(rest, desired, maxRad) {
    _vc.copy(desired)
    const ang = Math.acos(THREE.MathUtils.clamp(rest.dot(_vc), -1, 1))
    if (ang <= maxRad + 1e-7) return
    const t = maxRad / ang, sinA = Math.sin(ang)
    desired.copy(rest)
      .multiplyScalar(Math.sin((1 - t) * ang) / sinA)
      .addScaledVector(_vc, Math.sin(t * ang) / sinA)
      .normalize()
  }

  /** Prevent upper arms from clipping through body (min abduction from spine axis). */
  function _enforceMinAbduction(p, desired, pts) {
    if (p !== 16 && p !== 17) return
    _vd.subVectors(pts[0], pts[3])
    if (_vd.lengthSq() < 1e-8) return
    _vd.normalize()
    const cosAngle = desired.dot(_vd)
    const cosLimit = Math.cos(THREE.MathUtils.degToRad(12))
    if (cosAngle > cosLimit) {
      _ve.copy(desired).addScaledVector(_vd, -cosAngle)
      if (_ve.lengthSq() < 1e-8) {
        const childMn = mixamoMap[HML_JOINT_NAMES[(p === 16) ? 18 : 19]]
        const rest = restBoneDir[childMn]
        if (rest) _ve.copy(rest); else return
      }
      _ve.normalize()
      const sinLimit = Math.sin(THREE.MathUtils.degToRad(12))
      desired.copy(_vd).multiplyScalar(cosLimit).addScaledVector(_ve, sinLimit).normalize()
    }
  }

  /**
   * Core bone rotation: compute delta quaternion from rest direction to desired
   * direction, apply on top of rest world quaternion, convert to local space.
   * _va must contain the rest direction before this call.
   */
  function _applyBone(bone, restWQ, desiredDir) {
    _dq.setFromUnitVectors(_va, desiredDir)
    _wq.multiplyQuaternions(_dq, restWQ)
    if (bone.parent) {
      bone.parent.getWorldQuaternion(_wqi).invert()
      bone.quaternion.multiplyQuaternions(_wqi, _wq)
    } else {
      bone.quaternion.copy(_wq)
    }
    bone.updateMatrixWorld(true)
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  function resetPose() {
    for (const mn of Object.values(mixamoMap)) {
      const b = boneMap[mn], rq = restLocalQ[mn]
      if (b && rq) b.quaternion.copy(rq)
    }
    const hb = boneMap[mixamoMap['pelvis']]
    if (hb && restHipsLocalY !== null) hb.position.y = restHipsLocalY
    character.updateMatrixWorld(true)
  }

  /**
   * Apply one frame of MDM positions to the rig.
   * @param {number[][]} positions22  Array of 22 [x, y, z] world positions (HumanML3D space).
   */
  function applyFrame(positions22) {
    const pts = positions22.map(([x, y, z]) => new THREE.Vector3(x, y, -z))

    resetPose()

    // ── Pelvis: simple direction-based (spine direction) ──────────────────
    const hipsMn  = mixamoMap['pelvis']
    const spineMn = mixamoMap['spine1']
    const hipsBone = boneMap[hipsMn]
    const hipsRestWQ = restWorldQ[hipsMn]
    if (hipsBone && hipsRestWQ && _getRestDir(spineMn, _va)) {
      _vb.subVectors(pts[3], pts[0])
      if (_vb.length() >= 1e-5 && _va.dot(_vb) > -0.9999) {
        _vb.normalize()
        _clampDir(_va, _vb, THREE.MathUtils.degToRad(58))
        _applyBone(hipsBone, hipsRestWQ, _vb)
      }
    }

    // ── Root Y translation — makes jumps and crouches visible ─────────────
    if (hipsBone && restHipsLocalY !== null && Math.abs(restHipsLocalY) > 1e-3) {
      const HML_REST_Y = 0.94
      const rigUnitsPerMetre = restHipsLocalY / HML_REST_Y
      const dy = THREE.MathUtils.clamp(
        (pts[0].y - HML_REST_Y) * rigUnitsPerMetre,
        -restHipsLocalY * 0.40,
        restHipsLocalY * 0.25
      )
      hipsBone.position.y = restHipsLocalY + dy
      hipsBone.updateMatrixWorld(true)
    }

    // ── Rest of skeleton (depth-first so parents precede children) ────────
    const order = retargetOrder || [...Array(21)].map((_, i) => i + 1)
    for (const p of order) {
      const childJ = HML_PRIMARY_CHILD[p]
      if (childJ === undefined) continue

      const parentMn = mixamoMap[HML_JOINT_NAMES[p]]
      const bone     = parentMn && boneMap[parentMn]
      if (!bone) continue

      const childMn = mixamoMap[HML_JOINT_NAMES[childJ]]
      const restWQ  = restWorldQ[parentMn]
      if (!restWQ || !_getRestDir(childMn, _va)) continue

      _vb.subVectors(pts[childJ], pts[p])
      if (_vb.length() < 1e-5 || _va.dot(_vb) < -0.9999) continue
      _vb.normalize()

      _enforceMinAbduction(p, _vb, pts)
      _clampDir(_va, _vb, _maxSwing(p))
      _applyBone(bone, restWQ, _vb)
    }
  }

  /**
   * Read the FBX rest-pose world positions and convert them into HumanML3D-coordinate
   * positions scaled to match standard HumanML3D proportions (pelvis ≈ 0.94m).
   */
  function _computeRigRestPose() {
    character.updateMatrixWorld(true)
    const wp = new THREE.Vector3()
    const raw = []
    for (let j = 0; j < 22; j++) {
      const mn = mixamoMap[HML_JOINT_NAMES[j]]
      const bone = boneMap[mn]
      if (bone) {
        bone.getWorldPosition(wp)
        raw.push([wp.x, wp.y, wp.z])
      } else {
        raw.push(null)
      }
    }
    if (!raw[0] || !raw[15]) return null

    const pelvis = raw[0]
    const head   = raw[15]
    const rigH = Math.sqrt(
      (head[0] - pelvis[0]) ** 2 +
      (head[1] - pelvis[1]) ** 2 +
      (head[2] - pelvis[2]) ** 2
    )
    const HML_PELVIS_Y = 0.94
    const HML_HEAD_Y   = 1.72
    const hmlH = HML_HEAD_Y - HML_PELVIS_Y
    const s = rigH > 1e-6 ? hmlH / rigH : 1.0

    const pose = []
    for (let j = 0; j < 22; j++) {
      const r = raw[j]
      if (!r) { pose.push([0, HML_PELVIS_Y, 0]); continue }
      const x =  (r[0] - pelvis[0]) * s
      const y =  (r[1] - pelvis[1]) * s + HML_PELVIS_Y
      const z = -(r[2] - pelvis[2]) * s   // Three.js Z → HumanML3D Z: negate
      pose.push([+x.toFixed(4) * 1, +y.toFixed(4) * 1, +z.toFixed(4) * 1])
    }
    console.log('[retarget] Rig rest pose (HumanML3D coords):', JSON.stringify(pose))
    return pose
  }

  function debugDump() {
    character.updateMatrixWorld(true)
    const wp = new THREE.Vector3()
    const info = {}
    for (const [hml, mn] of Object.entries(mixamoMap)) {
      const bone = boneMap[mn]
      if (!bone) { info[hml] = 'MISSING'; continue }
      bone.getWorldPosition(wp)
      info[hml] = { bone: mn, world: [+wp.x.toFixed(4), +wp.y.toFixed(4), +wp.z.toFixed(4)] }
    }
    console.table(info)
    return info
  }

  return { applyFrame, resetPose, boneMap, mixamoMap, debugDump, rigRestPose }
}
