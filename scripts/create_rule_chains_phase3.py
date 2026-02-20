#!/usr/bin/env python3
"""
Create Rule Chains RC3 (Rate of Change Detection) and RC4 (Contextual Alarm Enrichment)
on ThingsBoard PE via REST API.

Usage:
    python create_rule_chains_phase3.py
    python create_rule_chains_phase3.py --server https://panel.atilax.io --user well@atilax.io
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
log = logging.getLogger("rule-chains-phase3")

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
        metadata["ruleChainId"] = {"id": rc_id, "entityType": "RULE_CHAIN"}
        result = self._post("/ruleChain/metadata", metadata)
        log.info("Set metadata for rule chain %s", rc_id)
        return result


# ===================================================================
# RC3 — Rate of Change Detection
# ===================================================================
def build_rc3_metadata() -> Dict:
    """
    Build the metadata (nodes + connections) for RC3.

    Nodes:
      0 - Message Type Switch
      1 - Originator Attributes (ss_rateThreshold)
      2 - Calculate Delta (pvDelta + periodInMs)
      3 - Script Transformation TBEL (compute rateOfChange)
      4 - Script Filter TBEL (|rateOfChange| > threshold)
      5 - Create Alarm (RATE_OF_CHANGE)

    Flow: 0→2→3→1→4→5(True)
    """
    nodes = [
        # 0 — Message Type Switch
        {
            "type": "org.thingsboard.rule.engine.filter.TbMsgTypeSwitchNode",
            "name": "Message Type Switch",
            "configuration": {"version": 0},
            "additionalInfo": {"layoutX": 200, "layoutY": 300},
        },
        # 1 — Originator Attributes (ss_rateThreshold)
        {
            "type": "org.thingsboard.rule.engine.metadata.TbGetAttributesNode",
            "name": "Get Rate Threshold",
            "configuration": {
                "fetchToData": False,
                "serverAttributeNames": ["ss_rateThreshold"],
                "clientAttributeNames": [],
                "sharedAttributeNames": [],
                "latestTsKeyNames": [],
                "tellFailureIfAbsent": False,
                "getLatestValueWithTs": False,
            },
            "additionalInfo": {"layoutX": 950, "layoutY": 300},
        },
        # 2 — Calculate Delta
        {
            "type": "org.thingsboard.rule.engine.action.TbCalculateDeltaNode",
            "name": "Calculate Delta",
            "configuration": {
                "inputValueKey": "PV",
                "outputValueKey": "pvDelta",
                "useCache": True,
                "addPeriodBetweenMsgs": True,
                "periodValueKey": "periodInMs",
                "round": 4,
                "tellFailureIfDeltaIsNegative": False,
            },
            "additionalInfo": {"layoutX": 450, "layoutY": 300},
        },
        # 3 — Script Transformation TBEL (compute rate)
        {
            "type": "org.thingsboard.rule.engine.transform.TbTransformMsgNode",
            "name": "Compute Rate of Change",
            "configuration": {
                "scriptLang": "TBEL",
                "tbelScript": (
                    "var rate = 0;\n"
                    "if (msg.periodInMs != null && msg.periodInMs > 0) {\n"
                    "  rate = msg.pvDelta / (msg.periodInMs / 1000.0);\n"
                    "}\n"
                    "msg.rateOfChange = rate;\n"
                    "return {msg: msg, metadata: metadata, msgType: msgType};"
                ),
                "jsScript": "return {msg: msg, metadata: metadata, msgType: msgType};",
            },
            "additionalInfo": {"layoutX": 700, "layoutY": 300},
        },
        # 4 — Script Filter TBEL (check threshold)
        {
            "type": "org.thingsboard.rule.engine.filter.TbJsFilterNode",
            "name": "Rate Exceeds Threshold",
            "configuration": {
                "scriptLang": "TBEL",
                "tbelScript": (
                    "if (metadata.ss_rateThreshold == null) {\n"
                    "  return false;\n"
                    "}\n"
                    "return Math.abs(msg.rateOfChange) > parseFloat(metadata.ss_rateThreshold);"
                ),
                "jsScript": "return false;",
            },
            "additionalInfo": {"layoutX": 1200, "layoutY": 300},
        },
        # 5 — Create Alarm (RATE_OF_CHANGE)
        {
            "type": "org.thingsboard.rule.engine.action.TbCreateAlarmNode",
            "name": "Alarm RATE_OF_CHANGE",
            "configuration": {
                "useMessageAlarmData": False,
                "alarmType": "RATE_OF_CHANGE",
                "severity": "MAJOR",
                "propagate": True,
                "propagateToOwner": False,
                "propagateToTenant": False,
                "relationTypes": [],
                "scriptLang": "TBEL",
                "alarmDetailsBuildTbel": (
                    "var details = {};\n"
                    "details.PV = msg.PV;\n"
                    "details.rateOfChange = msg.rateOfChange;\n"
                    "details.threshold = metadata.ss_rateThreshold;\n"
                    "details.message = 'Rate of change ' + msg.rateOfChange "
                    "+ ' exceeds threshold ' + metadata.ss_rateThreshold;\n"
                    "return details;"
                ),
                "alarmDetailsBuildJs": (
                    "var details = {};\n"
                    "details.PV = msg.PV;\n"
                    "return details;"
                ),
            },
            "additionalInfo": {"layoutX": 1450, "layoutY": 300},
        },
    ]

    connections = [
        {"fromIndex": 0, "toIndex": 2, "type": "Post telemetry request"},
        {"fromIndex": 2, "toIndex": 3, "type": "Success"},
        {"fromIndex": 3, "toIndex": 1, "type": "Success"},
        {"fromIndex": 1, "toIndex": 4, "type": "Success"},
        {"fromIndex": 4, "toIndex": 5, "type": "True"},
    ]

    return {
        "firstNodeIndex": 0,
        "nodes": nodes,
        "connections": connections,
        "ruleChainConnections": None,
    }


# ===================================================================
# RC4 — Contextual Alarm Enrichment
# ===================================================================
def build_rc4_metadata() -> Dict:
    """
    Build the metadata (nodes + connections) for RC4.

    Nodes:
      0 - Message Type Switch (alarm-related messages)
      1 - Originator Attributes (ss_setpoint, ss_engUnits, ss_description)
      2 - Originator Latest Telemetry (PV)
      3 - Script Transformation TBEL (enrich alarm details)
      4 - Log node

    Flow: 0→1(Alarm Created/Updated)→2→3→4
    """
    nodes = [
        # 0 — Message Type Switch
        {
            "type": "org.thingsboard.rule.engine.filter.TbMsgTypeSwitchNode",
            "name": "Message Type Switch",
            "configuration": {"version": 0},
            "additionalInfo": {"layoutX": 200, "layoutY": 300},
        },
        # 1 — Originator Attributes
        {
            "type": "org.thingsboard.rule.engine.metadata.TbGetAttributesNode",
            "name": "Get Context Attributes",
            "configuration": {
                "fetchToData": False,
                "serverAttributeNames": ["ss_setpoint", "ss_engUnits", "ss_description"],
                "clientAttributeNames": [],
                "sharedAttributeNames": [],
                "latestTsKeyNames": [],
                "tellFailureIfAbsent": False,
                "getLatestValueWithTs": False,
            },
            "additionalInfo": {"layoutX": 450, "layoutY": 300},
        },
        # 2 — Originator Latest Telemetry (PV)
        {
            "type": "org.thingsboard.rule.engine.metadata.TbGetTelemetryNode",
            "name": "Get Latest PV",
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
            "additionalInfo": {"layoutX": 700, "layoutY": 300},
        },
        # 3 — Script Transformation TBEL (enrich alarm)
        {
            "type": "org.thingsboard.rule.engine.transform.TbTransformMsgNode",
            "name": "Enrich Alarm Details",
            "configuration": {
                "scriptLang": "TBEL",
                "tbelScript": (
                    "var details = json.parse(msg.details) || {};\n"
                    "if (metadata.PV != null) {\n"
                    "  details.PV = parseFloat(metadata.PV);\n"
                    "}\n"
                    "if (metadata.ss_setpoint != null) {\n"
                    "  details.setpoint = parseFloat(metadata.ss_setpoint);\n"
                    "  if (details.PV != null) {\n"
                    "    details.deviation = details.PV - details.setpoint;\n"
                    "  }\n"
                    "}\n"
                    "if (metadata.ss_engUnits != null) {\n"
                    "  details.engUnits = metadata.ss_engUnits;\n"
                    "}\n"
                    "if (metadata.ss_description != null) {\n"
                    "  details.description = metadata.ss_description;\n"
                    "}\n"
                    "msg.details = json.stringify(details);\n"
                    "return {msg: msg, metadata: metadata, msgType: msgType};"
                ),
                "jsScript": "return {msg: msg, metadata: metadata, msgType: msgType};",
            },
            "additionalInfo": {"layoutX": 950, "layoutY": 300},
        },
        # 4 — Log node
        {
            "type": "org.thingsboard.rule.engine.action.TbLogNode",
            "name": "Log Enriched Alarm",
            "configuration": {
                "scriptLang": "TBEL",
                "tbelScript": "return 'Enriched alarm: ' + json.stringify(msg);",
                "jsScript": "return 'Enriched alarm: ' + JSON.stringify(msg);",
            },
            "additionalInfo": {"layoutX": 1200, "layoutY": 300},
        },
    ]

    connections = [
        {"fromIndex": 0, "toIndex": 1, "type": "Alarm Created"},
        {"fromIndex": 0, "toIndex": 1, "type": "Alarm Updated"},
        {"fromIndex": 1, "toIndex": 2, "type": "Success"},
        {"fromIndex": 2, "toIndex": 3, "type": "Success"},
        {"fromIndex": 3, "toIndex": 4, "type": "Success"},
    ]

    return {
        "firstNodeIndex": 0,
        "nodes": nodes,
        "connections": connections,
        "ruleChainConnections": None,
    }


# ===================================================================
# Link RC3 from RC1
# ===================================================================
def link_rc3_to_rc1(client: TBClient, rc1_id: str, rc3_id: str) -> None:
    """
    Add RC3 as an additional ruleChainConnection from RC1's Save Timeseries node.
    This ensures data flows: RC1 -> RC2 (deadband) AND RC1 -> RC3 (rate of change).
    """
    meta = client.get_rule_chain_metadata(rc1_id)

    # Find the Save Timeseries node index
    save_ts_index = None
    for i, node in enumerate(meta.get("nodes", [])):
        if node.get("type") == "org.thingsboard.rule.engine.telemetry.TbMsgTimeseriesNode":
            save_ts_index = i
            break

    if save_ts_index is None:
        log.warning("Could not find Save Timeseries node in RC1 — skipping RC3 link")
        return

    # Check if RC3 is already linked
    existing_connections = meta.get("ruleChainConnections") or []
    for conn in existing_connections:
        target = conn.get("targetRuleChainId", {})
        if target.get("id") == rc3_id:
            log.info("RC3 already linked from RC1 Save Timeseries node")
            return

    # Add RC3 connection
    existing_connections.append({
        "fromIndex": save_ts_index,
        "targetRuleChainId": {"id": rc3_id, "entityType": "RULE_CHAIN"},
        "type": "Success",
        "additionalInfo": {"layoutX": 1450, "layoutY": 400},
    })
    meta["ruleChainConnections"] = existing_connections

    client.set_rule_chain_metadata(rc1_id, meta)
    log.info("Linked RC3 from RC1 Save Timeseries node (index=%d)", save_ts_index)


# ===================================================================
# Main
# ===================================================================
def main() -> None:
    parser = argparse.ArgumentParser(description="Create RC3 and RC4 rule chains")
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
    # Step 2: Create rule chain shells
    # ------------------------------------------------------------------
    log.info("=" * 60)
    log.info("Creating rule chains …")
    log.info("=" * 60)

    rc3 = client.create_rule_chain("RC3 Rate of Change Detection")
    rc3_id = rc3["id"]["id"]
    log.info("  RC3 id = %s", rc3_id)

    rc4 = client.create_rule_chain("RC4 Contextual Alarm Enrichment")
    rc4_id = rc4["id"]["id"]
    log.info("  RC4 id = %s", rc4_id)

    # ------------------------------------------------------------------
    # Step 3: Set RC3 metadata
    # ------------------------------------------------------------------
    log.info("=" * 60)
    log.info("Setting RC3 metadata …")
    log.info("=" * 60)
    rc3_meta = build_rc3_metadata()
    log.info("  RC3 nodes: %d, connections: %d",
             len(rc3_meta["nodes"]), len(rc3_meta["connections"]))
    client.set_rule_chain_metadata(rc3_id, rc3_meta)

    # ------------------------------------------------------------------
    # Step 4: Set RC4 metadata
    # ------------------------------------------------------------------
    log.info("=" * 60)
    log.info("Setting RC4 metadata …")
    log.info("=" * 60)
    rc4_meta = build_rc4_metadata()
    log.info("  RC4 nodes: %d, connections: %d",
             len(rc4_meta["nodes"]), len(rc4_meta["connections"]))
    client.set_rule_chain_metadata(rc4_id, rc4_meta)

    # ------------------------------------------------------------------
    # Step 5: Link RC3 from RC1's Save Timeseries node
    # ------------------------------------------------------------------
    log.info("=" * 60)
    log.info("Linking RC3 from RC1 …")
    log.info("=" * 60)

    rc1 = client.find_rule_chain("RC1 Ingesta y Validacion")
    if rc1:
        rc1_id = rc1["id"]["id"]
        link_rc3_to_rc1(client, rc1_id, rc3_id)
    else:
        log.warning("RC1 not found — RC3 created as standalone chain")

    # ------------------------------------------------------------------
    # Summary
    # ------------------------------------------------------------------
    log.info("=" * 60)
    log.info("RULE CHAINS CREATED SUCCESSFULLY")
    log.info("=" * 60)
    log.info("  RC3 (Rate of Change Detection)      : %s", rc3_id)
    log.info("  RC4 (Contextual Alarm Enrichment)    : %s", rc4_id)
    if rc1:
        log.info("  RC1 -> RC3 linked via ruleChainConnection (Save TS -> RC3)")
    log.info("")
    log.info("Flow: Device -> RC1 -> Save TS -> RC2 (deadband)")
    log.info("                                -> RC3 (rate of change)")
    log.info("  Alarms -> RC4 (contextual enrichment)")


if __name__ == "__main__":
    main()
