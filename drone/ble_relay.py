#!/usr/bin/env python3
"""
ZeroHour Drone BLE Relay
========================
Runs on the drone's companion computer (Raspberry Pi / any Linux or Windows with BLE).

Primary path  — GATT:
  Scans for phones advertising service UUID 5a480001-... (ZeroHour SOS service),
  connects, reads the full SOS JSON off the characteristic, POSTs to hub, then
  broadcasts a 7-byte ACK beacon so the phone can confirm pick-up.

Fallback path — legacy 17-byte advertising packet:
  If a device advertises manufacturer ID 0x5A48 with a 17-byte payload (old format
  or Gemma not loaded on phone), parses the compact packet and relays with the
  available fields only.

Install: pip install -r requirements.txt
Run:     python ble_relay.py --hub https://your-backend.railway.app
"""

import asyncio
import json
import platform
import struct
import argparse
import httpx
import time
import subprocess
from bleak import BleakScanner, BleakClient
from bleak.backends.device import BLEDevice
from bleak.backends.scanner import AdvertisementData

ZEROHOUR_MFR_ID   = 0x5A48
SOS_SERVICE_UUID   = "5a480001-0000-1000-8000-00805f9b34fb"
SOS_DATA_CHAR_UUID = "5a480002-0000-1000-8000-00805f9b34fb"
SOS_ACK_CHAR_UUID  = "5a480003-0000-1000-8000-00805f9b34fb"
ACK_FLAG          = 0xFF

SEVERITY_MAP = {0: "low", 1: "urgent", 2: "critical"}
TYPE_MAP = {
    0: "medical", 1: "fire", 2: "flood",
    3: "structural", 4: "violence", 5: "unknown", 6: "trapped",
}

_relayed: dict[str, float] = {}        # victim_code → last relay time
_addr_relayed: dict[str, float] = {}   # device address → last relay time
_connecting: set[str] = set()          # device addresses currently being connected
DEDUP_WINDOW_S = 30


# ── Payload parsers ───────────────────────────────────────────────────────────

def parse_legacy_payload(data: bytes) -> dict | None:
    """Parse the compact 17-byte advertising packet."""
    if len(data) < 17:
        return None
    victim_code = data[0:6].decode("ascii", errors="replace").strip()
    lat, lng = struct.unpack_from("<ff", data, 6)
    return {
        "victim_code": victim_code,
        "lat": lat,
        "lng": lng,
        "severity": SEVERITY_MAP.get(data[14], "urgent"),
        "emergency_type": TYPE_MAP.get(data[15], "unknown"),
        "hops": data[16],
        "has_audio": False,
        "has_image": False,
    }


# ── Hub relay ─────────────────────────────────────────────────────────────────

async def relay_to_hub(hub_url: str, packet: dict):
    """POST the SOS packet to the hub. Returns True on success."""
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(f"{hub_url}/sos/", json=packet)
        print(f"[relay] POST /sos/ → {resp.status_code}  victim={packet.get('victim_code')}")
        if resp.status_code in (200, 201):
            data = resp.json()
            assignment = data.get("assignment")
            if assignment:
                print(f"[relay] Responder: {assignment.get('responder_name')} ETA {assignment.get('eta_minutes')} min")
            return True
    return False


async def relay(hub_url: str, packet: dict):
    """Relay a legacy 17-byte packet — use beacon ACK since no GATT connection."""
    await relay_to_hub(hub_url, packet)
    await broadcast_ack(packet["victim_code"])


# ── GATT client ───────────────────────────────────────────────────────────────

async def handle_gatt_sos(device: BLEDevice, hub_url: str):
    addr = device.address
    now = time.time()
    if addr in _connecting:
        return
    if addr in _addr_relayed and now - _addr_relayed[addr] < DEDUP_WINDOW_S:
        return
    _connecting.add(addr)
    print(f"[GATT] Connecting to {addr}…")
    try:
        async with BleakClient(device, timeout=15.0) as client:
            # Request larger MTU so full JSON payload fits in one read
            try:
                await client.request_mtu(512)
                print(f"[GATT] MTU negotiated for {addr}")
            except Exception as mtu_err:
                print(f"[GATT] MTU negotiation skipped ({mtu_err})")

            # 1. Read full SOS JSON
            raw = await client.read_gatt_char(SOS_DATA_CHAR_UUID)
            raw_str = raw.decode("utf-8")

            # Detect truncated JSON (BLE cut mid-string) and attempt repair
            if not raw_str.rstrip().endswith("}"):
                open_count = raw_str.count("{") - raw_str.count("}")
                raw_str = raw_str.rstrip().rstrip(",") + ("}" * max(open_count, 1))
                print(f"[GATT] JSON truncated at {len(raw)} bytes — repaired")

            sos = json.loads(raw_str)

            code = sos.get("victim_code", "unknown")
            now = time.time()
            if code in _relayed and now - _relayed[code] < DEDUP_WINDOW_S:
                print(f"[GATT] Duplicate — skipping {code}")
                return
            _relayed[code] = now
            _addr_relayed[addr] = now

            print(f"[GATT] SOS from {code} | {sos.get('lat'):.5f},{sos.get('lng'):.5f} | "
                  f"{sos.get('emergency_type')} {sos.get('severity')} | "
                  f"device_triage={'yes' if sos.get('device_triage') else 'no'} | "
                  f"message_len={len(sos.get('message') or '')}")

            # 2. Relay to hub
            await relay_to_hub(hub_url, sos)

            # 3. Write ACK back via same GATT connection — most reliable, no role switch needed
            try:
                ack_bytes = code.ljust(6)[:6].encode("ascii")
                await client.write_gatt_char(SOS_ACK_CHAR_UUID, ack_bytes, response=True)
                print(f"[GATT] ACK written to phone for {code}")
            except Exception as ack_err:
                print(f"[GATT] GATT ACK failed ({ack_err}) — falling back to beacon")
                await broadcast_ack(code)

    except Exception as e:
        print(f"[GATT] Error reading {addr}: {e}")
    finally:
        _connecting.discard(addr)


# ── ACK beacon ────────────────────────────────────────────────────────────────

def _ack_payload(victim_code: str) -> bytes:
    return victim_code.ljust(6)[:6].encode("ascii") + bytes([ACK_FLAG])


async def _broadcast_ack_windows(payload: bytes, duration_s: float):
    try:
        from winsdk.windows.devices.bluetooth.advertisement import (
            BluetoothLEAdvertisementPublisher,
            BluetoothLEAdvertisement,
            BluetoothLEManufacturerData,
        )
        from winsdk.windows.storage.streams import DataWriter
    except ImportError:
        print("[ack] winsdk not installed — run: pip install winsdk")
        return
    mfr = BluetoothLEManufacturerData()
    mfr.company_id = ZEROHOUR_MFR_ID
    writer = DataWriter()
    for b in payload:
        writer.write_byte(b)
    mfr.data = writer.detach_buffer()
    adv = BluetoothLEAdvertisement()
    adv.manufacturer_data.append(mfr)
    publisher = BluetoothLEAdvertisementPublisher(adv)
    try:
        publisher.start()
        await asyncio.sleep(duration_s)
    finally:
        publisher.stop()


async def _broadcast_ack_linux(payload: bytes, duration_s: float):
    ad = bytes([0x0A, 0xFF, 0x48, 0x5A]) + payload
    adv_args = [f"0x{len(ad):02X}"] + [f"0x{b:02X}" for b in ad] + ["0x00"] * (31 - len(ad))
    try:
        subprocess.run(["hcitool", "-i", "hci0", "cmd", "0x08", "0x0006",
                        "0xA0", "0x00", "0xA0", "0x00", "0x03",
                        "0x00", "0x00", "0x00", "0x00", "0x00", "0x00", "0x00",
                        "0x07", "0x00"], capture_output=True, check=False)
        subprocess.run(["hcitool", "-i", "hci0", "cmd", "0x08", "0x0008"] + adv_args,
                       capture_output=True, check=False)
        subprocess.run(["hcitool", "-i", "hci0", "cmd", "0x08", "0x000A", "0x01"],
                       capture_output=True, check=False)
        await asyncio.sleep(duration_s)
    finally:
        subprocess.run(["hcitool", "-i", "hci0", "cmd", "0x08", "0x000A", "0x00"],
                       capture_output=True, check=False)


async def broadcast_ack(victim_code: str, duration_s: float = 6.0):
    print(f"[ack] Broadcasting ACK for {victim_code} ({duration_s}s)")
    payload = _ack_payload(victim_code)
    try:
        if platform.system() == "Windows":
            await _broadcast_ack_windows(payload, duration_s)
        elif platform.system() == "Linux":
            await _broadcast_ack_linux(payload, duration_s)
        else:
            print(f"[ack] Platform '{platform.system()}' not supported — skipping ACK beacon")
    except Exception as e:
        print(f"[ack] Error: {e}")
    print(f"[ack] ACK done for {victim_code}")


# ── BLE scan callback ─────────────────────────────────────────────────────────

def make_callback(hub_url: str, loop: asyncio.AbstractEventLoop, verbose: bool = False):
    def callback(device: BLEDevice, adv: AdvertisementData):
        mfr = adv.manufacturer_data

        if verbose and mfr:
            for mid, mdata in mfr.items():
                print(f"[scan] {device.address} rssi={adv.rssi} mfr=0x{mid:04X} data={mdata.hex()}")

        # ── GATT SOS: connectable device advertising our service UUID ─────────
        service_uuids = [str(u).lower() for u in (adv.service_uuids or [])]
        if SOS_SERVICE_UUID in service_uuids and device.address not in _connecting:
            asyncio.run_coroutine_threadsafe(handle_gatt_sos(device, hub_url), loop)
            return

        # ── Legacy 17-byte packet ─────────────────────────────────────────────
        if ZEROHOUR_MFR_ID not in mfr:
            return
        raw = mfr[ZEROHOUR_MFR_ID]

        # Ignore ACK beacons and GATT markers
        if len(raw) == 7 and raw[6] == ACK_FLAG:
            return
        if len(raw) == 1 and raw[0] == 0x01:
            return  # GATT SOS marker without service UUID yet visible

        payload = parse_legacy_payload(raw)
        if payload is None:
            return

        code = payload["victim_code"]
        now = time.time()
        if code in _relayed and now - _relayed[code] < DEDUP_WINDOW_S:
            return
        _relayed[code] = now

        print(f"[scan] Legacy SOS from {code} | {payload['lat']:.5f},{payload['lng']:.5f} | "
              f"{payload['emergency_type']} {payload['severity']} | hops={payload['hops']}")
        asyncio.run_coroutine_threadsafe(relay(hub_url, payload), loop)

    return callback


# ── Main ──────────────────────────────────────────────────────────────────────

async def main(hub_url: str, verbose: bool = False):
    print(f"[drone] ZeroHour BLE Relay — scanning → {hub_url}")
    print(f"[drone] GATT service: {SOS_SERVICE_UUID}")
    loop = asyncio.get_event_loop()
    scanner = BleakScanner(detection_callback=make_callback(hub_url, loop, verbose=verbose))
    await scanner.start()
    print("[drone] Scanning… (Ctrl+C to stop)")
    try:
        while True:
            await asyncio.sleep(1)
    except KeyboardInterrupt:
        pass
    finally:
        await scanner.stop()
        print("[drone] Stopped.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--hub", default="http://localhost:8001")
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()
    asyncio.run(main(args.hub, verbose=args.verbose))
