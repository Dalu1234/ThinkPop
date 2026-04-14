/**
 * Asset generation — Meshy AI (if MESHY_API_KEY set) or procedural GLB fallback.
 *
 * POST /api/assets/generate  →  startGeneration()  →  { taskId, status }
 * GET  /api/assets/generate/:taskId  →  getTask()   →  task object
 *
 * Tasks live in memory; they are pruned after 24 h to prevent unbounded growth.
 * If the server restarts mid-generation, in-flight Meshy tasks are lost (dev tool).
 */
import { writeFile } from 'node:fs/promises'
import { join }      from 'node:path'
import { generateId, addAsset, readDb, GEN_DIR, GEN_URL } from './assetsDb.mjs'

// ── In-memory task store ──────────────────────────────────────
const tasks       = new Map()
const TASK_TTL_MS = 24 * 60 * 60 * 1000   // prune after 24 hours

function pruneOldTasks() {
  const cutoff = Date.now() - TASK_TTL_MS
  for (const [id, t] of tasks) {
    if (t.createdAt < cutoff) tasks.delete(id)
  }
}

export function getTask(taskId) {
  return tasks.get(taskId) ?? null
}

// ── Colour helpers ────────────────────────────────────────────
function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

/** Parses #rgb, #rrggbb, rrggbb → [r,g,b,a] in linear space. */
function parseColor(hex) {
  if (!hex || typeof hex !== 'string') return [1, 1, 1, 1]
  const h = hex.replace('#', '').trim()
  let r, g, b
  if (h.length === 3) {
    r = parseInt(h[0] + h[0], 16) / 255
    g = parseInt(h[1] + h[1], 16) / 255
    b = parseInt(h[2] + h[2], 16) / 255
  } else if (h.length === 6) {
    r = parseInt(h.slice(0, 2), 16) / 255
    g = parseInt(h.slice(2, 4), 16) / 255
    b = parseInt(h.slice(4, 6), 16) / 255
  } else {
    return [1, 1, 1, 1]
  }
  if (isNaN(r) || isNaN(g) || isNaN(b)) return [1, 1, 1, 1]
  return [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b), 1.0]
}

// ── Procedural GLB builders ───────────────────────────────────
/**
 * Assembles a binary GLB 2.0 buffer from typed-array geometry data.
 * Handles 4-byte chunk padding (JSON → 0x20, BIN → 0x00).
 */
function buildGlb(colorHex, positions, normals, indices, vertCount, idxCount, minXYZ, maxXYZ) {
  const [r, g, b, a] = parseColor(colorHex)

  // ── Binary chunk ───────────────────────────────────────────
  const posBufLen = vertCount * 3 * 4                      // Float32 positions
  const nrmBufLen = vertCount * 3 * 4                      // Float32 normals
  const idxRaw    = idxCount * 2                           // Uint16 indices
  const idxBufLen = idxRaw + ((4 - (idxRaw % 4)) % 4)     // pad to 4 bytes

  const binPayload = Buffer.alloc(posBufLen + nrmBufLen + idxBufLen)
  Buffer.from(positions.buffer, positions.byteOffset, positions.byteLength).copy(binPayload, 0)
  Buffer.from(normals.buffer,   normals.byteOffset,   normals.byteLength  ).copy(binPayload, posBufLen)
  Buffer.from(indices.buffer,   indices.byteOffset,   indices.byteLength  ).copy(binPayload, posBufLen + nrmBufLen)
  // remaining bytes are already 0-padded by Buffer.alloc

  // ── JSON chunk ─────────────────────────────────────────────
  const jsonObj = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes:  [{ mesh: 0 }],
    meshes: [{
      primitives: [{
        attributes: { POSITION: 0, NORMAL: 1 },
        indices: 2,
        material: 0,
        mode: 4,        // TRIANGLES
      }],
    }],
    materials: [{
      pbrMetallicRoughness: {
        baseColorFactor:  [r, g, b, a],
        metallicFactor:   0.1,
        roughnessFactor:  0.65,
      },
      doubleSided: false,
    }],
    accessors: [
      {
        bufferView: 0, componentType: 5126 /* FLOAT */,          count: vertCount, type: 'VEC3',
        min: minXYZ, max: maxXYZ,
      },
      {
        bufferView: 1, componentType: 5126 /* FLOAT */,          count: vertCount, type: 'VEC3',
      },
      {
        bufferView: 2, componentType: 5123 /* UNSIGNED_SHORT */, count: idxCount,  type: 'SCALAR',
      },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0,                          byteLength: posBufLen, target: 34962 /* ARRAY_BUFFER */ },
      { buffer: 0, byteOffset: posBufLen,                  byteLength: nrmBufLen, target: 34962 },
      { buffer: 0, byteOffset: posBufLen + nrmBufLen,      byteLength: idxBufLen, target: 34963 /* ELEMENT_ARRAY_BUFFER */ },
    ],
    buffers: [{ byteLength: binPayload.length }],
  }

  const jsonStr    = JSON.stringify(jsonObj)
  const jsonPadLen = (4 - (jsonStr.length % 4)) % 4
  const jsonPad    = jsonStr + ' '.repeat(jsonPadLen)   // pad with spaces
  const jsonBuf    = Buffer.from(jsonPad, 'utf8')

  // ── GLB envelope ──────────────────────────────────────────
  const totalLen = 12 + 8 + jsonBuf.length + 8 + binPayload.length

  const glbHeader = Buffer.alloc(12)
  glbHeader.writeUInt32LE(0x46546C67, 0)  // magic 'glTF'
  glbHeader.writeUInt32LE(2,           4)  // version
  glbHeader.writeUInt32LE(totalLen,    8)

  const jsonHeader = Buffer.alloc(8)
  jsonHeader.writeUInt32LE(jsonBuf.length, 0)
  jsonHeader.writeUInt32LE(0x4E4F534A,     4)   // 'JSON'

  const binHeader = Buffer.alloc(8)
  binHeader.writeUInt32LE(binPayload.length, 0)
  binHeader.writeUInt32LE(0x004E4942,        4)  // 'BIN\0'

  return Buffer.concat([glbHeader, jsonHeader, jsonBuf, binHeader, binPayload])
}

/** Generates a unit box GLB (24 vertices, flat per-face normals). */
function buildBoxGlb(color) {
  // 4 vertices per face, 6 faces — CCW winding viewed from outside
  // prettier-ignore
  const positions = new Float32Array([
    // Front  (z=+0.5)
    -0.5,-0.5, 0.5,  0.5,-0.5, 0.5,  0.5, 0.5, 0.5, -0.5, 0.5, 0.5,
    // Back   (z=-0.5)
     0.5,-0.5,-0.5, -0.5,-0.5,-0.5, -0.5, 0.5,-0.5,  0.5, 0.5,-0.5,
    // Left   (x=-0.5)
    -0.5,-0.5,-0.5, -0.5,-0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5,-0.5,
    // Right  (x=+0.5)
     0.5,-0.5, 0.5,  0.5,-0.5,-0.5,  0.5, 0.5,-0.5,  0.5, 0.5, 0.5,
    // Top    (y=+0.5)
    -0.5, 0.5, 0.5,  0.5, 0.5, 0.5,  0.5, 0.5,-0.5, -0.5, 0.5,-0.5,
    // Bottom (y=-0.5)
    -0.5,-0.5,-0.5,  0.5,-0.5,-0.5,  0.5,-0.5, 0.5, -0.5,-0.5, 0.5,
  ])

  const faceNormals = [[0,0,1],[0,0,-1],[-1,0,0],[1,0,0],[0,1,0],[0,-1,0]]
  const normals = new Float32Array(24 * 3)
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      normals[(f * 4 + v) * 3 + 0] = faceNormals[f][0]
      normals[(f * 4 + v) * 3 + 1] = faceNormals[f][1]
      normals[(f * 4 + v) * 3 + 2] = faceNormals[f][2]
    }
  }

  // prettier-ignore
  const indices = new Uint16Array([
     0, 1, 2,  0, 2, 3,   // front
     4, 5, 6,  4, 6, 7,   // back
     8, 9,10,  8,10,11,   // left
    12,13,14, 12,14,15,   // right
    16,17,18, 16,18,19,   // top
    20,21,22, 20,22,23,   // bottom
  ])

  return buildGlb(color, positions, normals, indices, 24, 36,
    [-0.5, -0.5, -0.5], [0.5, 0.5, 0.5])
}

/** Generates a UV sphere GLB (radius 0.5). */
function buildSphereGlb(color) {
  const RINGS = 14, SEGS = 14
  const V = (RINGS + 1) * (SEGS + 1)
  const I = RINGS * SEGS * 6

  const positions = new Float32Array(V * 3)
  const normals   = new Float32Array(V * 3)
  const indices   = new Uint16Array(I)

  let vi = 0
  for (let r = 0; r <= RINGS; r++) {
    const phi = (Math.PI * r) / RINGS
    for (let s = 0; s <= SEGS; s++) {
      const theta = (2 * Math.PI * s) / SEGS
      const x = 0.5 * Math.sin(phi) * Math.cos(theta)
      const y = 0.5 * Math.cos(phi)
      const z = 0.5 * Math.sin(phi) * Math.sin(theta)
      positions[vi * 3]     = x
      positions[vi * 3 + 1] = y
      positions[vi * 3 + 2] = z
      const len = Math.hypot(x, y, z) || 1
      normals[vi * 3]     = x / len
      normals[vi * 3 + 1] = y / len
      normals[vi * 3 + 2] = z / len
      vi++
    }
  }

  let ii = 0
  for (let r = 0; r < RINGS; r++) {
    for (let s = 0; s < SEGS; s++) {
      const a = r * (SEGS + 1) + s
      const b = a + (SEGS + 1)
      indices[ii++] = a;     indices[ii++] = b;     indices[ii++] = a + 1
      indices[ii++] = b;     indices[ii++] = b + 1; indices[ii++] = a + 1
    }
  }

  return buildGlb(color, positions, normals, indices, V, I,
    [-0.5, -0.5, -0.5], [0.5, 0.5, 0.5])
}

function pickShape(name = '', description = '') {
  const text = `${name} ${description}`.toLowerCase()
  if (/sphere|ball|orb|globe|round|bubble/.test(text)) return 'sphere'
  return 'box'
}

// ── Meshy AI integration ──────────────────────────────────────
const MESHY_BASE = 'https://api.meshy.ai/openapi/v2'

async function meshyRequest(method, path, body) {
  const res = await fetch(`${MESHY_BASE}${path}`, {
    method,
    headers: {
      Authorization:  `Bearer ${process.env.MESHY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`Meshy ${method} ${path} → ${res.status}: ${await res.text()}`)
  return res.json()
}

async function pollMeshy(meshyId, taskId, maxMs = 10 * 60_000) {
  const deadline = Date.now() + maxMs
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 5000))

    let data
    try {
      data = await meshyRequest('GET', `/text-3d/${meshyId}`)
    } catch (e) {
      console.warn(`[assets] Meshy poll error (retrying): ${e.message}`)
      continue
    }

    if (data.status === 'SUCCEEDED') return data
    if (data.status === 'FAILED' || data.status === 'EXPIRED') {
      throw new Error(`Meshy task ${data.status.toLowerCase()}`)
    }

    // Propagate progress from Meshy (maps 0-100 to 20-85 in our scale)
    const task = tasks.get(taskId)
    if (task) {
      const mp = typeof data.progress === 'number' ? data.progress : 0
      tasks.set(taskId, { ...task, progress: 20 + Math.round(mp * 0.65), detail: `Meshy: ${data.status}` })
    }
  }
  throw new Error('Generation timed out after 10 minutes')
}

// ── Core generation runner ────────────────────────────────────
async function runGeneration(taskId, { name, description, category, tags, color, shape }) {
  tasks.set(taskId, { status: 'generating', progress: 10, createdAt: tasks.get(taskId)?.createdAt ?? Date.now() })

  const id       = generateId()
  const slug     = name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 40)
  const filename = `${slug}_${Date.now()}.glb`
  const diskPath = join(GEN_DIR, filename)
  const webPath  = `${GEN_URL}/${filename}`

  let glbBuffer

  if (process.env.MESHY_API_KEY) {
    // ── Meshy path ─────────────────────────────────────────────
    tasks.set(taskId, { ...tasks.get(taskId), progress: 15, detail: 'Submitting to Meshy AI…' })

    const artStyle = /cartoon|stylized|cute|pixel/.test((description || '').toLowerCase())
      ? 'cartoon' : 'realistic'

    const created = await meshyRequest('POST', '/text-3d', {
      mode:             'preview',
      prompt:            description || name,
      art_style:         artStyle,
      negative_prompt:  'low quality, blurry, bad geometry',
    })

    tasks.set(taskId, {
      ...tasks.get(taskId),
      progress: 20,
      detail: 'Meshy AI generating…',
      meshyTaskId: created.result,
    })

    const result = await pollMeshy(created.result, taskId)
    tasks.set(taskId, { ...tasks.get(taskId), progress: 87, detail: 'Downloading model…' })

    const dlRes = await fetch(result.model_urls.glb)
    if (!dlRes.ok) throw new Error(`GLB download failed: ${dlRes.status}`)
    glbBuffer = Buffer.from(await dlRes.arrayBuffer())

  } else {
    // ── Procedural fallback ────────────────────────────────────
    tasks.set(taskId, { ...tasks.get(taskId), progress: 50, detail: 'Building procedural shape…' })
    const resolvedShape = shape || pickShape(name, description || '')
    glbBuffer = resolvedShape === 'sphere' ? buildSphereGlb(color) : buildBoxGlb(color)
  }

  await writeFile(diskPath, glbBuffer)
  tasks.set(taskId, { ...tasks.get(taskId), progress: 95, detail: 'Saving to database…' })

  const entry = {
    id,
    name,
    path:      webPath,
    category:  category || 'Props',
    tags:      Array.isArray(tags) ? tags : [],
    generated: true,
    color:     color || '#44aaff',
    createdAt: new Date().toISOString(),
  }

  await addAsset(entry)
  tasks.set(taskId, { status: 'complete', progress: 100, asset: entry, createdAt: tasks.get(taskId)?.createdAt })
  return entry
}

// ── Public API ────────────────────────────────────────────────
export async function startGeneration(params) {
  pruneOldTasks()

  if (!params.name?.trim()) throw new Error('"name" is required')

  const taskId = `task_${generateId()}`
  tasks.set(taskId, { status: 'pending', progress: 0, createdAt: Date.now() })

  // Fire-and-forget — client polls for status
  runGeneration(taskId, params).catch(err => {
    console.error(`[assets] Generation failed (${taskId}):`, err.message)
    tasks.set(taskId, {
      status: 'error',
      error:  err.message,
      progress: 0,
      createdAt: tasks.get(taskId)?.createdAt ?? Date.now(),
    })
  })

  return { taskId, status: 'pending' }
}
