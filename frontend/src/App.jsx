import { useState } from 'react'
// import VictimApp from './apps/victim/VictimApp'
import ResponderApp from './apps/responder/ResponderApp'
import SupervisorApp from './apps/supervisor/SupervisorApp'
import { /* BellRing, */ ShieldCheck, Monitor, ArrowLeft } from 'lucide-react'

const PHONE_W = 390
const PHONE_H = 760

function PhoneFrame({ children }) {
  return (
    <div
      className="relative rounded-[48px] overflow-hidden shadow-2xl"
      style={{
        width: PHONE_W,
        height: PHONE_H,
        maxHeight: '85vh',
        background: '#F5F1EB',
        border: `2px solid #E5E0D8`,
        boxShadow: '0 32px 64px rgba(0,0,0,0.15)',
      }}
    >
      <div className="h-full overflow-hidden">{children}</div>
    </div>
  )
}

function BackButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
    >
      <ArrowLeft size={14} /> Back
    </button>
  )
}

export default function App() {
  const [role, setRole] = useState(null)

  if (role === 'responder') {
    return (
      <div className="min-h-screen bg-[#06080F] flex flex-col items-center justify-center gap-6 p-4">
        <BackButton onClick={() => setRole(null)} />
        <PhoneFrame><ResponderApp /></PhoneFrame>
        <p className="text-xs text-gray-600 font-mono">RESPONDER · FIELD PAPER</p>
      </div>
    )
  }

  if (role === 'supervisor') {
    return (
      <div className="min-h-screen bg-[#06080F] flex flex-col supervisor-theme text-white">
        <div className="px-4 pt-3 pb-2">
          <BackButton onClick={() => setRole(null)} />
        </div>
        <SupervisorApp />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#06080F] flex flex-col items-center justify-center px-6">
      <div className="mb-2">

        <span className="font-mono text-xs tracking-[0.3em] text-relay uppercase">Disaster Response</span>
      </div>
      <h1 className="text-5xl font-black text-white mb-1">ZeroHour</h1>
      <p className="text-gray-500 text-sm mb-14 font-mono">AI-coordinated mesh rescue</p>

      <div className="flex flex-col sm:flex-row gap-4 w-full max-w-lg">
        {/* Victim card hidden — use the Flutter app instead
          {
            id: 'victim',
            label: 'Victim',
            sub: 'Send SOS · calm light',
            Icon: BellRing,
            iconColor: 'text-red-400',
            iconBg: 'bg-red-500/10 group-hover:bg-red-500/20',
            border: 'hover:border-red-500/30',
          },
        */}
        {[
          {
            id: 'responder',
            label: 'Responder',
            sub: 'Triage · dispatch · ops dark',
            Icon: ShieldCheck,
            iconColor: 'text-relay',
            iconBg: 'bg-relay/10 group-hover:bg-relay/20',
            border: 'hover:border-relay/40',
          },
          {
            id: 'supervisor',
            label: 'Supervisor',
            sub: 'Live dashboard · all events',
            Icon: Monitor,
            iconColor: 'text-purple-400',
            iconBg: 'bg-purple-500/10 group-hover:bg-purple-500/20',
            border: 'hover:border-purple-500/30',
          },
        ].map(({ id, label, sub, Icon, iconColor, iconBg, border }) => (
          <button
            key={id}
            onClick={() => setRole(id)}
            className={`flex-1 flex flex-col items-center gap-3 p-6 rounded-2xl border border-gray-800 bg-[#0A0E14] transition-colors group ${border}`}
          >
            <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${iconBg}`}>
              <Icon size={22} className={iconColor} />
            </div>
            <div className="text-center">
              <p className="text-white font-semibold">{label}</p>
              <p className="text-gray-600 text-xs mt-0.5">{sub}</p>
            </div>
          </button>
        ))}
      </div>

      <p className="mt-12 text-[10px] font-mono text-gray-700 tracking-widest">
        POWERED BY GEMMA 4 · EDGE AI · MESH NETWORK
      </p>
    </div>
  )
}
