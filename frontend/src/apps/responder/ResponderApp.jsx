import { useState } from 'react'
import { List, Map, Radio, User } from 'lucide-react'
import TriageScreen from './TriageScreen'
import PacketDetailSheet from './PacketDetailSheet'
import MapScreen from './MapScreen'
import MeshScreen from './MeshScreen'
import MeScreen from './MeScreen'

const TABS = [
  { id: 'triage', label: 'Triage', Icon: List },
  { id: 'map', label: 'Map', Icon: Map },
  { id: 'mesh', label: 'Mesh', Icon: Radio },
  { id: 'me', label: 'Me', Icon: User },
]

export default function ResponderApp() {
  const [tab, setTab] = useState('triage')
  const [selectedPacket, setSelectedPacket] = useState(null)
  const [dispatched, setDispatched] = useState([])

  return (
    <div className="flex flex-col h-full bg-ops">
      {/* Screen content */}
      <div className="flex-1 relative overflow-hidden">
        {tab === 'triage' && (
          <TriageScreen onSelectPacket={setSelectedPacket} dispatched={dispatched} />
        )}
        {tab === 'map' && <MapScreen />}
        {tab === 'mesh' && <MeshScreen />}
        {tab === 'me' && <MeScreen />}

        {/* Packet detail bottom sheet */}
        {selectedPacket && (
          <PacketDetailSheet
            packet={selectedPacket}
            onClose={() => setSelectedPacket(null)}
            onDispatch={(pkt) => setDispatched(prev => [...prev, pkt.id])}
          />
        )}
      </div>

      {/* Bottom nav */}
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
