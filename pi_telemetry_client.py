#!/usr/bin/env python3
import json
import os
import random
import time
from urllib import request


DASHBOARD_URL = os.environ.get("DASHBOARD_URL", "http://localhost:3000/api/telemetry")
SOURCE = os.environ.get("SAT_SOURCE", "raspberry-pi")


def read_cpu_temp():
    try:
        with open("/sys/class/thermal/thermal_zone0/temp", "r", encoding="utf-8") as temp_file:
            return round(int(temp_file.read().strip()) / 1000, 1)
    except OSError:
        return round(45 + random.random() * 5, 1)


def read_linux_load():
    try:
        one_minute_load = os.getloadavg()[0]
        cpu_count = os.cpu_count() or 1
        return round(min(100, (one_minute_load / cpu_count) * 100), 1)
    except OSError:
        return round(10 + random.random() * 20, 1)


def build_packet(sequence):
    return {
        "timestamp": int(time.time()),
        "packetId": f"PI-{sequence:06d}",
        "source": SOURCE,
        "altitude": round(100 + sequence * 0.8, 1),
        "temperature": round(22 + random.uniform(-1.5, 1.5), 1),
        "pressure": round(1013.25 - sequence * 0.05, 2),
        "humidity": round(40 + random.uniform(-5, 5), 1),
        "battery": round(max(0, 100 - sequence * 0.03), 1),
        "voltage": round(4.1 - sequence * 0.0002, 3),
        "current": round(180 + random.uniform(-20, 20), 1),
        "sysTemp": read_cpu_temp(),
        "cpuUsage": read_linux_load(),
        "memUsage": 0,
        "diskUsage": 0,
        "velocity": round(0.02 + sequence * 0.0001, 4),
        "attitude": {
            "pitch": round(random.uniform(-2, 2), 2),
            "roll": round(random.uniform(-2, 2), 2),
            "yaw": round((sequence * 2) % 360, 2),
        },
        "acceleration": {
            "x": round(random.uniform(-0.05, 0.05), 3),
            "y": round(random.uniform(-0.05, 0.05), 3),
            "z": round(9.8 + random.uniform(-0.05, 0.05), 3),
        },
        "gps": {
            "lat": 37.5665,
            "lng": 126.9780,
            "satellites": 8,
        },
    }


def post_packet(packet):
    body = json.dumps(packet).encode("utf-8")
    req = request.Request(
        DASHBOARD_URL,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with request.urlopen(req, timeout=5) as response:
        return response.read().decode("utf-8")


def main():
    interval = float(os.environ.get("SAT_INTERVAL", "2"))
    sequence = 1
    while True:
        packet = build_packet(sequence)
        try:
            result = post_packet(packet)
            print(f"sent {packet['packetId']} -> {result}")
        except OSError as exc:
            print(f"send failed: {exc}")
        sequence += 1
        time.sleep(interval)


if __name__ == "__main__":
    main()
