import { mockPeers } from '../../data/mockData'
import { Radio, Smartphone, Shield } from 'lucide-react'

const PEER_ICONS = {
  phone: Smartphone,
  gateway: Radio,
  responder: Shield,
}

const PEER_COLORS = {
  phone: '#00C9D4',
  gateway: '#F59E0B',
  responder: '#00C9D4',
}

const PEER_POSITIONS = [
  { cx: 50, cy: 20 },
  { cx: 20, cy: 60 },
  { cx: 78, cy: 62 },
]

export default function MeshScreen() {
  return (
    <div className="flex flex-col h-full bg-ops">
      {/* Status bar */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1.5">
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="w-1.5 h-1.5 rounded-full bg-relay" />
          <span>3 peers</span>
        </div>
        <span className="font-mono text-xs text-relay">R-114</span>
      </div>

      <div className="px-4 pt-3 pb-2">
        <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-0.5">Mesh Network</p>
        <p className="text-4xl font-black text-white">
          5 <span className="text-xl font-semibold text-gray-500">peers</span>
        </p>
        <p className="text-xs text-gray-500 font-mono mt-1">healthy · 84 ms · 1 satellite uplink</p>
      </div>

      {/* Radar */}
      <div className="flex items-center justify-center py-4">
        <div className="relative w-52 h-52">
          <svg viewBox="0 0 200 200" className="w-full h-full">
            {/* Concentric rings */}
            {[80, 60, 40, 20].map(r => (
              <circle key={r} cx="100" cy="100" r={r} fill="none" stroke="#1E2938" strokeWidth="1" />
            ))}
            {/* Cross hairs */}
            <line x1="100" y1="20" x2="100" y2="180" stroke="#1E2938" strokeWidth="0.5" />
            <line x1="20" y1="100" x2="180" y2="100" stroke="#1E2938" strokeWidth="0.5" />

            {/* Sweep */}
            <g style={{ transformOrigin: '100px 100px', animation: 'radar-sweep 3s linear infinite' }}>
              <defs>
                <linearGradient id="sweep" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#00C9D4" stopOpacity="0" />
                  <stop offset="100%" stopColor="#00C9D4" stopOpacity="0.35" />
                </linearGradient>
              </defs>
              <path
                d="M100,100 L180,100 A80,80 0 0,0 100,20 Z"
                fill="url(#sweep)"
              />
            </g>

            {/* Peer dots */}
            {mockPeers.map((peer, i) => {
              const pos = PEER_POSITIONS[i]
              const color = PEER_COLORS[peer.type]
              const cx = 100 + (pos.cx - 50) * 1.5
              const cy = 100 + (pos.cy - 50) * 1.5
              return (
                <g key={peer.id}>
                  <circle cx={cx} cy={cy} r="6" fill={color} opacity="0.2" />
                  <circle cx={cx} cy={cy} r="3.5" fill={color} />
                </g>
              )
            })}

            {/* Self dot */}
            <circle cx="100" cy="100" r="5" fill="#00C9D4" />
            <circle cx="100" cy="100" r="10" fill="none" stroke="#00C9D4" strokeWidth="1.5" opacity="0.4" />
          </svg>
        </div>
      </div>

      {/* Peer list */}
      <div className="flex-1 px-4 space-y-2 overflow-y-auto pb-4">
        {mockPeers.map(peer => {
          const Icon = PEER_ICONS[peer.type] || Smartphone
          const color = PEER_COLORS[peer.type]
          return (
            <div
              key={peer.id}
              className="flex items-center justify-between bg-ops-card border border-ops-border rounded-xl px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${color}18` }}
                >
                  <Icon size={14} style={{ color }} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white font-mono">{peer.id}</p>
                  <p className="text-xs text-gray-500">{peer.distance}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-16 h-1.5 bg-ops rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${peer.signal}%`, backgroundColor: color }}
                  />
                </div>
                <span className="font-mono text-xs text-gray-500">{peer.signal}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
