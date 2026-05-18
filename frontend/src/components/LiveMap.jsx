import { useEffect, useRef } from 'react'
import L from 'leaflet'

// Fix Leaflet's broken default icon path with Vite
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const SEV_COLOR = { critical: '#E84040', urgent: '#F59E0B', low: '#6B7A8D' }
const STATUS_COLOR = { available: '#22C55E', en_route: '#00C9D4', busy: '#F59E0B', off_duty: '#4B5563' }

function sosIcon(severity) {
  const color = SEV_COLOR[severity] || '#888'
  return L.divIcon({
    className: '',
    html: `
      <div style="position:relative;width:32px;height:40px">
        <svg viewBox="0 0 32 40" width="32" height="40" xmlns="http://www.w3.org/2000/svg">
          <path d="M16 0C9 0 4 6 4 13C4 22 16 38 16 38C16 38 28 22 28 13C28 6 23 0 16 0Z"
            fill="${color}" stroke="white" stroke-width="2"/>
          <circle cx="16" cy="13" r="5" fill="white"/>
        </svg>
        <div style="
          position:absolute;top:7px;left:50%;transform:translateX(-50%);
          font-size:7px;font-weight:900;color:${color};font-family:monospace;
          white-space:nowrap;
        ">SOS</div>
      </div>`,
    iconSize: [32, 40],
    iconAnchor: [16, 40],
    popupAnchor: [0, -42],
  })
}

function responderIcon(status, code) {
  const color = STATUS_COLOR[status] || '#888'
  return L.divIcon({
    className: '',
    html: `
      <div style="
        width:36px;height:36px;border-radius:50%;
        background:${color}22;border:2.5px solid ${color};
        display:flex;align-items:center;justify-content:center;
        font-size:8px;font-weight:700;color:${color};font-family:monospace;
      ">${code}</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -20],
  })
}

function selfIcon() {
  return L.divIcon({
    className: '',
    html: `
      <div style="position:relative;width:20px;height:20px">
        <div style="
          width:20px;height:20px;border-radius:50%;
          background:#00C9D422;border:2px solid #00C9D4;
          display:flex;align-items:center;justify-content:center;
        ">
          <div style="width:8px;height:8px;border-radius:50%;background:#00C9D4"></div>
        </div>
      </div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  })
}

// Dark map tile — CartoDB Dark Matter (free, no key needed)
const DARK_TILE = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
const TILE_ATTR = '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

export default function LiveMap({
  packets = [],
  responders = [],
  assignments = [],
  selfLocation = null,   // { lat, lng } — for responder "you are here"
  center = [9.9312, 76.2673],
  zoom = 14,
  height = '100%',
  dark = true,
  onSOSClick = null,
}) {
  const mapRef = useRef(null)
  const containerRef = useRef(null)
  const layersRef = useRef({ sos: {}, responders: {}, lines: [] })

  // Init map once
  useEffect(() => {
    if (mapRef.current) return
    const map = L.map(containerRef.current, { zoomControl: true, attributionControl: false })
    L.tileLayer(DARK_TILE, { attribution: TILE_ATTR, maxZoom: 19 }).addTo(map)
    map.setView(center, zoom)
    mapRef.current = map

    // Fix tile rendering when container is resized (panel drag, scroll, tab switch)
    const ro = new ResizeObserver(() => {
      map.invalidateSize({ animate: false })
    })
    ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Re-center when center prop changes (e.g. switching scenarios)
  useEffect(() => {
    if (mapRef.current) mapRef.current.setView(center, zoom)
  }, [center[0], center[1]])

  // Update SOS markers
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const existing = layersRef.current.sos

    // Remove stale
    Object.keys(existing).forEach(id => {
      if (!packets.find(p => p.id === id)) { existing[id].remove(); delete existing[id] }
    })

    // Add / update
    packets.forEach(pkt => {
      if (!pkt.lat || !pkt.lng) return
      if (existing[pkt.id]) return  // already on map

      const marker = L.marker([pkt.lat, pkt.lng], { icon: sosIcon(pkt.severity) })
        .bindPopup(`
          <div style="font-family:monospace;font-size:11px;min-width:160px">
            <b style="color:${SEV_COLOR[pkt.severity]}">${pkt.severity.toUpperCase()}</b>
            &nbsp;<span style="color:#888">${pkt.packet_code || ''}</span><br/>
            <b>${pkt.victim_code}</b> · ${pkt.emergency_type}<br/>
            <span style="color:#aaa">${pkt.message || '—'}</span><br/>
            <span style="color:#666">${pkt.lat.toFixed(5)}, ${pkt.lng.toFixed(5)}</span>
          </div>`)
        .addTo(map)

      if (onSOSClick) marker.on('click', () => onSOSClick(pkt))
      existing[pkt.id] = marker
    })
  }, [packets])

  // Update responder markers
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const existing = layersRef.current.responders

    Object.keys(existing).forEach(code => {
      if (!responders.find(r => r.code === code)) { existing[code].remove(); delete existing[code] }
    })

    responders.forEach(r => {
      if (!r.lat || !r.lng) return
      if (existing[r.code]) {
        existing[r.code].setLatLng([r.lat, r.lng])
        return
      }
      const marker = L.marker([r.lat, r.lng], { icon: responderIcon(r.status, r.code) })
        .bindPopup(`
          <div style="font-family:monospace;font-size:11px">
            <b style="color:${STATUS_COLOR[r.status]}">${r.code}</b> · ${r.name}<br/>
            ${r.role} · Sector ${r.sector}<br/>
            Status: ${r.status} · Battery: ${r.battery}%<br/>
            <span style="color:#666">${r.lat?.toFixed(5)}, ${r.lng?.toFixed(5)}</span>
          </div>`)
        .addTo(map)
      existing[r.code] = marker
    })
  }, [responders])

  // Draw assignment lines
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    layersRef.current.lines.forEach(l => l.remove())
    layersRef.current.lines = []

    assignments.forEach(a => {
      const sos = packets.find(p => p.id === a.sos?.id || p.victim_code === a.sos?.victim_code)
      const resp = responders.find(r => r.code === a.responder_code)
      if (!sos?.lat || !resp?.lat) return

      const line = L.polyline(
        [[resp.lat, resp.lng], [sos.lat, sos.lng]],
        { color: '#00C9D4', weight: 2, dashArray: '6 4', opacity: 0.7 }
      ).addTo(map)
      layersRef.current.lines.push(line)
    })
  }, [assignments, packets, responders])

  // Self location (responder "you are here")
  useEffect(() => {
    const map = mapRef.current
    if (!map || !selfLocation) return
    L.marker([selfLocation.lat, selfLocation.lng], { icon: selfIcon() })
      .bindPopup('<span style="font-family:monospace;font-size:11px">You are here</span>')
      .addTo(map)
  }, [selfLocation])

  return (
    <div
      ref={containerRef}
      style={{ height, width: '100%' }}
      className="z-0"
    />
  )
}
