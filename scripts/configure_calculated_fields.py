#!/usr/bin/env python3
"""
Configure Calculated Fields (TB 4.0+) and Scheduler PE events
on ThingsBoard PE via REST API.

Usage:
    python configure_calculated_fields.py
    python configure_calculated_fields.py --server https://panel.atilax.io --user well@atilax.io
"""

import argparse
import json
import logging
import sys
import time
from typing import Any, Dict, List, Optional

import requests

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("calculated-fields")

API_DELAY = 0.15  # seconds between API calls


def _sleep():
    time.sleep(API_DELAY)


# ===================================================================
# ThingsBoard REST helpers
# ===================================================================
class TBClient:
    def __init__(self, base_url: str, username: str, password: str):
        self.base_url = base_url.rstrip("/")
        self.api = f"{self.base_url}/api"
        self.username = username
        self.password = password
        self.session = requests.Session()

    def authenticate(self) -> None:
        resp = requests.post(
            f"{self.api}/auth/login",
            json={"username": self.username, "password": self.password},
            timeout=30,
        )
        resp.raise_for_status()
        token = resp.json()["token"]
        self.session.headers.update({
            "X-Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        })
        log.info("Authenticated as %s on %s", self.username, self.base_url)

    def _get(self, path: str, params: Optional[dict] = None) -> Any:
        _sleep()
        resp = self.session.get(f"{self.api}{path}", params=params, timeout=30)
        resp.raise_for_status()
        return resp.json()

    def _get_safe(self, path: str, params: Optional[dict] = None) -> Optional[Any]:
        """GET that returns None on 404/501 (feature not available)."""
        _sleep()
        resp = self.session.get(f"{self.api}{path}", params=params, timeout=30)
        if resp.status_code in (404, 501):
            return None
        resp.raise_for_status()
        return resp.json()

    def _post(self, path: str, payload: Any = None) -> Any:
        _sleep()
        resp = self.session.post(f"{self.api}{path}", json=payload, timeout=30)
        resp.raise_for_status()
        try:
            return resp.json()
        except ValueError:
            return None

    def _post_safe(self, path: str, payload: Any = None) -> Optional[Any]:
        """POST that returns None on 404/501 (feature not available)."""
        _sleep()
        resp = self.session.post(f"{self.api}{path}", json=payload, timeout=30)
        if resp.status_code in (404, 501):
            return None
        resp.raise_for_status()
        try:
            return resp.json()
        except ValueError:
            return None

    # ------------------------------------------------------------------
    # Device Profiles
    # ------------------------------------------------------------------
    def find_device_profile(self, name: str) -> Optional[Dict]:
        """Find a device profile by name."""
        page = 0
        while True:
            data = self._get("/deviceProfiles", params={
                "pageSize": 100, "page": page,
                "sortProperty": "name", "sortOrder": "ASC",
            })
            for item in data.get("data", []):
                if item.get("name") == name:
                    return item
            if not data.get("hasNext", False):
                break
            page += 1
        return None

    # ------------------------------------------------------------------
    # Asset Profiles
    # ------------------------------------------------------------------
    def find_asset_profile(self, name: str) -> Optional[Dict]:
        """Find an asset profile by name."""
        page = 0
        while True:
            data = self._get("/assetProfiles", params={
                "pageSize": 100, "page": page,
                "sortProperty": "name", "sortOrder": "ASC",
            })
            for item in data.get("data", []):
                if item.get("name") == name:
                    return item
            if not data.get("hasNext", False):
                break
            page += 1
        return None

    # ------------------------------------------------------------------
    # Calculated Fields (TB 4.0+)
    # ------------------------------------------------------------------
    def check_calculated_fields_api(self) -> bool:
        """Check if the Calculated Fields API is available."""
        _sleep()
        resp = self.session.get(
            f"{self.api}/calculatedFields",
            params={"pageSize": 1, "page": 0},
            timeout=30,
        )
        if resp.status_code in (404, 501):
            return False
        # 200 or other success codes mean the API exists
        return resp.status_code < 400

    def get_calculated_fields(self, entity_type: str, entity_id: str) -> Optional[List]:
        """Get calculated fields for a given entity (device/asset profile)."""
        result = self._get_safe(
            f"/calculatedFields/{entity_type}/{entity_id}",
            params={"pageSize": 100, "page": 0},
        )
        if result is None:
            return None
        return result.get("data", [])

    def create_calculated_field(self, payload: Dict) -> Optional[Dict]:
        """Create a calculated field. Returns None if API not available."""
        return self._post_safe("/calculatedField", payload)

    # ------------------------------------------------------------------
    # Scheduler Events (PE)
    # ------------------------------------------------------------------
    def find_scheduler_events(self) -> List[Dict]:
        """List all scheduler events."""
        data = self._get("/schedulerEvents", params={
            "pageSize": 100, "page": 0,
        })
        return data.get("data", [])

    def create_scheduler_event(self, payload: Dict) -> Any:
        """Create a scheduler event."""
        return self._post("/schedulerEvent", payload)


# ===================================================================
# Calculated Fields Configuration
# ===================================================================
def configure_calculated_fields(client: TBClient) -> bool:
    """
    Configure calculated fields on device/asset profiles.
    Returns True if the API is available and fields were configured.
    """
    # Check if the Calculated Fields API is available
    if not client.check_calculated_fields_api():
        log.warning("Calculated Fields API not available on this ThingsBoard version")
        log.warning("Requires ThingsBoard 4.0+ — skipping calculated fields configuration")
        return False

    log.info("Calculated Fields API is available")

    # ------------------------------------------------------------------
    # 1. Find AnalogInput device profile
    # ------------------------------------------------------------------
    analog_profile = client.find_device_profile("AnalogInput")
    if not analog_profile:
        log.warning("Device profile 'AnalogInput' not found — skipping calculated fields")
        return False

    analog_profile_id = analog_profile["id"]["id"]
    log.info("Found AnalogInput profile: %s", analog_profile_id)

    # Check existing calculated fields to avoid duplicates
    existing = client.get_calculated_fields("DEVICE_PROFILE", analog_profile_id)
    existing_names = set()
    if existing:
        for cf in existing:
            name = cf.get("configuration", {}).get("outputKey", "")
            existing_names.add(name)
            log.info("  Existing calculated field: %s", name)

    # ------------------------------------------------------------------
    # 2. Simple Calculated Field — Unit Conversion (PSI to Bar)
    # ------------------------------------------------------------------
    if "PV_bar" not in existing_names:
        cf_unit = {
            "entityId": {
                "id": analog_profile_id,
                "entityType": "DEVICE_PROFILE",
            },
            "type": "SIMPLE",
            "configuration": {
                "type": "SIMPLE",
                "outputKey": "PV_bar",
                "outputType": "TELEMETRY",
                "arguments": {
                    "PV": {
                        "type": "TELEMETRY",
                        "key": "PV",
                        "defaultValue": 0,
                    }
                },
                "expression": "PV * 0.0689476",
            },
        }
        result = client.create_calculated_field(cf_unit)
        if result:
            log.info("Created calculated field: PV_bar (PSI to Bar conversion)")
        else:
            log.warning("Failed to create PV_bar calculated field")
    else:
        log.info("Calculated field 'PV_bar' already exists — skipping")

    # ------------------------------------------------------------------
    # 3. Script Calculated Field — Moving Average (60-min window)
    # ------------------------------------------------------------------
    if "PV_avg60m" not in existing_names:
        cf_avg = {
            "entityId": {
                "id": analog_profile_id,
                "entityType": "DEVICE_PROFILE",
            },
            "type": "SCRIPT",
            "configuration": {
                "type": "SCRIPT",
                "outputKey": "PV_avg60m",
                "outputType": "TELEMETRY",
                "arguments": {
                    "PV": {
                        "type": "ROLLING_TIME_SERIES",
                        "key": "PV",
                        "defaultValue": 0,
                        "limit": 1000,
                        "timeWindow": 3600000,  # 60 minutes in ms
                    }
                },
                "expression": (
                    "var sum = 0; var count = 0;\n"
                    "for (var i = 0; i < PV.size(); i++) {\n"
                    "  sum = sum + PV.get(i).value;\n"
                    "  count = count + 1;\n"
                    "}\n"
                    "return count > 0 ? sum / count : 0;"
                ),
            },
        }
        result = client.create_calculated_field(cf_avg)
        if result:
            log.info("Created calculated field: PV_avg60m (60-min moving average)")
        else:
            log.warning("Failed to create PV_avg60m calculated field")
    else:
        log.info("Calculated field 'PV_avg60m' already exists — skipping")

    # ------------------------------------------------------------------
    # 4. Aggregation Calculated Field — Equipment avg PV
    # ------------------------------------------------------------------
    equip_profile = client.find_asset_profile("Equipment")
    if equip_profile:
        equip_profile_id = equip_profile["id"]["id"]
        log.info("Found Equipment asset profile: %s", equip_profile_id)

        existing_equip = client.get_calculated_fields("ASSET_PROFILE", equip_profile_id)
        equip_names = set()
        if existing_equip:
            for cf in existing_equip:
                name = cf.get("configuration", {}).get("outputKey", "")
                equip_names.add(name)

        if "avg_PV" not in equip_names:
            cf_agg = {
                "entityId": {
                    "id": equip_profile_id,
                    "entityType": "ASSET_PROFILE",
                },
                "type": "SCRIPT",
                "configuration": {
                    "type": "SCRIPT",
                    "outputKey": "avg_PV",
                    "outputType": "TELEMETRY",
                    "arguments": {
                        "PV": {
                            "type": "AGGREGATION",
                            "key": "PV",
                            "defaultValue": 0,
                            "entityTypes": ["DEVICE"],
                        }
                    },
                    "expression": (
                        "var sum = 0; var count = 0;\n"
                        "for (var i = 0; i < PV.size(); i++) {\n"
                        "  sum = sum + PV.get(i).value;\n"
                        "  count = count + 1;\n"
                        "}\n"
                        "return count > 0 ? sum / count : 0;"
                    ),
                },
            }
            result = client.create_calculated_field(cf_agg)
            if result:
                log.info("Created calculated field: avg_PV (Equipment aggregation)")
            else:
                log.warning("Failed to create avg_PV calculated field")
        else:
            log.info("Calculated field 'avg_PV' already exists — skipping")
    else:
        log.warning("Asset profile 'Equipment' not found — skipping aggregation field")

    return True


# ===================================================================
# Scheduler Configuration
# ===================================================================
def configure_scheduler(client: TBClient) -> None:
    """Configure a daily scheduler event for summary aggregation."""

    # Check if a similar event already exists
    events = client.find_scheduler_events()
    for event in events:
        if event.get("name") == "Daily Summary Aggregation":
            log.info("Scheduler event 'Daily Summary Aggregation' already exists (id=%s)",
                     event["id"]["id"])
            return

    # Create daily scheduler event at midnight UTC
    scheduler_payload = {
        "name": "Daily Summary Aggregation",
        "type": "CUSTOM_MSG",
        "schedule": {
            "type": "CRON",
            "cronExpression": "0 0 0 * * ?",
            "timezone": "UTC",
        },
        "configuration": {
            "msgType": "DAILY_SUMMARY_TRIGGER",
            "msgBody": json.dumps({
                "action": "generate_daily_summary",
                "aggregation": "AVG",
                "keys": ["PV"],
            }),
            "metadata": {
                "source": "scheduler",
                "eventType": "daily_summary",
            },
        },
    }

    try:
        result = client.create_scheduler_event(scheduler_payload)
        if result:
            log.info("Created scheduler event: Daily Summary Aggregation (id=%s)",
                     result.get("id", {}).get("id", "unknown"))
        else:
            log.warning("Failed to create scheduler event (no response)")
    except requests.exceptions.HTTPError as exc:
        if exc.response and exc.response.status_code == 404:
            log.warning("Scheduler API not available — requires ThingsBoard PE")
        else:
            log.error("Failed to create scheduler event: %s", exc)
            raise


# ===================================================================
# Main
# ===================================================================
def main() -> None:
    parser = argparse.ArgumentParser(
        description="Configure Calculated Fields and Scheduler on ThingsBoard PE"
    )
    parser.add_argument("--server", default="https://panel.atilax.io")
    parser.add_argument("--user", default="well@atilax.io")
    parser.add_argument("--password", default="10203040")
    args = parser.parse_args()

    client = TBClient(args.server, args.user, args.password)

    # ------------------------------------------------------------------
    # Step 1: Authenticate
    # ------------------------------------------------------------------
    try:
        client.authenticate()
    except requests.exceptions.HTTPError as exc:
        log.error("Auth failed: %s — %s", exc, getattr(exc.response, "text", ""))
        sys.exit(1)
    except requests.exceptions.ConnectionError as exc:
        log.error("Cannot connect to %s: %s", args.server, exc)
        sys.exit(1)

    # ------------------------------------------------------------------
    # Step 2: Configure Calculated Fields
    # ------------------------------------------------------------------
    log.info("=" * 60)
    log.info("Configuring Calculated Fields …")
    log.info("=" * 60)

    cf_available = configure_calculated_fields(client)

    # ------------------------------------------------------------------
    # Step 3: Configure Scheduler
    # ------------------------------------------------------------------
    log.info("=" * 60)
    log.info("Configuring Scheduler Events …")
    log.info("=" * 60)

    configure_scheduler(client)

    # ------------------------------------------------------------------
    # Summary
    # ------------------------------------------------------------------
    log.info("=" * 60)
    log.info("CONFIGURATION COMPLETE")
    log.info("=" * 60)
    if cf_available:
        log.info("  Calculated Fields:")
        log.info("    - PV_bar       : PSI to Bar unit conversion (AnalogInput)")
        log.info("    - PV_avg60m    : 60-min moving average (AnalogInput)")
        log.info("    - avg_PV       : Average PV of child devices (Equipment)")
    else:
        log.info("  Calculated Fields: SKIPPED (API not available)")
    log.info("  Scheduler:")
    log.info("    - Daily Summary Aggregation: daily at 00:00 UTC")


if __name__ == "__main__":
    main()
