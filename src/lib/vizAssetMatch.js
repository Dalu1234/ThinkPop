/**
 * Map Agent 6 `itemShape` strings (e.g. "oranges", "mini pumpkin") to GLB paths
 * using assetsDatabase tags. Falls back to a small default pool.
 */

function stem(s) {
  let t = String(s || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
  if (t.length > 4 && t.endsWith('s') && !t.endsWith('ss')) t = t.slice(0, -1)
  return t
}

const DEFAULT_IDS = ['model_01', 'model_02', 'model_09', 'model_11', 'model_14']

/** Citrus / orange — no dedicated orange GLB; peach reads as round fruit */
const ORANGE_SHAPE_ALIASES = ['orange', 'orang', 'citrus', 'tangerine', 'mandarin']

/**
 * @param {string | undefined} itemShape
 * @param {Array<{ id: string, path?: string, tags?: string[], name?: string }>} database
 * @returns {string[]} glb paths to load (1–4)
 */
export function resolveGlbPathsForItemShape(itemShape, database) {
  const raw = String(itemShape || '').trim().toLowerCase()
  const list = Array.isArray(database) ? database : []
  const byId = new Map(list.map(a => [a.id, a]))

  if (!raw) {
    return DEFAULT_IDS.map(id => byId.get(id)?.path).filter(Boolean)
  }

  const stemmed = stem(raw)
  const tokens = new Set([raw, stemmed, ...raw.split(/[\s,_-]+/).filter(Boolean)])

  for (const alias of ORANGE_SHAPE_ALIASES) {
    if (tokens.has(alias) || raw.includes(alias)) {
      const peach = byId.get('model_15')
      if (peach?.path) return [peach.path]
    }
  }

  let best = []
  let bestScore = 0
  for (const asset of list) {
    if (!asset?.path?.endsWith('.glb')) continue
    const tags = (asset.tags || []).map(t => String(t).toLowerCase())
    const name = String(asset.name || '').toLowerCase()
    let score = 0
    for (const tok of tokens) {
      if (!tok || tok.length < 2) continue
      if (tags.some(t => t === tok || t.includes(tok) || tok.includes(t))) score += 3
      if (name.includes(tok)) score += 2
    }
    if (score > bestScore) {
      bestScore = score
      best = [asset.path]
    } else if (score === bestScore && score > 0) {
      best.push(asset.path)
    }
  }

  if (bestScore > 0) {
    return [...new Set(best)].slice(0, 4)
  }

  if (tokens.has('apple') || raw.includes('apple')) {
    const a = byId.get('model_01')
    if (a?.path) return [a.path]
  }

  return DEFAULT_IDS.map(id => byId.get(id)?.path).filter(Boolean)
}

/**
 * Default fill color when the agent names a thing but we only have tinted meshes.
 * @param {string | undefined} itemShape
 * @param {string | undefined} itemColor — hex from agent
 */
export function defaultTintForItemShape(itemShape, itemColor) {
  if (typeof itemColor === 'string' && itemColor.startsWith('#') && itemColor.length >= 4) {
    return itemColor
  }
  const raw = String(itemShape || '').toLowerCase()
  if (ORANGE_SHAPE_ALIASES.some(a => raw.includes(a))) return '#ff8c42'
  if (raw.includes('apple')) return '#e84b3c'
  if (raw.includes('pumpkin') || raw.includes('pump')) return '#ff8c00'
  if (raw.includes('peach')) return '#ffb07c'
  return '#00e5ff'
}
