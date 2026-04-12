import { useState, useCallback, useRef, useEffect } from 'react'
import LandingPage from './LandingPage'
import CharacterScene from './components/CharacterScene'
import TopicCard from './components/TopicCard'
import ChatPanel from './components/ChatPanel'
import HistorySidebar from './components/HistorySidebar'
import AIStatus from './components/AIStatus'
import PipelineProgress from './components/PipelineProgress'
import Skyline from './components/Skyline'
import { textToSpeechBlob, playAudioBlob } from './lib/elevenlabs'
import { streamLessonPipeline, emojiForTopic } from './lib/lessonApi'
import { requestMotion, MOTION_PROMPTS, generateProceduralMotion } from './lib/motionApi'

const MDM_TEST_ACTIONS = [
  { label: 'Wave', prompt: MOTION_PROMPTS.wave },
  { label: 'Point', prompt: MOTION_PROMPTS.point },
  { label: 'Open', prompt: MOTION_PROMPTS.open },
  { label: 'Emphasize', prompt: MOTION_PROMPTS.emphasize },
  { label: 'Jump', prompt: 'a person bends their knees and jumps up into the air and lands back down' },
  { label: 'Rest', prompt: MOTION_PROMPTS.rest },
]

const NUMBER_WORDS = {
  zero: '0',
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  ten: '10',
  eleven: '11',
  twelve: '12',
  thirteen: '13',
  fourteen: '14',
  fifteen: '15',
  sixteen: '16',
  seventeen: '17',
  eighteen: '18',
  nineteen: '19',
  twenty: '20',
}

const INITIAL_TOPIC = { label: 'Elementary math', emoji: '🔢' }
const REST_GESTURE = { motion: 'rest', hand: 'both' }

function MDMTestPanel({ onFrames, disabled }) {
  const [busy, setBusy] = useState(null)
  const [lastMode, setLastMode] = useState(null)

  async function run(label, prompt) {
    if (busy) return
    setBusy(label)
    try {
      const data = await requestMotion(prompt, 80)
      setLastMode(data.mode)
      onFrames(data.frames)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mdm-test-panel">
      <p className="mdm-test-title">MDM Test</p>
      <div className="mdm-test-grid">
        {MDM_TEST_ACTIONS.map(({ label, prompt }) => (
          <button
            key={label}
            className={`mdm-test-btn${busy === label ? ' mdm-test-btn--busy' : ''}`}
            disabled={!!busy || disabled}
            onClick={() => run(label, prompt)}
          >
            {busy === label ? '...' : label}
          </button>
        ))}
      </div>
      {lastMode && (
        <p className="mdm-test-mode">
          {lastMode.startsWith('procedural') ? 'local fallback' : 'MDM server'}
        </p>
      )}
    </div>
  )
}

function segmentMotionKey(seg, index) {
  return String(seg?.id != null ? seg.id : `segment-${index}`)
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function normalizeAnswerText(text) {
  let value = String(text || '').toLowerCase().trim()
  value = value.replace(/\b(it is|it's|the answer is|answer is|i think|maybe|um|uh|so)\b/g, ' ')
  value = value.replace(/[^\w\s/.-]+/g, ' ')
  value = value.replace(/\s+/g, ' ').trim()
  if (NUMBER_WORDS[value]) return NUMBER_WORDS[value]
  return value
}

function answersMatch(actual, expected) {
  const a = normalizeAnswerText(actual)
  const e = normalizeAnswerText(expected)
  if (!a || !e) return false
  if (a === e) return true
  const aNum = Number(a)
  const eNum = Number(e)
  if (!Number.isNaN(aNum) && !Number.isNaN(eNum)) return aNum === eNum
  return a.replace(/\s+/g, '') === e.replace(/\s+/g, '')
}

function BaymaxExperience() {
  const [aiState, setAiState] = useState(null)
  const [aiError, setAiError] = useState('')
  const aiAudioLevelsRef = useRef([])
  const [aiAudioActive, setAiAudioActive] = useState(false)
  const [topicDisplay, setTopicDisplay] = useState(INITIAL_TOPIC)
  const [playGesture, setPlayGesture] = useState(REST_GESTURE)
  const [currentMotionFrames, setCurrentMotionFrames] = useState(() =>
    generateProceduralMotion(MOTION_PROMPTS.wave, 96).frames
  )
  const [messages, setMessages] = useState([
    {
      id: 1,
      from: 'ai',
      text: "I'm your voice-first math tutor. Ask a math question with the mic, and we'll work through it together.",
    },
  ])

  const pipelineResultRef = useRef(null)
  const segmentMotionsRef = useRef({})
  const awaitingUserRef = useRef(null)

  const speakAiText = useCallback(async (text) => {
    const spokenText = String(text || '').trim()
    if (!spokenText) return
    const audioBlob = await textToSpeechBlob(spokenText)
    await playAudioBlob(audioBlob, {
      onStart: () => {
        aiAudioLevelsRef.current = []
        setAiAudioActive(true)
      },
      onLevels: (levels) => {
        aiAudioLevelsRef.current = Array.isArray(levels) ? levels : []
      },
      onEnd: () => {
        aiAudioLevelsRef.current = []
        setAiAudioActive(false)
      },
    })
  }, [])

  const deliverAiMessage = useCallback(
    async (text) => {
      const spokenText = String(text || '').trim()
      if (!spokenText) return
      setMessages(prev => [...prev, { id: Date.now() + Math.random(), from: 'ai', text: spokenText }])
      setAiError('')
      try {
        await speakAiText(spokenText)
      } catch (error) {
        console.error('ElevenLabs text-to-speech failed:', error)
        const detail = error instanceof Error ? error.message : String(error)
        const normalized = detail.toLowerCase()
        if (normalized.includes('402') || normalized.includes('payment required')) {
          setAiError('TTS unavailable on current ElevenLabs plan.')
        } else {
          setAiError(detail || 'Text-to-speech failed.')
        }
        await delay(2800)
      }
    },
    [speakAiText]
  )

  const setMotionForSegment = useCallback((result, segmentId) => {
    const segments = result?.lessonPlan?.segments || []
    const gestures = result?.gesturePlan?.gestures || []
    const seg = segments.find(item => String(item.id) === String(segmentId))
    const gesture = gestures.find(item => String(item.segmentId) === String(segmentId))

    setPlayGesture({
      motion: gesture?.motion || 'emphasize',
      hand: gesture?.hand || 'right',
    })

    let frames = segmentMotionsRef.current[String(segmentId)]
    if (!frames?.length && seg) {
      const prompt = gesture?.mdmPrompt || MOTION_PROMPTS[gesture?.motion] || MOTION_PROMPTS.rest
      frames = generateProceduralMotion(prompt, 80).frames
    }
    setCurrentMotionFrames(frames?.length ? frames : generateProceduralMotion(MOTION_PROMPTS.wave, 96).frames)
  }, [])

  const speakSegment = useCallback(
    async (segmentId, text) => {
      const result = pipelineResultRef.current
      if (result) setMotionForSegment(result, segmentId)
      setAiState('speaking')
      await deliverAiMessage(text)
    },
    [deliverAiMessage, setMotionForSegment]
  )

  const waitForUserAnswer = useCallback(() => {
    setAiState('awaiting_user')
    return new Promise(resolve => {
      awaitingUserRef.current = resolve
    })
  }, [])

  const askQuestionWithRetries = useCallback(
    async ({
      segmentId,
      question,
      expectedAnswer,
      successMessage,
      failureMessage,
      hint,
      maxTries,
      revealOnFailure = true,
    }) => {
      for (let attempt = 1; attempt <= maxTries; attempt++) {
        await speakSegment(segmentId, attempt === 1 ? question : `Try again: ${question}`)
        const answer = await waitForUserAnswer()
        if (answersMatch(answer, expectedAnswer)) {
          await speakSegment(segmentId, successMessage || 'Correct. Nice job.')
          return true
        }

        const isLastTry = attempt === maxTries
        if (isLastTry) {
          if (revealOnFailure) {
            await speakSegment(segmentId, `That's incorrect. The answer is ${expectedAnswer}.`)
          } else {
            await speakSegment(segmentId, failureMessage || "That's incorrect.")
          }
          return false
        }

        await speakSegment(segmentId, failureMessage || "That's not quite right.")
        if (hint) await speakSegment(segmentId, hint)
      }

      return false
    },
    [speakSegment, waitForUserAnswer]
  )

  const runWorkedExample = useCallback(
    async ({ workedExample, introSegmentId, checkpointPrefix }) => {
      await speakSegment(introSegmentId, `Let's work through ${workedExample.problem} together.`)
      const steps = workedExample.steps || []
      const checkpoints = workedExample.checkpoints || []

      for (let i = 0; i < steps.length; i++) {
        await speakSegment(introSegmentId, steps[i])
        if (checkpoints[i]) {
          await askQuestionWithRetries({
            segmentId: `${checkpointPrefix}${i + 1}`,
            question: checkpoints[i].question,
            expectedAnswer: checkpoints[i].expectedAnswer,
            successMessage: checkpoints[i].successMessage,
            failureMessage: checkpoints[i].failureMessage,
            hint: checkpoints[i].hint,
            maxTries: 2,
          })
        }
      }
      for (let i = steps.length; i < checkpoints.length; i++) {
        await askQuestionWithRetries({
          segmentId: `${checkpointPrefix}${i + 1}`,
          question: checkpoints[i].question,
          expectedAnswer: checkpoints[i].expectedAnswer,
          successMessage: checkpoints[i].successMessage,
          failureMessage: checkpoints[i].failureMessage,
          hint: checkpoints[i].hint,
          maxTries: 2,
        })
      }
      if (workedExample.answer) {
        await speakSegment(introSegmentId, `So the answer to ${workedExample.problem} is ${workedExample.answer}.`)
      }
    },
    [askQuestionWithRetries, speakSegment]
  )

  const generateSegmentMotions = useCallback(async (result) => {
    const segments = result?.lessonPlan?.segments || []
    const gestures = result?.gesturePlan?.gestures || []
    segmentMotionsRef.current = {}

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]
      const key = segmentMotionKey(seg, i)
      const gesture = gestures.find(item => String(item.segmentId) === String(seg.id)) || gestures[i]
      const prompt = gesture?.mdmPrompt || MOTION_PROMPTS[gesture?.motion] || MOTION_PROMPTS.rest
      try {
        const data = await requestMotion(prompt, 80)
        segmentMotionsRef.current[key] = data.frames
      } catch {
        segmentMotionsRef.current[key] = generateProceduralMotion(prompt, 80).frames
      }
    }
  }, [])

  const runTutorSession = useCallback(
    async (questionText) => {
      pipelineResultRef.current = null
      setAiState('intake')

      let result
      try {
        result = await streamLessonPipeline(questionText, {
          onEvent: evt => {
            if (evt.stage === 'intake') setAiState('topic')
            if (evt.stage === 'topic' && evt.data?.topicTitle) {
              setTopicDisplay({
                label: evt.data.topicTitle,
                emoji: emojiForTopic(evt.data.topicTitle),
              })
              setAiState('objectives')
            }
            if (evt.stage === 'objectives') setAiState('lesson_plan')
            if (evt.stage === 'lessonPlan') setAiState('gestures')
            if (evt.stage === 'gestures') setAiState('visual_model')
          },
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const normalized = message.toLowerCase()
        let friendly = message
        if (normalized.includes('429') || normalized.includes('quota') || normalized.includes('billing')) {
          friendly = 'OpenAI quota exceeded — add credits at platform.openai.com/billing'
        } else if (normalized.includes('401') || normalized.includes('invalid') || normalized.includes('api key')) {
          friendly = 'OpenAI API key is invalid — check OPENAI_API_KEY in .env'
        }
        setAiError(friendly)
        setMessages(prev => [...prev, { id: Date.now() + Math.random(), from: 'ai', text: `Pipeline error: ${friendly}` }])
        setAiState(null)
        await delay(4000)
        setAiError('')
        return
      }

      if (!result) {
        setMessages(prev => [
          ...prev,
          {
            id: Date.now() + Math.random(),
            from: 'ai',
            text: 'Lesson pipeline finished without a result. Is the dev server running?',
          },
        ])
        setAiState(null)
        return
      }

      setAiState('building')
      pipelineResultRef.current = result
      await generateSegmentMotions(result)

      const plan = result.lessonPlan || {}
      const intro = `${plan.conceptSummary?.restatedPrompt || ''} ${plan.conceptSummary?.briefExplanation || ''}`.trim()
      await speakSegment('seg-intro', intro)
      await runWorkedExample({
        workedExample: plan.workedExample || { steps: [], checkpoints: [] },
        introSegmentId: 'seg-example',
        checkpointPrefix: 'seg-checkpoint-',
      })

      const targetPrompt = plan.targetQuestion?.prompt || questionText
      const targetAnswer = plan.targetQuestion?.answer
      const successMessage = plan.targetQuestion?.successMessage || 'Correct. Nice job â€” you got it right.'
      const failureMessage = plan.targetQuestion?.failureMessage || "That's incorrect."

      const firstTryCorrect = await askQuestionWithRetries({
        segmentId: 'seg-final-question',
        question: `Now you try: what is ${targetPrompt}?`,
        expectedAnswer: targetAnswer,
        successMessage,
        failureMessage,
        hint: '',
        maxTries: 1,
        revealOnFailure: false,
      })

      if (firstTryCorrect) {
        await speakSegment('seg-final-question', plan.targetQuestion?.successMessage || 'Correct. Nice job — you got it right.')
        setAiState(null)
        setCurrentMotionFrames(generateProceduralMotion(MOTION_PROMPTS.wave, 96).frames)
        return
      }

      await speakSegment(
        'seg-final-question',
        plan.targetQuestion?.failureMessage || "That's incorrect. Let's try it a different way."
      )
      await speakSegment('seg-retry-intro', plan.retryPlan?.alternateExplanation || 'Let’s try a different way.')
      await runWorkedExample({
        workedExample: plan.retryPlan?.workedExample || { steps: [], checkpoints: [] },
        introSegmentId: 'seg-retry-example',
        checkpointPrefix: 'seg-retry-checkpoint-',
      })
      const secondTryCorrect = await askQuestionWithRetries({
        segmentId: 'seg-retry-final',
        question: `Try the original question again: what is ${targetPrompt}?`,
        expectedAnswer: targetAnswer,
        successMessage,
        failureMessage,
        hint: 'Think about the example we just solved, then try once more.',
        maxTries: 1,
        revealOnFailure: false,
      })
      if (!secondTryCorrect) {

        await speakSegment('seg-retry-final', "That's still incorrect. Let's do one last try.")
        const thirdTryCorrect = await askQuestionWithRetries({
          segmentId: 'seg-retry-final',
          question: `One last try: what is ${targetPrompt}?`,
          expectedAnswer: targetAnswer,
          successMessage,
          failureMessage,
          hint: '',
          maxTries: 1,
        })
        if (!thirdTryCorrect) {
        await speakSegment('seg-retry-final', plan.targetQuestion?.successMessage || 'Correct. Nice job — you got it right.')
      } else {
        await speakSegment(
          'seg-retry-final',
          `That's still incorrect. Good effort. The answer is ${plan.targetQuestion?.answer || 'that final value'}.`
        )
      }

      setAiState(null)
      setCurrentMotionFrames(generateProceduralMotion(MOTION_PROMPTS.wave, 96).frames)
    },
    [generateSegmentMotions, runWorkedExample, speakSegment, waitForUserAnswer]
  )

  const handleUserInput = useCallback(
    async (text) => {
      const spokenText = String(text || '').trim()
      if (!spokenText) return

      setMessages(prev => [...prev, { id: Date.now() + Math.random(), from: 'user', text: spokenText }])

      if (awaitingUserRef.current) {
        const resolve = awaitingUserRef.current
        awaitingUserRef.current = null
        resolve(spokenText)
        return
      }

      if (aiState !== null) return
      setAiError('')
      await runTutorSession(spokenText)
    },
    [aiState, runTutorSession]
  )

  useEffect(() => {
    return () => {
      if (awaitingUserRef.current) {
        awaitingUserRef.current('')
        awaitingUserRef.current = null
      }
    }
  }, [])

  const inputLocked = aiState !== null && aiState !== 'awaiting_user'

  return (
    <div className="app-root">
      <CharacterScene
        aiState={aiState}
        motionFrames={currentMotionFrames}
        audioLevelsRef={aiAudioLevelsRef}
        audioActive={aiAudioActive || aiState === 'speaking'}
      />

      <div className="edge-bloom edge-bloom-left" />
      <div className="edge-bloom edge-bloom-right" />

      <Skyline />
      <HistorySidebar />

      <AIStatus state={aiError ? 'error' : aiState} message={aiError} />
      <PipelineProgress state={aiError ? null : aiState} />
      <MDMTestPanel onFrames={frames => setCurrentMotionFrames(frames)} disabled={aiState !== null} />
      <TopicCard topic={topicDisplay} />
      <ChatPanel
        messages={messages}
        onSend={handleUserInput}
        aiState={aiState}
        audioOnly
        inputLocked={inputLocked}
      />
    </div>
  )
}

export default function AppVoice() {
  const [route, setRoute] = useState(() => window.location.hash || '#/')

  useEffect(() => {
    const syncRoute = () => setRoute(window.location.hash || '#/')
    window.addEventListener('hashchange', syncRoute)
    return () => window.removeEventListener('hashchange', syncRoute)
  }, [])

  if (route === '#/baymax') {
    return <BaymaxExperience />
  }

  return <LandingPage />
}
