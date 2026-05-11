import math
from dataclasses import dataclass


@dataclass
class GeoPoint:
    lat: float
    lng: float


WALKING_SPEED_MS = 1.4   # m/s ≈ 5 km/h on foot through disaster terrain
DRIVE_SPEED_MS = 8.3     # m/s ≈ 30 km/h slow vehicle


def haversine_m(a: GeoPoint, b: GeoPoint) -> float:
    """Return distance in metres between two lat/lng points."""
    R = 6_371_000
    phi1, phi2 = math.radians(a.lat), math.radians(b.lat)
    dphi = math.radians(b.lat - a.lat)
    dlam = math.radians(b.lng - a.lng)
    h = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def bearing_label(a: GeoPoint, b: GeoPoint) -> str:
    dlng = b.lng - a.lng
    x = math.sin(math.radians(dlng)) * math.cos(math.radians(b.lat))
    y = math.cos(math.radians(a.lat)) * math.sin(math.radians(b.lat)) - (
        math.sin(math.radians(a.lat)) * math.cos(math.radians(b.lat)) * math.cos(math.radians(dlng))
    )
    bearing = (math.degrees(math.atan2(x, y)) + 360) % 360
    dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
    return dirs[round(bearing / 45) % 8]


def eta_minutes(distance_m: float, role: str) -> int:
    speed = DRIVE_SPEED_MS if role in ("rescue", "fire") else WALKING_SPEED_MS
    return max(1, round(distance_m / speed / 60))
