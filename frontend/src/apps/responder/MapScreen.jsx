import { mapPins } from '../../data/mockData'

const PIN_COLORS = {
  critical: '#E84040',
  urgent: '#F59E0B',
  safe: '#22C55E',
  self: '#00C9D4',
}

function MapPin({ pin }) {
  const color = PIN_COLORS[pin.severity] || '#888'
  const isSelf = pin.severity === 'self'
  return (
    <g transform={`translate(${pin.x * 2.8}, ${pin.y * 2.8})`}>
      {isSelf ? (
        <>
          <circle r="8" fill={color} opacity="0.2" />
          <circle r="5" fill={color} opacity="0.4" />
          <circle r="3" fill={color} />
        </>
      ) : (
        <>
          <circle r="9" fill={color} opacity="0.15" />
          <path
            d="M0,-11 C-6,-11 -10,-7 -10,-2 C-10,5 0,14 0,14 C0,14 10,5 10,-2 C10,-7 6,-11 0,-11 Z"
            fill={color}
          />
          <circle r="3.5" fill="white" cy="-2" />
        </>
      )}
    </g>
  )
}

export default function MapScreen() {
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

      {/* Full bleed map */}
      <div className="flex-1 relative overflow-hidden">
        {/* Dark grid background */}
        <svg className="absolute inset-0 w-full h-full opacity-20" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="smallGrid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#334155" strokeWidth="0.5" />
            </pattern>
            <pattern id="grid" width="100" height="100" patternUnits="userSpaceOnUse">
              <rect width="100" height="100" fill="url(#smallGrid)" />
              <path d="M 100 0 L 0 0 0 100" fill="none" stroke="#334155" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>

        {/* Scanline overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,201,212,0.015) 3px, rgba(0,201,212,0.015) 4px)',
          }}
        />

        {/* Roads simulation */}
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 280 480" preserveAspectRatio="xMidYMid slice">
          <line x1="80" y1="0" x2="140" y2="480" stroke="#1E2938" strokeWidth="8" />
          <line x1="0" y1="200" x2="280" y2="160" stroke="#1E2938" strokeWidth="6" />
          <line x1="160" y1="0" x2="200" y2="480" stroke="#1E2938" strokeWidth="4" />
          <line x1="0" y1="350" x2="280" y2="310" stroke="#1E2938" strokeWidth="5" />

          {/* Map pins */}
          {mapPins.map(pin => (
            <MapPin key={pin.id} pin={pin} />
          ))}

          {/* Legend */}
          <g transform="translate(10, 400)">
            <rect width="130" height="62" rx="6" fill="#12181F" opacity="0.9" />
            {[
              { color: PIN_COLORS.critical, label: 'Critical' },
              { color: PIN_COLORS.urgent, label: 'Urgent' },
              { color: PIN_COLORS.self, label: 'You' },
            ].map((item, i) => (
              <g key={item.label} transform={`translate(10, ${14 + i * 17})`}>
                <circle r="4" fill={item.color} />
                <text x="12" y="4" fill="#9CA3AF" fontSize="9" fontFamily="monospace">{item.label}</text>
              </g>
            ))}
          </g>
        </svg>
      </div>
    </div>
  )
}
