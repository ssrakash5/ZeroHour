import { useEffect, useState, useCallback } from 'react'
import { api } from '../../api'
import { useWebSocket } from '../../hooks/useWebSocket'

const SEVERITY_STYLES = {
  critical: {
    badge: 'bg-critical text-white',
    card: 'border-critical/40 crit-pulse',
  },
  urgent: {
    badge: 'bg-urgent/90 text-white',
    card: 'border-urgent/30',
  },
  low: {
    badge: 'bg-gray-600 text-white',
    card: 'border-ops-border',
  },
}

function extractField(message, label) {
  const line = (message || '')
    .split('\n')
    .find((entry) => entry.startsWith(`${label}:`))
  return line ? line.slice(label.length + 1).trim() : ''
}

function packetPreview(packet) {
  return (
    extractField(packet.message, 'Voice transcript')
    || extractField(packet.message, 'Situation')
    || packet.message
    || 'No message'
  )
}

export default function TriageScreen({ onSelectPacket }) {
  const [packets, setPackets] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  const fetchQueue = useCallback(async () => {
    try {
      const data = await api.getQueue()
      setPackets(data)
    } catch {
      // backend not up yet
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchQueue() }, [fetchQueue])

  const wsFactory = useCallback(() => api.supervisorWS(), [])
  useWebSocket(wsFactory, (msg) => {
    if (msg.event === 'sos:new') {
      setPackets((prev) => {
        const exists = prev.find((p) => p.id === msg.payload.id)
        if (exists) return prev
        return [msg.payload, ...prev]
      })
    }
    if (msg.event === 'assignment:new') {
      setPackets((prev) =>
        prev.map((p) => (p.id === msg.payload.sos?.id ? { ...p, status: 'assigned' } : p)),
      )
    }
  })

  const filtered = filter === 'all' ? packets : packets.filter((p) => p.severity === filter)
  const critCount = packets.filter((p) => p.severity === 'critical').length
  const urgCount = packets.filter((p) => p.severity === 'urgent').length
  const openCount = packets.filter((p) => p.status === 'pending').length

  return (
    <div className="flex flex-col h-full bg-ops">
      <div className="flex items-center justify-between px-4 pt-3 pb-1.5">
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="w-1.5 h-1.5 rounded-full bg-relay" />
          <span>3 peers - 84 ms</span>
        </div>
        <span className="font-mono text-xs text-relay">R-114</span>
      </div>

      <div className="px-4 pt-3 pb-2">
        <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-0.5">Triage Queue</p>
        <p className="text-4xl font-black text-white">
          {openCount} <span className="text-xl font-semibold text-gray-500">open</span>
        </p>
        <p className="text-xs text-gray-500 mt-1 font-mono">{packets.length} packets - live</p>

        <div className="flex gap-2 mt-3">
          {[
            ['all', `All - ${packets.length}`, 'border-ops-border text-white bg-ops-card'],
            ['critical', `Crit - ${critCount}`, 'border-critical/50 text-critical'],
            ['urgent', `Urg - ${urgCount}`, 'border-urgent/50 text-urgent'],
          ].map(([val, label, cls]) => (
            <button
              key={val}
              onClick={() => setFilter(val)}
              className={`px-2.5 py-1 rounded-full border text-xs font-medium transition-opacity ${cls} ${filter === val ? 'opacity-100' : 'opacity-50'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 space-y-2.5 pb-4">
        {loading && (
          <p className="text-center text-gray-600 text-sm pt-8">Connecting to backend...</p>
        )}
        {!loading && filtered.length === 0 && (
          <p className="text-center text-gray-600 text-sm pt-8">No packets yet.</p>
        )}
        {filtered.map((pkt) => {
          const style = SEVERITY_STYLES[pkt.severity] || SEVERITY_STYLES.low
          return (
            <button
              key={pkt.id}
              onClick={() => onSelectPacket(pkt)}
              className={`w-full text-left bg-ops-card border rounded-2xl p-3.5 ${style.card}`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${style.badge}`}>
                    {pkt.severity}
                  </span>
                  <span className="font-mono text-[10px] text-gray-500">{pkt.packet_code}</span>
                </div>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                  pkt.status === 'assigned' ? 'text-relay bg-relay/10' : 'text-gray-500'
                }`}
                >
                  {pkt.status}
                </span>
              </div>

              <p className="text-sm font-semibold text-white mb-1">
                {pkt.victim_code} - {pkt.emergency_type}
              </p>
              <p className="text-xs text-gray-400 leading-relaxed mb-2 line-clamp-3">
                {packetPreview(pkt)}
                {pkt.model_score ? ` - model ${pkt.model_score}` : ''}
              </p>

              <div className="mb-2 flex flex-wrap gap-1.5">
                {pkt.has_audio && (
                  <span className="rounded-full border border-relay/30 bg-relay/10 px-2 py-0.5 text-[10px] font-mono text-relay">
                    voice
                  </span>
                )}
                {pkt.has_image && (
                  <span className="rounded-full border border-gray-700 bg-black/20 px-2 py-0.5 text-[10px] font-mono text-gray-300">
                    photo
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between text-[10px] font-mono text-gray-500">
                <span>{pkt.hops} hops</span>
                <span>{new Date(pkt.created_at).toLocaleTimeString()}</span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
