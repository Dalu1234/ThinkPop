import { useRef, useState, useCallback, useEffect } from 'react'
import { loadUserModelProfile, normalizeTopicKey, recordLessonOutcome } from '../lib/userModel'

const ANALYZE_PROMPT = `You are a teaching assistant. The student just took a photo of their work.
Identify the academic subject, specific topic, and difficulty level from what you see.
Reply ONLY with valid JSON — no markdown fences, no extra text:
{ "subject": "...", "topic": "...", "details": "one sentence", "difficulty": "easy|medium|hard" }`

async function analyzeImage(dataUrl) {
  const res = await fetch('/api/vlm-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: ANALYZE_PROMPT },
          { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
        ],
      }],
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  try {
    const clean = data.reply.replace(/```json\s*/gi, '').replace(/```/g, '').trim()
    return JSON.parse(clean)
  } catch {
    return { subject: 'Unknown', topic: data.reply?.slice(0, 80) || 'Unknown', details: '', difficulty: 'medium' }
  }
}

function saveWorkContext(result) {
  const profile = loadUserModelProfile()
  if (!profile.workContext) profile.workContext = []

  profile.workContext.unshift({
    subject: result.subject,
    topic: result.topic,
    details: result.details,
    difficulty: result.difficulty,
    timestamp: new Date().toISOString(),
  })
  if (profile.workContext.length > 20) profile.workContext = profile.workContext.slice(0, 20)

  const key = normalizeTopicKey(result.topic)
  if (key) {
    if (!profile.topics[key]) profile.topics[key] = { correct: 0, incorrect: 0, lastPlayed: '' }
    profile.topics[key].lastPlayed = new Date().toISOString()
  }

  try { localStorage.setItem('thinkpop_user_model', JSON.stringify(profile)) } catch {}

  return key
}

export default function CameraPage() {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const fileInputRef = useRef(null)

  const [active, setActive] = useState(false)
  const [facingMode, setFacingMode] = useState('environment')
  const [flash, setFlash] = useState(false)
  const [error, setError] = useState(null)

  // 'idle' | 'captured' | 'analyzing' | 'done' | 'error'
  const [phase, setPhase] = useState('idle')
  const [capturedUrl, setCapturedUrl] = useState(null)
  const [result, setResult] = useState(null)
  const [analyzeError, setAnalyzeError] = useState(null)

  const startCamera = useCallback(async (facing) => {
    try {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play() }
      setActive(true)
      setError(null)
    } catch { setError('Camera unavailable'); setActive(false) }
  }, [])

  useEffect(() => {
    startCamera(facingMode)
    return () => streamRef.current?.getTracks().forEach(t => t.stop())
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const flipCamera = useCallback(() => {
    const next = facingMode === 'environment' ? 'user' : 'environment'
    setFacingMode(next)
    startCamera(next)
  }, [facingMode, startCamera])

  const capture = useCallback(() => {
    const v = videoRef.current, c = canvasRef.current
    if (!v || !c) return
    c.width = v.videoWidth; c.height = v.videoHeight
    c.getContext('2d').drawImage(v, 0, 0)
    const url = c.toDataURL('image/jpeg', 0.92)
    setCapturedUrl(url)
    setPhase('captured')
    setFlash(true)
    setTimeout(() => setFlash(false), 150)
  }, [])

  const uploadFile = useCallback(async (file) => {
    if (!file?.type.startsWith('image/')) return
    const url = await new Promise((res, rej) => {
      const r = new FileReader()
      r.onload = e => res(e.target.result)
      r.onerror = rej
      r.readAsDataURL(file)
    })
    setCapturedUrl(url)
    setPhase('captured')
  }, [])

  const analyze = useCallback(async () => {
    if (!capturedUrl) return
    setPhase('analyzing')
    setAnalyzeError(null)
    try {
      const res = await analyzeImage(capturedUrl)
      setResult(res)
      saveWorkContext(res)
      setPhase('done')
    } catch (e) {
      setAnalyzeError(e.message)
      setPhase('error')
    }
  }, [capturedUrl])

  const retake = useCallback(() => {
    setCapturedUrl(null)
    setResult(null)
    setAnalyzeError(null)
    setPhase('idle')
  }, [])

  return (
    <div className="cam">
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={async (e) => { if (e.target.files[0]) await uploadFile(e.target.files[0]); e.target.value = '' }} />

      {/* Viewfinder / Captured preview */}
      <div className="cam-viewfinder">
        {phase === 'idle' ? (
          <>
            <video ref={videoRef} className="cam-video" playsInline muted autoPlay />
            {flash && <div className="cam-flash" />}
            {error && <div className="cam-status">{error}</div>}
            {!active && !error && <div className="cam-status">Starting camera...</div>}
          </>
        ) : (
          <img src={capturedUrl} alt="Captured" className="cam-preview" />
        )}

        {/* Analyzing overlay */}
        {phase === 'analyzing' && (
          <div className="cam-overlay">
            <div className="cam-spinner" />
            <span className="cam-overlay-text">Analyzing your work...</span>
          </div>
        )}
      </div>

      {/* Top bar */}
      <div className="cam-bar cam-bar--top">
        <a href="#/baymax" className="cam-pill-btn" aria-label="Back">
          <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4L6 9l5 5" />
          </svg>
        </a>
        <span className="cam-title">Scan Your Work</span>
        <button type="button" className="cam-pill-btn" onClick={flipCamera} aria-label="Flip">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 4v6h6" /><path d="M23 20v-6h-6" />
            <path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15" />
          </svg>
        </button>
      </div>

      {/* Result card */}
      {phase === 'done' && result && (
        <div className="cam-result">
          <div className="cam-result-card">
            <div className="cam-result-label">Detected</div>
            <div className="cam-result-subject">{result.subject}</div>
            <div className="cam-result-topic">{result.topic}</div>
            {result.details && <div className="cam-result-details">{result.details}</div>}
            <div className={`cam-result-diff cam-result-diff--${result.difficulty}`}>
              {result.difficulty}
            </div>
            <div className="cam-result-saved">Added to your knowledge profile</div>
            <div className="cam-result-actions">
              <button type="button" className="cam-btn cam-btn--ghost" onClick={retake}>Scan another</button>
              <a href="#/baymax" className="cam-btn cam-btn--primary">Back to tutor</a>
            </div>
          </div>
        </div>
      )}

      {/* Error card */}
      {phase === 'error' && (
        <div className="cam-result">
          <div className="cam-result-card">
            <div className="cam-result-label" style={{ color: 'rgba(255,100,100,0.8)' }}>Analysis failed</div>
            <div className="cam-result-details">{analyzeError}</div>
            <div className="cam-result-actions">
              <button type="button" className="cam-btn cam-btn--ghost" onClick={retake}>Try again</button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom controls */}
      <div className="cam-bar cam-bar--bottom">
        {phase === 'idle' && (
          <div className="cam-input-row">
            <button type="button" className="cam-pill-btn cam-pill-btn--sm" onClick={() => fileInputRef.current?.click()} aria-label="Upload">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </button>
            <button type="button" className="cam-shutter" onClick={capture} disabled={!active} aria-label="Capture">
              <span className="cam-shutter-dot" />
            </button>
            <div style={{ width: 36 }} />
          </div>
        )}
        {phase === 'captured' && (
          <div className="cam-input-row">
            <button type="button" className="cam-btn cam-btn--ghost" onClick={retake}>Retake</button>
            <button type="button" className="cam-btn cam-btn--primary" onClick={analyze}>Analyze</button>
          </div>
        )}
      </div>
    </div>
  )
}
