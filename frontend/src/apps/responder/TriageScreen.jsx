import { mockPackets } from '../../data/mockData'

const SEVERITY_STYLES = {
  critical: {
    badge: 'bg-critical text-white',
    card: 'border-critical/40 crit-pulse',
    dot: 'bg-critical animate-pulse',
  },
  urgent: {
    badge: 'bg-urgent/90 text-white',
    card: 'border-urgent/30',
    dot: 'bg-urgent',
  },
  low: {
    badge: 'bg-gray-600 text-white',
    card: 'border-ops-border',
    dot: 'bg-gray-500',
  },
}

export default function TriageScreen({ onSelectPacket }) {
  const critCount = mockPackets.filter(p => p.severity === 'critical').length
  const urgCount = mockPackets.filter(p => p.severity === 'urgent').length

  return (
    <div className="flex flex-col h-full bg-ops">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1.5">
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="w-1.5 h-1.5 rounded-full bg-relay" />
          <span>3 peers · 84 ms</span>
        </div>
        <span className="font-mono text-xs text-relay">R-114</span>
      </div>

      <div className="px-4 pt-3 pb-2">
        <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-0.5">Triage Queue</p>
        <p className="text-4xl font-black text-white">
          {mockPackets.length} <span className="text-xl font-semibold text-gray-500">open</span>
        </p>
        <p className="text-xs text-gray-500 mt-1 font-mono">
          {mockPackets.length} packets · synced 3 s ago
        </p>

        {/* Filter chips */}
        <div className="flex gap-2 mt-3">
          <button className="px-2.5 py-1 rounded-full border border-ops-border text-xs text-white bg-ops-card">
            All · {mockPackets.length}
          </button>
          <button className="px-2.5 py-1 rounded-full border border-critical/50 text-xs text-critical">
            Crit · {critCount}
          </button>
          <button className="px-2.5 py-1 rounded-full border border-urgent/50 text-xs text-urgent">
            Urg · {urgCount}
          </button>
        </div>
      </div>

      {/* Packet list */}
      <div className="flex-1 overflow-y-auto px-4 space-y-2.5 pb-4">
        {mockPackets.map(pkt => {
          const s = SEVERITY_STYLES[pkt.severity] || SEVERITY_STYLES.low
          return (
            <button
              key={pkt.id}
              onClick={() => onSelectPacket(pkt)}
              className={`w-full text-left bg-ops-card border rounded-2xl p-3.5 ${s.card}`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${s.badge}`}>
                    {pkt.severity}
                  </span>
                  <span className="font-mono text-[10px] text-gray-500">{pkt.pktId}</span>
                </div>
                <span className="font-mono text-[10px] text-gray-500">{pkt.time}</span>
              </div>

              <p className="text-sm font-semibold text-white mb-1">
                {pkt.id} · {pkt.victimDesc}
              </p>
              <p className="text-xs text-gray-400 leading-relaxed mb-2">
                {pkt.message} · model {pkt.modelScore}
              </p>

              <div className="flex items-center justify-between text-[10px] font-mono text-gray-500">
                <span>{pkt.hops} hops · {pkt.distance}</span>
                <span>{pkt.time}</span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
