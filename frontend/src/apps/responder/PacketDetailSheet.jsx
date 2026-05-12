import { X, ArrowRight } from 'lucide-react'

export default function PacketDetailSheet({ packet, onClose, onDispatch }) {
  if (!packet) return null

  const score = packet.model_score ?? 0
  const barWidth = Math.round(score * 100)

  // Extract enriched fields from message
  const lines = (packet.message || '').split('\n')
  const voiceTranscript = lines.find(l => l.startsWith('Voice transcript:'))?.replace('Voice transcript:', '').trim()
  const aiReasoning = lines.find(l => l.startsWith('AI reasoning:'))?.replace('AI reasoning:', '').trim()
  const peopleCount = lines.find(l => l.startsWith('People count:'))?.replace('People count:', '').trim()
  const baseMessage = lines.filter(l => 
    !l.startsWith('Voice transcript:') && 
    !l.startsWith('AI reasoning:') && 
    !l.startsWith('People count:')
  ).join('\n').trim()

  // Build a hop path from hops count
  const hopNodes = ['Victim']
  for (let i = 1; i <= (packet.hops ?? 1); i++) hopNodes.push(`P-${String(i * 11 + 12).padStart(2, '0')}`)
  hopNodes.push('R-114')

  const tags = [
    packet.has_audio && 'audio:distress',
    packet.has_image && 'image:attached',
    packet.emergency_type && `type:${packet.emergency_type}`,
  ].filter(Boolean)

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
            <span className="font-mono text-[10px] text-gray-500">{packet.packet_code}</span>
            <span className="font-mono text-[10px] text-gray-500">
              {new Date(packet.created_at).toLocaleTimeString()}
            </span>
          </div>
        </div>

        <p className="text-lg font-bold text-white mb-1 flex items-center gap-2">
          {packet.victim_code} · {packet.emergency_type}
          {peopleCount && (
            <span className="text-[10px] font-mono bg-ops text-gray-400 px-2 py-0.5 rounded-full border border-ops-border">
              {peopleCount} {parseInt(peopleCount) === 1 ? 'person' : 'people'}
            </span>
          )}
        </p>
        <p className="text-sm text-gray-400 mb-3 whitespace-pre-wrap">"{baseMessage || 'No message'}"</p>

        {voiceTranscript && (
          <div className="bg-ops border border-relay/20 rounded-xl p-3 mb-4">
            <p className="text-[10px] uppercase tracking-widest text-relay mb-1.5 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-relay animate-pulse" />
              Voice Transcript
            </p>
            <p className="text-xs text-gray-300 italic">"{voiceTranscript}"</p>
          </div>
        )}

        {/* Model score */}
        <div className="bg-ops rounded-xl p-3 mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[10px] uppercase tracking-widest text-gray-500">AI Score</p>
            <span className="font-mono text-[10px] text-gray-500">Gemma 4</span>
          </div>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl font-black text-white">{score.toFixed(2)}</span>
            <div className="flex-1 h-2 bg-ops-border rounded-full overflow-hidden">
              <div
                className="h-full shimmer rounded-full"
                style={{ width: `${barWidth}%` }}
              />
            </div>
          </div>
          
          {aiReasoning && (
            <div className="mt-2 pt-2 border-t border-ops-border/50">
              <p className="text-xs text-gray-400 leading-relaxed"><span className="text-gray-300 font-semibold">Reasoning:</span> {aiReasoning}</p>
            </div>
          )}

          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {tags.map(tag => (
                <span key={tag} className="font-mono text-[10px] px-2 py-0.5 rounded-md bg-ops-border text-gray-400">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Mesh path */}
        <div className="mb-5">
          <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">
            Relay path · {packet.hops ?? 0} hop{packet.hops !== 1 ? 's' : ''}
          </p>
          <div className="flex items-center gap-1 flex-wrap">
            {hopNodes.map((node, i) => {
              const isFirst = i === 0
              const isLast = i === hopNodes.length - 1
              return (
                <div key={`${node}-${i}`} className="flex items-center gap-1">
                  <span className={`font-mono text-xs px-2 py-0.5 rounded-lg border ${
                    isFirst
                      ? 'border-gray-600 text-gray-400 bg-ops'
                      : isLast
                      ? 'border-relay text-relay bg-relay/10'
                      : 'border-ops-border text-gray-500 bg-ops'
                  }`}>
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
