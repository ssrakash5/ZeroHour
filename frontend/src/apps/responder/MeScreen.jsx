import { useState } from 'react'
import { mockResponder } from '../../data/mockData'
import { Battery, MapPin } from 'lucide-react'

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

export default function MeScreen() {
  const r = mockResponder
  const [onDuty, setOnDuty] = useState(true)
  const [autoCrit, setAutoCrit] = useState(true)
  const [muteNonCrit, setMuteNonCrit] = useState(false)

  const batteryColor = r.battery > 40 ? '#22C55E' : r.battery > 20 ? '#F59E0B' : '#E84040'

  return (
    <div className="flex flex-col h-full bg-ops overflow-y-auto">
      {/* Status bar */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1.5">
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="w-1.5 h-1.5 rounded-full bg-relay" />
          <span>3 peers</span>
        </div>
        <span className="font-mono text-xs text-relay">R-114</span>
      </div>

      <div className="px-4 pt-3 pb-4">
        <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-0.5">Responder</p>
        <p className="text-3xl font-black text-white">{r.id} · {r.name}</p>
        <p className="text-xs text-gray-500 font-mono mt-1">
          {r.role} · sector {r.sector} · since {r.onDutyFrom}
        </p>
      </div>

      {/* Stats grid */}
      <div className="mx-4 grid grid-cols-2 gap-2 mb-3">
        <div className="bg-ops-card border border-ops-border rounded-xl p-3">
          <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Today</p>
          <p className="text-2xl font-black text-white">{r.dispatched}</p>
          <p className="text-xs text-gray-500">dispatched · {r.active} active</p>
        </div>
        <div className="bg-ops-card border border-ops-border rounded-xl p-3">
          <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Median ETA</p>
          <p className="text-2xl font-black text-white">{r.medianEta} <span className="text-base font-semibold text-gray-500">min</span></p>
          <p className="text-xs text-gray-500">last 24 h</p>
        </div>
        <div className="bg-ops-card border border-ops-border rounded-xl p-3">
          <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Battery</p>
          <div className="flex items-center gap-2 mt-1">
            <Battery size={16} style={{ color: batteryColor }} />
            <p className="text-2xl font-black" style={{ color: batteryColor }}>{r.battery}%</p>
          </div>
          <p className="text-xs text-gray-500">≈ 4 h field life</p>
        </div>
        <div className="bg-ops-card border border-ops-border rounded-xl p-3">
          <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Sector</p>
          <p className="text-2xl font-black text-white">{r.sector}</p>
          <div className="flex items-center gap-1 mt-0.5">
            <MapPin size={10} className="text-gray-500" />
            <p className="text-xs text-gray-500">{r.location}</p>
          </div>
        </div>
      </div>

      {/* Status toggles */}
      <div className="mx-4 bg-ops-card border border-ops-border rounded-xl divide-y divide-ops-border">
        <p className="px-4 pt-3 pb-2 text-[10px] uppercase tracking-widest text-gray-500">Status</p>
        {[
          { label: 'On duty', value: onDuty, set: setOnDuty },
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
        <p className="mx-4 mt-2 text-xs text-gray-500 font-mono">
          Off-duty = off the queue.
        </p>
      )}

      <div className="h-6" />
    </div>
  )
}
