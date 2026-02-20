#!/usr/bin/env python3
"""
MQTT Telemetry Simulator for ThingsBoard PE Industrial Historian.

Generates realistic industrial process data for 24 tags across two ESP wells
and two compressors.  Each tag is a separate ThingsBoard Device authenticated
by its own access token.

Usage examples
--------------
  # 1. Fetch device access tokens from ThingsBoard REST API
  python mqtt_simulator.py --fetch-tokens

  # 2. Run continuous simulation at 1-second scan rate
  python mqtt_simulator.py --tokens tokens.json --scan-rate 1

  # 3. Generate 24 hours of backfill data at 5-second intervals
  python mqtt_simulator.py --tokens tokens.json --historical 24 --scan-rate 5

  # 4. Run for 10 minutes (quality Q=192 is always included by default)
  python mqtt_simulator.py --tokens tokens.json --duration 600

Dependencies: paho-mqtt, requests
"""

from __future__ import annotations

import argparse
import json
import logging
import math
import os
import random
import signal
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    import paho.mqtt.client as mqtt
except ImportError:
    sys.exit("paho-mqtt is required.  Install with:  pip install paho-mqtt")

try:
    import requests
except ImportError:
    requests = None  # Only needed for --fetch-tokens

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("mqtt_simulator")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
MQTT_TOPIC = "v1/devices/me/telemetry"
DEFAULT_SERVER = "panel.atilax.io"
DEFAULT_MQTT_HOST = "144.126.150.120"
DEFAULT_MQTT_PORT = 1883
DEFAULT_SCAN_RATE = 1  # seconds
DEFAULT_TOKENS_FILE = "tokens.json"
DEFAULT_TB_USER = "well@atilax.io"
DEFAULT_TB_PASS = "10203040"
OPC_QUALITY_GOOD = 192

# ---------------------------------------------------------------------------
# Tag Definitions
# ---------------------------------------------------------------------------

@dataclass
class TagDefinition:
    """Immutable specification of a single industrial tag."""
    name: str
    tag_type: str       # pressure | flow | temperature | current | vibration | digital
    units: str
    low: float
    high: float
    setpoint: float
    noise: float
    group: str          # e.g. "ESP001", "C002"
    correlated_with: Optional[str] = None  # tag name this tag tracks


# fmt: off
TAG_DEFINITIONS: List[TagDefinition] = [
    # ── ESP Well 1 ────────────────────────────────────────────────────────
    TagDefinition("ESP001_PIT_001", "pressure",    "PSI",  0, 5000,  2500, 50,  "ESP001"),
    TagDefinition("ESP001_FIT_001", "flow",        "BPD",  0, 10000, 5000, 100, "ESP001"),
    TagDefinition("ESP001_VIB_001", "vibration",   "g",    0, 10,    0.5,  0.2, "ESP001"),
    TagDefinition("ESP001_TIT_001", "temperature", "degF", 100, 400, 250,  5,   "ESP001", correlated_with="ESP001_PIT_001"),
    TagDefinition("ESP001_AMP_001", "current",     "A",    0, 200,   100,  3,   "ESP001", correlated_with="ESP001_FIT_001"),
    TagDefinition("ESP001_RUN_001", "digital",     "-",    0, 1,     1,    0,   "ESP001"),
    # ── ESP Well 2 ────────────────────────────────────────────────────────
    TagDefinition("ESP002_PIT_001", "pressure",    "PSI",  0, 5000,  2400, 50,  "ESP002"),
    TagDefinition("ESP002_FIT_001", "flow",        "BPD",  0, 10000, 4800, 100, "ESP002"),
    TagDefinition("ESP002_VIB_001", "vibration",   "g",    0, 10,    0.6,  0.2, "ESP002"),
    TagDefinition("ESP002_TIT_001", "temperature", "degF", 100, 400, 255,  5,   "ESP002", correlated_with="ESP002_PIT_001"),
    TagDefinition("ESP002_AMP_001", "current",     "A",    0, 200,   105,  3,   "ESP002", correlated_with="ESP002_FIT_001"),
    TagDefinition("ESP002_RUN_001", "digital",     "-",    0, 1,     1,    0,   "ESP002"),
    # ── Compressor 1 ─────────────────────────────────────────────────────
    TagDefinition("C001_PIT_001",   "pressure",    "PSI",  0, 500,   200,  5,   "C001"),
    TagDefinition("C001_PIT_002",   "pressure",    "PSI",  0, 3000,  1500, 15,  "C001"),
    TagDefinition("C001_TIT_001",   "temperature", "degF", 100, 600, 350,  8,   "C001", correlated_with="C001_PIT_002"),
    TagDefinition("C001_AMP_001",   "current",     "A",    0, 500,   250,  5,   "C001", correlated_with="C001_PIT_002"),
    TagDefinition("C001_VIB_001",   "vibration",   "g",    0, 10,    0.5,  0.2, "C001"),
    TagDefinition("C001_RUN_001",   "digital",     "-",    0, 1,     1,    0,   "C001"),
    # ── Compressor 2 ─────────────────────────────────────────────────────
    TagDefinition("C002_PIT_001",   "pressure",    "PSI",  0, 500,   210,  5,   "C002"),
    TagDefinition("C002_PIT_002",   "pressure",    "PSI",  0, 3000,  1550, 15,  "C002"),
    TagDefinition("C002_TIT_001",   "temperature", "degF", 100, 600, 360,  8,   "C002", correlated_with="C002_PIT_002"),
    TagDefinition("C002_AMP_001",   "current",     "A",    0, 500,   260,  5,   "C002", correlated_with="C002_FIT_001" if False else "C002_PIT_002"),
    TagDefinition("C002_VIB_001",   "vibration",   "g",    0, 10,    0.6,  0.2, "C002"),
    TagDefinition("C002_RUN_001",   "digital",     "-",    0, 1,     1,    0,   "C002"),
]
# fmt: on

TAG_BY_NAME: Dict[str, TagDefinition] = {t.name: t for t in TAG_DEFINITIONS}

# ---------------------------------------------------------------------------
# Tag State  -- mutable runtime state for a single tag
# ---------------------------------------------------------------------------

@dataclass
class TagState:
    """Mutable runtime state that evolves each scan cycle."""
    definition: TagDefinition
    value: float = 0.0
    # Internal accumulators for realistic patterns
    random_walk: float = 0.0           # slow drift component
    daily_phase: float = 0.0           # phase offset for daily sinusoid
    step_target: float = 0.0           # target after a step change
    step_remaining: int = 0            # scans left ramping to step_target
    digital_on: bool = True
    digital_off_remaining: int = 0     # scans remaining in OFF period
    digital_next_toggle: int = 0       # scans until next OFF event
    vibration_spike_remaining: int = 0 # scans remaining in a spike event
    vibration_spike_level: float = 0.0

    def __post_init__(self):
        d = self.definition
        self.value = d.setpoint
        self.random_walk = 0.0
        self.daily_phase = random.uniform(0, 2 * math.pi)
        self.step_target = d.setpoint
        # Digital tags: schedule first toggle
        if d.tag_type == "digital":
            self.digital_next_toggle = random.randint(1500, 2400)  # ~25-40 min at 1 s scan


# ---------------------------------------------------------------------------
# Simulation Engine
# ---------------------------------------------------------------------------

class SimulationEngine:
    """Computes next-value for every tag each scan cycle.

    The engine keeps the full set of TagState objects so that correlated
    tags (temperature following pressure, current following flow) can look
    up the current value of their driver.
    """

    def __init__(self, definitions: List[TagDefinition], scan_rate: float = 1.0):
        self.scan_rate = scan_rate
        self.states: Dict[str, TagState] = {}
        for d in definitions:
            self.states[d.name] = TagState(definition=d)
        self.tick: int = 0  # monotonic scan counter

    # ---- public API -------------------------------------------------------

    def advance(self, sim_time: Optional[float] = None) -> Dict[str, float]:
        """Compute one scan cycle.  Returns {tag_name: new_value}."""
        self.tick += 1
        t = sim_time if sim_time is not None else time.time()

        results: Dict[str, float] = {}
        # Process digital first (run status affects analog tags)
        for name, state in self.states.items():
            if state.definition.tag_type == "digital":
                results[name] = self._next_digital(state)

        # Process analog tags in dependency order:
        #   1. pressure / flow  (independent)
        #   2. temperature / current  (depend on pressure/flow)
        #   3. vibration  (semi-independent)
        for name, state in self.states.items():
            if state.definition.tag_type in ("pressure", "flow"):
                results[name] = self._next_analog(state, t)
        for name, state in self.states.items():
            if state.definition.tag_type in ("temperature", "current"):
                results[name] = self._next_correlated(state, t)
        for name, state in self.states.items():
            if state.definition.tag_type == "vibration":
                results[name] = self._next_vibration(state)

        # If a group's RUN tag is OFF, force analog values to zero / low
        self._apply_shutdown_logic(results)

        return results

    # ---- private generators -----------------------------------------------

    def _next_analog(self, state: TagState, t: float) -> float:
        """Pressure and flow: random walk + daily sinusoid + occasional step changes."""
        d = state.definition

        # Random walk (mean-reverting Ornstein-Uhlenbeck-like)
        reversion_strength = 0.002
        state.random_walk += (
            -reversion_strength * state.random_walk
            + d.noise * 0.3 * random.gauss(0, 1) * math.sqrt(self.scan_rate)
        )

        # Daily sinusoidal cycle (24 h period)
        hour_of_day = (t % 86400) / 3600.0
        daily_component = d.noise * 1.5 * math.sin(
            2 * math.pi * hour_of_day / 24.0 + state.daily_phase
        )

        # Occasional step change (probability ~0.05 % per scan at 1 s)
        if state.step_remaining > 0:
            # Ramp toward step target
            ramp_rate = (state.step_target - d.setpoint) / 300  # ramp over ~5 min
            state.random_walk += ramp_rate * self.scan_rate
            state.step_remaining -= 1
        else:
            if random.random() < 0.0005 * self.scan_rate:
                # New step change: shift setpoint by up to +/- 3x noise
                delta = random.gauss(0, d.noise * 3)
                state.step_target = d.setpoint + delta
                state.step_remaining = random.randint(200, 600)

        # High-frequency noise
        hf_noise = d.noise * 0.5 * random.gauss(0, 1)

        raw = d.setpoint + state.random_walk + daily_component + hf_noise
        state.value = max(d.low, min(d.high, round(raw, 2)))
        return state.value

    def _next_correlated(self, state: TagState, t: float) -> float:
        """Temperature and current: follow a driver tag with lag and added noise."""
        d = state.definition
        driver_name = d.correlated_with
        if driver_name and driver_name in self.states:
            driver_state = self.states[driver_name]
            driver_def = driver_state.definition
            # Normalized deviation of driver from its setpoint (-1 .. +1 ish)
            if driver_def.setpoint != 0:
                driver_deviation = (
                    (driver_state.value - driver_def.setpoint) / driver_def.setpoint
                )
            else:
                driver_deviation = 0.0

            # Temperature: thermal lag (exponential smoothing)
            # Current: faster response to flow/pressure changes
            if d.tag_type == "temperature":
                lag_alpha = 0.005 * self.scan_rate  # slow
            else:
                lag_alpha = 0.05 * self.scan_rate   # faster for current

            target = d.setpoint * (1.0 + 0.15 * driver_deviation)
            state.value += lag_alpha * (target - state.value)
        else:
            # Fallback: treat as independent analog
            return self._next_analog(state, t)

        # Add own noise
        hf_noise = d.noise * 0.5 * random.gauss(0, 1)
        raw = state.value + hf_noise
        state.value = max(d.low, min(d.high, round(raw, 2)))
        return state.value

    def _next_vibration(self, state: TagState) -> float:
        """Vibration: normally low baseline with occasional spikes."""
        d = state.definition

        # Occasional spike event (~0.1 % per scan at 1 s, lasting 5-30 s)
        if state.vibration_spike_remaining > 0:
            state.vibration_spike_remaining -= 1
            spike = state.vibration_spike_level * random.uniform(0.7, 1.3)
        elif random.random() < 0.001 * self.scan_rate:
            state.vibration_spike_remaining = random.randint(5, 30)
            state.vibration_spike_level = random.uniform(
                d.setpoint * 3, d.high * 0.8
            )
            spike = state.vibration_spike_level
        else:
            spike = 0.0

        baseline = d.setpoint + d.noise * random.gauss(0, 1)
        baseline = max(0, baseline)
        raw = baseline + spike
        state.value = max(d.low, min(d.high, round(raw, 3)))
        return state.value

    def _next_digital(self, state: TagState) -> float:
        """Digital (run status): mostly ON, with rare OFF periods."""
        if state.digital_off_remaining > 0:
            state.digital_off_remaining -= 1
            if state.digital_off_remaining == 0:
                state.digital_on = True
                state.digital_next_toggle = random.randint(1500, 2400)
            state.value = 0.0
            return 0.0

        state.digital_next_toggle -= 1
        if state.digital_next_toggle <= 0:
            state.digital_on = False
            # OFF for 2-5 minutes at 1 s scan rate
            off_duration_s = random.randint(120, 300)
            state.digital_off_remaining = max(1, int(off_duration_s / self.scan_rate))
            state.value = 0.0
            return 0.0

        state.value = 1.0
        return 1.0

    def _apply_shutdown_logic(self, results: Dict[str, float]) -> None:
        """When a group's RUN tag is OFF, drive analog tags toward zero/ambient."""
        groups = set(d.group for d in TAG_DEFINITIONS)
        for group in groups:
            run_tag = f"{group}_RUN_001"
            if run_tag in results and results[run_tag] == 0.0:
                for name, state in self.states.items():
                    if state.definition.group != group:
                        continue
                    if state.definition.tag_type == "digital":
                        continue
                    d = state.definition
                    if d.tag_type == "flow":
                        decay_target = 0.0
                    elif d.tag_type == "current":
                        decay_target = 0.0
                    elif d.tag_type == "pressure":
                        decay_target = d.low + (d.high - d.low) * 0.05
                    elif d.tag_type == "temperature":
                        decay_target = d.low  # ambient
                    elif d.tag_type == "vibration":
                        decay_target = 0.0
                    else:
                        decay_target = 0.0

                    # Exponential decay toward shutdown target
                    alpha = 0.02 * self.scan_rate
                    state.value += alpha * (decay_target - state.value)
                    state.value = max(d.low, min(d.high, round(state.value, 2)))
                    results[name] = state.value


# ---------------------------------------------------------------------------
# ThingsBoard REST API helpers (for --fetch-tokens)
# ---------------------------------------------------------------------------

def tb_login(base_url: str, username: str, password: str) -> str:
    """Authenticate to ThingsBoard REST API and return JWT token."""
    if requests is None:
        sys.exit("The 'requests' library is required for --fetch-tokens.  pip install requests")

    url = f"{base_url}/api/auth/login"
    payload = {"username": username, "password": password}
    resp = requests.post(url, json=payload, timeout=15)
    resp.raise_for_status()
    token = resp.json().get("token")
    if not token:
        sys.exit("Failed to obtain JWT token from ThingsBoard.")
    log.info("Authenticated to ThingsBoard as %s", username)
    return token


def tb_get_device_id(base_url: str, jwt: str, device_name: str) -> Optional[str]:
    """Look up a device by name and return its ID (or None)."""
    url = f"{base_url}/api/tenant/devices"
    params = {"deviceName": device_name}
    headers = {"X-Authorization": f"Bearer {jwt}"}
    resp = requests.get(url, params=params, headers=headers, timeout=15)
    if resp.status_code == 404:
        return None
    resp.raise_for_status()
    data = resp.json()
    return data.get("id", {}).get("id")


def tb_get_device_token(base_url: str, jwt: str, device_id: str) -> Optional[str]:
    """Get the MQTT access token (credentials) for a device."""
    url = f"{base_url}/api/device/{device_id}/credentials"
    headers = {"X-Authorization": f"Bearer {jwt}"}
    resp = requests.get(url, headers=headers, timeout=15)
    resp.raise_for_status()
    data = resp.json()
    return data.get("credentialsId")


def fetch_all_tokens(base_url: str, username: str, password: str) -> Dict[str, str]:
    """Fetch access tokens for all 24 tags from ThingsBoard REST API."""
    jwt = tb_login(base_url, username, password)
    tokens: Dict[str, str] = {}
    for tag_def in TAG_DEFINITIONS:
        name = tag_def.name
        device_id = tb_get_device_id(base_url, jwt, name)
        if device_id is None:
            log.warning("Device not found: %s  (skipping)", name)
            continue
        token = tb_get_device_token(base_url, jwt, device_id)
        if token:
            tokens[name] = token
            log.info("  %s -> %s", name, token[:8] + "...")
        else:
            log.warning("  %s -> no credentials", name)
    return tokens


# ---------------------------------------------------------------------------
# MQTT Client Management
# ---------------------------------------------------------------------------

class MqttClientPool:
    """Manages one paho MQTT client per device/tag."""

    def __init__(self, host: str, port: int, tokens: Dict[str, str], use_tls: bool = False):
        self.host = host
        self.port = port
        self.tokens = tokens
        self.use_tls = use_tls
        self.clients: Dict[str, mqtt.Client] = {}
        self._connected: Dict[str, bool] = {}

    def connect_all(self) -> int:
        """Create and connect one MQTT client per tag.  Returns count of successful connections."""
        connected = 0
        for tag_name, access_token in self.tokens.items():
            client_id = f"sim-{tag_name}-{random.randint(1000,9999)}"
            try:
                client = mqtt.Client(
                    client_id=client_id,
                    protocol=mqtt.MQTTv311,
                    callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
                )
            except TypeError:
                # Older paho-mqtt without callback_api_version
                client = mqtt.Client(client_id=client_id, protocol=mqtt.MQTTv311)

            client.username_pw_set(username=access_token, password=None)

            if self.use_tls:
                client.tls_set()

            # Callbacks for logging
            tag = tag_name  # capture for closure

            def on_connect(client, userdata, flags, rc, *args, _tag=tag):
                if isinstance(rc, int):
                    code = rc
                else:
                    # paho v2 passes a ReasonCode object
                    code = rc.value if hasattr(rc, "value") else int(rc)
                if code == 0:
                    self._connected[_tag] = True
                else:
                    log.error("  %s  MQTT connect failed (rc=%s)", _tag, rc)

            def on_disconnect(client, userdata, *args, _tag=tag):
                self._connected[_tag] = False

            client.on_connect = on_connect
            client.on_disconnect = on_disconnect

            try:
                client.connect(self.host, self.port, keepalive=60)
                client.loop_start()
                self.clients[tag_name] = client
                connected += 1
            except Exception as exc:
                log.error("  %s  connection error: %s", tag_name, exc)

        # Give connections a moment to establish
        time.sleep(min(2.0, 0.1 * len(self.tokens)))

        ok = sum(1 for v in self._connected.values() if v)
        log.info("MQTT clients connected: %d / %d", ok, len(self.tokens))
        return ok

    def publish(self, tag_name: str, payload: dict) -> bool:
        """Publish a JSON payload for a given tag.  Returns True on success."""
        client = self.clients.get(tag_name)
        if client is None:
            return False
        try:
            msg = json.dumps(payload)
            info = client.publish(MQTT_TOPIC, msg, qos=1)
            return info.rc == mqtt.MQTT_ERR_SUCCESS
        except Exception as exc:
            log.debug("  %s  publish error: %s", tag_name, exc)
            return False

    def disconnect_all(self) -> None:
        """Gracefully disconnect all clients."""
        for tag_name, client in self.clients.items():
            try:
                client.loop_stop()
                client.disconnect()
            except Exception:
                pass
        self.clients.clear()
        self._connected.clear()
        log.info("All MQTT clients disconnected.")


# ---------------------------------------------------------------------------
# HTTP Transport (fallback when MQTT ports are blocked)
# ---------------------------------------------------------------------------

class HttpTransportPool:
    """HTTP-based telemetry transport using ThingsBoard REST API.

    Uses POST /api/plugins/telemetry/DEVICE/{id}/timeseries/ANY as a
    fallback when MQTT ports (1883/8883) are unreachable.
    Authenticates via JWT token, not device access tokens.
    """

    def __init__(self, base_url: str, tokens: Dict[str, str],
                 username: str, password: str):
        self.base_url = base_url.rstrip("/")
        self.api = f"{self.base_url}/api"
        self.tokens = tokens
        self.username = username
        self.password = password
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.device_ids: Dict[str, str] = {}  # tag_name -> device_id

    def connect_all(self) -> int:
        """Authenticate and resolve device IDs for all tags."""
        # Authenticate
        url = f"{self.api}/auth/login"
        resp = requests.post(url, json={
            "username": self.username, "password": self.password
        }, timeout=15)
        resp.raise_for_status()
        jwt = resp.json()["token"]
        self.session.headers.update({"X-Authorization": f"Bearer {jwt}"})
        log.info("HTTP transport authenticated as %s", self.username)

        # Resolve device IDs
        for tag_name in self.tokens:
            try:
                dev = self.session.get(
                    f"{self.api}/tenant/devices",
                    params={"deviceName": tag_name}, timeout=10
                ).json()
                self.device_ids[tag_name] = dev["id"]["id"]
            except Exception as exc:
                log.warning("  %s  device lookup failed: %s", tag_name, exc)

        log.info("HTTP transport ready: %d / %d devices resolved",
                 len(self.device_ids), len(self.tokens))
        return len(self.device_ids)

    def publish(self, tag_name: str, payload: dict) -> bool:
        """POST telemetry via REST API (bypasses device transport rule chain issues)."""
        device_id = self.device_ids.get(tag_name)
        if not device_id:
            return False
        url = f"{self.api}/plugins/telemetry/DEVICE/{device_id}/timeseries/ANY"
        try:
            resp = self.session.post(url, json=payload, timeout=5)
            return resp.status_code == 200
        except Exception as exc:
            log.debug("  %s  HTTP publish error: %s", tag_name, exc)
            return False

    def disconnect_all(self) -> None:
        """Close HTTP session."""
        self.session.close()
        log.info("HTTP transport session closed.")


# ---------------------------------------------------------------------------
# Main Simulation Loop
# ---------------------------------------------------------------------------

_shutdown_requested = False


def _handle_signal(signum, frame):
    global _shutdown_requested
    _shutdown_requested = True
    log.info("Shutdown requested (signal %d).", signum)


def run_continuous(
    pool: MqttClientPool,
    engine: SimulationEngine,
    scan_rate: float,
    duration: float,
) -> None:
    """Publish telemetry in real time at the configured scan rate."""
    log.info(
        "Starting continuous simulation  scan_rate=%.1fs  duration=%s  quality=always",
        scan_rate,
        f"{duration}s" if duration > 0 else "forever",
    )

    start_time = time.time()
    publish_count = 0
    error_count = 0

    while not _shutdown_requested:
        cycle_start = time.time()

        # Check duration limit
        if duration > 0 and (cycle_start - start_time) >= duration:
            log.info("Duration limit reached (%.0f s).", duration)
            break

        values = engine.advance(sim_time=cycle_start)

        for tag_name, value in values.items():
            payload: Dict[str, Any] = {"PV": value, "Q": OPC_QUALITY_GOOD}
            ok = pool.publish(tag_name, payload)
            if ok:
                publish_count += 1
            else:
                error_count += 1

        # Log summary every 60 scans
        if engine.tick % max(1, int(60 / scan_rate)) == 0:
            elapsed = time.time() - start_time
            log.info(
                "tick=%d  elapsed=%.0fs  published=%d  errors=%d  sample: %s=%.2f",
                engine.tick,
                elapsed,
                publish_count,
                error_count,
                TAG_DEFINITIONS[0].name,
                values.get(TAG_DEFINITIONS[0].name, 0),
            )

        # Sleep until next scan
        elapsed_cycle = time.time() - cycle_start
        sleep_time = max(0, scan_rate - elapsed_cycle)
        if sleep_time > 0:
            time.sleep(sleep_time)


def run_historical(
    pool: MqttClientPool,
    engine: SimulationEngine,
    scan_rate: float,
    hours: float,
) -> None:
    """Generate historical backfill data with explicit timestamps.

    Each message uses the ThingsBoard timestamped format:
        {"ts": <epoch_ms>, "values": {"PV": ..., "Q": 192}}
    """
    total_seconds = int(hours * 3600)
    total_scans = int(total_seconds / scan_rate)

    # Start time: `hours` ago from now
    end_ts = time.time()
    start_ts = end_ts - total_seconds

    log.info(
        "Starting historical backfill  hours=%.1f  scan_rate=%.1fs  total_scans=%d",
        hours,
        scan_rate,
        total_scans,
    )
    log.info(
        "  Time range: %s  ->  %s",
        datetime.fromtimestamp(start_ts, tz=timezone.utc).isoformat(),
        datetime.fromtimestamp(end_ts, tz=timezone.utc).isoformat(),
    )

    publish_count = 0
    error_count = 0

    for i in range(total_scans):
        if _shutdown_requested:
            log.info("Historical backfill interrupted.")
            break

        sim_time = start_ts + i * scan_rate
        ts_ms = int(sim_time * 1000)

        values = engine.advance(sim_time=sim_time)

        for tag_name, value in values.items():
            inner: Dict[str, Any] = {"PV": value, "Q": OPC_QUALITY_GOOD}
            payload = {"ts": ts_ms, "values": inner}
            ok = pool.publish(tag_name, payload)
            if ok:
                publish_count += 1
            else:
                error_count += 1

        # Progress log every 5 % or every 10 000 scans
        if (i + 1) % max(1, total_scans // 20) == 0 or (i + 1) % 10000 == 0:
            pct = 100.0 * (i + 1) / total_scans
            current_dt = datetime.fromtimestamp(sim_time, tz=timezone.utc).strftime(
                "%Y-%m-%d %H:%M:%S"
            )
            log.info(
                "  progress: %5.1f%%  scan=%d/%d  time=%s  published=%d  errors=%d",
                pct,
                i + 1,
                total_scans,
                current_dt,
                publish_count,
                error_count,
            )

        # Throttle to avoid overwhelming the broker -- yield briefly every scan
        # For large backfills, a small sleep keeps the broker happy.
        if (i + 1) % 100 == 0:
            time.sleep(0.05)

    log.info(
        "Historical backfill complete.  published=%d  errors=%d",
        publish_count,
        error_count,
    )


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="MQTT Telemetry Simulator for ThingsBoard PE Industrial Historian.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Fetch tokens from ThingsBoard API and save to tokens.json
  python mqtt_simulator.py --fetch-tokens

  # Run continuous simulation (Ctrl-C to stop)
  python mqtt_simulator.py --tokens tokens.json

  # Generate 24 hours of backfill at 5 s intervals
  python mqtt_simulator.py --tokens tokens.json --historical 24 --scan-rate 5

  # Run for 1 hour (Q=192 Good always included)
  python mqtt_simulator.py --tokens tokens.json --duration 3600
""",
    )

    p.add_argument(
        "--fetch-tokens",
        action="store_true",
        help="Fetch device access tokens from ThingsBoard REST API and save to tokens file.",
    )
    p.add_argument(
        "--tokens",
        metavar="FILE",
        default=DEFAULT_TOKENS_FILE,
        help=f"Path to JSON file mapping tag names to access tokens (default: {DEFAULT_TOKENS_FILE}).",
    )
    p.add_argument(
        "--scan-rate",
        type=float,
        default=DEFAULT_SCAN_RATE,
        metavar="SEC",
        help=f"Seconds between readings (default: {DEFAULT_SCAN_RATE}).",
    )
    p.add_argument(
        "--duration",
        type=float,
        default=0,
        metavar="SEC",
        help="Run for N seconds; 0 = run forever (default: 0).",
    )
    p.add_argument(
        "--historical",
        type=float,
        default=0,
        metavar="HOURS",
        help="Generate N hours of historical back-fill data with timestamps.",
    )
    p.add_argument(
        "--server",
        default=DEFAULT_SERVER,
        metavar="HOST",
        help=f"ThingsBoard REST API hostname (default: {DEFAULT_SERVER}).",
    )
    p.add_argument(
        "--mqtt-host",
        default=DEFAULT_MQTT_HOST,
        metavar="HOST",
        help=f"MQTT broker hostname (default: {DEFAULT_MQTT_HOST}).",
    )
    p.add_argument(
        "--mqtt-port",
        type=int,
        default=DEFAULT_MQTT_PORT,
        metavar="PORT",
        help=f"MQTT broker port (default: {DEFAULT_MQTT_PORT}; use 8883 for TLS).",
    )
    p.add_argument(
        "--user",
        default=DEFAULT_TB_USER,
        metavar="EMAIL",
        help=f"ThingsBoard API username for --fetch-tokens (default: {DEFAULT_TB_USER}).",
    )
    p.add_argument(
        "--password",
        default=DEFAULT_TB_PASS,
        metavar="PASS",
        help="ThingsBoard API password for --fetch-tokens.",
    )
    p.add_argument(
        "--no-quality",
        action="store_true",
        help="Suppress OPC quality code Q from telemetry (by default Q=192 Good is always sent).",
    )
    p.add_argument(
        "--tls",
        action="store_true",
        help="Enable TLS for MQTT connections (use with --mqtt-port 8883).",
    )
    p.add_argument(
        "--http",
        action="store_true",
        help="Use HTTP transport instead of MQTT (for servers with blocked MQTT ports).",
    )
    p.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Enable DEBUG-level logging.",
    )
    return p


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    # ── Fetch tokens mode ─────────────────────────────────────────────────
    if args.fetch_tokens:
        protocol = "https" if args.mqtt_port == 8883 or args.tls else "https"
        base_url = f"{protocol}://{args.server}"
        log.info("Fetching device tokens from %s ...", base_url)
        tokens = fetch_all_tokens(base_url, args.user, args.password)
        out_path = Path(args.tokens)
        out_path.write_text(json.dumps(tokens, indent=2) + "\n", encoding="utf-8")
        log.info("Saved %d tokens to %s", len(tokens), out_path)
        return

    # ── Load tokens ───────────────────────────────────────────────────────
    tokens_path = Path(args.tokens)
    if not tokens_path.exists():
        sys.exit(
            f"Tokens file not found: {tokens_path}\n"
            f"Run with --fetch-tokens first, or create {tokens_path} manually.\n"
            f"Format: {{\"ESP001_PIT_001\": \"<access_token>\", ...}}"
        )

    with open(tokens_path, "r", encoding="utf-8") as f:
        tokens: Dict[str, str] = json.load(f)

    if not tokens:
        sys.exit("Tokens file is empty.")

    # Filter to only tags we have definitions for
    known_tags = set(TAG_BY_NAME.keys())
    active_tokens = {k: v for k, v in tokens.items() if k in known_tags}
    skipped = set(tokens.keys()) - known_tags
    if skipped:
        log.warning("Skipping unknown tags in tokens file: %s", ", ".join(sorted(skipped)))

    log.info("Loaded %d tag tokens from %s", len(active_tokens), tokens_path)
    for name in sorted(active_tokens):
        td = TAG_BY_NAME[name]
        log.debug("  %-20s  %-12s  %s  [%.0f - %.0f]  sp=%.1f",
                   name, td.tag_type, td.units, td.low, td.high, td.setpoint)

    if not active_tokens:
        sys.exit("No valid tag tokens found.  Check your tokens file.")

    # ── Setup ─────────────────────────────────────────────────────────────
    signal.signal(signal.SIGINT, _handle_signal)
    signal.signal(signal.SIGTERM, _handle_signal)

    # Only simulate tags we have tokens for
    active_defs = [TAG_BY_NAME[name] for name in active_tokens]
    engine = SimulationEngine(definitions=active_defs, scan_rate=args.scan_rate)

    if args.http:
        # HTTP REST API transport (fallback for servers with blocked MQTT ports)
        protocol = "https"
        base_url = f"{protocol}://{args.server}"
        log.info("Using HTTP REST API transport to %s (%d tags) ...", base_url, len(active_tokens))
        pool = HttpTransportPool(
            base_url=base_url,
            tokens=active_tokens,
            username=args.user,
            password=args.password,
        )
    else:
        use_tls = args.tls or args.mqtt_port == 8883
        pool = MqttClientPool(
            host=args.mqtt_host,
            port=args.mqtt_port,
            tokens=active_tokens,
            use_tls=use_tls,
        )
        log.info("Connecting %d MQTT clients to %s:%d (TLS=%s) ...",
                 len(active_tokens), args.mqtt_host, args.mqtt_port, use_tls)

    pool.connect_all()

    # ── Run ───────────────────────────────────────────────────────────────
    try:
        if args.historical > 0:
            run_historical(
                pool=pool,
                engine=engine,
                scan_rate=args.scan_rate,
                hours=args.historical,
            )
        else:
            run_continuous(
                pool=pool,
                engine=engine,
                scan_rate=args.scan_rate,
                duration=args.duration,
            )
    finally:
        pool.disconnect_all()
        log.info("Simulator stopped.")


if __name__ == "__main__":
    main()
