import { useState } from 'react'
import { X, ShieldCheck, AlertTriangle } from 'lucide-react'
import { api } from '../../api'

const SEV_COLOR = { critical: '#E84040', urgent: '#F59E0B', low: '#6B7A8D' }

export default function ManualDispatchModal({ sos, responders, onClose, onDispatched }) {
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const available = responders.filter(r => r.status === 'available')

  const handleDispatch = async () => {
    if (!selected) return
    setLoading(true)
    setError(null)
    try {
      await api.manualDispatch(sos.id, selected.code)
      onDispatched({ sos, responder: selected })
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Scrim */}
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-ops-card border border-ops-border rounded-2xl w-full max-w-md shadow-2xl fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-ops-border">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-0.5">Manual Dispatch Override</p>
            <p className="text-base font-bold text-white">{sos.victim_code} · {sos.emergency_type}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* SOS summary */}
        <div className="px-5 py-3 border-b border-ops-border">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white uppercase"
              style={{ backgroundColor: SEV_COLOR[sos.severity] || '#666' }}
            >
              {sos.severity}
            </span>
            <span className="text-xs font-mono text-gray-500">{sos.packet_code}</span>
          </div>
          <p className="text-sm text-gray-300">{sos.message || 'No message'}</p>
        </div>

        {/* Warning */}
        <div className="mx-5 mt-4 flex items-start gap-2 px-3 py-2.5 rounded-xl bg-urgent/10 border border-urgent/30">
          <AlertTriangle size={14} className="text-urgent shrink-0 mt-0.5" />
          <p className="text-xs text-urgent">
            Manual dispatch overrides AI assignment. You are accountable for this decision.
          </p>
        </div>

        {/* Responder selection */}
        <div className="px-5 py-4">
          <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-3">
            Select responder ({available.length} available)
          </p>

          {available.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-4">No available responders right now.</p>
          )}

          <div className="space-y-2 max-h-56 overflow-y-auto">
            {available.map(r => (
              <button
                key={r.id}
                onClick={() => setSelected(r)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors text-left ${
                  selected?.id === r.id
                    ? 'border-relay bg-relay/10'
                    : 'border-ops-border hover:border-gray-500'
                }`}
              >
                <div className="w-8 h-8 rounded-full bg-relay/10 flex items-center justify-center shrink-0">
                  <ShieldCheck size={14} className="text-relay" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-white font-mono">{r.code} · {r.name}</p>
                  <p className="text-xs text-gray-500">{r.role} · Sector {r.sector} · {r.battery}% battery</p>
                </div>
                {selected?.id === r.id && (
                  <div className="w-4 h-4 rounded-full bg-relay flex items-center justify-center shrink-0">
                    <div className="w-2 h-2 rounded-full bg-ops" />
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="px-5 pb-2 text-xs text-red-400 font-mono">{error}</p>}

        {/* Actions */}
        <div className="flex gap-3 px-5 pb-5">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-ops-border text-sm text-gray-400 font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleDispatch}
            disabled={!selected || loading}
            className="flex-[2] py-3 rounded-xl bg-relay text-ops text-sm font-bold disabled:opacity-40"
          >
            {loading ? 'Dispatching…' : `Dispatch ${selected?.code || '—'}`}
          </button>
        </div>
      </div>
    </div>
  )
}
