import { Radio, Smartphone, Shield } from 'lucide-react'
import { SELF_CODE } from '../../api'

function getDistanceKm(lat1, lng1, lat2, lng2) {
  if (!lat1 || !lng1 || !lat2 || !lng2) return null
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2
  return (R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)))
}

function getBearing(lat1, lng1, lat2, lng2) {
  const dLng = (lng2 - lng1) * Math.PI / 180
  const y = Math.sin(dLng) * Math.cos(lat2 * Math.PI / 180)
  const x = Math.cos(lat1*Math.PI/180)*Math.sin(lat2*Math.PI/180) -
            Math.sin(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.cos(dLng)
  return Math.atan2(y, x)
}

function signalFromKm(km) {
  if (km == null) return 30
  if (km < 0.1) return 96
  if (km < 0.5) return 82
  if (km < 1)   return 66
  if (km < 3)   return 48
  if (km < 5)   return 32
  return 18
}

function roleIcon(role) {
  if (role === 'medic' || role === 'fire') return Shield
  return Smartphone
}

export default function MeshScreen({ self, responders = [], ping }) {
  // Place peers on radar based on real bearing + distance from self
  const MAX_RADAR_KM = 5
  const peers = responders
    .filter(r => r.lat && r.lng)
    .map(r => {
      const distKm = getDistanceKm(self?.lat, self?.lng, r.lat, r.lng)
      const bearing = getBearing(self?.lat, self?.lng, r.lat, r.lng)
      const norm = Math.min((distKm ?? 0) / MAX_RADAR_KM, 1)
      const cx = 100 + norm * 75 * Math.sin(bearing)
      const cy = 100 - norm * 75 * Math.cos(bearing)
      return { ...r, distKm, signal: signalFromKm(distKm), cx, cy }
    })

  // Include responders without GPS in list but not on radar
  const allPeers = responders.map(r => {
    const distKm = getDistanceKm(self?.lat, self?.lng, r.lat, r.lng)
    return { ...r, distKm, signal: signalFromKm(distKm) }
  })

  return (
    <div className="flex flex-col h-full bg-ops">
      {/* Status bar */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1.5">
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="w-1.5 h-1.5 rounded-full bg-relay" />
          <span>{responders.length} peers{ping != null ? ` · ${ping} ms` : ''}</span>
        </div>
        <span className="font-mono text-xs text-relay">{SELF_CODE}</span>
      </div>

      <div className="px-4 pt-3 pb-2">
        <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-0.5">Mesh Network</p>
        <p className="text-4xl font-black text-white">
          {responders.length} <span className="text-xl font-semibold text-gray-500">peers</span>
        </p>
        <p className="text-xs text-gray-500 font-mono mt-1">
          {ping != null ? `${ping} ms hub latency · ` : ''}{peers.length} with GPS · live
        </p>
      </div>

      {/* Radar */}
      <div className="flex items-center justify-center py-4">
        <div className="relative w-52 h-52">
          <svg viewBox="0 0 200 200" className="w-full h-full">
            {[80, 60, 40, 20].map(r => (
              <circle key={r} cx="100" cy="100" r={r} fill="none" stroke="#1E2938" strokeWidth="1" />
            ))}
            <line x1="100" y1="20" x2="100" y2="180" stroke="#1E2938" strokeWidth="0.5" />
            <line x1="20" y1="100" x2="180" y2="100" stroke="#1E2938" strokeWidth="0.5" />

            {/* Range labels */}
            <text x="102" y="60" fill="#374151" fontSize="6" fontFamily="monospace">2.5km</text>
            <text x="102" y="20" fill="#374151" fontSize="6" fontFamily="monospace">5km</text>

            {/* Sweep */}
            <g style={{ transformOrigin: '100px 100px', animation: 'radar-sweep 3s linear infinite' }}>
              <defs>
                <linearGradient id="sweep" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#00C9D4" stopOpacity="0" />
                  <stop offset="100%" stopColor="#00C9D4" stopOpacity="0.35" />
                </linearGradient>
              </defs>
              <path d="M100,100 L180,100 A80,80 0 0,0 100,20 Z" fill="url(#sweep)" />
            </g>

            {/* Real peer dots */}
            {peers.map((peer) => (
              <g key={peer.code}>
                <circle cx={peer.cx} cy={peer.cy} r="6" fill="#00C9D4" opacity="0.2" />
                <circle cx={peer.cx} cy={peer.cy} r="3.5" fill="#00C9D4" />
                <text x={peer.cx + 5} y={peer.cy + 4} fill="#6B7280" fontSize="5" fontFamily="monospace">
                  {peer.code}
                </text>
              </g>
            ))}

            {/* Self */}
            <circle cx="100" cy="100" r="5" fill="#00C9D4" />
            <circle cx="100" cy="100" r="10" fill="none" stroke="#00C9D4" strokeWidth="1.5" opacity="0.4" />
          </svg>
        </div>
      </div>

      {/* Peer list */}
      <div className="flex-1 px-4 space-y-2 overflow-y-auto pb-4">
        {allPeers.length === 0 && (
          <p className="text-center text-gray-600 text-sm pt-4">No other responders online.</p>
        )}
        {allPeers.map(peer => {
          const Icon = roleIcon(peer.role)
          return (
            <div
              key={peer.code}
              className="flex items-center justify-between bg-ops-card border border-ops-border rounded-xl px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-relay/10">
                  <Icon size={14} className="text-relay" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white font-mono">{peer.code}</p>
                  <p className="text-xs text-gray-500">
                    {peer.name} · {peer.role}
                    {peer.distKm != null ? ` · ${peer.distKm < 1 ? `${(peer.distKm*1000).toFixed(0)} m` : `${peer.distKm.toFixed(1)} km`}` : ' · no GPS'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-16 h-1.5 bg-ops rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-relay"
                    style={{ width: `${peer.signal}%` }}
                  />
                </div>
                <span className="font-mono text-xs text-gray-500 w-6 text-right">{peer.signal}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
