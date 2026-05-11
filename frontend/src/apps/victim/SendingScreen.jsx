import { useEffect, useState, useRef } from 'react'
import { CheckCircle2, Circle, Loader2 } from 'lucide-react'
import { api } from '../../api'

// Demo SOS payload — in a real app this comes from GPS + mic + camera
const DEMO_SOS = {
  victim_code: 'V-2891',
  lat: 28.6280,
  lng: 77.2090,
  severity: 'critical',
  emergency_type: 'medical',
  message: 'Trapped — water rising. Two children with me.',
  has_audio: true,
  has_image: true,
  hops: 2,
}

const LOCAL_STEPS = [
  { label: 'Recording 5 s of audio', ms: 700 },
  { label: 'Capturing photo', ms: 500 },
  { label: 'Classifying with model', ms: 900 },
  { label: 'Encrypting packet', ms: 400 },
]

const RELAY_STEPS = [
  { label: 'Hop 1 · P-23' },
  { label: 'Hop 2 · P-08' },
  { label: 'Delivered to responder' },
]

const ALL_STEPS = [...LOCAL_STEPS.map(s => s.label), ...RELAY_STEPS.map(s => s.label)]

export default function SendingScreen({ onAck }) {
  const [doneIdx, setDoneIdx] = useState(-1)
  const [activeIdx, setActiveIdx] = useState(0)
  const [error, setError] = useState(null)
  const onAckRef = useRef(onAck)
  onAckRef.current = onAck

  useEffect(() => {
    let cancelled = false

    const runFlow = async () => {
      // Run local steps sequentially
      for (let i = 0; i < LOCAL_STEPS.length; i++) {
        if (cancelled) return
        setActiveIdx(i)
        await sleep(LOCAL_STEPS[i].ms)
        setDoneIdx(i)
      }

      // Start relay steps — POST to backend while animating hops
      setActiveIdx(LOCAL_STEPS.length) // "Hop 1"

      let result = null
      try {
        result = await api.postSOS(DEMO_SOS)
      } catch (e) {
        if (!cancelled) setError('Backend unreachable. Is the server running?')
        return
      }

      if (cancelled) return

      // Animate remaining relay steps
      for (let i = 0; i < RELAY_STEPS.length; i++) {
        const idx = LOCAL_STEPS.length + i
        setActiveIdx(idx)
        await sleep(600)
        setDoneIdx(idx)
      }

      if (!cancelled) onAckRef.current(result)
    }

    runFlow()
    return () => { cancelled = true }
  }, [])

  return (
    <div className="flex flex-col h-full bg-cream">
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <span className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
          3 peers · relaying
        </span>
        <span className="font-mono text-xs text-gray-400">V-2891</span>
      </div>

      <div className="flex-1 flex flex-col px-6 pt-6">
        <p className="text-[10px] tracking-[0.2em] text-gray-400 uppercase mb-2 font-mono">
          Sending SOS
        </p>
        <h1 className="text-[26px] font-extrabold text-gray-900 leading-tight mb-6">
          Don't put your phone away.
        </h1>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4 space-y-3.5">
          {ALL_STEPS.map((label, i) => {
            const isDone = i <= doneIdx
            const isActive = i === activeIdx && !isDone
            return (
              <div key={label} className="flex items-center gap-3">
                {isDone ? (
                  <CheckCircle2 size={20} className="text-green-500 shrink-0" strokeWidth={2.5} />
                ) : isActive ? (
                  <Loader2 size={20} className="text-blue-400 shrink-0 animate-spin" strokeWidth={2} />
                ) : (
                  <Circle size={20} className="text-gray-200 shrink-0" strokeWidth={2} />
                )}
                <span className={`text-sm ${isDone ? 'text-gray-700 font-medium' : isActive ? 'text-gray-900 font-semibold' : 'text-gray-300'}`}>
                  {label}
                </span>
              </div>
            )
          })}
        </div>

        {error ? (
          <p className="text-center text-xs text-red-400 font-mono mt-6">{error}</p>
        ) : (
          <p className="text-center font-mono text-sm text-gray-500 mt-8 leading-relaxed">
            Your phone is the relay. Stay<br />still if you can.
          </p>
        )}
      </div>

      <div className="px-6 pb-8 pt-4 text-center">
        <span className="text-xs font-mono text-gray-400">→ delivered + ack</span>
      </div>
    </div>
  )
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
