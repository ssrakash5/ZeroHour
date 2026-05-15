import { useEffect, useState, useCallback } from 'react'
import { api } from '../../api'
import { useWebSocket } from '../../hooks/useWebSocket'

const DEFAULT_SELF = { lat: 9.9312, lng: 76.2673, code: 'R-114' }

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

function getDistanceKm(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2); 
  return (R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))).toFixed(1);
}

function extractField(message, label) {
  const line = (message || '')
    .split('\n')
    .find((entry) => entry.startsWith(`${label}:`))
  return line ? line.slice(label.length + 1).trim() : ''
}

function packetPreview(packet) {
  const message = packet.message || ''
  const baseMessage = message.split('---STRUCTURED_DATA---')[0].trim()
  
  if (message.includes('---STRUCTURED_DATA---')) {
    const parts = message.split('---STRUCTURED_DATA---')
    try {
      for (let i = parts.length - 1; i >= 1; i--) {
        const jsonMatch = parts[i].match(/({[\s\S]*?})/)
        if (jsonMatch) {
          const structuredData = JSON.parse(jsonMatch[1])
          if (structuredData.reason && structuredData.reason !== 'Unknown') {
            return `AI Summary: ${structuredData.reason}`
          }
          break
        }
      }
    } catch (e) {
      // ignore
    }
  }

  return (
    extractField(baseMessage, 'Situation')
    || (baseMessage.length > 80 ? baseMessage.slice(0, 80) + '...' : baseMessage)
    || 'No message'
  )
}

function ExtractedDetailsTable({ packet }) {
  let baseMessage = packet.message || ''
  let structuredData = null
  
  if (baseMessage.includes('---STRUCTURED_DATA---')) {
    const parts = baseMessage.split('---STRUCTURED_DATA---')
    
    try {
      for (let i = parts.length - 1; i >= 1; i--) {
        const jsonMatch = parts[i].match(/({[\s\S]*?})/)
        if (jsonMatch) {
          structuredData = JSON.parse(jsonMatch[1])
          break
        }
      }
    } catch (e) {
      // ignore
    }
  }

  if (!structuredData) return null

  const fields = [
    { label: 'People', value: structuredData.people_count },
    { label: 'Calamity', value: structuredData.calamity },
    { label: 'Age', value: structuredData.age },
    { label: 'Medical', value: structuredData.medical_conditions },
    { label: 'Quick Needs', value: structuredData.quick_needs },
    { label: 'Consciousness', value: structuredData.consciousness_status },
    { label: 'Mobility', value: structuredData.mobility_status },
    { label: 'Hazards', value: structuredData.hazards }
  ].filter(f => f.value && f.value !== 'Unknown' && f.value !== 'None')

  if (fields.length === 0) return null

  return (
    <div className="mt-3 mb-2 bg-black/20 rounded-lg overflow-hidden border border-ops-border/50">
      <div className="grid grid-cols-2 divide-x divide-y divide-ops-border/50 text-[10px] font-mono">
        {fields.map((f, i) => (
          <div key={i} className="flex flex-col px-2 py-1">
            <span className="text-gray-500">{f.label}</span>
            <span className="text-gray-300 truncate">{f.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function TriageScreen({ onSelectPacket, dispatched = [], onMissionComplete, rescued = 0, self: selfProp, ping, peerCount }) {
  const self = selfProp || DEFAULT_SELF
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
    if (msg.event === 'sos:resolved') {
      setPackets((prev) => prev.filter((p) => p.id !== msg.payload.id))
    }
  })

  const visible = packets.filter((p) => p.status !== 'resolved')
  const filtered = filter === 'all' ? visible : visible.filter((p) => p.severity === filter)
  const critCount = visible.filter((p) => p.severity === 'critical').length
  const urgCount = visible.filter((p) => p.severity === 'urgent').length
  const openCount = visible.filter((p) => p.status === 'pending').length

  return (
    <div className="flex flex-col h-full bg-ops">
      <div className="flex items-center justify-between px-4 pt-3 pb-1.5">
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="w-1.5 h-1.5 rounded-full bg-relay" />
          <span>{peerCount ?? '—'} peers{ping != null ? ` · ${ping} ms` : ''}</span>
        </div>
        <span className="font-mono text-xs text-relay">{self.code}</span>
      </div>

      <div className="px-4 pt-3 pb-2">
        <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-0.5">Triage Queue</p>
        <div className="flex items-end gap-4">
          <p className="text-4xl font-black text-white">
            {openCount} <span className="text-xl font-semibold text-gray-500">open</span>
          </p>
          {rescued > 0 && (
            <p className="text-2xl font-black text-green-400 mb-0.5">
              {rescued} <span className="text-base font-semibold text-green-600">rescued</span>
            </p>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-1 font-mono">{visible.length} active packets - live</p>

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
          const isDispatched = dispatched.includes(pkt.id)
          return (
            <button
              key={pkt.id}
              onClick={() => onSelectPacket(pkt)}
              className={`w-full text-left border rounded-2xl p-3.5 transition-colors ${
                isDispatched
                  ? 'bg-relay/5 border-relay/40'
                  : `bg-ops-card ${style.card}`
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${style.badge}`}>
                    {pkt.severity}
                  </span>
                  <span className="font-mono text-[10px] text-gray-500">{pkt.packet_code}</span>
                </div>
                {isDispatched ? (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full text-relay bg-relay/15 border border-relay/30 font-bold">
                    EN ROUTE
                  </span>
                ) : (
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                    pkt.status === 'assigned' ? 'text-relay bg-relay/10' : 'text-gray-500'
                  }`}>
                    {pkt.status}
                  </span>
                )}
              </div>

              <p className="text-sm font-semibold text-white mb-0.5">
                {pkt.victim_code} - {pkt.emergency_type}
              </p>
              <a 
                href={`https://www.google.com/maps/search/?api=1&query=${pkt.lat},${pkt.lng}`}
                target="_blank" rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-[10px] font-mono text-blue-400 hover:text-blue-300 hover:underline mb-2 inline-block"
              >
                📍 {pkt.lat?.toFixed(5)}, {pkt.lng?.toFixed(5)} ({getDistanceKm(self.lat, self.lng, pkt.lat, pkt.lng)} km away)
              </a>
              <p className="text-xs text-gray-400 leading-relaxed mb-2 line-clamp-3">
                {packetPreview(pkt)}
                {pkt.model_score ? ` - model ${pkt.model_score}` : ''}
              </p>

              <ExtractedDetailsTable packet={pkt} />

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
                <span>{new Date(pkt.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
              </div>

              {isDispatched && (
                <button
                  onClick={(e) => { e.stopPropagation(); onMissionComplete?.(pkt) }}
                  className="mt-2 w-full py-2 rounded-lg border border-green-600/40 text-green-400 text-xs font-semibold hover:bg-green-500/10 transition-colors"
                >
                  ✓ Victim rescued — mark me available
                </button>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
