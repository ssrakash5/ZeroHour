import { X, ArrowRight } from 'lucide-react'

export default function PacketDetailSheet({ packet, onClose, onDispatch }) {
  if (!packet) return null

  const barWidth = Math.round(packet.modelScore * 100)

  return (
    <div className="absolute inset-0 flex flex-col justify-end z-10">
      {/* Scrim */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Sheet */}
      <div className="relative bg-ops-card rounded-t-3xl border-t border-ops-border px-5 pt-4 pb-6 fade-in">
        {/* Handle */}
        <div className="w-10 h-1 bg-ops-border rounded-full mx-auto mb-4" />

        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-critical text-white uppercase tracking-wide">
            {packet.severity}
          </span>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-gray-500">{packet.pktId}</span>
            <span className="font-mono text-[10px] text-gray-500">{packet.time}</span>
          </div>
        </div>

        <p className="text-lg font-bold text-white mb-1">
          {packet.id} · {packet.victimDesc}
        </p>
        <p className="text-sm text-gray-400 mb-4">"{packet.message}"</p>

        {/* Model score */}
        <div className="bg-ops rounded-xl p-3 mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[10px] uppercase tracking-widest text-gray-500">Model</p>
            <span className="font-mono text-[10px] text-gray-500">gemma-edge q4</span>
          </div>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl font-black text-white">{packet.modelScore}</span>
            <div className="flex-1 h-2 bg-ops-border rounded-full overflow-hidden">
              <div
                className="h-full shimmer rounded-full"
                style={{ width: `${barWidth}%` }}
              />
            </div>
          </div>
          {/* Tags */}
          <div className="flex flex-wrap gap-1.5">
            {packet.tags.map(tag => (
              <span key={tag} className="font-mono text-[10px] px-2 py-0.5 rounded-md bg-ops-border text-gray-400">
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* Mesh path */}
        <div className="mb-5">
          <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">Path</p>
          <div className="flex items-center gap-1 flex-wrap">
            {packet.path.map((node, i) => {
              const isFirst = i === 0
              const isLast = i === packet.path.length - 1
              return (
                <div key={`${node}-${i}`} className="flex items-center gap-1">
                  <span
                    className={`font-mono text-xs px-2 py-0.5 rounded-lg border ${
                      isFirst
                        ? 'border-gray-600 text-gray-400 bg-ops'
                        : isLast
                        ? 'border-relay text-relay bg-relay/10'
                        : 'border-ops-border text-gray-500 bg-ops'
                    }`}
                  >
                    {node}
                  </span>
                  {!isLast && <ArrowRight size={10} className="text-gray-600" />}
                </div>
              )
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3.5 rounded-xl border border-ops-border text-sm text-gray-400 font-semibold"
          >
            Defer
          </button>
          <button
            onClick={() => { onDispatch(packet); onClose() }}
            className="flex-[2] py-3.5 rounded-xl bg-relay text-ops text-sm font-bold flex items-center justify-center gap-2"
          >
            <span className="text-base">🛡</span>
            Acknowledge · dispatch me
          </button>
        </div>
      </div>
    </div>
  )
}
