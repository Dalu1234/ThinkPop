/**
 * Pick exactly one GLB for a visualization (rotates through the full catalog when
 * itemShape is missing or unmatched) and derive a spoken plural phrase that matches
 * what appears on screen.
 */
import assetsDatabase from '../data/assetsDatabase.json'
import { resolveGlbPathsForItemShape } from './vizAssetMatch.js'

function assetVariantOf(viz) {
  const v = viz?.assetVariant
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

/** All .glb paths in order (stable for hashing). */
function allGlbPaths(database) {
  const list = Array.isArray(database) ? database : []
  return list.map(a => a.path).filter(p => typeof p === 'string' && p.endsWith('.glb'))
}

/**
 * One path to load — uses itemShape match when possible, otherwise cycles the full catalog.
 * @param {object | null | undefined} viz
 * @param {Array} [database]
 * @returns {string[]}
 */
export function getVisualizationAssetPaths(viz, database = assetsDatabase) {
  const variant = assetVariantOf(viz)
  const raw = String(viz?.itemShape || '').trim()
  const all = allGlbPaths(database)
  if (!all.length) return []

  if (!raw) {
    return [all[variant % all.length]]
  }

  const ranked = resolveGlbPathsForItemShape(raw, database)
  if (ranked.length === 0) {
    return [all[variant % all.length]]
  }
  if (ranked.length === 1) return [ranked[0]]
  return [ranked[variant % ranked.length]]
}

function pluralizeEnglishWord(w) {
  if (!w) return 'things'
  const lower = w.toLowerCase()
  if (['fish', 'deer', 'sheep', 'moose'].includes(lower)) return lower
  if (lower.endsWith('s') && lower.length > 2) return lower
  if (/(s|x|z|ch|sh)$/.test(lower)) return `${lower}es`
  if (lower.endsWith('y') && !/[aeiou]y$/.test(lower)) return `${lower.slice(0, -1)}ies`
  return `${lower}s`
}

/** Turn catalog display name into a natural plural for speech (e.g. "Mini pumpkin" → "mini pumpkins"). */
export function speechPhraseFromAssetName(name, fallbackShape) {
  let s = String(name || '').trim()
  if (!s) return pluralizeItemShape(fallbackShape)
  const paren = s.indexOf('(')
  if (paren >= 0) s = s.slice(0, paren).trim()
  s = s.replace(/^fnaf\s+/i, '').replace(/\s+fnaf\s+/gi, ' ').trim()
  const words = s.split(/\s+/).filter(Boolean)
  if (!words.length) return pluralizeItemShape(fallbackShape)
  const lower = words.map(w => w.toLowerCase())
  const last = lower[lower.length - 1]
  if (last.endsWith('s') && last.length > 2) {
    return lower.join(' ')
  }
  const pluralLast = pluralizeEnglishWord(last)
  return [...lower.slice(0, -1), pluralLast].join(' ')
}

function pluralizeItemShape(shape) {
  if (!shape) return 'objects'
  const s = shape.trim().toLowerCase()
  if (s.endsWith('s')) return s
  if (/(sh|ch|x|z)$/.test(s)) return `${s}es`
  return `${s}s`
}

/**
 * Phrase for TTS / chat that matches the GLB chosen by getVisualizationAssetPaths.
 */
export function getVizSpeechLabel(viz, database = assetsDatabase) {
  const paths = getVisualizationAssetPaths(viz, database)
  const path = paths[0]
  if (!path) return pluralizeItemShape(viz?.itemShape)
  const list = Array.isArray(database) ? database : []
  const asset = list.find(a => a.path === path)
  return speechPhraseFromAssetName(asset?.name, viz?.itemShape)
}

/** Attach speechLabel so narration and the 3D scene describe the same object. */
export function enrichVisualizationForClient(viz, database = assetsDatabase) {
  if (!viz) return null
  const speechLabel = getVizSpeechLabel(viz, database)
  return { ...viz, speechLabel }
}
