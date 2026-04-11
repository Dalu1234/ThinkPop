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

export function playAudioBlob(blob) {
  const url = URL.createObjectURL(blob)
  const audio = new Audio(url)
  return new Promise((resolve, reject) => {
    const done = () => {
      URL.revokeObjectURL(url)
      resolve()
    }
    audio.addEventListener('ended', done, { once: true })
    audio.addEventListener(
      'error',
      () => {
        URL.revokeObjectURL(url)
        reject(new Error('Audio playback failed'))
      },
      { once: true }
    )
    audio.play().catch(err => {
      URL.revokeObjectURL(url)
      reject(err)
    })
  })
}
