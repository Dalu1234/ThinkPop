/**
 * Assets database — read/write src/data/assetsDatabase.json
 *
 * All writes are serialised through a promise queue so concurrent
 * task completions don't overwrite each other.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const DB_PATH       = fileURLToPath(new URL('../src/data/assetsDatabase.json', import.meta.url))
export const GEN_DIR = fileURLToPath(new URL('../public/models/generated',     import.meta.url))
export const GEN_URL = '/models/generated'

// Create generated-models directory once at import time (no-op if already exists)
await mkdir(GEN_DIR, { recursive: true })

// ── Serialised write queue ────────────────────────────────────
let _queue = Promise.resolve()
function withDbLock(fn) {
  return new Promise((resolve, reject) => {
    _queue = _queue.then(() => fn().then(resolve, reject))
  })
}

// ── Low-level I/O ─────────────────────────────────────────────
export async function readDb() {
  const raw = await readFile(DB_PATH, 'utf8')
  return JSON.parse(raw)
}

async function _writeDb(assets) {
  await writeFile(DB_PATH, JSON.stringify(assets, null, 2) + '\n', 'utf8')
}

// ── Public CRUD ───────────────────────────────────────────────
export function generateId() {
  return `gen_${randomUUID()}`
}

export async function addAsset(entry) {
  return withDbLock(async () => {
    const assets = await readDb()
    assets.push(entry)
    await _writeDb(assets)
    return entry
  })
}

export async function removeAsset(id) {
  return withDbLock(async () => {
    const assets = await readDb()
    const idx = assets.findIndex(a => a.id === id)
    if (idx === -1) return null
    const [removed] = assets.splice(idx, 1)
    await _writeDb(assets)
    return removed
  })
}

export async function getAssetById(id) {
  const assets = await readDb()
  return assets.find(a => a.id === id) ?? null
}

export async function filterAssets({ category, tag, generated } = {}) {
  const assets = await readDb()
  return assets.filter(a => {
    if (category  && a.category?.toLowerCase() !== category.toLowerCase())          return false
    if (tag       && !a.tags?.some(t => t.toLowerCase().includes(tag.toLowerCase()))) return false
    if (generated === true  && !a.generated) return false
    if (generated === false &&  a.generated) return false
    return true
  })
}
