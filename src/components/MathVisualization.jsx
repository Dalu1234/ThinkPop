import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { getVisualizationAssetPaths } from '../lib/vizVisualItem'
import { runTool } from '../lib/vizTools'
import { TOKEN_FOOTPRINT, createSphere, applyTintToObject } from '../lib/vizTools/helpers'

const _scratchVec = new THREE.Vector3()
const _scratchColor = new THREE.Color()

/**
 * Anchor — positions the center of the boundary box in world space.
 * Kept far enough left so BOUNDS_W / 2 to the right still clears the character.
 */
const VIZ_ANCHOR = [-1.05, 0.22, 0.08]

function elasticOut(t) {
  if (t <= 0) return 0
  if (t >= 1) return 1
  const c4 = (2 * Math.PI) / 3
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1
}

function MathVisualization({ visualization, stepIndex }) {
  const rootRef = useRef()
  const vizObjectsRef = useRef([])
  const vizStateRef = useRef({
    key: null,
    viz: null,
    stage: 0,
    stageChangedAt: 0,
    autoTimes: [],
    maxStages: 1,
    lastExternalStep: 0,
    pendingViz: null,
    pendingAt: 0,
    assetIndex: 0,
  })
  const assetPaths = useMemo(
    () => getVisualizationAssetPaths(visualization),
    [visualization]
  )
  const [assetTemplates, setAssetTemplates] = useState([])

  useEffect(() => {
    let cancelled = false
    const loader = new GLTFLoader()

    async function loadAssets() {
      try {
        const gltfs = await Promise.all(assetPaths.map(path => loader.loadAsync(path)))
        if (cancelled) return
        const templates = gltfs.map((gltf, index) => {
          const scene = gltf?.scene ? clone(gltf.scene) : new THREE.Group()
          const box = new THREE.Box3().setFromObject(scene)
          const size = new THREE.Vector3()
          const center = new THREE.Vector3()
          box.getSize(size)
          box.getCenter(center)
          const maxDimension = Math.max(size.x || 0, size.y || 0, size.z || 0, 1)
          const targetSize = TOKEN_FOOTPRINT
          const scale = targetSize / maxDimension
          scene.scale.setScalar(scale)
          scene.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale)
          scene.updateMatrixWorld(true)
          return {
            id: assetPaths[index] || `asset-${index}`,
            scene,
            footprint: Math.max((size.x || 0) * scale, (size.z || 0) * scale, TOKEN_FOOTPRINT),
          }
        })
        setAssetTemplates(templates)
      } catch (error) {
        console.warn('[MathVisualization] Counting assets failed to load, using fallback shapes.', error)
        if (!cancelled) setAssetTemplates([])
      }
    }

    loadAssets()
    return () => { cancelled = true }
  }, [assetPaths])

  function chooseAssetIndex() {
    return 0
  }

  function createAssetToken(color) {
    if (!assetTemplates.length) {
      const group = new THREE.Group()
      const token = createSphere(color)
      token.position.y = 0.14
      group.add(token)
      return { mesh: group, materials: [token.material], footprint: 0.3 }
    }
    const template = assetTemplates[vizStateRef.current.assetIndex % assetTemplates.length]
    const asset = clone(template.scene)
    const materials = applyTintToObject(asset, color)
    const group = new THREE.Group()
    asset.position.y = 0.045
    group.add(asset)
    return { mesh: group, materials: [...materials], footprint: Math.max(template.footprint || TOKEN_FOOTPRINT, 0.3) }
  }

  function addObject(object) {
    if (!rootRef.current) return
    const keys = Object.keys(object.stagePositions || { 0: 0 })
    object._maxStageKey = Math.max(...keys.map(Number))
    rootRef.current.add(object.mesh)
    vizObjectsRef.current.push(object)
  }

  function clearVisualization() {
    const now = performance.now() / 1000
    vizObjectsRef.current.forEach(obj => {
      obj.clearing = true
      obj.clearStartedAt = now
    })
    vizStateRef.current.viz = null
    vizStateRef.current.stage = 0
  }

  function spawnVisualization(viz) {
    if (!rootRef.current || !viz?.type) return
    const now = performance.now() / 1000
    vizStateRef.current.assetIndex = chooseAssetIndex()

    const toolContext = { now, createAssetToken }
    const result = runTool(viz.type, viz, toolContext)
    if (!result) return

    for (const obj of result.objects) {
      addObject(obj)
    }

    vizStateRef.current.viz = viz
    vizStateRef.current.stage = 0
    vizStateRef.current.stageChangedAt = now
    vizStateRef.current.autoTimes = result.autoTimes
    vizStateRef.current.maxStages = result.maxStages
    vizStateRef.current.lastExternalStep = stepIndex
  }

  useEffect(() => {
    const key = visualization ? JSON.stringify(visualization) : null
    if (vizStateRef.current.key === key) return
    vizStateRef.current.key = key

    if (!visualization) {
      clearVisualization()
      return
    }

    if (vizObjectsRef.current.length) {
      clearVisualization()
      vizStateRef.current.pendingViz = visualization
      vizStateRef.current.pendingAt = performance.now() / 1000 + 0.32
    } else {
      spawnVisualization(visualization)
    }
  }, [visualization, stepIndex])

  useFrame(() => {
    const now = performance.now() / 1000
    const vizState = vizStateRef.current

    if (vizState.pendingViz && now >= vizState.pendingAt && vizObjectsRef.current.length === 0) {
      const pending = vizState.pendingViz
      vizState.pendingViz = null
      spawnVisualization(pending)
    }

    if (vizState.viz?.steps && stepIndex !== vizState.lastExternalStep) {
      vizState.lastExternalStep = stepIndex
      vizState.stage = Math.min(stepIndex, vizState.maxStages - 1)
      vizState.stageChangedAt = now
    } else if (vizState.viz && !vizState.viz.steps) {
      const nextStage = vizState.stage + 1
      if (nextStage < vizState.maxStages) {
        const wait = (vizState.autoTimes[nextStage] || 0) - (vizState.autoTimes[vizState.stage] || 0)
        if (now - vizState.stageChangedAt >= wait) {
          vizState.stage = nextStage
          vizState.stageChangedAt = now
        }
      }
    }

    const stageProgress = Math.min(1, Math.max(0, (now - vizState.stageChangedAt) / 0.35))
    const survivors = []

    for (const obj of vizObjectsRef.current) {
      const { mesh } = obj
      const materials = obj.materials || (mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [])

      if (obj.clearing) {
        const t = Math.min(1, (now - obj.clearStartedAt) / 0.3)
        const s = Math.max(0.0001, 1 - t)
        mesh.scale.setScalar(s)
        materials.forEach(material => {
          if (material && 'opacity' in material) material.opacity = 1 - t
        })
        if (t >= 1) {
          rootRef.current?.remove(mesh)
          mesh.traverse(child => {
            if (child.geometry) child.geometry.dispose()
            const mats = child.material
              ? (Array.isArray(child.material) ? child.material : [child.material])
              : []
            mats.forEach(m => {
              m?.map?.dispose?.()
              m?.dispose?.()
            })
          })
          continue
        }
        survivors.push(obj)
        continue
      }

      const visibleFromStage = obj.visibleFromStage ?? 0
      const visibleUntilStage = obj.visibleUntilStage ?? Infinity
      const stageVisible = vizState.stage >= visibleFromStage && vizState.stage <= visibleUntilStage
      const spawnT = Math.min(1, Math.max(0, (now - (obj.appearAt ?? 0)) / 0.5))
      const baseScale = stageVisible ? elasticOut(spawnT) * (obj.targetScale || 1) : 0.0001
      mesh.scale.setScalar(baseScale)
      materials.forEach(material => {
        if (material && 'opacity' in material) material.opacity = stageVisible ? 1 : 0
      })

      const currentStagePos =
        obj.stagePositions?.[vizState.stage] ||
        obj.stagePositions?.[obj._maxStageKey ?? 0] ||
        obj.basePosition
      const prevStagePos = obj.stagePositions?.[Math.max(0, vizState.stage - 1)] || currentStagePos
      const pos = _scratchVec.copy(prevStagePos).lerp(currentStagePos, stageProgress)

      if (obj.role === 'removed' && vizState.stage >= 2 && obj.explodeVector) {
        const explodeT = Math.min(1, (now - vizState.stageChangedAt) / 0.45)
        pos.addScaledVector(obj.explodeVector, explodeT)
        mesh.scale.setScalar(Math.max(0.0001, 1 - explodeT))
        materials.forEach(material => {
          if (material && 'opacity' in material) material.opacity = 1 - explodeT
        })
      }

      if (obj.role === 'removed' && vizState.stage === 1) {
        pos.x += Math.sin(now * 38 + obj.bobPhase) * 0.03
      }

      mesh.position.set(pos.x, pos.y, pos.z)

      const targetColor = obj.colors?.[vizState.stage]
      if (targetColor) {
        _scratchColor.set(targetColor)
        materials.forEach(material => {
          if (material?.color) material.color.lerp(_scratchColor, 0.16)
          if (material?.emissive) material.emissive.lerp(_scratchColor, 0.16)
        })
      }
      if ((obj.role === 'token' || obj.role === 'cube' || obj.role === 'remaining' || obj.role === 'remainder') && vizState.stage === vizState.maxStages - 1) {
        const pulse = 1 + Math.sin(now * 5 + obj.bobPhase) * 0.08
        mesh.scale.setScalar(baseScale * pulse)
      }

      survivors.push(obj)
    }

    vizObjectsRef.current = survivors
  })

  return (
    <group position={VIZ_ANCHOR}>
      <group ref={rootRef} />
    </group>
  )
}

export default MathVisualization
