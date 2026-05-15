import { useState, useEffect, useCallback } from 'react'
import LiveMap from '../../components/LiveMap'
import { api } from '../../api'
import { useWebSocket } from '../../hooks/useWebSocket'

const DEFAULT_SELF = { lat: 9.9312, lng: 76.2673, code: 'R-114' }

export default function MapScreen({ self: selfProp }) {
  const SELF = selfProp || DEFAULT_SELF
  const [packets, setPackets] = useState([])
  const [responders, setResponders] = useState([])
  const [assignments, setAssignments] = useState([])

  useEffect(() => {
    api.getQueue().then(setPackets).catch(() => {})
    api.getResponders().then(r => setResponders(r.filter(x => x.code !== SELF.code))).catch(() => {})
  }, [])

  const wsFactory = useCallback(() => api.supervisorWS(), [])
  useWebSocket(wsFactory, (msg) => {
    if (msg.event === 'sos:new') {
      setPackets(prev => prev.find(p => p.id === msg.payload.id) ? prev : [msg.payload, ...prev])
    }
    if (msg.event === 'assignment:new') {
      setAssignments(prev => [msg.payload, ...prev].slice(0, 10))
      if (msg.payload.responder_code === SELF.code) {
        // flash or highlight — future: show route to victim
      }
    }
    if (msg.event === 'location:update') {
      setResponders(prev =>
        prev.map(r =>
          r.code === msg.payload.responder_code
            ? { ...r, lat: msg.payload.lat, lng: msg.payload.lng }
            : r
        )
      )
    }
  })

  // My active assignment (if any)
  const myAssignment = assignments.find(a => a.responder_code === SELF.code)
  const myTarget = myAssignment
    ? packets.find(p => p.victim_code === myAssignment.sos?.victim_code)
    : null

  return (
    <div className="flex flex-col h-full bg-ops">
      {/* Status bar */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1.5 shrink-0">
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="w-1.5 h-1.5 rounded-full bg-relay" />
          <span>Live map</span>
        </div>
        <span className="font-mono text-xs text-relay">R-114</span>
      </div>

      {/* Active assignment banner */}
      {myAssignment && (
        <div className="mx-3 mb-1 px-3 py-2 rounded-xl bg-relay/10 border border-relay/30 shrink-0">
          <p className="text-[10px] uppercase tracking-widest text-relay mb-0.5">Active assignment</p>
          <p className="text-sm font-bold text-white">
            → {myAssignment.sos?.victim_code} · {myAssignment.sos?.emergency_type}
          </p>
          <p className="text-xs text-gray-400 font-mono">
            ETA {myAssignment.eta_minutes ?? '—'} min · {myAssignment.distance_m ?? '—'} m
          </p>
        </div>
      )}

      {/* Map */}
      <div className="flex-1 relative">
        <LiveMap
          packets={packets}
          responders={responders}
          assignments={myAssignment ? [myAssignment] : []}
          selfLocation={SELF}
          center={[SELF.lat, SELF.lng]}
          zoom={14}
          height="100%"
        />

        {/* Coordinate display on hover — shown as overlay */}
        <div className="absolute bottom-2 left-2 right-2 pointer-events-none">
          <div className="flex justify-between">
            <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-black/60 text-gray-400">
              {SELF.lat.toFixed(5)}, {SELF.lng.toFixed(5)} — you
            </span>
            <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-black/60 text-gray-400">
              {packets.length} SOS · {responders.length} peers
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
