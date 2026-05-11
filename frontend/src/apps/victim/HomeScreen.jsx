import { useState, useRef, useEffect } from 'react'
import { BellRing } from 'lucide-react'

export default function HomeScreen({ onSend }) {
  const [holding, setHolding] = useState(false)
  const [progress, setProgress] = useState(0)
  const timerRef = useRef(null)
  const startRef = useRef(null)
  const HOLD_MS = 1500

  const startHold = () => {
    setHolding(true)
    startRef.current = Date.now()
    timerRef.current = setInterval(() => {
      const pct = Math.min((Date.now() - startRef.current) / HOLD_MS, 1)
      setProgress(pct)
      if (pct >= 1) {
        clearInterval(timerRef.current)
        onSend()
      }
    }, 16)
  }

  const stopHold = () => {
    setHolding(false)
    setProgress(0)
    clearInterval(timerRef.current)
  }

  useEffect(() => () => clearInterval(timerRef.current), [])

  return (
    <div className="flex flex-col h-full bg-cream">
      {/* Status bar */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <span className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
          3 peers · connected
        </span>
        <span className="font-mono text-xs text-gray-400">V-2891</span>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <p className="text-[10px] tracking-[0.2em] text-gray-400 uppercase mb-2 font-mono">
          Relay · Victim
        </p>
        <h1 className="text-[28px] font-extrabold text-gray-900 leading-tight mb-2">
          Hold to send SOS
        </h1>
        <p className="text-sm text-gray-400 mb-14 max-w-[200px] leading-relaxed">
          Audio, photo, location — through the mesh.
        </p>

        {/* SOS Button */}
        <div className="relative flex items-center justify-center mb-14">
          <span className="sos-ring-1 absolute w-44 h-44 rounded-full bg-red-500 opacity-25 pointer-events-none" />
          <span className="sos-ring-2 absolute w-44 h-44 rounded-full bg-red-500 opacity-15 pointer-events-none" />

          {/* Progress ring */}
          <svg className="absolute w-48 h-48 -rotate-90" viewBox="0 0 160 160">
            <circle cx="80" cy="80" r="72" fill="none" stroke="rgba(232,64,64,0.15)" strokeWidth="4" />
            <circle
              cx="80" cy="80" r="72"
              fill="none"
              stroke="#E84040"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 72}`}
              strokeDashoffset={`${2 * Math.PI * 72 * (1 - progress)}`}
              style={{ transition: 'stroke-dashoffset 0.05s linear' }}
            />
          </svg>

          <button
            onPointerDown={startHold}
            onPointerUp={stopHold}
            onPointerLeave={stopHold}
            className="relative w-40 h-40 rounded-full bg-red-500 flex flex-col items-center justify-center text-white shadow-2xl"
            style={{
              transform: holding ? 'scale(0.93)' : 'scale(1)',
              transition: 'transform 0.15s ease',
              boxShadow: holding
                ? '0 0 40px rgba(232,64,64,0.5)'
                : '0 8px 32px rgba(232,64,64,0.35)',
            }}
          >
            <BellRing size={30} strokeWidth={2} />
            <span className="text-lg font-black tracking-[0.2em] mt-1">SOS</span>
          </button>
        </div>

        <p className="text-xs text-gray-400 font-mono">→ hold 1.5 s</p>
      </div>

      {/* Bottom mesh status */}
      <div className="mx-4 mb-5 border border-gray-200 rounded-2xl p-3.5 bg-white/60 backdrop-blur">
        <div className="flex justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-0.5">Mesh</p>
            <p className="text-sm font-bold text-blue-500">3 peers</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-0.5">Offline AI</p>
            <p className="text-sm font-bold text-green-500">ready</p>
          </div>
        </div>
      </div>
    </div>
  )
}
