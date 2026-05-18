from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from db.database import create_tables
from routers import sos, responders, ws, ontology, dispatch
from seed import seed_responders


import os

@asynccontextmanager
async def lifespan(app: FastAPI):
    if os.getenv("FLUSH_DB") == "true":
        print("!!! FLUSH_DB=true: Dropping and recreating all tables !!!")
        from db.database import drop_tables
        await drop_tables()
        
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
app.include_router(ontology.router, prefix="/ontology", tags=["Ontology"])
app.include_router(dispatch.router, prefix="/sos", tags=["Dispatch"])
app.include_router(ws.router, tags=["WebSocket"])


@app.get("/health")
async def health():
    return {"status": "ok"}
