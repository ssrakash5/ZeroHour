import { useState } from 'react'
import { Plus, ShieldCheck, CheckSquare, Square, ChevronDown, ChevronUp } from 'lucide-react'
import { api } from '../../api'

const ROLES = ['medic', 'rescue', 'fire']

const EQUIPMENT_BY_ROLE = {
  medic:   ['Defibrillator', 'First Aid Kit', 'Stretcher', 'O2 Tank', 'IV Kit'],
  rescue:  ['Hydraulic Cutters', 'Rope', 'Hard Hat', 'Shoring Kit', 'Life Ring', 'Inflatable Boat', 'Life Jacket'],
  fire:    ['Breathing Apparatus', 'Fire Extinguisher', 'Hose', 'Thermal Camera', 'PPE'],
}

const STATUS_COLOR = {
  available: 'text-green-400 bg-green-400/10 border-green-400/30',
  en_route:  'text-relay bg-relay/10 border-relay/30',
  busy:      'text-urgent bg-urgent/10 border-urgent/30',
  off_duty:  'text-gray-500 bg-gray-500/10 border-gray-500/30',
}

function EquipmentChecklist({ role, checked, onChange }) {
  const items = EQUIPMENT_BY_ROLE[role] || []
  return (
    <div className="space-y-1.5 mt-2">
      {items.map(item => {
        const on = checked.includes(item)
        return (
          <button
            key={item}
            type="button"
            onClick={() => onChange(on ? checked.filter(e => e !== item) : [...checked, item])}
            className="flex items-center gap-2 w-full text-left"
          >
            {on
              ? <CheckSquare size={14} className="text-relay shrink-0" />
              : <Square size={14} className="text-gray-600 shrink-0" />
            }
            <span className={`text-xs ${on ? 'text-gray-200' : 'text-gray-500'}`}>{item}</span>
          </button>
        )
      })}
    </div>
  )
}

function ResponderCard({ responder, onStatusChange }) {
  const [expanded, setExpanded] = useState(false)
  const statusCls = STATUS_COLOR[responder.status] || STATUS_COLOR.off_duty

  return (
    <div className="bg-ops-card border border-ops-border rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-left"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-relay/10 flex items-center justify-center shrink-0">
            <ShieldCheck size={14} className="text-relay" />
          </div>
          <div>
            <p className="text-sm font-bold text-white font-mono">{responder.code} · {responder.name}</p>
            <p className="text-xs text-gray-500">{responder.role} · Sector {responder.sector}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${statusCls}`}>
            {responder.status}
          </span>
          {expanded ? <ChevronUp size={14} className="text-gray-500" /> : <ChevronDown size={14} className="text-gray-500" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-ops-border pt-3 space-y-3">
          {/* Battery */}
          <div>
            <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Battery</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-ops rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-green-500"
                  style={{ width: `${responder.battery}%` }}
                />
              </div>
              <span className="text-xs font-mono text-gray-400">{responder.battery}%</span>
            </div>
          </div>

          {/* Status override */}
          <div>
            <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">Set status</p>
            <div className="flex gap-1.5 flex-wrap">
              {['available', 'busy', 'off_duty'].map(s => (
                <button
                  key={s}
                  onClick={() => onStatusChange(responder.code, s)}
                  className={`text-[10px] font-mono px-2.5 py-1 rounded-full border transition-colors ${
                    responder.status === s
                      ? STATUS_COLOR[s]
                      : 'border-ops-border text-gray-500 hover:border-gray-500'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function TeamsPanel({ responders, onTeamAdded, onStatusChange }) {
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const defaultEquip = (role) => [...(EQUIPMENT_BY_ROLE[role] || [])]

  const [form, setForm] = useState({
    code: '',
    name: '',
    role: 'medic',
    sector: '',
    lat: '28.6280',
    lng: '77.2090',
    equipment: defaultEquip('medic'),
  })

  const set = (key, val) => {
    setForm(f => {
      const next = { ...f, [key]: val }
      if (key === 'role') next.equipment = defaultEquip(val)
      return next
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const payload = {
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        role: form.role,
        sector: parseInt(form.sector) || 1,
        lat: parseFloat(form.lat),
        lng: parseFloat(form.lng),
      }
      const created = await api.postJSON('/responders/', payload)
      onTeamAdded(created)
      setShowForm(false)
      setForm({ code: '', name: '', role: 'medic', sector: '', lat: '28.6280', lng: '77.2090', equipment: defaultEquip('medic') })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-ops-border">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-0.5">Field Teams</p>
          <p className="text-2xl font-black text-white">{responders.length} <span className="text-sm font-semibold text-gray-500">registered</span></p>
        </div>
        <button
          onClick={() => setShowForm(f => !f)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-relay text-ops text-sm font-bold"
        >
          <Plus size={16} />
          Register Team
        </button>
      </div>

      {/* Registration form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="border-b border-ops-border px-5 py-4 space-y-3 bg-ops-card fade-in">
          <p className="text-xs font-bold text-white uppercase tracking-wider">New Team Registration</p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-widest text-gray-500 block mb-1">Team Code</label>
              <input
                required
                placeholder="R-115"
                value={form.code}
                onChange={e => set('code', e.target.value)}
                className="w-full bg-ops border border-ops-border rounded-lg px-3 py-2 text-sm text-white font-mono placeholder-gray-600 focus:outline-none focus:border-relay"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest text-gray-500 block mb-1">Full Name</label>
              <input
                required
                placeholder="K. Sharma"
                value={form.name}
                onChange={e => set('name', e.target.value)}
                className="w-full bg-ops border border-ops-border rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-relay"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-widest text-gray-500 block mb-1">Role</label>
              <select
                value={form.role}
                onChange={e => set('role', e.target.value)}
                className="w-full bg-ops border border-ops-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-relay"
              >
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest text-gray-500 block mb-1">Sector</label>
              <input
                required
                type="number"
                placeholder="14"
                value={form.sector}
                onChange={e => set('sector', e.target.value)}
                className="w-full bg-ops border border-ops-border rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-relay"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-widest text-gray-500 block mb-1">Lat</label>
              <input
                value={form.lat}
                onChange={e => set('lat', e.target.value)}
                className="w-full bg-ops border border-ops-border rounded-lg px-3 py-2 text-sm text-white font-mono placeholder-gray-600 focus:outline-none focus:border-relay"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest text-gray-500 block mb-1">Lng</label>
              <input
                value={form.lng}
                onChange={e => set('lng', e.target.value)}
                className="w-full bg-ops border border-ops-border rounded-lg px-3 py-2 text-sm text-white font-mono placeholder-gray-600 focus:outline-none focus:border-relay"
              />
            </div>
          </div>

          {/* Equipment checklist */}
          <div>
            <label className="text-[10px] uppercase tracking-widest text-gray-500 block mb-1">
              Equipment on hand
            </label>
            <EquipmentChecklist
              role={form.role}
              checked={form.equipment}
              onChange={val => set('equipment', val)}
            />
          </div>

          {error && <p className="text-xs text-red-400 font-mono">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="flex-1 py-2 rounded-lg border border-ops-border text-sm text-gray-400"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-[2] py-2 rounded-lg bg-relay text-ops text-sm font-bold disabled:opacity-50"
            >
              {loading ? 'Registering…' : 'Register'}
            </button>
          </div>
        </form>
      )}

      {/* Team list */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
        {responders.map(r => (
          <ResponderCard
            key={r.id}
            responder={r}
            onStatusChange={onStatusChange}
          />
        ))}
      </div>
    </div>
  )
}
