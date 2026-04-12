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

export function createRetargeter(character) {
  const mixamoMap    = { ...DEFAULT_MIXAMO_MAP }
  const boneMap      = {}
  const restLocalQ   = {}
  const restWorldQ   = {}
  const restBoneDir  = {}
  let   restHipsLocalY = null

  const _wq  = new THREE.Quaternion()
  const _wqi = new THREE.Quaternion()
  const _va  = new THREE.Vector3()
  const _vb  = new THREE.Vector3()
  const _vc  = new THREE.Vector3()
  const _vd  = new THREE.Vector3()
  const _ve  = new THREE.Vector3()
  const _dq  = new THREE.Quaternion()

  // Twist bone distribution scratch
  const _dtQ1 = new THREE.Quaternion()
  const _dtQ2 = new THREE.Quaternion()
  const _dtV1 = new THREE.Vector3()

  let retargetOrder = null
  let rigRestPose = null
  let _prevPts = null

  // Per-joint EMA smoothing
  const JOINT_SMOOTH = new Float32Array(22).fill(0.3)
  JOINT_SMOOTH[13] = 0.25; JOINT_SMOOTH[14] = 0.25
  JOINT_SMOOTH[16] = 0.25; JOINT_SMOOTH[17] = 0.25
  JOINT_SMOOTH[18] = 0.30; JOINT_SMOOTH[19] = 0.30
  JOINT_SMOOTH[20] = 0.35; JOINT_SMOOTH[21] = 0.35

  // ── Boot ──────────────────────────────────────────────────────────────────
  _collectBones()
  _detectPrefix()
  _captureRestLocalQ()
  _captureRestWorldQ()
  _buildOrder()
  rigRestPose = _computeRigRestPose()

  // ── Private ───────────────────────────────────────────────────────────────
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
    if (boneMap['mixamorig:Hips']) return
    const hip = Object.keys(boneMap).find(n => n.toLowerCase().includes('hip'))
    if (!hip) { console.warn('[retarget] No Hips bone found'); return }
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
    character.traverse(child => {
      if (child.isBone) child._restLocalQuat = child.quaternion.clone()
    })
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
      restBoneDir[mn] = new THREE.Vector3(0, 1, 0)
    }

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

    const neckBone = boneMap[mixamoMap.neck]
    const headBone = boneMap[mixamoMap.head]
    if (neckBone && headBone) {
      neckBone.getWorldPosition(wp)
      headBone.getWorldPosition(wc)
      const d = wc.clone().sub(wp)
      if (d.length() > 1e-5) restBoneDir[mixamoMap.head] = d.normalize()
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
    if (p === 3) return THREE.MathUtils.degToRad(25)
    if (p === 6) return THREE.MathUtils.degToRad(30)
    if (p === 9) return THREE.MathUtils.degToRad(35)
    if (p === 12) return THREE.MathUtils.degToRad(18)
    if (p === 13 || p === 14) return THREE.MathUtils.degToRad(40)
    return Math.PI
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

  function _decomposeTwist(q, restQ, twistAxis) {
    _dtQ1.copy(restQ).invert()
    _dtQ2.copy(q).multiply(_dtQ1)
    const dot = _dtQ2.x * twistAxis.x + _dtQ2.y * twistAxis.y + _dtQ2.z * twistAxis.z
    _dtQ1.set(twistAxis.x * dot, twistAxis.y * dot, twistAxis.z * dot, _dtQ2.w)
    const len = Math.sqrt(_dtQ1.x**2 + _dtQ1.y**2 + _dtQ1.z**2 + _dtQ1.w**2)
    if (len < 1e-8) return _dtQ1.identity()
    _dtQ1.x /= len; _dtQ1.y /= len; _dtQ1.z /= len; _dtQ1.w /= len
    return _dtQ1
  }

  function _distributeTwistBones() {
    const mappedNames = new Set(Object.values(mixamoMap))
    for (const [pIdxStr, cIdx] of Object.entries(HML_PRIMARY_CHILD)) {
      const pIdx = Number(pIdxStr)
      const pMn = mixamoMap[HML_JOINT_NAMES[pIdx]]
      const cMn = mixamoMap[HML_JOINT_NAMES[cIdx]]
      const pBone = pMn && boneMap[pMn]
      const cBone = cMn && boneMap[cMn]
      if (!pBone || !cBone) continue
      const intermediates = []
      let cur = cBone.parent
      while (cur && cur !== pBone && cur.isBone) {
        if (!mappedNames.has(cur.name)) intermediates.unshift(cur)
        cur = cur.parent
        if (intermediates.length > 8) break
      }
      if (intermediates.length === 0) continue
      const restQ = restLocalQ[pMn]
      if (!restQ) continue
      _dtV1.set(0, 1, 0)
      const twistQ = _decomposeTwist(pBone.quaternion, restQ, _dtV1)
      const n = intermediates.length
      for (let i = 0; i < n; i++) {
        const t = (i + 1) / (n + 1)
        const bone = intermediates[i]
        const boneRestQ = bone._restLocalQuat
        if (!boneRestQ) continue
        _dtQ2.identity().slerp(twistQ, t)
        bone.quaternion.copy(boneRestQ).multiply(_dtQ2)
      }
    }
    character.updateMatrixWorld(true)
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  function resetPose() {
    character.traverse(child => {
      if (child.isBone && child._restLocalQuat) {
        child.quaternion.copy(child._restLocalQuat)
      }
    })
    const hb = boneMap[mixamoMap['pelvis']]
    if (hb && restHipsLocalY !== null) hb.position.y = restHipsLocalY
    character.updateMatrixWorld(true)
  }

  /**
   * Apply one frame of MDM positions to the rig.
   *
   * [1] Root translation is DELTA-based: only the Y offset from HML rest pelvis
   *     height (0.94 m) is converted to rig-local units. X/Z root drift is
   *     intentionally ignored so the character doesn't slide around the scene.
   * [4] Head (p=12) IS driven — neck→head direction controls head nod/tilt.
   * [5] Pelvis slerp damping removed — full MDM pelvis orientation is applied.
   */
  function applyFrame(positions22) {
    const pts = positions22.map(([x, y, z]) => new THREE.Vector3(x, y, z))

    // Per-joint temporal smoothing
    if (_prevPts && _prevPts.length === pts.length) {
      for (let i = 0; i < pts.length; i++) {
        pts[i].lerp(_prevPts[i], JOINT_SMOOTH[i])
      }
    }
    _prevPts = pts.map(p => p.clone())

    resetPose()

    // ── Pelvis orientation (spine direction) ──────────────────────────────
    const hipsMn  = mixamoMap['pelvis']
    const spineMn = mixamoMap['spine1']
    const hipsBone = boneMap[hipsMn]
    const hipsRestWQ = restWorldQ[hipsMn]
    if (hipsBone && hipsRestWQ && _getRestDir(spineMn, _va)) {
      _vb.subVectors(pts[3], pts[0])
      if (_vb.length() >= 1e-5) {
        _vb.normalize()
        if (_va.dot(_vb) < -0.9999) { _vb.x += 1e-4; _vb.normalize() }
        _clampDir(_va, _vb, THREE.MathUtils.degToRad(58))
        // [5] No slerp damping — apply full MDM pelvis orientation
        _applyBone(hipsBone, hipsRestWQ, _vb)
      }
    }

    // ── [1] Root Y translation (delta-based, rig-unit scaled) ─────────────
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

    // ── Skeleton (depth order) ────────────────────────────────────────────
    const order = retargetOrder || [...Array(21)].map((_, i) => i + 1)
    for (const p of order) {
      // [4] p=12 (neck) is NO LONGER skipped — head nod/tilt is driven
      if (p === 7 || p === 8) continue  // feet: MDM toe data too noisy
      const childJ = HML_PRIMARY_CHILD[p]
      if (childJ === undefined) continue

      const parentMn = mixamoMap[HML_JOINT_NAMES[p]]
      const bone     = parentMn && boneMap[parentMn]
      if (!bone) continue

      const childMn = mixamoMap[HML_JOINT_NAMES[childJ]]
      const restWQ  = restWorldQ[parentMn]
      if (!restWQ || !_getRestDir(childMn, _va)) continue

      _vb.subVectors(pts[childJ], pts[p])
      if (_vb.length() < 1e-5) continue
      _vb.normalize()

      _enforceMinAbduction(p, _vb, pts)


      if (_va.dot(_vb) < -0.9999) {
        _vb.x += 1e-4
        _vb.normalize()
      }

      _clampDir(_va, _vb, _maxSwing(p))
      _applyBone(bone, restWQ, _vb)
    }

    _distributeTwistBones()

    // Tilt head forward so the face points toward the camera.
    // This is a post-retarget correction applied directly to the neck bone's
    // local quaternion — it works regardless of what the MDM data says.
    const neckBone = boneMap[mixamoMap['neck']]
    if (neckBone) {
      _dq.setFromAxisAngle(_va.set(1, 0, 0), THREE.MathUtils.degToRad(15))
      neckBone.quaternion.multiply(_dq)
      neckBone.updateMatrixWorld(true)
    }
  }

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
      const z =  (r[2] - pelvis[2]) * s
      pose.push([+x.toFixed(4) * 1, +y.toFixed(4) * 1, +z.toFixed(4) * 1])
    }

    _relaxArmsToAPose(pose)
    console.log('[retarget] Rig rest pose (A-pose):', JSON.stringify(pose))
    return pose
  }

  function _relaxArmsToAPose(pose) {
    const RELAX_RAD = 45 * (Math.PI / 180)
    _rotateArmChainXY(pose, 13, [16, 18, 20], -RELAX_RAD)
    _rotateArmChainXY(pose, 14, [17, 19, 21], RELAX_RAD)
  }

  function _rotateArmChainXY(pose, pivotIdx, jointIndices, angle) {
    const px = pose[pivotIdx][0], py = pose[pivotIdx][1]
    const cosA = Math.cos(angle), sinA = Math.sin(angle)
    for (const j of jointIndices) {
      const dx = pose[j][0] - px, dy = pose[j][1] - py
      pose[j][0] = +(px + dx * cosA - dy * sinA).toFixed(4) * 1
      pose[j][1] = +(py + dx * sinA + dy * cosA).toFixed(4) * 1
    }
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
