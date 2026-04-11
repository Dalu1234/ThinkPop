import { useElevenLabsConversation } from '../hooks/useElevenLabsConversation'

const AGENT_ID = import.meta.env.VITE_ELEVENLABS_AGENT_ID || ''

export default function VoiceConversationBar({
  onUserTranscript,
  onAgentResponse,
  onVoicePhaseChange,
}) {
  const { active, starting, lastError, captions, start, stop } = useElevenLabsConversation({
    agentId: AGENT_ID,
    onUserTranscript,
    onAgentResponse,
    onPhaseChange: onVoicePhaseChange,
  })

  const configured = Boolean(AGENT_ID.trim())

  const showLive = active || starting

  return (
    <div className="voice-conv-bar">
      {showLive && (
        <div className="voice-live-captions" aria-live="polite">
          <div className="voice-live-row voice-live-user">
            <span className="voice-live-label">You</span>
            <p className="voice-live-text">
              {captions.user ? (
                captions.user
              ) : (
                <span className="voice-live-placeholder">Waiting for speech…</span>
              )}
            </p>
          </div>
          <div className="voice-live-row voice-live-agent">
            <span className="voice-live-label">AI</span>
            <p className="voice-live-text">
              {captions.agent ? (
                captions.agent
              ) : (
                <span className="voice-live-placeholder">Reply will appear as it speaks…</span>
              )}
            </p>
          </div>
        </div>
      )}

      <button
        type="button"
        className={`voice-conv-btn ${active ? 'voice-conv-btn-live' : ''}`}
        onClick={() => void (active ? stop() : start())}
        disabled={starting || !configured}
        title={
          configured
            ? active
              ? 'End real-time voice with your ElevenLabs agent'
              : 'Talk with your ElevenLabs agent (voice in / voice out)'
            : 'Add VITE_ELEVENLABS_AGENT_ID to .env'
        }
      >
        {starting ? 'Connecting…' : active ? '● End voice chat' : '◇ Start voice chat'}
      </button>
      {!configured && (
        <span className="voice-conv-hint">
          Set <code className="voice-conv-code">VITE_ELEVENLABS_AGENT_ID</code> and create an agent at
          elevenlabs.io/agents — give it a prompt that asks clarifying questions when needed.
        </span>
      )}
      {configured && lastError && <span className="voice-conv-err">{lastError}</span>}
    </div>
  )
}
