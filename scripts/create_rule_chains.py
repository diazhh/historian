#!/usr/bin/env python3
"""
Create Rule Chains RC1 (Ingesta y Validación) and RC2 (Compresión Deadband)
on ThingsBoard PE via REST API.

Usage:
    python create_rule_chains.py
    python create_rule_chains.py --server https://panel.atilax.io --user well@atilax.io
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
log = logging.getLogger("rule-chains")

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

    def _post(self, path: str, payload: Any = None) -> Any:
        _sleep()
        resp = self.session.post(f"{self.api}{path}", json=payload, timeout=30)
        resp.raise_for_status()
        try:
            return resp.json()
        except ValueError:
            return None

    # ------------------------------------------------------------------
    # Rule Chains
    # ------------------------------------------------------------------
    def find_rule_chain(self, name: str) -> Optional[Dict]:
        """Find a rule chain by exact name."""
        page = 0
        while True:
            data = self._get("/ruleChains", params={
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

    def create_rule_chain(self, name: str, debug: bool = False) -> Dict:
        """Create a rule chain or return existing one."""
        existing = self.find_rule_chain(name)
        if existing:
            log.info("Rule chain '%s' already exists (id=%s)", name, existing["id"]["id"])
            return existing
        result = self._post("/ruleChain", {"name": name, "debugMode": debug})
        log.info("Created rule chain '%s' (id=%s)", name, result["id"]["id"])
        return result

    def get_rule_chain_metadata(self, rc_id: str) -> Dict:
        """Get the current metadata of a rule chain."""
        return self._get(f"/ruleChain/{rc_id}/metadata")

    def set_rule_chain_metadata(self, rc_id: str, metadata: Dict) -> Any:
        """Set the metadata (nodes + connections) of a rule chain."""
        # TB API: POST /api/ruleChain/metadata with ruleChainId in the body
        metadata["ruleChainId"] = {"id": rc_id, "entityType": "RULE_CHAIN"}
        result = self._post("/ruleChain/metadata", metadata)
        log.info("Set metadata for rule chain %s", rc_id)
        return result

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

    def get_device_profile_full(self, profile_id: str) -> Dict:
        """Get full device profile object by ID."""
        return self._get(f"/deviceProfile/{profile_id}")

    def save_device_profile(self, profile: Dict) -> Dict:
        """Save (update) a device profile."""
        return self._post("/deviceProfile", profile)


# ===================================================================
# RC1 — Ingesta y Validación
# ===================================================================
def build_rc1_metadata(rc2_id: Optional[str] = None) -> Dict:
    """
    Build the metadata (nodes + connections) for RC1.

    Nodes:
      0 - Message Type Switch
      1 - Check Existence Fields (PV)
      2 - Originator Attributes (ss_rangeLow, ss_rangeHigh)
      3 - Script Filter TBEL (range check)
      4 - Save Timeseries
      5 - Create Alarm (OUT_OF_RANGE)
    """
    nodes = [
        # 0 — Message Type Switch
        {
            "type": "org.thingsboard.rule.engine.filter.TbMsgTypeSwitchNode",
            "name": "Message Type Switch",
            "configuration": {"version": 0},
            "additionalInfo": {"layoutX": 200, "layoutY": 300},
        },
        # 1 — Check Existence Fields
        {
            "type": "org.thingsboard.rule.engine.filter.TbCheckMessageNode",
            "name": "Check PV Exists",
            "configuration": {
                "messageNames": ["PV"],
                "metadataNames": [],
                "checkAllKeys": True,
            },
            "additionalInfo": {"layoutX": 450, "layoutY": 300},
        },
        # 2 — Originator Attributes
        {
            "type": "org.thingsboard.rule.engine.metadata.TbGetAttributesNode",
            "name": "Get Range Attributes",
            "configuration": {
                "fetchToData": False,
                "serverAttributeNames": ["ss_rangeLow", "ss_rangeHigh"],
                "clientAttributeNames": [],
                "sharedAttributeNames": [],
                "latestTsKeyNames": [],
                "tellFailureIfAbsent": False,
                "getLatestValueWithTs": False,
            },
            "additionalInfo": {"layoutX": 700, "layoutY": 300},
        },
        # 3 — Script Filter TBEL (Range Check)
        {
            "type": "org.thingsboard.rule.engine.filter.TbJsFilterNode",
            "name": "Range Check",
            "configuration": {
                "scriptLang": "TBEL",
                "tbelScript": (
                    "if (metadata.ss_rangeLow == null || metadata.ss_rangeHigh == null) {\n"
                    "  return true;\n"
                    "}\n"
                    "return msg.PV >= metadata.ss_rangeLow && msg.PV <= metadata.ss_rangeHigh;"
                ),
                "jsScript": "return true;",
            },
            "additionalInfo": {"layoutX": 950, "layoutY": 300},
        },
        # 4 — Save Timeseries
        {
            "type": "org.thingsboard.rule.engine.telemetry.TbMsgTimeseriesNode",
            "name": "Save Timeseries",
            "configuration": {
                "defaultTTL": 0,
                "skipLatestPersistence": False,
                "useServerTs": False,
            },
            "additionalInfo": {"layoutX": 1200, "layoutY": 200},
        },
        # 5 — Create Alarm (OUT_OF_RANGE)
        {
            "type": "org.thingsboard.rule.engine.action.TbCreateAlarmNode",
            "name": "Alarm OUT_OF_RANGE",
            "configuration": {
                "useMessageAlarmData": False,
                "alarmType": "OUT_OF_RANGE",
                "severity": "WARNING",
                "propagate": True,
                "propagateToOwner": False,
                "propagateToTenant": False,
                "relationTypes": [],
                "scriptLang": "TBEL",
                "alarmDetailsBuildTbel": (
                    "var details = {};\n"
                    "details.PV = msg.PV;\n"
                    "details.rangeLow = metadata.ss_rangeLow;\n"
                    "details.rangeHigh = metadata.ss_rangeHigh;\n"
                    "details.message = 'Value ' + msg.PV + ' outside range [' "
                    "+ metadata.ss_rangeLow + ', ' + metadata.ss_rangeHigh + ']';\n"
                    "return details;"
                ),
                "alarmDetailsBuildJs": (
                    "var details = {};\n"
                    "details.PV = msg.PV;\n"
                    "return details;"
                ),
            },
            "additionalInfo": {"layoutX": 1200, "layoutY": 450},
        },
    ]

    connections = [
        {"fromIndex": 0, "toIndex": 1, "type": "Post telemetry request"},
        {"fromIndex": 1, "toIndex": 2, "type": "True"},
        {"fromIndex": 2, "toIndex": 3, "type": "Success"},
        {"fromIndex": 3, "toIndex": 4, "type": "True"},
        {"fromIndex": 3, "toIndex": 5, "type": "False"},
    ]

    # Chain to RC2 if provided
    rule_chain_connections = None
    if rc2_id:
        rule_chain_connections = [
            {
                "fromIndex": 4,
                "targetRuleChainId": {"id": rc2_id, "entityType": "RULE_CHAIN"},
                "type": "Success",
                "additionalInfo": {"layoutX": 1450, "layoutY": 200},
            }
        ]

    return {
        "firstNodeIndex": 0,
        "nodes": nodes,
        "connections": connections,
        "ruleChainConnections": rule_chain_connections,
    }


# ===================================================================
# RC2 — Compresión Deadband
# ===================================================================
def build_rc2_metadata() -> Dict:
    """
    Build the metadata (nodes + connections) for RC2.

    Nodes:
      0 - Originator Attributes (ss_deadband)
      1 - Originator Telemetry (Latest PV)
      2 - Script Filter TBEL (deadband check)
      3 - Save Timeseries
    """
    nodes = [
        # 0 — Originator Attributes (deadband)
        {
            "type": "org.thingsboard.rule.engine.metadata.TbGetAttributesNode",
            "name": "Get Deadband Attribute",
            "configuration": {
                "fetchToData": False,
                "serverAttributeNames": ["ss_deadband"],
                "clientAttributeNames": [],
                "sharedAttributeNames": [],
                "latestTsKeyNames": [],
                "tellFailureIfAbsent": False,
                "getLatestValueWithTs": False,
            },
            "additionalInfo": {"layoutX": 200, "layoutY": 300},
        },
        # 1 — Originator Telemetry (Latest PV)
        {
            "type": "org.thingsboard.rule.engine.metadata.TbGetTelemetryNode",
            "name": "Get Last PV",
            "configuration": {
                "latestTsKeyNames": ["PV"],
                "fetchMode": "LATEST",
                "orderBy": "ASC",
                "limit": 1,
                "useMetadataIntervalPatterns": False,
                "startInterval": 0,
                "endInterval": 0,
                "startIntervalTimeUnit": "MILLISECONDS",
                "endIntervalTimeUnit": "MILLISECONDS",
                "startIntervalPattern": "",
                "endIntervalPattern": "",
            },
            "additionalInfo": {"layoutX": 450, "layoutY": 300},
        },
        # 2 — Script Filter TBEL (Deadband Check)
        {
            "type": "org.thingsboard.rule.engine.filter.TbJsFilterNode",
            "name": "Deadband Check",
            "configuration": {
                "scriptLang": "TBEL",
                "tbelScript": (
                    "if (metadata.PV == null) {\n"
                    "  return true;\n"
                    "}\n"
                    "var deadband = metadata.ss_deadband;\n"
                    "if (deadband == null || deadband <= 0) {\n"
                    "  return true;\n"
                    "}\n"
                    "return Math.abs(msg.PV - metadata.PV) > deadband;"
                ),
                "jsScript": "return true;",
            },
            "additionalInfo": {"layoutX": 700, "layoutY": 300},
        },
        # 3 — Save Timeseries
        {
            "type": "org.thingsboard.rule.engine.telemetry.TbMsgTimeseriesNode",
            "name": "Save Timeseries",
            "configuration": {
                "defaultTTL": 0,
                "skipLatestPersistence": False,
                "useServerTs": False,
            },
            "additionalInfo": {"layoutX": 950, "layoutY": 300},
        },
    ]

    connections = [
        {"fromIndex": 0, "toIndex": 1, "type": "Success"},
        {"fromIndex": 1, "toIndex": 2, "type": "Success"},
        {"fromIndex": 2, "toIndex": 3, "type": "True"},
    ]

    return {
        "firstNodeIndex": 0,
        "nodes": nodes,
        "connections": connections,
        "ruleChainConnections": None,
    }


# ===================================================================
# Main
# ===================================================================
def main() -> None:
    parser = argparse.ArgumentParser(description="Create RC1 and RC2 rule chains")
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
    # Step 2: Create rule chain shells (we need both IDs before metadata)
    # ------------------------------------------------------------------
    log.info("=" * 60)
    log.info("Creating rule chains …")
    log.info("=" * 60)

    rc1 = client.create_rule_chain("RC1 Ingesta y Validacion")
    rc1_id = rc1["id"]["id"]
    log.info("  RC1 id = %s", rc1_id)

    rc2 = client.create_rule_chain("RC2 Compresion Deadband")
    rc2_id = rc2["id"]["id"]
    log.info("  RC2 id = %s", rc2_id)

    # ------------------------------------------------------------------
    # Step 3: Set RC1 metadata (with chain to RC2)
    # ------------------------------------------------------------------
    log.info("=" * 60)
    log.info("Setting RC1 metadata (with chain to RC2) …")
    log.info("=" * 60)
    rc1_meta = build_rc1_metadata(rc2_id=rc2_id)
    log.info("  RC1 nodes: %d, connections: %d, ruleChainConnections: %s",
             len(rc1_meta["nodes"]), len(rc1_meta["connections"]),
             len(rc1_meta.get("ruleChainConnections") or []))
    client.set_rule_chain_metadata(rc1_id, rc1_meta)

    # ------------------------------------------------------------------
    # Step 4: Set RC2 metadata
    # ------------------------------------------------------------------
    log.info("=" * 60)
    log.info("Setting RC2 metadata …")
    log.info("=" * 60)
    rc2_meta = build_rc2_metadata()
    log.info("  RC2 nodes: %d, connections: %d",
             len(rc2_meta["nodes"]), len(rc2_meta["connections"]))
    client.set_rule_chain_metadata(rc2_id, rc2_meta)

    # ------------------------------------------------------------------
    # Step 5: Assign RC1 as default rule chain on device profiles
    # ------------------------------------------------------------------
    log.info("=" * 60)
    log.info("Assigning RC1 as default rule chain on device profiles …")
    log.info("=" * 60)

    for profile_name in ["AnalogInput", "DigitalInput"]:
        profile = client.find_device_profile(profile_name)
        if not profile:
            log.warning("Device profile '%s' not found — skipping", profile_name)
            continue

        profile_id = profile["id"]["id"]
        full_profile = client.get_device_profile_full(profile_id)

        full_profile["defaultRuleChainId"] = {
            "id": rc1_id,
            "entityType": "RULE_CHAIN",
        }
        client.save_device_profile(full_profile)
        log.info("  Set RC1 as default rule chain for '%s' (id=%s)", profile_name, profile_id)

    # ------------------------------------------------------------------
    # Summary
    # ------------------------------------------------------------------
    log.info("=" * 60)
    log.info("RULE CHAINS CREATED SUCCESSFULLY")
    log.info("=" * 60)
    log.info("  RC1 (Ingesta y Validacion)  : %s", rc1_id)
    log.info("  RC2 (Compresion Deadband)   : %s", rc2_id)
    log.info("  RC1 chained to RC2 via ruleChainConnection (Save TS → RC2)")
    log.info("  AnalogInput  → default RC = RC1")
    log.info("  DigitalInput → default RC = RC1")
    log.info("")
    log.info("Flow: Device → RC1 (validate + save) → RC2 (deadband + save)")
    log.info("Note: Digital tags pass RC2 harmlessly (deadband=0 → always save)")


if __name__ == "__main__":
    main()
