/**
 * sessions.js — localStorage-backed conversation history for ThinkPop.
 *
 * Each session stores: id, timestamp, topic, messages, and the full
 * lessonResult (lessonPlan + gesturePlan) so motions can be regenerated
 * on load without hitting the server again.
 */

const STORAGE_KEY = 'thinkpop_sessions'
const MAX_SESSIONS = 60

// ── Read / Write ──────────────────────────────────────────────────────────────

export function loadSessions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveSession(session) {
  const sessions = loadSessions().filter(s => s.id !== session.id)
  sessions.unshift(session)                            // newest first
  if (sessions.length > MAX_SESSIONS) sessions.length = MAX_SESSIONS
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
  } catch (e) {
    // Storage quota — drop oldest half and retry
    const trimmed = sessions.slice(0, Math.floor(MAX_SESSIONS / 2))
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed)) } catch {}
  }
}

export function deleteSession(id) {
  const sessions = loadSessions().filter(s => s.id !== id)
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions)) } catch {}
}

export function clearAllSessions() {
  try { localStorage.removeItem(STORAGE_KEY) } catch {}
}

// ── Session factory ───────────────────────────────────────────────────────────

export function createSession({ topic, messages, lessonResult }) {
  return {
    id: `session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
    topic,           // { label, emoji }
    messages,        // Message[] — id/from/text
    lessonResult,    // { lessonPlan, gesturePlan } or null — gestures used to regen motions
  }
}

// ── Date grouping ─────────────────────────────────────────────────────────────

const DAY = 86_400_000

export function groupSessionsByDate(sessions) {
  const now = Date.now()
  const buckets = {
    'Today':            [],
    'Yesterday':        [],
    'Previous 7 Days':  [],
    'Previous 30 Days': [],
    'Older':            [],
  }
  for (const s of sessions) {
    const age = now - (s.timestamp || 0)
    if      (age < DAY)       buckets['Today'].push(s)
    else if (age < 2 * DAY)   buckets['Yesterday'].push(s)
    else if (age < 7 * DAY)   buckets['Previous 7 Days'].push(s)
    else if (age < 30 * DAY)  buckets['Previous 30 Days'].push(s)
    else                      buckets['Older'].push(s)
  }
  return Object.entries(buckets).filter(([, items]) => items.length > 0)
}
