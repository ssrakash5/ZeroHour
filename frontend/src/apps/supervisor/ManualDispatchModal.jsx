import { useState } from 'react'
import { X, ShieldCheck, AlertTriangle } from 'lucide-react'
import { api } from '../../api'

const SEV_COLOR = { critical: '#E84040', urgent: '#F59E0B', low: '#6B7A8D' }

export default function ManualDispatchModal({ sos, responders, onClose, onDispatched }) {
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const available = responders.filter(r => r.status === 'available')

  // Parse all structured data blocks from the message
  let baseMessage = sos.message || ''
  let summary = baseMessage.split('---STRUCTURED_DATA---')[0].trim()
  let merged = {}
  
  if (baseMessage.includes('---STRUCTURED_DATA---')) {
    const parts = baseMessage.split('---STRUCTURED_DATA---')
    for (let i = 1; i < parts.length; i++) {
      try {
        const jsonMatch = parts[i].match(/({[\s\S]*?})/)
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[1])
          merged = { ...merged, ...parsed }
        }
      } catch (e) {
        // ignore
      }
    }
  }

  const originalMessage = merged.original_transcript || merged.original_message || ''
  const englishTranscript = merged.english_transcript || merged.voice_transcript || ''
  const gemmaStatement = merged.victim_statement || merged.english_summary || summary
  const aiReasoning = merged.reason || ''

  const details = [
    { label: 'Original', value: originalMessage },
    { label: 'English', value: englishTranscript },
    { label: 'Gemma Summary', value: gemmaStatement },
    { label: 'People', value: merged.people_count != null ? String(merged.people_count) : null },
    { label: 'Calamity', value: merged.calamity },
    { label: 'Age', value: merged.age },
    { label: 'Medical', value: merged.medical_conditions },
    { label: 'Quick Needs', value: merged.quick_needs },
    { label: 'Consciousness', value: merged.consciousness_status },
    { label: 'Mobility', value: merged.mobility_status },
    { label: 'Hazards', value: merged.hazards }
  ].filter(f => f.value && f.value !== 'Unknown' && f.value !== 'None')

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
      <div className="relative bg-ops-card border border-ops-border rounded-2xl w-full max-w-md shadow-2xl fade-in overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-ops-border shrink-0">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-0.5">Manual Dispatch Override</p>
            <p className="text-base font-bold text-white">{sos.victim_code} · {sos.emergency_type}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Content Container */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {/* SOS summary */}
          <div className="px-5 py-3 border-b border-ops-border bg-ops-border/10">
            <div className="flex items-center gap-2 mb-2">
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white uppercase"
                style={{ backgroundColor: SEV_COLOR[sos.severity] || '#666' }}
              >
                {sos.severity}
              </span>
              <span className="text-xs font-mono text-gray-500">{sos.packet_code}</span>
            </div>
            
            <div className="space-y-3">
              {originalMessage && (
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-gray-500 font-mono mb-1">Original Transcript</p>
                  <p className="whitespace-pre-wrap text-sm text-gray-300 italic bg-black/20 p-2.5 rounded-lg border border-ops-border/40">"{originalMessage}"</p>
                </div>
              )}
              <div>
                <p className="text-[10px] uppercase tracking-widest text-gray-500 font-mono mb-1">
                  {originalMessage ? 'AI English Summary' : 'Victim Report'}
                </p>
                <p className="whitespace-pre-wrap text-sm text-white font-medium">
                  {gemmaStatement || englishTranscript || summary || 'No message'}
                </p>
              </div>
            </div>
          </div>

          {/* Details Table */}
          {details.length > 0 && (
            <div className="px-5 pt-4">
              <div className="overflow-hidden rounded-xl border border-ops-border bg-ops-card">
                <div className="bg-ops-border/20 px-3 py-2 border-b border-ops-border">
                  <p className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">Extracted Details</p>
                </div>
                <div className="divide-y divide-ops-border/50 text-[10px] font-mono">
                  {details.map((f, i) => (
                    <div key={i} className="grid grid-cols-[120px_minmax(0,1fr)] gap-x-4 px-3 py-2.5">
                      <span className="text-gray-500">{f.label}</span>
                      <span className="text-gray-300 font-semibold leading-snug break-words whitespace-pre-wrap">{f.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Dedicated AI Reasoning Card */}
          {aiReasoning && (
            <div className="px-5 pt-4">
              <div className="overflow-hidden rounded-xl border border-ops-border/30 bg-ops-border/10 p-3">
                <p className="text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-1 flex items-center gap-1">
                  🤖 Gemma-4 AI Reasoning
                </p>
                <p className="text-xs text-gray-300 leading-relaxed italic">"{aiReasoning}"</p>
              </div>
            </div>
          )}

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

            <div className="space-y-2">
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
        </div>

        {error && <p className="px-5 pb-2 text-xs text-red-400 font-mono shrink-0">{error}</p>}

        {/* Actions */}
        <div className="flex gap-3 px-5 pb-5 pt-2 border-t border-ops-border/20 shrink-0">
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
