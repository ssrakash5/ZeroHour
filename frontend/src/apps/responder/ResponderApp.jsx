import { useState, useEffect, useCallback } from 'react'
import { List, Map, Radio, User } from 'lucide-react'
import { api, SELF_CODE } from '../../api'
import TriageScreen from './TriageScreen'
import PacketDetailSheet from './PacketDetailSheet'
import MapScreen from './MapScreen'
import MeshScreen from './MeshScreen'
import MeScreen from './MeScreen'

const TABS = [
  { id: 'triage', label: 'Triage', Icon: List },
  { id: 'map',    label: 'Map',    Icon: Map  },
  { id: 'mesh',   label: 'Mesh',   Icon: Radio },
  { id: 'me',     label: 'Me',     Icon: User },
]

// Kochi/Ernakulam — Kerala 2018 flood scenario default
const DEFAULT_LOCATION = { lat: 9.9312, lng: 76.2673 }

export default function ResponderApp() {
  const [tab, setTab] = useState('triage')
  const [selectedPacket, setSelectedPacket] = useState(null)
  const [dispatched, setDispatched] = useState([])
  const [rescued, setRescued] = useState(0)

  // Use DB coordinates for self — overrides browser GPS so the demo stays in Kerala
  const [selfLocation, setSelfLocation] = useState(DEFAULT_LOCATION)

  // Real responder data for this device
  const [selfResponder, setSelfResponder] = useState(null)
  const [allResponders, setAllResponders] = useState([])
  const fetchResponders = useCallback(async () => {
    try {
      const rs = await api.getResponders()
      setAllResponders(rs)
      const me = rs.find(r => r.code === SELF_CODE)
      if (me) {
        setSelfResponder(me)
        if (me.lat && me.lng) setSelfLocation({ lat: me.lat, lng: me.lng })
      }
    } catch {}
  }, [])
  useEffect(() => { fetchResponders() }, [fetchResponders])

  // Backend ping latency
  const [ping, setPing] = useState(null)
  useEffect(() => {
    const measure = async () => {
      try {
        const t0 = Date.now()
        await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8001'}/health`)
        setPing(Date.now() - t0)
      } catch {}
    }
    measure()
    const id = setInterval(measure, 10000)
    return () => clearInterval(id)
  }, [])

  // Acknowledge — marks responder en_route on the backend
  const handleDispatch = useCallback(async (pkt) => {
    setDispatched(prev => [...prev, pkt.id])
    try {
      await api.manualDispatch(pkt.id, SELF_CODE)
      await fetchResponders() // refresh Me screen data
    } catch (e) {
      // manualDispatch fails if already en_route — fall back to just setting status
      try { await api.setStatus(SELF_CODE, 'en_route') } catch {}
      console.error('[Acknowledge] dispatch failed', e)
    }
  }, [fetchResponders])

  // Status toggle from Me screen
  const handleStatusChange = useCallback(async (status) => {
    try {
      await api.setStatus(SELF_CODE, status)
      await fetchResponders()
    } catch (e) {
      console.error('[Me] status update failed', e)
    }
  }, [fetchResponders])

  // Mission complete — responder rescued the victim, back to available
  const handleMissionComplete = useCallback(async (pkt) => {
    setDispatched(prev => prev.filter(id => id !== pkt.id))
    setRescued(prev => prev + 1)
    try {
      await Promise.all([
        api.setStatus(SELF_CODE, 'available'),
        api.resolveSOS(pkt.id),
      ])
      await fetchResponders()
    } catch (e) {
      console.error('[MissionComplete] failed', e)
    }
  }, [fetchResponders])

  const self = { ...selfLocation, code: SELF_CODE }

  return (
    <div className="flex flex-col h-full bg-ops text-ink" style={{ fontFamily: 'Inter, sans-serif' }}>
      <div className="flex-1 relative overflow-hidden">
        {tab === 'triage' && (
          <TriageScreen
            onSelectPacket={setSelectedPacket}
            dispatched={dispatched}
            onMissionComplete={handleMissionComplete}
            rescued={rescued}
            self={self}
            ping={ping}
            peerCount={allResponders.filter(r => r.code !== SELF_CODE).length}
          />
        )}
        {tab === 'map'  && <MapScreen self={self} />}
        {tab === 'mesh' && (
          <MeshScreen
            self={self}
            responders={allResponders.filter(r => r.code !== SELF_CODE)}
            ping={ping}
          />
        )}
        {tab === 'me' && (
          <MeScreen
            responder={selfResponder}
            onStatusChange={handleStatusChange}
            ping={ping}
            peerCount={allResponders.filter(r => r.code !== SELF_CODE).length}
          />
        )}

        {selectedPacket && (
          <PacketDetailSheet
            packet={selectedPacket}
            self={self}
            dispatched={dispatched}
            selfStatus={selfResponder?.status}
            onClose={() => setSelectedPacket(null)}
            onDispatch={handleDispatch}
            onMissionComplete={handleMissionComplete}
          />
        )}
      </div>

      <div className="flex items-center border-t border-ops-border bg-ops px-2 pb-1 pt-1">
        {TABS.map(({ id, label, Icon }) => {
          const active = tab === id
          return (
            <button
              key={id}
              onClick={() => { setTab(id); setSelectedPacket(null) }}
              className={`flex-1 flex flex-col items-center py-2 gap-0.5 rounded-xl transition-colors ${
                active ? 'text-relay' : 'text-gray-600'
              }`}
            >
              <Icon size={20} strokeWidth={active ? 2.5 : 1.5} />
              <span className={`text-[10px] font-medium ${active ? 'text-relay' : 'text-gray-600'}`}>
                {label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
