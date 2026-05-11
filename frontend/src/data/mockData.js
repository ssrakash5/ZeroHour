export const mockPackets = [
  {
    id: 'V-2891',
    severity: 'critical',
    victimDesc: 'woman, 30s',
    pktId: 'PKT-7F2A',
    message: 'Trapped — water rising. Two children with me.',
    modelScore: 0.91,
    tags: ['audio:distress', 'image:water', 'kw:trapped'],
    hops: 2,
    distance: '340 m NE',
    time: '14:02:07',
    path: ['V', 'P-23', 'P-08', 'R-114'],
  },
  {
    id: 'V-2885',
    severity: 'critical',
    victimDesc: 'man, 60s',
    pktId: 'PKT-7F19',
    message: 'Cardiac symptoms · self-reported chest pain',
    modelScore: 0.87,
    tags: ['audio:pain', 'kw:cardiac'],
    hops: 1,
    distance: '120 m E',
    time: '14:01:45',
    path: ['V', 'P-12', 'R-118'],
    assignedTo: 'R-118',
  },
  {
    id: 'V-2879',
    severity: 'urgent',
    victimDesc: 'group of 4',
    pktId: 'PKT-7F11',
    message: 'Trapped under partial collapse · 1 leg injury',
    modelScore: 0.74,
    tags: ['audio:pain', 'kw:trapped', 'kw:injury'],
    hops: 3,
    distance: '610 m N',
    time: '13:58:30',
    path: ['V', 'P-31', 'P-08', 'P-23', 'R-114'],
  },
]

export const mockResponder = {
  id: 'R-114',
  name: 'A. Kumar',
  role: 'medic',
  sector: 14,
  location: 'Delhi NCR north',
  onDutyFrom: '13:42',
  dispatched: 7,
  active: 2,
  medianEta: 6,
  battery: 72,
}

export const mockPeers = [
  { id: 'P-23', type: 'phone', distance: '180 m', signal: 92, lat: 0.35, lng: 0.55 },
  { id: 'P-04', type: 'gateway', distance: '720 m', signal: 88, lat: 0.6, lng: 0.3 },
  { id: 'R-118', type: 'responder', distance: '610 m', signal: 56, lat: 0.7, lng: 0.65 },
]

export const mapPins = [
  { id: 'V-2891', severity: 'critical', x: 48, y: 42 },
  { id: 'V-2885', severity: 'critical', x: 55, y: 60 },
  { id: 'V-2879', severity: 'urgent', x: 35, y: 30 },
  { id: 'V-2870', severity: 'urgent', x: 65, y: 25 },
  { id: 'R-114', severity: 'self', x: 52, y: 52 },
]
