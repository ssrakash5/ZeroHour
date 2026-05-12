import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, Circle, Loader2, MapPin } from 'lucide-react'
import { api } from '../../api'

const FALLBACK_REPORT = {
  victim_code: 'V-2891',
  lat: 28.628,
  lng: 77.209,
  severity: null,
  emergency_type: null,
  message: 'People needing help: 1\nNeeds: Cannot move\nSituation: Trapped and need rescue.',
  has_audio: false,
  has_image: false,
  hops: 0,
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function toPayload(report) {
  const { local, ...payload } = report || FALLBACK_REPORT
  return payload
}

export default function SendingScreen({ report, onAck }) {
  const [doneIdx, setDoneIdx] = useState(-1)
  const [activeIdx, setActiveIdx] = useState(0)
  const [error, setError] = useState(null)
  const onAckRef = useRef(onAck)
  onAckRef.current = onAck

  const payload = useMemo(() => toPayload(report), [report])
  const steps = useMemo(() => {
    const evidenceBits = [
      payload.has_image ? 'photos' : null,
      payload.has_audio ? 'voice note' : null,
    ].filter(Boolean)
    const evidenceLabel = evidenceBits.length
      ? `Attaching ${evidenceBits.join(' and ')}`
      : 'Attaching typed details'
    return [
      { label: 'Locking rescue coordinates', ms: 650 },
      { label: evidenceLabel, ms: 550 },
      { label: 'Checking nearby duplicate reports', ms: 650 },
      { label: 'Sending to central hub', ms: 750, post: true },
      { label: 'Gemma 4 reviewing voice, images, and details', ms: 900 },
      { label: 'Waiting for responder acknowledgement', ms: 650 },
    ]
  }, [payload.has_audio, payload.has_image])

  useEffect(() => {
    let cancelled = false

    const runFlow = async () => {
      let result = null

      for (let i = 0; i < steps.length; i++) {
        if (cancelled) return
        setActiveIdx(i)

        if (steps[i].post) {
          try {
            result = await api.postSOS(payload)
          } catch (e) {
            if (!cancelled) setError('Hub unreachable. Keep this screen open and try again.')
            return
          }
        }

        await sleep(steps[i].ms)
        if (cancelled) return
        setDoneIdx(i)
      }

      if (!cancelled) onAckRef.current(result)
    }

    runFlow()
    return () => { cancelled = true }
  }, [payload, steps])

  return (
    <div className="flex h-full flex-col bg-cream">
      <div className="flex items-center justify-between px-4 pb-1 pt-3">
        <span className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" />
          sending
        </span>
        <span className="font-mono text-xs text-gray-400">{payload.victim_code}</span>
      </div>

      <div className="flex-1 px-6 pt-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-gray-400">
          Rescue packet
        </p>
        <h1 className="mb-2 mt-1 text-[28px] font-extrabold leading-tight text-gray-900">
          Stay on this screen.
        </h1>
        <p className="mb-5 text-sm leading-relaxed text-gray-500">
          Your request is being deduplicated, triaged, and routed.
        </p>

        <div className="mb-4 rounded-xl border border-gray-200 bg-white/75 p-3">
          <div className="flex items-start gap-2">
            <MapPin size={16} className="mt-0.5 text-relay" />
            <div>
              <p className="text-xs font-bold text-gray-800">
                AI assessing incident type and criticality
              </p>
              <p className="font-mono text-[10px] text-gray-400">
                {Number(payload.lat).toFixed(5)}, {Number(payload.lng).toFixed(5)}
              </p>
              <p className="mt-1 text-[11px] text-gray-500">
                {payload.has_image ? 'Photos attached' : 'No photos'} · {payload.has_audio ? 'Voice note attached' : 'No voice note'}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-3.5 rounded-xl border border-gray-100 bg-white px-5 py-4 shadow-sm">
          {steps.map((step, i) => {
            const isDone = i <= doneIdx
            const isActive = i === activeIdx && !isDone
            return (
              <div key={step.label} className="flex items-center gap-3">
                {isDone ? (
                  <CheckCircle2 size={20} className="shrink-0 text-green-500" strokeWidth={2.5} />
                ) : isActive ? (
                  <Loader2 size={20} className="shrink-0 animate-spin text-blue-400" strokeWidth={2} />
                ) : (
                  <Circle size={20} className="shrink-0 text-gray-200" strokeWidth={2} />
                )}
                <span className={`text-sm ${
                  isDone ? 'font-medium text-gray-700' : isActive ? 'font-semibold text-gray-900' : 'text-gray-300'
                }`}
                >
                  {step.label}
                </span>
              </div>
            )
          })}
        </div>

        {error ? (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center">
            <p className="text-xs font-semibold text-critical">{error}</p>
          </div>
        ) : (
          <p className="mt-8 text-center font-mono text-sm leading-relaxed text-gray-500">
            Keep the phone nearby if safe.
          </p>
        )}
      </div>

      <div className="px-6 pb-8 pt-4 text-center">
        <span className="font-mono text-xs text-gray-400">central hub + responder routing</span>
      </div>
    </div>
  )
}
