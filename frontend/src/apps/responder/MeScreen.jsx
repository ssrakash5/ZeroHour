import { useState, useEffect } from 'react'
import { Battery, MapPin, Wifi } from 'lucide-react'
import { SELF_CODE } from '../../api'

function Toggle({ checked, onChange }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
        checked ? 'bg-relay' : 'bg-ops-border'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

export default function MeScreen({ responder, onStatusChange, ping, peerCount }) {
  const [onDuty, setOnDuty] = useState(true)
  const [autoCrit, setAutoCrit] = useState(true)
  const [muteNonCrit, setMuteNonCrit] = useState(false)

  // Sync on-duty toggle with real status from backend
  useEffect(() => {
    if (responder?.status) {
      setOnDuty(responder.status !== 'off_duty')
    }
  }, [responder?.status])

  const handleDutyToggle = (val) => {
    setOnDuty(val)
    onStatusChange?.(val ? 'available' : 'off_duty')
  }

  const battery = responder?.battery ?? 100
  const batteryColor = battery > 40 ? '#22C55E' : battery > 20 ? '#F59E0B' : '#E84040'

  return (
    <div className="flex flex-col h-full bg-ops overflow-y-auto">
      {/* Status bar */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1.5">
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="w-1.5 h-1.5 rounded-full bg-relay" />
          <span>{peerCount ?? '—'} peers{ping != null ? ` · ${ping} ms` : ''}</span>
        </div>
        <span className="font-mono text-xs text-relay">{SELF_CODE}</span>
      </div>

      <div className="px-4 pt-3 pb-4">
        <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-0.5">Responder</p>
        {responder ? (
          <>
            <p className="text-3xl font-black text-white">{responder.code} · {responder.name}</p>
            <p className="text-xs text-gray-500 font-mono mt-1">
              {responder.role} · sector {responder.sector}
            </p>
          </>
        ) : (
          <p className="text-xl font-black text-gray-500">Loading…</p>
        )}
      </div>

      {/* Stats grid */}
      <div className="mx-4 grid grid-cols-2 gap-2 mb-3">
        <div className="bg-ops-card border border-ops-border rounded-xl p-3">
          <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Status</p>
          <p className="text-xl font-black text-white capitalize">{responder?.status ?? '—'}</p>
          <p className="text-xs text-gray-500">current state</p>
        </div>
        <div className="bg-ops-card border border-ops-border rounded-xl p-3">
          <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Sector</p>
          <p className="text-2xl font-black text-white">{responder?.sector ?? '—'}</p>
          <div className="flex items-center gap-1 mt-0.5">
            <MapPin size={10} className="text-gray-500" />
            <p className="text-xs text-gray-500 font-mono">
              {responder?.lat != null ? `${responder.lat.toFixed(4)}, ${responder.lng.toFixed(4)}` : 'no GPS'}
            </p>
          </div>
        </div>
        <div className="bg-ops-card border border-ops-border rounded-xl p-3">
          <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Battery</p>
          <div className="flex items-center gap-2 mt-1">
            <Battery size={16} style={{ color: batteryColor }} />
            <p className="text-2xl font-black" style={{ color: batteryColor }}>{battery}%</p>
          </div>
          <p className="text-xs text-gray-500">device charge</p>
        </div>
        <div className="bg-ops-card border border-ops-border rounded-xl p-3">
          <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Hub latency</p>
          <div className="flex items-center gap-2 mt-1">
            <Wifi size={14} className="text-relay" />
            <p className="text-2xl font-black text-white">
              {ping != null ? ping : '—'}
              <span className="text-base font-semibold text-gray-500"> ms</span>
            </p>
          </div>
          <p className="text-xs text-gray-500">{peerCount ?? '—'} other responders</p>
        </div>
      </div>

      {/* Supplies */}
      {responder?.supplies_percent != null && (
        <div className="mx-4 mb-3 bg-ops-card border border-ops-border rounded-xl p-3">
          <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">Supplies</p>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-ops rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-relay transition-all"
                style={{ width: `${responder.supplies_percent}%` }}
              />
            </div>
            <span className="font-mono text-xs text-gray-400">{responder.supplies_percent}%</span>
          </div>
        </div>
      )}

      {/* Status toggles */}
      <div className="mx-4 bg-ops-card border border-ops-border rounded-xl divide-y divide-ops-border">
        <p className="px-4 pt-3 pb-2 text-[10px] uppercase tracking-widest text-gray-500">Preferences</p>
        {[
          { label: 'On duty', value: onDuty, set: handleDutyToggle },
          { label: 'Auto-accept critical', value: autoCrit, set: setAutoCrit },
          { label: 'Mute non-critical', value: muteNonCrit, set: setMuteNonCrit },
        ].map(item => (
          <div key={item.label} className="flex items-center justify-between px-4 py-3">
            <span className={`text-sm font-medium ${item.value ? 'text-white' : 'text-gray-500'}`}>
              {item.label}
            </span>
            <Toggle checked={item.value} onChange={item.set} />
          </div>
        ))}
      </div>

      {!onDuty && (
        <p className="mx-4 mt-2 text-xs text-gray-500 font-mono">Off-duty — removed from dispatch queue.</p>
      )}
      {responder?.status === 'en_route' && (
        <button
          onClick={() => onStatusChange?.('available')}
          className="mx-4 mt-2 py-3 rounded-xl border border-relay/40 text-relay text-sm font-semibold hover:bg-relay/10 transition-colors"
        >
          Mark as available — mission complete
        </button>
      )}

      <div className="h-6" />
    </div>
  )
}
