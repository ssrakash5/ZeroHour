# ZeroHour

AI-coordinated disaster response — mesh-networked SOS triage powered by Gemma 4.

Built for the **Gemma 4 Impact Challenge** · Global Resilience track.

---

## What it does

Victims in a disaster zone send an SOS from their phone. The signal hops through a peer-to-peer mesh network (Bluetooth/WiFi Direct) until it reaches a hub. Gemma 4 runs on-device or on an edge server, triages incoming packets by severity and type, and auto-dispatches the nearest best-fit responder — all in real time, with or without internet.

### Three interfaces

| Interface | Theme | Purpose |
|-----------|-------|---------|
| **Victim** | Calm light | Hold-to-send SOS, checklist progress, responder ETA |
| **Responder** | Ops dark | Triage queue, AI packet detail, map, mesh radar, profile |
| **Supervisor** | *(coming)* | Bird's-eye map, resource allocation, AI summaries |

---

## Architecture

```
Victim device (BLE beacon / SOS app)
    → Mesh relay (peer devices / drone)
        → Hub / edge server
            → Gemma 4 (triage + assignment)
                ↓
        PostgreSQL ← persists SOS + assignments
        Redis      ← live locations (TTL 30s) + pub/sub
                ↓
        WebSocket push
            → Responder app (new assignment)
            → Supervisor dashboard (all events)
```

### Tech stack

| Layer | Tech |
|-------|------|
| Frontend | React 18 + Vite + Tailwind CSS |
| Backend | FastAPI + uvicorn (async) |
| AI | Gemma 4 via Ollama (local, edge) |
| Primary DB | PostgreSQL 16 |
| Real-time | Redis 7 (pub/sub + live location cache) |
| ORM | SQLAlchemy 2 (async) |
| Infra | Docker Compose |

---

## Project structure

```
ZeroHour/
├── docker-compose.yml          # Postgres + Redis
├── frontend/
│   └── src/
│       ├── App.jsx             # Landing — role selector
│       ├── data/mockData.js
│       └── apps/
│           ├── victim/         # HomeScreen · SendingScreen · AcknowledgedScreen
│           └── responder/      # TriageScreen · PacketDetailSheet · MapScreen · MeshScreen · MeScreen
└── backend/
    ├── main.py                 # FastAPI app + lifespan
    ├── seed.py                 # Demo responders seeded on first start
    ├── schemas.py              # Pydantic I/O models
    ├── db/
    │   ├── database.py         # Async engine + settings
    │   └── models.py           # SOSPacket · Responder · Assignment
    ├── services/
    │   ├── gemma.py            # Ollama/Gemma 4 triage prompt + fallback
    │   ├── assignment.py       # Full pipeline: query → AI → persist → publish
    │   ├── geo.py              # Haversine distance + ETA
    │   └── pubsub.py           # Redis live locations + pub/sub channels
    └── routers/
        ├── sos.py              # POST /sos · GET /sos/queue
        ├── responders.py       # Register · heartbeat · live locations
        └── ws.py               # /ws/supervisor · /ws/responder/{code}
```

---

## Getting started

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [Node.js 20+](https://nodejs.org/)
- [Python 3.11+](https://www.python.org/)
- [Ollama](https://ollama.com/) with `gemma3:4b` pulled

### 1. Clone & configure

```bash
git clone <repo-url>
cd ZeroHour

cp backend/.env.example backend/.env
# Edit backend/.env if your ports differ
```

### 2. Start infrastructure

```bash
docker compose up -d
```

Postgres will be available at `localhost:5432`, Redis at `localhost:6379`.

### 3. Start the backend

```bash
cd backend
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

On first start, tables are auto-created and 5 demo responders are seeded.

API docs: [http://localhost:8000/docs](http://localhost:8000/docs)

### 4. Start Ollama (in a separate terminal)

```bash
ollama serve
ollama pull gemma3:4b
```

> If Ollama is unreachable, the assignment engine falls back to nearest role-matched responder automatically.

### 5. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) and select a role.

---

## API reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/sos/` | Submit a new SOS — triggers AI assignment |
| `GET` | `/sos/queue` | List all SOS packets (filter by `?status=pending`) |
| `PATCH` | `/sos/{id}/resolve` | Mark an SOS as resolved |
| `POST` | `/responders/` | Register a responder |
| `POST` | `/responders/{code}/location` | Heartbeat — update live GPS |
| `GET` | `/responders/live/locations` | All responders active in last 30 s |
| `PATCH` | `/responders/{code}/status` | Set available / en_route / busy |
| `WS` | `/ws/supervisor` | Real-time feed of all events |
| `WS` | `/ws/responder/{code}` | Real-time assignments for one responder |

### Example SOS payload

```json
POST /sos/
{
  "victim_code": "V-2891",
  "lat": 28.6139,
  "lng": 77.2090,
  "severity": "critical",
  "emergency_type": "medical",
  "message": "Trapped — water rising. Two children with me.",
  "has_audio": true,
  "has_image": true,
  "hops": 2
}
```

---

## How the AI assignment works

1. SOS saved to Postgres → broadcast to supervisor via WebSocket
2. All `available` responders queried from DB
3. Haversine distance computed for each; filtered to ≤ 5 km
4. Top 5 candidates (sorted by distance) sent to Gemma 4 with a structured prompt
5. Gemma returns `{ assign, reason, eta_minutes, confidence }`
6. Assignment persisted; responder marked `en_route`
7. Redis pub/sub pushes the assignment to the responder's WebSocket channel

---

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql+asyncpg://zerohour:zerohour@localhost:5432/zerohour` | Postgres connection |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection |
| `OLLAMA_URL` | `http://localhost:11434` | Ollama server |
| `OLLAMA_MODEL` | `gemma3:4b` | Model to use for triage |

---

## Hackathon context

- **Competition**: Gemma 4 Impact Challenge (Kaggle)
- **Track**: Global Resilience · $10,000
- **Deadline**: May 18, 2026
- **Model**: Gemma 4 (gemma3:4b via Ollama — local/edge inference)
