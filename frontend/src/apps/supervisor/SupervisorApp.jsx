import { useState, useCallback, useEffect, useRef } from 'react'
import { ShieldCheck, Activity, Users, LayoutDashboard } from 'lucide-react'
import LiveMap from '../../components/LiveMap'
import { api } from '../../api'
import { useWebSocket } from '../../hooks/useWebSocket'
import OntologyPanel from './OntologyPanel'
import TeamsPanel from './TeamsPanel'
import ManualDispatchModal from './ManualDispatchModal'

const SEV_COLOR = { critical: '#E84040', urgent: '#F59E0B', low: '#6B7A8D' }
const SEV_BG = { critical: 'bg-critical/10 border-critical/30', urgent: 'bg-urgent/10 border-urgent/30', low: 'bg-ops-card border-ops-border' }

function StatCard({ label, value, sub, color }) {
  return (
    <div className="bg-ops-card border border-ops-border rounded-2xl p-4">
      <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">{label}</p>
      <p className="text-3xl font-black" style={{ color: color || '#fff' }}>{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </div>
  )
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
  
  return (
    extractField(baseMessage, 'Situation')
    || baseMessage
    || '-'
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
    { label: 'Quick Needs', value: structuredData.quick_needs }
  ].filter(f => f.value)

  if (fields.length === 0) return null

  return (
    <div className="mt-3 bg-black/20 rounded-lg overflow-hidden border border-ops-border/50">
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

export default function SupervisorApp() {
  const [packets, setPackets] = useState([])
  const [assignments, setAssignments] = useState([])
  const [responders, setResponders] = useState([])
  const [wsStatus, setWsStatus] = useState('connecting')
  const [selectedAssignment, setSelectedAssignment] = useState(null)
  const [tab, setTab] = useState('dashboard')
  const [dispatchTarget, setDispatchTarget] = useState(null)
  const [clock, setClock] = useState(() => new Date().toLocaleTimeString())

  // Panel resize state
  const [leftW, setLeftW] = useState(384)
  const [rightW, setRightW] = useState(320)
  const [mapPct, setMapPct] = useState(60) // map height % in center column
  const drag = useRef(null)

  useEffect(() => {
    const onMove = (e) => {
      if (!drag.current) return
      const { type, startX, startY, startVal } = drag.current
      if (type === 'left') {
        setLeftW(Math.max(240, Math.min(560, startVal + (e.clientX - startX))))
      } else if (type === 'right') {
        setRightW(Math.max(220, Math.min(560, startVal - (e.clientX - startX))))
      } else if (type === 'map') {
        const containerH = drag.current.containerH
        const dy = e.clientY - startY
        const newPct = Math.max(20, Math.min(80, startVal + (dy / containerH) * 100))
        setMapPct(newPct)
      }
    }
    const onUp = () => { drag.current = null; document.body.style.cursor = '' }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [])

  const startDrag = (type, e, containerH) => {
    e.preventDefault()
    document.body.style.cursor = type === 'map' ? 'row-resize' : 'col-resize'
    drag.current = {
      type,
      startX: e.clientX,
      startY: e.clientY,
      startVal: type === 'left' ? leftW : type === 'right' ? rightW : mapPct,
      containerH,
    }
  }

  const centerRef = useRef(null)

  useEffect(() => {
    api.getQueue().then(setPackets).catch(() => {})
    api.getResponders().then(setResponders).catch(() => {})
    api.getAssignments().then(setAssignments).catch(() => {})
  }, [])

  useEffect(() => {
    const id = setInterval(() => setClock(new Date().toLocaleTimeString()), 1000)
    return () => clearInterval(id)
  }, [])

  const wsFactory = useCallback(() => {
    const ws = api.supervisorWS()
    ws.onopen = () => setWsStatus('live')
    ws.onclose = () => setWsStatus('reconnecting')
    return ws
  }, [])

  useWebSocket(wsFactory, (msg) => {
    if (msg.event === 'sos:new') {
      setPackets((prev) => {
        if (prev.find((p) => p.id === msg.payload.id)) return prev
        return [msg.payload, ...prev]
      })
    }
    if (msg.event === 'assignment:new') {
      setAssignments((prev) => [{ ...msg.payload, ts: Date.now() }, ...prev].slice(0, 20))
      setPackets((prev) =>
        prev.map((p) => (p.id === msg.payload.sos?.id ? { ...p, status: 'assigned' } : p)),
      )
    }
    if (msg.event === 'location:update') {
      setResponders((prev) =>
        prev.map((r) =>
          r.code === msg.payload.responder_code
            ? { ...r, lat: msg.payload.lat, lng: msg.payload.lng }
            : r,
        ),
      )
    }
    if (msg.event === 'sos:resolved') {
      setPackets((prev) => prev.filter((p) => p.id !== msg.payload.id))
      setRescuedCount((prev) => prev + 1)
    }
    if (msg.event === 'responder:status') {
      setResponders((prev) =>
        prev.map((r) =>
          r.code === msg.payload.responder_code
            ? { ...r, status: msg.payload.status }
            : r,
        ),
      )
    }
  })

  const pending = packets.filter((p) => p.status === 'pending')
  const assigned = packets.filter((p) => p.status === 'assigned')
  const critical = packets.filter((p) => p.severity === 'critical' && p.status === 'pending')
  const available = responders.filter((r) => r.status === 'available')
  const [rescuedCount, setRescuedCount] = useState(0)

  return (
    <div className="min-h-screen bg-ops text-white flex flex-col" style={{ fontFamily: 'Inter, sans-serif' }}>
      <div className="border-b border-ops-border px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Activity size={18} className="text-relay" />
            <span className="font-black text-lg tracking-tight">ZeroHour</span>
            <span className="text-gray-600 text-sm">- Supervisor</span>
          </div>
          <div className="flex items-center gap-1 bg-ops rounded-lg p-1 border border-ops-border ml-4">
            {[
              { id: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard },
              { id: 'teams', label: 'Teams', Icon: Users },
            ].map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  tab === id ? 'bg-ops-card text-white' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                <Icon size={12} />
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className={`flex items-center gap-1.5 text-xs font-mono ${
            wsStatus === 'live' ? 'text-green-400' : 'text-yellow-400'
          }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${wsStatus === 'live' ? 'bg-green-400' : 'bg-yellow-400 animate-pulse'}`} />
            {wsStatus}
          </span>
          <span className="text-xs text-gray-500 font-mono">{clock}</span>
        </div>
      </div>

      {dispatchTarget && (
        <ManualDispatchModal
          sos={dispatchTarget}
          responders={responders}
          onClose={() => setDispatchTarget(null)}
          onDispatched={({ sos }) => {
            setPackets((prev) => prev.map((p) => (p.id === sos.id ? { ...p, status: 'assigned' } : p)))
            setDispatchTarget(null)
          }}
        />
      )}

      {tab === 'teams' && (
        <div className="flex-1 overflow-hidden">
          <TeamsPanel
            responders={responders}
            onTeamAdded={(r) => setResponders((prev) => [...prev, r])}
            onStatusChange={async (code, status) => {
              await api.setStatus(code, status)
              setResponders((prev) => prev.map((r) => (r.code === code ? { ...r, status } : r)))
            }}
          />
        </div>
      )}

      {tab !== 'teams' && <div className="flex-1 flex gap-0 overflow-hidden">
        {/* Left — SOS queue */}
        <div className="border-r border-ops-border flex flex-col shrink-0" style={{ width: leftW }}>
          <div className="px-5 py-4 border-b border-ops-border">
            <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">SOS Queue</p>
            <p className="text-3xl font-black text-white">
              {pending.length} <span className="text-lg font-semibold text-gray-500">pending</span>
            </p>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
            {packets.length === 0 && (
              <p className="text-gray-600 text-sm text-center pt-8">No SOS packets yet.</p>
            )}
            {packets.map(pkt => (
              <button
                key={pkt.id}
                onClick={() => setDispatchTarget(pkt)}
                className={`w-full text-left border rounded-xl p-3 transition-colors hover:brightness-110 ${SEV_BG[pkt.severity] || SEV_BG.low}`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white uppercase"
                    style={{ backgroundColor: SEV_COLOR[pkt.severity] || '#666' }}
                  >
                    {pkt.severity}
                  </span>
                  <span className={`text-[10px] font-mono ${pkt.status === 'assigned' ? 'text-relay' : 'text-gray-500'}`}>
                    {pkt.status}
                  </span>
                </div>
                <p className="text-sm font-semibold text-white">{pkt.victim_code} · {pkt.emergency_type}</p>
                <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{packetPreview(pkt) || '—'}</p>
                <ExtractedDetailsTable packet={pkt} />
                <div className="flex items-center justify-between mt-2">
                  <p className="text-[10px] font-mono text-gray-600">
                    {new Date(pkt.created_at).toLocaleTimeString()}
                  </p>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-md border border-relay/40 text-relay">
                    {pkt.status === 'pending' ? 'Tap to dispatch →' : 'View details →'}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Left ↔ Center drag handle */}
        <div
          className="w-1 shrink-0 cursor-col-resize bg-ops-border hover:bg-relay/60 transition-colors z-10"
          onMouseDown={(e) => startDrag('left', e)}
        />

        {/* Center — Stats + Live Map + Assignment feed */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0" ref={centerRef}>
          {/* Stats row */}
          <div className="grid grid-cols-5 gap-3 p-4 border-b border-ops-border shrink-0">
            <StatCard label="Pending SOS" value={pending.length} color="#E84040" sub="awaiting assignment" />
            <StatCard label="Critical" value={critical.length} color="#E84040" sub="unassigned" />
            <StatCard label="Assigned" value={assigned.length} color="#00C9D4" sub="en route" />
            <StatCard label="Available" value={available.length} color="#22C55E" sub={`of ${responders.length}`} />
            <StatCard label="Rescued" value={rescuedCount} color="#22C55E" sub="this session" />
          </div>

          {/* Live Map */}
          <div className="relative" style={{ flex: `0 0 ${mapPct}%`, minHeight: 120 }}>
            <div className="absolute top-2 left-2 z-10 flex gap-2 pointer-events-none">
              <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-1 rounded-md bg-black/60 text-gray-300">
                <span className="w-2 h-2 rounded-full bg-critical inline-block" /> Critical SOS
              </span>
              <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-1 rounded-md bg-black/60 text-gray-300">
                <span className="w-2 h-2 rounded-full bg-urgent inline-block" /> Urgent SOS
              </span>
              <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-1 rounded-md bg-black/60 text-gray-300">
                <span className="w-2 h-2 rounded-full bg-relay inline-block" /> Responder
              </span>
            </div>
            <LiveMap
              packets={packets}
              responders={responders}
              assignments={assignments}
              center={[9.9312, 76.2673]}
              zoom={13}
              height="100%"
              onSOSClick={(pkt) => setDispatchTarget(prev => prev?.id === pkt.id ? null : pkt)}
            />
          </div>

          {/* Map ↕ Feed drag handle */}
          <div
            className="h-1 shrink-0 cursor-row-resize bg-ops-border hover:bg-relay/60 transition-colors z-10"
            onMouseDown={(e) => startDrag('map', e, centerRef.current?.offsetHeight || 600)}
          />

          {/* Assignment feed */}
          <div className="flex-1 overflow-y-auto px-4 py-3" style={{ minHeight: 80 }}>
            <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">
              Live Assignment Feed
            </p>
            {assignments.length === 0 && (
              <p className="text-gray-600 text-sm">Assignments appear here in real-time.</p>
            )}
            <div className="space-y-2">
              {assignments.map((a, i) => (
                <button
                  key={`${a.assignment_id}-${i}`}
                  onClick={() => setSelectedAssignment(a)}
                  className="flex gap-3 w-full text-left fade-in group"
                >
                  <div className={`w-px self-stretch shrink-0 ${selectedAssignment?.assignment_id === a.assignment_id ? 'bg-relay' : 'bg-relay/30'}`} />
                  <div className={`bg-ops-card border rounded-xl p-3 flex-1 transition-colors ${selectedAssignment?.assignment_id === a.assignment_id ? 'border-relay/50' : 'border-ops-border group-hover:border-relay/30'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <ShieldCheck size={12} className={a.is_team ? 'text-urgent' : 'text-relay'} />
                      <span className={`text-xs font-bold ${a.is_team ? 'text-urgent' : 'text-relay'}`}>
                        {a.is_team
                          ? a.team?.map(t => t.responder_code).join(' + ')
                          : a.responder_code
                        } → {a.sos?.victim_code}
                      </span>
                      {a.is_team && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-urgent/10 border border-urgent/30 text-urgent font-mono">team</span>
                      )}
                      <span className="text-[10px] text-gray-500 ml-auto font-mono">
                        {new Date(a.ts).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400">
                      ETA {a.eta_minutes ?? '—'} min · {a.distance_m ?? '—'} m
                      {a.composite_score !== undefined && ` · score ${(a.composite_score * 100).toFixed(0)}/100`}
                      {a.ai_available ? ' · Gemma 4 ✓' : ' · algo'}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Center ↔ Right drag handle */}
        <div
          className="w-1 shrink-0 cursor-col-resize bg-ops-border hover:bg-relay/60 transition-colors z-10"
          onMouseDown={(e) => startDrag('right', e)}
        />

        {/* Right — Responder roster + Ontology panel */}
        <div className="border-l border-ops-border flex flex-col shrink-0" style={{ width: rightW }}>
          {/* Roster (top half) */}
          <div className="border-b border-ops-border flex flex-col" style={{ maxHeight: '40%' }}>
            <div className="px-4 py-3 border-b border-ops-border">
              <p className="text-[10px] uppercase tracking-widest text-gray-500">Responders</p>
            </div>
            <div className="overflow-y-auto px-3 py-2 space-y-1.5">
              {responders.map(r => {
                const statusColor = {
                  available: 'text-green-400',
                  en_route: 'text-relay',
                  busy: 'text-urgent',
                  off_duty: 'text-gray-600',
                }[r.status] || 'text-gray-500'

                  return (
                    <div key={r.id} className="bg-ops-card border border-ops-border rounded-xl px-3 py-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-white font-mono">{r.code}</span>
                        <span className={`text-[10px] font-mono ${statusColor}`}>{r.status}</span>
                      </div>
                      <p className="text-xs text-gray-500">{r.name} - {r.role} - S{r.sector}</p>
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="text-[10px] font-mono text-gray-500">BAT: {r.battery}%</span>
                        <span className={`text-[10px] font-mono ${r.heart_rate > 120 || r.heart_rate < 50 ? 'text-critical font-bold animate-pulse' : 'text-gray-500'}`}>
                          BPM: {r.heart_rate || '--'}
                        </span>
                        <span className={`text-[10px] font-mono ${r.supplies_percent < 20 ? 'text-urgent font-bold' : 'text-gray-500'}`}>
                          SUP: {r.supplies_percent || '--'}%
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="px-4 py-2 border-b border-ops-border">
                <p className="text-[10px] uppercase tracking-widest text-gray-500">
                  Reasoning Chain {selectedAssignment ? `- ${selectedAssignment.responder_code}` : ''}
                </p>
              </div>
              <div className="flex-1 overflow-hidden">
                <OntologyPanel assignment={selectedAssignment} />
              </div>
            </div>
          </div>
        </div>
      }
    </div>
  )
}
