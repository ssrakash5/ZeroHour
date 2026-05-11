from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from db.database import create_tables
from routers import sos, responders, ws
from seed import seed_responders


@asynccontextmanager
async def lifespan(app: FastAPI):
    await create_tables()
    await seed_responders()
    yield


app = FastAPI(title="ZeroHour API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sos.router, prefix="/sos", tags=["SOS"])
app.include_router(responders.router, prefix="/responders", tags=["Responders"])
app.include_router(ws.router, tags=["WebSocket"])


@app.get("/health")
async def health():
    return {"status": "ok"}
