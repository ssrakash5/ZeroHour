# ZeroHour — GCP Deployment Guide

Two Cloud Run services (scale-to-zero, no idle charges):

```
zerohour-backend   → FastAPI               (1 GB / 1 CPU)
zerohour-frontend  → React + nginx         (256 MB / 1 CPU)
```

Gemma 4 27B runs via **Google AI Studio API** — no self-hosted GPU needed.

---

## Prerequisites

```bash
# Install gcloud CLI: https://cloud.google.com/sdk/docs/install
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# Install Docker Desktop (needed to build images locally)
```

---

## Step 0 — One-time project setup

```bash
bash gcp-setup.sh
```

---

## Step 1 — Get a Gemini API key

1. Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. Create a key → copy it
3. Verify Gemma 4 27B is available (model: `gemma-4-27b-it`)

```bash
export GEMINI_API_KEY="your-key-here"
```

> If `GEMINI_API_KEY` is unset, the system falls back to the algorithm-only top pick automatically — the app still works, just without AI reasoning.

---

## Step 2 — Databases (free managed)

| Service | Provider | Free tier |
|---------|----------|-----------|
| Postgres | [Neon](https://neon.tech) | 0.5 GB / 1 branch |
| Redis | [Upstash](https://upstash.com) | 10k commands/day |

```bash
export DB_URL="postgresql+asyncpg://user:pass@ep-xxx.neon.tech/zerohour?sslmode=require"
export REDIS_URL="redis://:password@host.upstash.io:port"
```

---

## Step 3 — Deploy Backend (FastAPI)

```bash
# GEMINI_API_KEY, DB_URL, REDIS_URL must be set
bash deploy-backend-gcp.sh
```

Copy the output URL:
```bash
export BACKEND_URL="https://zerohour-backend-xxxx-uc.a.run.app"
```

---

## Step 4 — Deploy Frontend (React + nginx)

```bash
# BACKEND_URL must be set
bash deploy-frontend-gcp.sh
```

`VITE_API_URL` is baked into the static bundle at build time via `--build-arg`.

---

## Full deploy cheatsheet

```bash
bash gcp-setup.sh                          # once

export GEMINI_API_KEY="your-key"
export DB_URL="postgresql+asyncpg://..."
export REDIS_URL="redis://..."

bash deploy-backend-gcp.sh
export BACKEND_URL="https://zerohour-backend-xxxx-uc.a.run.app"

bash deploy-frontend-gcp.sh
```

---

## Environment Variables

| Service | Variable | Value |
|---------|----------|-------|
| Backend | `DATABASE_URL` | Neon Postgres URL |
| Backend | `REDIS_URL` | Upstash Redis URL |
| Backend | `GEMINI_API_KEY` | Google AI Studio key |
| Backend | `GEMINI_MODEL` | `gemma-4-27b-it` |
| Frontend | `VITE_API_URL` | Cloud Run backend URL (baked at build) |

---

## Architecture

```
Browser ──► zerohour-frontend (Cloud Run / nginx)
                │
                │ REST + WebSocket
                ▼
         zerohour-backend (Cloud Run / FastAPI)
                │                    │
           PostgreSQL             Redis pub/sub
           (Neon)                 (Upstash)
                │
                │ HTTPS (Gemini API)
                ▼
         Google AI Studio
         Gemma 4 27B (gemma-4-27b-it)
```

**Fallback**: If `GEMINI_API_KEY` is unset or the API returns an error, the algorithm top pick is used automatically (`ai_available: false` in the response). The UI always gets a result.

---

## Local Development

```bash
# Start Postgres + Redis
docker-compose up -d

# Backend
cd backend && pip install -r requirements.txt
# Add GEMINI_API_KEY to backend/.env
uvicorn main:app --reload

# Frontend
cd frontend && npm install && npm run dev
```
