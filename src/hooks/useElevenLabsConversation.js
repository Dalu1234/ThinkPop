import { useRef, useCallback, useState } from 'react'
import { useVoiceStream } from 'voice-stream'

const API_PREFIX = '/api/elevenlabs'

const DEFAULT_AGENT_PROMPT = `You are Baymax, a warm educational tutor in a 3D learning app. 
Answer questions clearly and briefly for spoken dialogue. 
If the user's question is unclear or missing important detail, ask one short clarifying question before you explain.
Prefer natural spoken language over lists unless the user asks for steps.`

function parseAgentAudioFormat(format) {
  if (!format || typeof format !== 'string') {
    return { codec: 'pcm', sampleRate: 44100 }
  }
  const [codecPart, ratePart] = format.split('_')
  const rate = parseInt(ratePart, 10)
  const sampleRate = Number.isFinite(rate) ? rate : 44100
  if (codecPart === 'ulaw') {
    return { codec: 'ulaw', sampleRate }
  }
  return { codec: 'pcm', sampleRate }
}

/** ITU-T G.711 μ-law to linear int16 */
function ulawByteToInt16(u) {
  const uVal = (~u) & 0xff
  const sign = uVal & 0x80 ? -1 : 1
  const exponent = (uVal >> 4) & 7
  const mantissa = uVal & 0x0f
  let sample = ((mantissa << 3) + 0x84) << exponent
  sample -= 0x84
  return sign * sample
}

function base64ToAudioBuffer(audioContext, base64, sampleRate, codec) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

  let float32
  if (codec === 'ulaw') {
    float32 = new Float32Array(bytes.length)
    for (let i = 0; i < bytes.length; i++) {
      float32[i] = ulawByteToInt16(bytes[i]) / 32768
    }
  } else {
    const int16 = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2))
    float32 = new Float32Array(int16.length)
    for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768
  }

  const buffer = audioContext.createBuffer(1, float32.length, sampleRate)
  buffer.getChannelData(0).set(float32)
  return buffer
}

function createPlaybackScheduler() {
  let ctx = null
  let nextTime = 0
  const sources = new Set()

  async function ensureContext() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext
      ctx = new AC()
    }
    if (ctx.state === 'suspended') await ctx.resume()
    return ctx
  }

  function stopAll() {
    for (const s of sources) {
      try {
        s.stop()
      } catch {
        /* already stopped */
      }
    }
    sources.clear()
    nextTime = 0
  }

  async function scheduleChunk(base64, sampleRate, codec) {
    const audioContext = await ensureContext()
    const buffer = base64ToAudioBuffer(audioContext, base64, sampleRate, codec)
    const src = audioContext.createBufferSource()
    src.buffer = buffer
    src.connect(audioContext.destination)
    sources.add(src)
    src.onended = () => sources.delete(src)
    const now = audioContext.currentTime
    if (nextTime < now) nextTime = now
    src.start(nextTime)
    nextTime += buffer.duration
  }

  function close() {
    stopAll()
    if (ctx) {
      ctx.close().catch(() => {})
      ctx = null
    }
  }

  return { ensureContext, scheduleChunk, stopAll, close }
}

function sendWs(ws, payload) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload))
  }
}

function scheduleAlignmentCaptions(alignment, captionTimeoutIdsRef, setCaptions, accRef) {
  const chars = alignment?.chars
  const times = alignment?.char_start_times_ms
  if (!chars?.length) return
  const base = accRef.current
  chars.forEach((_, i) => {
    const delay = Math.max(0, times?.[i] ?? 0)
    const id = window.setTimeout(() => {
      const segment = chars.slice(0, i + 1).join('')
      const next = base + segment
      accRef.current = next
      setCaptions(c => ({ ...c, agent: next }))
    }, delay)
    captionTimeoutIdsRef.current.push(id)
  })
}

export function useElevenLabsConversation({
  agentId,
  onUserTranscript,
  onAgentResponse,
  onPhaseChange,
  onError,
}) {
  const [active, setActive] = useState(false)
  const [starting, setStarting] = useState(false)
  const [lastError, setLastError] = useState(null)
  const [captions, setCaptions] = useState({ user: '', agent: '' })

  const wsRef = useRef(null)
  const playbackRef = useRef(null)
  const outputRateRef = useRef(44100)
  const outputCodecRef = useRef('pcm')
  const captionTimeoutIdsRef = useRef([])
  const agentCaptionAccRef = useRef('')
  const pendingAgentResponseRef = useRef(null)
  const vadSpeakingRef = useRef(false)
  const callbacksRef = useRef({ onUserTranscript, onAgentResponse, onPhaseChange, onError })
  callbacksRef.current = { onUserTranscript, onAgentResponse, onPhaseChange, onError }

  const clearCaptionTimeouts = useCallback(() => {
    captionTimeoutIdsRef.current.forEach(tid => window.clearTimeout(tid))
    captionTimeoutIdsRef.current = []
  }, [])

  const setPhase = useCallback((phase) => {
    callbacksRef.current.onPhaseChange?.(phase)
  }, [])

  const { startStreaming, stopStreaming } = useVoiceStream({
    includeDestination: false,
    targetSampleRate: 16000,
    bufferSize: 4096,
    onAudioChunked: (chunkBase64) => {
      const ws = wsRef.current
      if (ws?.readyState === WebSocket.OPEN) {
        sendWs(ws, { user_audio_chunk: chunkBase64 })
      }
    },
    onError: (err) => {
      setLastError(err.message || String(err))
      callbacksRef.current.onError?.(err)
    },
  })

  const cleanupSession = useCallback(() => {
    clearCaptionTimeouts()
    agentCaptionAccRef.current = ''
    pendingAgentResponseRef.current = null
    vadSpeakingRef.current = false
    setCaptions({ user: '', agent: '' })
    stopStreaming()
    const w = wsRef.current
    wsRef.current = null
    try {
      w?.close()
    } catch {
      /* ignore */
    }
    playbackRef.current?.close()
    playbackRef.current = null
    setActive(false)
    setStarting(false)
    setPhase(null)
  }, [stopStreaming, setPhase, clearCaptionTimeouts])

  const handleMessage = useCallback(
    (event) => {
      let data
      try {
        data = JSON.parse(event.data)
      } catch {
        return
      }

      const ws = wsRef.current
      const playback = playbackRef.current

      if (data.type === 'ping' && data.ping_event?.event_id != null) {
        const delayMs = data.ping_event.ping_ms ?? 0
        window.setTimeout(() => {
          sendWs(wsRef.current, { type: 'pong', event_id: data.ping_event.event_id })
        }, delayMs)
        return
      }

      if (data.type === 'conversation_initiation_metadata' && data.conversation_initiation_metadata_event) {
        const fmt = data.conversation_initiation_metadata_event.agent_output_audio_format
        const parsed = parseAgentAudioFormat(fmt)
        outputRateRef.current = parsed.sampleRate
        outputCodecRef.current = parsed.codec
        return
      }

      if (data.type === 'vad_score' && data.vad_score_event) {
        const v = Number(data.vad_score_event.vad_score)
        const speaking = Number.isFinite(v) && v > 0.38
        vadSpeakingRef.current = speaking
        if (speaking) {
          setCaptions(c => ({ ...c, user: 'Listening…' }))
        }
        return
      }

      if (data.type === 'user_transcript' && data.user_transcription_event?.user_transcript != null) {
        const text = String(data.user_transcription_event.user_transcript).trim()
        vadSpeakingRef.current = false
        clearCaptionTimeouts()
        agentCaptionAccRef.current = ''
        pendingAgentResponseRef.current = null
        setCaptions(c => ({ ...c, user: text, agent: '' }))
        if (text) callbacksRef.current.onUserTranscript?.(text)
        setPhase('voice_listening')
        return
      }

      if (data.type === 'agent_response' && data.agent_response_event?.agent_response != null) {
        const text = String(data.agent_response_event.agent_response).trim()
        if (text) {
          callbacksRef.current.onAgentResponse?.(text)
          pendingAgentResponseRef.current = text
        }
        return
      }

      if (data.type === 'agent_response_correction' && data.agent_response_correction_event) {
        const text = String(
          data.agent_response_correction_event.corrected_agent_response || ''
        ).trim()
        if (text) {
          callbacksRef.current.onAgentResponse?.(text)
          pendingAgentResponseRef.current = text
          clearCaptionTimeouts()
          agentCaptionAccRef.current = text
          setCaptions(c => ({ ...c, agent: text }))
        }
        return
      }

      if (data.type === 'internal_tentative_agent_response' && data.tentative_agent_response_internal_event) {
        const t = String(
          data.tentative_agent_response_internal_event.tentative_agent_response || ''
        ).trim()
        if (t) {
          clearCaptionTimeouts()
          agentCaptionAccRef.current = ''
          setCaptions(c => ({ ...c, agent: t }))
        }
        return
      }

      if (data.type === 'agent_chat_response_part' && data.text_response_part) {
        const part = data.text_response_part
        const partType = part.type
        const chunk = String(part.text || '')
        if (partType === 'start') {
          clearCaptionTimeouts()
          agentCaptionAccRef.current = ''
          setCaptions(c => ({ ...c, agent: '' }))
        } else if (partType === 'delta') {
          agentCaptionAccRef.current += chunk
          setCaptions(c => ({ ...c, agent: agentCaptionAccRef.current }))
        }
        return
      }

      if (data.type === 'interruption') {
        playback?.stopAll()
        clearCaptionTimeouts()
        agentCaptionAccRef.current = ''
        pendingAgentResponseRef.current = null
        setCaptions(c => ({ ...c, agent: '' }))
        setPhase('voice_listening')
        return
      }

      if (data.type === 'audio' && data.audio_event?.audio_base_64) {
        setPhase('speaking')
        const al = data.audio_event.alignment
        if (al?.chars?.length) {
          pendingAgentResponseRef.current = null
          scheduleAlignmentCaptions(al, captionTimeoutIdsRef, setCaptions, agentCaptionAccRef)
        } else if (pendingAgentResponseRef.current) {
          const full = pendingAgentResponseRef.current
          pendingAgentResponseRef.current = null
          agentCaptionAccRef.current = full
          setCaptions(c => ({ ...c, agent: full }))
        }
        void playback?.scheduleChunk(
          data.audio_event.audio_base_64,
          outputRateRef.current,
          outputCodecRef.current
        )
        return
      }

      if (data.type === 'client_tool_call' && data.client_tool_call?.tool_call_id) {
        sendWs(wsRef.current, {
          type: 'client_tool_result',
          tool_call_id: data.client_tool_call.tool_call_id,
          result: 'Not implemented in this client.',
          is_error: true,
        })
      }
    },
    [setPhase, clearCaptionTimeouts]
  )

  const start = useCallback(async () => {
    const id = agentId?.trim()
    if (!id) {
      const msg = 'Set VITE_ELEVENLABS_AGENT_ID in .env (ElevenLabs → Agents → your agent).'
      setLastError(msg)
      callbacksRef.current.onError?.(new Error(msg))
      return
    }

    clearCaptionTimeouts()
    agentCaptionAccRef.current = ''
    pendingAgentResponseRef.current = null
    vadSpeakingRef.current = false
    setCaptions({ user: '', agent: '' })

    const playback = createPlaybackScheduler()
    playbackRef.current = playback
    outputCodecRef.current = 'pcm'
    outputRateRef.current = 44100

    try {
      await playback.ensureContext()
    } catch {
      /* still try session; playback may unlock on first chunk */
    }

    setLastError(null)
    setStarting(true)
    setPhase('voice_connecting')

    let url
    try {
      const res = await fetch(
        `${API_PREFIX}/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(id)}`
      )
      if (res.ok) {
        const body = await res.json()
        if (body.signed_url) url = body.signed_url
      }
    } catch {
      /* fall through to public URL */
    }

    if (!url) {
      url = `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${encodeURIComponent(id)}`
    }

    const ws = new WebSocket(url, ['convai'])
    wsRef.current = ws

    ws.onmessage = handleMessage

    ws.onerror = () => {
      setLastError('Voice connection error.')
      callbacksRef.current.onError?.(new Error('WebSocket error'))
    }

    ws.onclose = () => {
      if (wsRef.current !== ws) return
      cleanupSession()
    }

    ws.onopen = () => {
      const prompt =
        import.meta.env.VITE_ELEVENLABS_AGENT_PROMPT?.trim() || DEFAULT_AGENT_PROMPT
      sendWs(ws, {
        type: 'conversation_initiation_client_data',
        conversation_config_override: {
          agent: {
            prompt,
            language: import.meta.env.VITE_ELEVENLABS_AGENT_LANGUAGE || 'en',
          },
        },
      })
      void startStreaming()
        .then(() => {
          setActive(true)
          setStarting(false)
          setPhase('voice_listening')
        })
        .catch((err) => {
          setLastError(err?.message || 'Microphone failed.')
          callbacksRef.current.onError?.(err instanceof Error ? err : new Error(String(err)))
          try {
            ws.close()
          } catch {
            /* ignore */
          }
          cleanupSession()
        })
    }
  }, [agentId, handleMessage, startStreaming, setPhase, cleanupSession, clearCaptionTimeouts])

  const stop = useCallback(() => {
    cleanupSession()
  }, [cleanupSession])

  return {
    active,
    starting,
    lastError,
    captions,
    start,
    stop,
  }
}
