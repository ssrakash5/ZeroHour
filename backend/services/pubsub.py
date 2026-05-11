import json
import redis.asyncio as aioredis
from db.database import settings

_redis: aioredis.Redis | None = None


def get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis


# ── Live responder location (TTL 30 s) ───────────────────────────────────────

async def set_responder_location(code: str, lat: float, lng: float, battery: int | None = None):
    r = get_redis()
    data = {"lat": lat, "lng": lng}
    if battery is not None:
        data["battery"] = battery
    await r.setex(f"loc:{code}", 30, json.dumps(data))


async def get_responder_location(code: str) -> dict | None:
    r = get_redis()
    raw = await r.get(f"loc:{code}")
    return json.loads(raw) if raw else None


async def get_all_live_locations() -> dict[str, dict]:
    r = get_redis()
    keys = await r.keys("loc:*")
    result = {}
    for key in keys:
        raw = await r.get(key)
        if raw:
            code = key.removeprefix("loc:")
            result[code] = json.loads(raw)
    return result


# ── Pub/Sub publishing ────────────────────────────────────────────────────────

async def publish(channel: str, event: str, payload: dict):
    r = get_redis()
    message = json.dumps({"event": event, "payload": payload})
    await r.publish(channel, message)


async def publish_sos_new(sos_data: dict):
    await publish("supervisor", "sos:new", sos_data)


async def publish_assignment(responder_code: str, assignment_data: dict):
    await publish(f"responder:{responder_code}", "assignment:new", assignment_data)
    await publish("supervisor", "assignment:new", assignment_data)


async def publish_location_update(responder_code: str, lat: float, lng: float):
    await publish("supervisor", "location:update", {
        "responder_code": responder_code,
        "lat": lat,
        "lng": lng,
    })
