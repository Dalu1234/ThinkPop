/**
 * HTTP handlers for the 3D asset API.
 *
 * Routes (checked in order to avoid generate/:taskId → :id collision):
 *   POST   /api/assets/generate           – start generation
 *   GET    /api/assets/generate/:taskId   – poll task status
 *   GET    /api/assets                    – list (query: category, tag, generated)
 *   GET    /api/assets/:id                – get single asset
 *   DELETE /api/assets/:id                – delete generated asset
 */
import { unlink }       from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { filterAssets, getAssetById, removeAsset } from './assetsDb.mjs'
import { startGeneration, getTask }                from './assetGenerate.mjs'
import { readJsonBody }                            from './lessonHttp.mjs'

const PUBLIC_DIR = fileURLToPath(new URL('../public', import.meta.url))

function corsMeta(origin) {
  return {
    'Access-Control-Allow-Origin':  origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

function json(res, status, body, extra = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...extra })
  res.end(JSON.stringify(body, null, 2))
}

/** @returns {Promise<'handled' | 'skip'>} */
export async function handleAssets(req, res) {
  const url    = new URL(req.url || '/', 'http://localhost')
  const path   = url.pathname
  const qs     = url.searchParams
  const origin = req.headers.origin
  const cors   = corsMeta(origin)

  if (!path.startsWith('/api/assets')) return 'skip'

  // Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors)
    res.end()
    return 'handled'
  }

  // ── POST /api/assets/generate ─────────────────────────────
  if (path === '/api/assets/generate') {
    if (req.method !== 'POST') {
      json(res, 405, { error: 'Use POST to start generation' }, cors)
      return 'handled'
    }
    let body
    try { body = await readJsonBody(req) } catch {
      json(res, 400, { error: 'Invalid JSON body' }, cors)
      return 'handled'
    }
    try {
      const task = await startGeneration(body)
      json(res, 202, task, cors)
    } catch (e) {
      json(res, 422, { error: e.message }, cors)
    }
    return 'handled'
  }

  // ── GET /api/assets/generate/:taskId ──────────────────────
  // Must be checked BEFORE the generic /:id route
  const pollMatch = path.match(/^\/api\/assets\/generate\/([^/]+)$/)
  if (pollMatch) {
    if (req.method !== 'GET') {
      json(res, 405, { error: 'Use GET to poll task status' }, cors)
      return 'handled'
    }
    const task = getTask(pollMatch[1])
    if (!task) { json(res, 404, { error: 'Task not found' }, cors); return 'handled' }
    json(res, task.status === 'error' ? 500 : 200, task, cors)
    return 'handled'
  }

  // ── GET /api/assets ───────────────────────────────────────
  if (path === '/api/assets') {
    if (req.method !== 'GET') {
      json(res, 405, { error: 'Use GET to list assets' }, cors)
      return 'handled'
    }
    const category  = qs.get('category') || undefined
    const tag       = qs.get('tag')      || undefined
    const genParam  = qs.get('generated')
    const generated = genParam === 'true' ? true : genParam === 'false' ? false : undefined
    const assets    = await filterAssets({ category, tag, generated })
    json(res, 200, assets, cors)
    return 'handled'
  }

  // ── /api/assets/:id  (GET or DELETE) ─────────────────────
  const idMatch = path.match(/^\/api\/assets\/([^/]+)$/)
  if (idMatch) {
    const id = idMatch[1]

    if (req.method === 'GET') {
      const asset = await getAssetById(id)
      if (!asset) { json(res, 404, { error: 'Asset not found' }, cors); return 'handled' }
      json(res, 200, asset, cors)
      return 'handled'
    }

    if (req.method === 'DELETE') {
      const asset = await getAssetById(id)
      if (!asset) { json(res, 404, { error: 'Asset not found' }, cors); return 'handled' }
      if (!asset.generated) {
        json(res, 403, { error: 'Static assets cannot be deleted via the API' }, cors)
        return 'handled'
      }
      await removeAsset(id)
      // Best-effort file deletion (path is /models/generated/...)
      try {
        await unlink(`${PUBLIC_DIR}${asset.path}`)
      } catch { /* file may already be gone */ }
      json(res, 200, { deleted: id }, cors)
      return 'handled'
    }

    json(res, 405, { error: 'Use GET or DELETE on /api/assets/:id' }, cors)
    return 'handled'
  }

  return 'skip'
}
