import { useEffect, useState } from 'react'
import { CheckCircle2, Circle, Loader2 } from 'lucide-react'

const STEPS = [
  { label: 'Recording 5 s of audio', ms: 600 },
  { label: 'Capturing photo', ms: 500 },
  { label: 'Classifying with model', ms: 900 },
  { label: 'Encrypting packet', ms: 400 },
  { label: 'Hop 1 · P-23', ms: 800 },
  { label: 'Hop 2 · P-08', ms: 700 },
  { label: 'Delivered to responder', ms: 300 },
]

export default function SendingScreen({ onAck }) {
  const [done, setDone] = useState(0)
  const [active, setActive] = useState(0)

  useEffect(() => {
    let idx = 0
    const tick = () => {
      if (idx >= STEPS.length) {
        setTimeout(onAck, 400)
        return
      }
      setActive(idx)
      setTimeout(() => {
        setDone(idx + 1)
        idx++
        tick()
      }, STEPS[idx].ms)
    }
    const t = setTimeout(tick, 200)
    return () => clearTimeout(t)
  }, [onAck])

  return (
    <div className="flex flex-col h-full bg-cream">
      {/* Status bar */}
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

        {/* Checklist */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4 space-y-3.5">
          {STEPS.map((step, i) => {
            const isDone = i < done
            const isActive = i === active && !isDone
            const isPending = i > active || (i === active && isDone)

            return (
              <div key={step.label} className="flex items-center gap-3">
                {isDone ? (
                  <CheckCircle2 size={20} className="text-green-500 shrink-0" strokeWidth={2.5} />
                ) : isActive ? (
                  <Loader2 size={20} className="text-blue-400 shrink-0 animate-spin" strokeWidth={2} />
                ) : (
                  <Circle size={20} className="text-gray-200 shrink-0" strokeWidth={2} />
                )}
                <span
                  className={`text-sm ${
                    isDone
                      ? 'text-gray-700 font-medium'
                      : isActive
                      ? 'text-gray-900 font-semibold'
                      : 'text-gray-300'
                  }`}
                >
                  {step.label}
                </span>
              </div>
            )
          })}
        </div>

        <p className="text-center font-mono text-sm text-gray-500 mt-8 leading-relaxed">
          Your phone is the relay. Stay<br />still if you can.
        </p>
      </div>

      <div className="px-6 pb-8 pt-4 text-center">
        <span className="text-xs font-mono text-gray-400">→ delivered + ack</span>
      </div>
    </div>
  )
}
