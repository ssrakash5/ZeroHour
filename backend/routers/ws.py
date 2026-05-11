"""
WebSocket endpoints:
  /ws/supervisor          → receives all events (sos:new, assignment:new, location:update)
  /ws/responder/{code}    → receives only events for that responder
"""
import asyncio
import json
import redis.asyncio as aioredis
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from services.pubsub import get_redis

router = APIRouter()


async def _listen(ws: WebSocket, channel: str):
    r: aioredis.Redis = get_redis()
    pubsub = r.pubsub()
    await pubsub.subscribe(channel)
    try:
        async for message in pubsub.listen():
            if message["type"] == "message":
                await ws.send_text(message["data"])
    except (WebSocketDisconnect, asyncio.CancelledError):
        pass
    finally:
        await pubsub.unsubscribe(channel)
        await pubsub.aclose()


@router.websocket("/ws/supervisor")
async def supervisor_ws(ws: WebSocket):
    await ws.accept()
    try:
        await _listen(ws, "supervisor")
    except WebSocketDisconnect:
        pass


@router.websocket("/ws/responder/{code}")
async def responder_ws(ws: WebSocket, code: str):
    await ws.accept()
    try:
        await _listen(ws, f"responder:{code}")
    except WebSocketDisconnect:
        pass
