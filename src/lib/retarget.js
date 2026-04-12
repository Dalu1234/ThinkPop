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
  const restLocalQ   = {}   // local quat at rest per bone
  const restWorldQ   = {}   // world quat at rest per bone
  const restBoneDir  = {}   // world direction parent→bone at rest
  let   restHipsLocalY = null  // local Y of hips bone at rest (for root translation)

  // Scratch (reused every frame — avoids GC pressure)
  const _wq  = new THREE.Quaternion()
  const _wqi = new THREE.Quaternion()
  const _va  = new THREE.Vector3()
  const _vb  = new THREE.Vector3()
  const _vc  = new THREE.Vector3()
  const _dq  = new THREE.Quaternion()

  let retargetOrder = null

  // ── Boot ────────────────────────────────────────────────────────────────────
  _collectBones()
  _detectPrefix()
  _captureRestLocalQ()
  _captureRestWorldQ()
  _buildOrder()

  // ── Private ─────────────────────────────────────────────────────────────────
  function _collectBones() {
    // Pass 1 — skeleton.bones are what the SkinnedMesh renderer actually reads.
    // These MUST win; collect them first so pass 2 cannot overwrite them.
    character.traverse(child => {
      if (child.isSkinnedMesh) {
        child.frustumCulled = false
        child.skeleton?.bones.forEach(b => { boneMap[b.name] = b })
      }
    })
    // Pass 2 — isBone nodes (may be clone nodes when fbx.clone(true) is used).
    // Only add if not already present — skeleton.bones take priority.
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
    // Capture hips rest local Y so we can translate root for jumps/crouches
    const hb = boneMap[mixamoMap['pelvis']]
    if (hb) restHipsLocalY = hb.position.y
  }

  function _captureRestWorldQ() {
    character.updateMatrixWorld(true)
    const wp = new THREE.Vector3(), wc = new THREE.Vector3()
    for (const mn of Object.values(mixamoMap)) {
      const bone = boneMap[mn]
      if (!bone) continue
      restWorldQ[mn] = new THREE.Quaternion()
      bone.getWorldQuaternion(restWorldQ[mn])
      if (bone.parent) {
        bone.parent.getWorldPosition(wp)
        bone.getWorldPosition(wc)
        const dir = wc.clone().sub(wp)
        restBoneDir[mn] = dir.length() > 1e-5 ? dir.normalize() : new THREE.Vector3(0, 1, 0)
      } else {
        restBoneDir[mn] = new THREE.Vector3(0, 1, 0)
      }
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

  function _maxSwing(p) {
    // Spine chain — moderate limits to avoid pretzel torso
    if (p === 3 || p === 6 || p === 9) return THREE.MathUtils.degToRad(45)
    // Neck
    if (p === 12) return THREE.MathUtils.degToRad(40)
    // Collars (shoulders) — prevent arms swinging through torso
    if (p === 13 || p === 14) return THREE.MathUtils.degToRad(60)
    // Upper arms
    if (p === 16 || p === 17) return THREE.MathUtils.degToRad(80)
    // Elbows — natural hinge, shouldn't hyperextend
    if (p === 18 || p === 19) return THREE.MathUtils.degToRad(90)
    // Wrists
    if (p === 20 || p === 21) return THREE.MathUtils.degToRad(60)
    // Hips
    if (p === 1 || p === 2) return THREE.MathUtils.degToRad(70)
    // Knees
    if (p === 4 || p === 5) return THREE.MathUtils.degToRad(90)
    // Ankles/feet
    if (p >= 7 && p <= 11) return THREE.MathUtils.degToRad(45)
    return THREE.MathUtils.degToRad(90)
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

  function _applyBone(bone, restWQ, desiredDir) {
    _dq.setFromUnitVectors(_va, desiredDir)   // _va = rest dir (set by caller)
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

    // ── Pelvis: full 3-axis basis (recovers yaw) ─────────────────────────────
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

    // ── Root Y translation — makes jumps and crouches visible ────────────────
    // Scale the HumanML3D pelvis delta into the rig's own local units by using
    // the rest hip height as the reference. This is unit-agnostic: it works
    // whether the FBX skeleton is in cm, m, or any other scale.
    // Guard: only apply if rest height is meaningful (non-zero rig).
    if (hipsBone && restHipsLocalY !== null && Math.abs(restHipsLocalY) > 1e-3) {
      const HML_REST_Y = 0.94
      const rigUnitsPerMetre = restHipsLocalY / HML_REST_Y
      const dy = THREE.MathUtils.clamp(
        (pts[0].y - HML_REST_Y) * rigUnitsPerMetre,
        -restHipsLocalY * 0.40,  // max crouch: 40 % of rest height
        restHipsLocalY * 0.25    // max jump:   25 % of rest height
      )
      hipsBone.position.y = restHipsLocalY + dy
      hipsBone.updateMatrixWorld(true)
    }

    // ── Rest of skeleton (depth-first so parents precede children) ───────────
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
      _clampDir(_va, _vb, _maxSwing(p))
      _applyBone(bone, restWQ, _vb)
    }
  }

  return { applyFrame, resetPose, boneMap, mixamoMap }
}
