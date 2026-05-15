const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8001'
export const SELF_CODE = import.meta.env.VITE_RESPONDER_CODE || 'R-114'
const WS_BASE = BASE.replace(/^http/, 'ws')

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `HTTP ${res.status}`)
  }
  return res.json()
}

export const api = {
  // SOS
  postSOS: (data) => request('/sos/', { method: 'POST', body: JSON.stringify(data) }),
  resetDemo: () => request('/sos/reset-demo', { method: 'POST' }),
  getQueue: (status) => request(`/sos/queue${status ? `?status=${status}` : ''}`),
  getSOS: (id) => request(`/sos/${id}`),
  resolveSOS: (id) => request(`/sos/${id}/resolve`, { method: 'PATCH' }),
  manualDispatch: (sosId, responderCode) =>
    request(`/sos/${sosId}/manual-dispatch`, {
      method: 'POST',
      body: JSON.stringify({ responder_code: responderCode }),
    }),

  // Responders
  getResponders: () => request('/responders/'),
  postJSON: (path, data) => request(path, { method: 'POST', body: JSON.stringify(data) }),
  updateLocation: (code, data) =>
    request(`/responders/${code}/location`, { method: 'POST', body: JSON.stringify(data) }),
  setStatus: (code, status) =>
    request(`/responders/${code}/status?status=${status}`, { method: 'PATCH' }),

  // Assignments
  getAssignments: (limit = 20) => request(`/sos/assignments/recent?limit=${limit}`),

  // Ontology
  getEmergencyProfile: (type) => request(`/ontology/profile/${type}`),
  getHotspots: () => request('/ontology/hotspots'),

  // WebSocket factories
  supervisorWS: () => new WebSocket(`${WS_BASE}/ws/supervisor`),
  responderWS: (code) => new WebSocket(`${WS_BASE}/ws/responder/${code}`),
}
