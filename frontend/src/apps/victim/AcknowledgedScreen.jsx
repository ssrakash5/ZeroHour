import { CheckCircle2, MapPin, ShieldCheck, Waves } from 'lucide-react'

const TRACK_STEPS = [
  { key: 'received', label: 'Received by hub' },
  { key: 'triaged', label: 'Triage complete' },
  { key: 'assigned', label: 'Responder assigned' },
  { key: 'route', label: 'Tracking route' },
]

export default function AcknowledgedScreen({ result, onReset }) {
  const sos = result?.sos
  const assignment = result?.assignment
  const triage = result?.triage
  const responderName = assignment?.responder_name ?? 'Responder team'
  const responderCode = assignment?.responder_code ?? 'Hub'
  const responderRole = assignment?.responder_role ?? 'dispatch'
  const responderSector = assignment?.responder_sector ?? 'local'
  const eta = assignment?.eta_minutes
  const distance = assignment?.distance_m

  return (
    <div className="fade-in flex h-full flex-col bg-cream">
      <div className="flex items-center justify-between px-4 pb-1 pt-3">
        <span className="flex items-center gap-1.5 text-xs font-medium text-green-600">
          <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
          tracking live
        </span>
        <span className="font-mono text-xs text-gray-400">{sos?.victim_code ?? 'V-2891'}</span>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pt-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-relay">
          Packet {sos?.packet_code ?? 'sent'}
        </p>
        <h1 className="mb-2 mt-1 text-[30px] font-extrabold leading-tight text-gray-900">
          Rescue is now being tracked.
        </h1>
        <p className="mb-5 text-sm leading-relaxed text-gray-500">
          Once a team is assigned, this screen shows the handoff and route status.
        </p>

        <div className="mb-4 rounded-xl border border-relay/20 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-relay/10">
              <ShieldCheck size={22} className="text-relay" strokeWidth={2} />
            </div>
            <div>
              <p className="text-[15px] font-bold text-gray-900">
                {responderCode} - {responderName}
              </p>
              <p className="text-xs text-gray-400">
                {assignment ? `${responderRole} - sector ${responderSector}` : 'Awaiting responder assignment'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 border-t border-gray-100 pt-4">
            <div>
              <p className="mb-0.5 text-[10px] uppercase tracking-widest text-gray-400">ETA</p>
              <p className="text-2xl font-extrabold text-gray-900">
                {eta ?? '--'} <span className="text-base font-semibold text-gray-400">min</span>
              </p>
            </div>
            <div>
              <p className="mb-0.5 text-[10px] uppercase tracking-widest text-gray-400">Distance</p>
              <p className="text-2xl font-extrabold text-gray-900">
                {distance ?? '--'} <span className="text-base font-semibold text-gray-400">m</span>
              </p>
            </div>
          </div>
        </div>

        <div className="mb-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Waves size={16} className="text-relay" />
            <p className="text-[10px] uppercase tracking-widest text-gray-400">Tracking status</p>
          </div>
          <div className="space-y-3">
            {TRACK_STEPS.map((step, index) => {
              const active = assignment ? true : index < 2
              return (
                <div key={step.key} className="flex items-center gap-3">
                  <div className={`flex h-7 w-7 items-center justify-center rounded-full border ${
                    active ? 'border-relay bg-relay/10 text-relay' : 'border-gray-200 text-gray-300'
                  }`}
                  >
                    <CheckCircle2 size={14} />
                  </div>
                  <div className="flex-1">
                    <p className={`text-sm font-semibold ${active ? 'text-gray-900' : 'text-gray-400'}`}>
                      {step.label}
                    </p>
                    <p className="text-[11px] text-gray-400">
                      {step.key === 'route' && assignment
                        ? 'Responder route is now attached to your request.'
                        : step.key === 'assigned' && assignment
                          ? `${responderCode} accepted this request.`
                          : active
                            ? 'Completed'
                            : 'Waiting'}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="mb-3 text-[10px] uppercase tracking-widest text-gray-400">What the hub has</p>
          <div className="space-y-2.5">
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <CheckCircle2 size={17} className="text-green-500" />
              Status: {assignment ? 'assigned and tracked' : sos?.status ?? 'submitted'}
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <MapPin size={17} className="text-relay" />
              {sos ? `${Number(sos.lat).toFixed(5)}, ${Number(sos.lng).toFixed(5)}` : 'Location attached'}
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <CheckCircle2 size={17} className="text-green-500" />
              Photos: {sos?.has_image ? 'attached' : 'not attached'}
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <CheckCircle2 size={17} className="text-green-500" />
              Voice note: {sos?.has_audio ? 'attached' : 'not attached'}
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <CheckCircle2 size={17} className="text-green-500" />
              AI triage: {(triage?.severity ?? sos?.severity) || 'pending'} / {(triage?.emergency_type ?? sos?.emergency_type) || 'pending'}
            </div>
          </div>

          {(triage?.reason || assignment?.ai_reason) && (
            <div className="mt-3 border-t border-gray-100 pt-3 space-y-2">
              {triage?.reason && (
                <p className="text-xs text-gray-500">
                  <span className="font-semibold text-gray-700">Criticality reasoning:</span> {triage.reason}
                </p>
              )}
              {assignment?.ai_reason && (
                <p className="text-xs italic text-gray-400">
                  {assignment.ai_reason}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="mt-4 rounded-xl border border-gray-200 bg-white/60 p-4">
          <p className="mb-2 text-[10px] uppercase tracking-widest text-gray-400">While you wait</p>
          <p className="text-sm leading-relaxed text-gray-700">
            Stay where you are if it is safe. Keep the phone nearby and visible so updates remain tied to this request.
          </p>
        </div>
      </div>

      <div className="px-6 pb-6 pt-4">
        <button
          onClick={onReset}
          className="w-full rounded-xl border border-gray-200 bg-white/70 py-3 text-sm font-medium text-gray-500"
        >
          Start another request
        </button>
      </div>
    </div>
  )
}
