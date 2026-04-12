/**
 * ThinkPop user model — linear performance predictor + online SGD updates.
 * Persists to localStorage (same device). Inspired by nex-hacks UserModel.
 */

const STORAGE_KEY = 'thinkpop_user_model'
const MAX_TRAINING_BUFFER = 50
const DEFAULT_WEIGHTS = [0.5, 0.2, -0.1]
const DEFAULT_BIAS = 0.5
const DEFAULT_LR = 0.01

function clamp01(x) {
  return Math.max(0, Math.min(1, x))
}

function defaultProfile() {
  return {
    topics: {},
    game_stats: {
      lesson: {
        lessons_started: 0,
        completions: 0,
        failures: 0,
      },
    },
    prediction_model: {
      weights: [...DEFAULT_WEIGHTS],
      bias: DEFAULT_BIAS,
      learning_rate: DEFAULT_LR,
      training_data: [],
      total_predictions: 0,
      cumulative_error: 0,
      model_accuracy: 0,
    },
  }
}

function deepMerge(target, source) {
  if (!source || typeof source !== 'object') return target
  for (const key of Object.keys(source)) {
    const sv = source[key]
    const tv = target[key]
    if (sv && typeof sv === 'object' && !Array.isArray(sv) && tv && typeof tv === 'object' && !Array.isArray(tv)) {
      deepMerge(tv, sv)
    } else {
      target[key] = sv
    }
  }
  return target
}

export function loadUserModelProfile() {
  const base = defaultProfile()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return base
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') {
      deepMerge(base, parsed)
    }
  } catch {
    /* keep defaults */
  }
  if (!Array.isArray(base.prediction_model.weights) || base.prediction_model.weights.length < 3) {
    base.prediction_model.weights = [...DEFAULT_WEIGHTS]
  }
  if (typeof base.prediction_model.bias !== 'number') base.prediction_model.bias = DEFAULT_BIAS
  if (!base.game_stats.lesson) {
    base.game_stats.lesson = { lessons_started: 0, completions: 0, failures: 0 }
  }
  return base
}

function saveUserModelProfile(profile) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile))
  } catch (e) {
    console.warn('[userModel] save failed', e)
  }
}

/** Stable key for topic strings */
export function normalizeTopicKey(topic) {
  return String(topic || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .slice(0, 200)
}

function daysSinceIso(iso) {
  if (!iso || typeof iso !== 'string') return 7
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return 7
  return Math.max(0, (Date.now() - t) / 86400000)
}

/**
 * @param {ReturnType<typeof loadUserModelProfile>} profile
 * @param {string} topicKey
 * @param {string} gameType
 * @returns {number[]}
 */
function extractFeatures(profile, topicKey, gameType) {
  const features = [0, 0, 0]
  const topics = profile.topics || {}
  const lessonStats = profile.game_stats?.lesson || { lessons_started: 0 }

  if (topicKey && topics[topicKey]) {
    const t = topics[topicKey]
    const correct = Number(t.correct) || 0
    const incorrect = Number(t.incorrect) || 0
    const total = correct + incorrect
    features[0] = total > 0 ? correct / total : 0.5
    features[1] = clamp01(total / 20)
    const last = t.lastPlayed || ''
    features[2] = clamp01(daysSinceIso(last) / 7)
  } else {
    features[0] = 0.5
    const attempts = gameType === 'lesson' ? Number(lessonStats.lessons_started) || 0 : 0
    features[1] = clamp01(attempts / 20)
    features[2] = 1
  }

  return features
}

function calculateConfidence(profile) {
  const n = profile.prediction_model.training_data.length
  return clamp01(n / 25) * 0.95
}

/**
 * @param {string} topic — display or raw topic string
 * @param {string} [gameType='lesson']
 * @returns {{ predicted_score: number, confidence: number, features: number[], feature_names: string[] }}
 */
export function predictPerformance(topic, gameType = 'lesson') {
  const profile = loadUserModelProfile()
  const topicKey = normalizeTopicKey(topic)
  if (gameType === 'lesson') {
    profile.game_stats.lesson.lessons_started = (Number(profile.game_stats.lesson.lessons_started) || 0) + 1
  }

  const model = profile.prediction_model
  const weights = model.weights
  const bias = model.bias
  // Features use stats as of this moment (includes lessons_started bump for global fallback).
  const features = extractFeatures(profile, topicKey, gameType)

  let predicted = bias
  for (let i = 0; i < Math.min(weights.length, features.length); i++) {
    predicted += weights[i] * features[i]
  }
  predicted = clamp01(predicted)

  model.total_predictions = (Number(model.total_predictions) || 0) + 1
  saveUserModelProfile(profile)

  return {
    predicted_score: predicted,
    confidence: calculateConfidence(profile),
    features: [...features],
    feature_names: ['topic_mastery', 'attempts_normalized', 'time_decay'],
  }
}

function gradientDescentStep(profile, error, features) {
  const model = profile.prediction_model
  const lr = Number(model.learning_rate) || DEFAULT_LR
  const weights = model.weights
  for (let i = 0; i < Math.min(weights.length, features.length); i++) {
    const g = error * features[i]
    weights[i] = clampWeight(weights[i] - lr * g)
  }
  model.bias = clampBias(model.bias - lr * error)
}

function clampWeight(w) {
  return Math.max(-2, Math.min(2, w))
}

function clampBias(b) {
  return Math.max(-1, Math.min(1, b))
}

/**
 * Call after you know actual outcome (0–1). Pass the same `features` from predictPerformance.
 */
export function recordPredictionResult(predicted, actual, features, topic = '') {
  const profile = loadUserModelProfile()
  const model = profile.prediction_model
  const y = clamp01(actual)
  const yhat = clamp01(predicted)
  const error = yhat - y

  const sample = {
    features: [...features],
    predicted: yhat,
    actual: y,
    error,
    topic: normalizeTopicKey(topic),
    timestamp: new Date().toISOString(),
  }
  model.training_data.push(sample)
  if (model.training_data.length > MAX_TRAINING_BUFFER) {
    model.training_data.shift()
  }

  let totalErr = 0
  for (const s of model.training_data) {
    totalErr += Math.abs(s.error)
  }
  const avgErr = model.training_data.length ? totalErr / model.training_data.length : 0
  model.model_accuracy = clamp01(1 - avgErr)
  model.cumulative_error = (Number(model.cumulative_error) || 0) + Math.abs(error)

  gradientDescentStep(profile, error, features)
  saveUserModelProfile(profile)
}

/**
 * Update per-topic counts after a lesson attempt (separate from gradient step).
 */
export function recordLessonOutcome(topic, success) {
  const profile = loadUserModelProfile()
  const key = normalizeTopicKey(topic)
  if (success) {
    profile.game_stats.lesson.completions = (Number(profile.game_stats.lesson.completions) || 0) + 1
  } else {
    profile.game_stats.lesson.failures = (Number(profile.game_stats.lesson.failures) || 0) + 1
  }
  if (!key) {
    saveUserModelProfile(profile)
    return
  }
  if (!profile.topics[key]) {
    profile.topics[key] = { correct: 0, incorrect: 0, lastPlayed: '' }
  }
  const t = profile.topics[key]
  if (success) {
    t.correct = (Number(t.correct) || 0) + 1
  } else {
    t.incorrect = (Number(t.incorrect) || 0) + 1
  }
  t.lastPlayed = new Date().toISOString()
  saveUserModelProfile(profile)
}

export function getPredictionStats() {
  const profile = loadUserModelProfile()
  const m = profile.prediction_model
  return {
    weights: [...m.weights],
    bias: m.bias,
    training_samples: m.training_data.length,
    accuracy_percent: (m.model_accuracy || 0) * 100,
    total_predictions: m.total_predictions || 0,
    feature_names: ['Topic mastery', 'Practice amount', 'Recency'],
  }
}
