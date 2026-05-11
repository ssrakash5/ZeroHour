import { CheckCircle2, XCircle, Zap, Brain, AlertTriangle } from 'lucide-react'

function SkillBadge({ label, matched }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-md border ${
      matched
        ? 'border-green-500/30 bg-green-500/10 text-green-400'
        : 'border-red-500/30 bg-red-500/10 text-red-400'
    }`}>
      {matched ? <CheckCircle2 size={9} /> : <XCircle size={9} />}
      {label}
    </span>
  )
}

function ScoreBar({ label, value, color }) {
  return (
    <div>
      <div className="flex justify-between text-[10px] font-mono mb-0.5">
        <span className="text-gray-500">{label}</span>
        <span style={{ color }}>{(value * 100).toFixed(0)}%</span>
      </div>
      <div className="h-1.5 bg-ops rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${value * 100}%`, backgroundColor: color }}
        />
      </div>
    </div>
  )
}

const SCORE_COLORS = {
  role_match: '#00C9D4',
  capability: '#22C55E',
  distance: '#F59E0B',
  battery: '#A78BFA',
  sector: '#6B7A8D',
}

export default function OntologyPanel({ assignment }) {
  if (!assignment) {
    return (
      <div className="flex items-center justify-center h-full text-gray-600 text-sm">
        Select an assignment to see the reasoning chain.
      </div>
    )
  }

  const onto = assignment.ontology || {}
  const breakdown = assignment.score_breakdown || {}
  const composite = assignment.composite_score
  const aiAvailable = assignment.ai_available
  const override = assignment.ai_override

  return (
    <div className="h-full overflow-y-auto px-4 py-4 space-y-4 fade-in">

      {/* Header */}
      <div>
        <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Dispatch Reasoning Chain</p>
        <p className="text-base font-bold text-white">
          {assignment.sos?.victim_code} → {assignment.responder_code}
        </p>
        <p className="text-xs text-gray-400">{assignment.sos?.emergency_type} · {assignment.sos?.severity}</p>
      </div>

      {/* AI / Algorithm indicator */}
      <div className="flex gap-2">
        <div className={`flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full border font-mono ${
          aiAvailable ? 'border-relay/40 bg-relay/10 text-relay' : 'border-gray-700 bg-ops text-gray-500'
        }`}>
          <Brain size={10} />
          {aiAvailable ? 'Gemma 4 active' : 'Algorithm fallback'}
        </div>
        {override && (
          <div className="flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full border border-urgent/40 bg-urgent/10 text-urgent font-mono">
            <AlertTriangle size={10} />
            AI overrode algorithm
          </div>
        )}
      </div>

      {/* AI Reason */}
      {assignment.ai_reason && (
        <div className="bg-ops-card border border-ops-border rounded-xl p-3">
          <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1.5 flex items-center gap-1">
            <Brain size={10} /> Gemma 4 reasoning
          </p>
          <p className="text-sm text-gray-300 italic">"{assignment.ai_reason}"</p>
          {assignment.confidence && (
            <p className="text-[10px] font-mono text-gray-500 mt-1">
              confidence: {(assignment.confidence * 100).toFixed(0)}%
            </p>
          )}
        </div>
      )}

      {/* Algorithm composite score */}
      {composite !== undefined && (
        <div className="bg-ops-card border border-ops-border rounded-xl p-3">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] uppercase tracking-widest text-gray-500 flex items-center gap-1">
              <Zap size={10} /> Algorithm score
            </p>
            <span className="text-lg font-black text-white">{(composite * 100).toFixed(0)}<span className="text-xs text-gray-500">/100</span></span>
          </div>
          <div className="space-y-2">
            {Object.entries(breakdown).map(([key, val]) => (
              <ScoreBar
                key={key}
                label={key.replace('_', ' ')}
                value={val}
                color={SCORE_COLORS[key] || '#888'}
              />
            ))}
          </div>
        </div>
      )}

      {/* Skills ontology */}
      {onto.required_skills?.length > 0 && (
        <div className="bg-ops-card border border-ops-border rounded-xl p-3">
          <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">Skills coverage</p>
          <div className="flex flex-wrap gap-1.5">
            {onto.skills_matched?.map(s => <SkillBadge key={s} label={s} matched />)}
            {onto.skills_missing?.map(s => <SkillBadge key={s} label={s} matched={false} />)}
          </div>
          <div className="mt-2 h-1.5 bg-ops rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-green-500"
              style={{ width: `${(onto.skill_coverage || 0) * 100}%` }}
            />
          </div>
          <p className="text-[10px] font-mono text-gray-500 mt-1">
            {((onto.skill_coverage || 0) * 100).toFixed(0)}% covered
          </p>
        </div>
      )}

      {/* Equipment */}
      {onto.required_equipment?.length > 0 && (
        <div className="bg-ops-card border border-ops-border rounded-xl p-3">
          <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">Equipment required</p>
          <div className="space-y-1.5">
            {onto.required_equipment.map(eq => {
              const has = onto.equipment_matched?.includes(eq)
              return (
                <div key={eq} className="flex items-center gap-2">
                  {has
                    ? <CheckCircle2 size={12} className="text-green-400 shrink-0" />
                    : <XCircle size={12} className="text-red-400 shrink-0" />
                  }
                  <span className={`text-xs font-mono ${has ? 'text-gray-300' : 'text-red-400'}`}>{eq}</span>
                  {!has && <span className="text-[10px] text-red-400/60 ml-auto">NOT CARRIED</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Dispatch info */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-ops-card border border-ops-border rounded-xl p-3">
          <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">ETA</p>
          <p className="text-xl font-black text-white">{assignment.eta_minutes} <span className="text-sm text-gray-500">min</span></p>
        </div>
        <div className="bg-ops-card border border-ops-border rounded-xl p-3">
          <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Distance</p>
          <p className="text-xl font-black text-white">{assignment.distance_m} <span className="text-sm text-gray-500">m</span></p>
        </div>
      </div>
    </div>
  )
}
