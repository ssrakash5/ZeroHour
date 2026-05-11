import { ShieldCheck } from 'lucide-react'

export default function AcknowledgedScreen({ result, onReset }) {
  const assignment = result?.assignment
  const responderName = assignment?.responder_name ?? 'A. Kumar'
  const responderCode = assignment?.responder_code ?? 'R-114'
  const responderRole = assignment?.responder_role ?? 'medic'
  const responderSector = assignment?.responder_sector ?? 14
  const eta = assignment?.eta_minutes ?? '—'
  const distance = assignment?.distance_m ?? '—'

  return (
    <div className="flex flex-col h-full bg-cream fade-in">
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <span className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
          acknowledged
        </span>
        <span className="font-mono text-xs text-gray-400">V-2891</span>
      </div>

      <div className="flex-1 flex flex-col px-6 pt-6">
        <p className="text-[10px] tracking-[0.2em] font-mono uppercase mb-1 text-relay">
          Relayed · Acknowledged
        </p>
        <h1 className="text-[32px] font-extrabold text-gray-900 leading-tight mb-2">
          Help is coming.
        </h1>
        <p className="text-sm text-gray-400 mb-6 leading-relaxed">
          {responderCode} acknowledged your packet.<br />Routing now.
        </p>

        {/* Responder card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-full bg-relay/10 flex items-center justify-center">
              <ShieldCheck size={22} className="text-relay" strokeWidth={2} />
            </div>
            <div>
              <p className="font-bold text-gray-900 text-[15px]">
                {responderCode} · {responderName}
              </p>
              <p className="text-xs text-gray-400">
                {responderRole} · sector {responderSector}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 border-t border-gray-100 pt-4">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-0.5">ETA</p>
              <p className="text-2xl font-extrabold text-gray-900">
                {eta} <span className="text-base font-semibold text-gray-400">min</span>
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-0.5">Distance</p>
              <p className="text-2xl font-extrabold text-gray-900">
                {typeof distance === 'number' ? distance : distance}{' '}
                <span className="text-base font-semibold text-gray-400">m</span>
              </p>
            </div>
          </div>

          {assignment?.ai_reason && (
            <p className="text-xs text-gray-400 mt-3 pt-3 border-t border-gray-100 italic">
              "{assignment.ai_reason}"
            </p>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-3">While you wait</p>
          <ul className="space-y-2 text-sm text-gray-700">
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-gray-300">•</span>
              Stay where you are if it is <strong>safe</strong>.
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-gray-300">•</span>
              Keep your <strong>screen on</strong>.
            </li>
          </ul>
        </div>
      </div>

      <div className="px-6 pb-6 pt-4">
        <button
          onClick={onReset}
          className="w-full py-3 rounded-xl border border-gray-200 text-sm text-gray-400 font-medium bg-white/60"
        >
          ← Reset demo
        </button>
      </div>
    </div>
  )
}
