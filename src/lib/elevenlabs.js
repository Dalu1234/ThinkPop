const API_PREFIX = '/api/elevenlabs'

const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM'

function voiceId() {
  return import.meta.env.VITE_ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID
}

function ttsModelId() {
  return import.meta.env.VITE_ELEVENLABS_TTS_MODEL || 'eleven_turbo_v2_5'
}

function sttModelId() {
  return import.meta.env.VITE_ELEVENLABS_STT_MODEL || 'scribe_v2'
}

export async function textToSpeechBlob(text) {
  const id = voiceId()
  const res = await fetch(`${API_PREFIX}/v1/text-to-speech/${id}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: ttsModelId(),
    }),
  })
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(detail || `TTS failed (${res.status})`)
  }
  return res.blob()
}

export async function speechToText(audioBlob, fileName = 'recording.webm') {
  const form = new FormData()
  form.append('model_id', sttModelId())
  form.append('file', audioBlob, fileName)

  const res = await fetch(`${API_PREFIX}/v1/speech-to-text`, {
    method: 'POST',
    body: form,
  })
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(detail || `Speech-to-text failed (${res.status})`)
  }
  const data = await res.json()
  let text = ''
  if (data.transcripts?.[0]?.text != null) {
    text = String(data.transcripts[0].text).trim()
  } else if (data.text != null) {
    text = String(data.text).trim()
  }
  return { text, raw: data }
}

export function playAudioBlob(blob, options = {}) {
  const url = URL.createObjectURL(blob)
  const audio = new Audio(url)
  return new Promise((resolve, reject) => {
    const AC = window.AudioContext || window.webkitAudioContext
    const audioContext = AC ? new AC() : null
    let analyser = null
    let source = null
    let frameId = 0
    let data = null

    const stopVisualizer = () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId)
        frameId = 0
      }
      try {
        source?.disconnect()
      } catch {
        /* ignore */
      }
      try {
        analyser?.disconnect()
      } catch {
        /* ignore */
      }
      source = null
      analyser = null
      data = null
      audioContext?.close().catch(() => {})
      options.onLevels?.(null)
      options.onEnd?.()
    }

    const tick = () => {
      if (!analyser || !data) return
      analyser.getByteFrequencyData(data)
      const bucketCount = 28
      const levels = new Array(bucketCount).fill(0).map((_, index) => {
        const start = Math.floor((index / bucketCount) * data.length)
        const end = Math.max(start + 1, Math.floor(((index + 1) / bucketCount) * data.length))
        let total = 0
        for (let i = start; i < end; i++) total += data[i]
        return total / ((end - start) * 255)
      })
      options.onLevels?.(levels)
      frameId = window.requestAnimationFrame(tick)
    }

    const done = () => {
      stopVisualizer()
      URL.revokeObjectURL(url)
      resolve()
    }
    if (audioContext) {
      try {
        source = audioContext.createMediaElementSource(audio)
        analyser = audioContext.createAnalyser()
        analyser.fftSize = 256
        analyser.smoothingTimeConstant = 0.78
        data = new Uint8Array(analyser.frequencyBinCount)
        source.connect(analyser)
        analyser.connect(audioContext.destination)
      } catch {
        source = null
        analyser = null
        data = null
      }
    }
    audio.addEventListener('ended', done, { once: true })
    audio.addEventListener(
      'error',
      () => {
        stopVisualizer()
        URL.revokeObjectURL(url)
        reject(new Error('Audio playback failed'))
      },
      { once: true }
    )
    audio.play().catch(err => {
      stopVisualizer()
      URL.revokeObjectURL(url)
      reject(err)
    })
    Promise.resolve(audioContext?.resume?.())
      .catch(() => {})
      .finally(() => {
        options.onStart?.()
        if (analyser && data) {
          tick()
        }
      })
  })
}
