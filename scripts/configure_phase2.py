#!/usr/bin/env python3
"""
Configure Phase 2 features on ThingsBoard PE:
  - Task 2.4: Stale Data Detection (device inactivity timeout)
  - Task 2.5: Notification Center (alarm notification templates + rules)

Usage:
    python configure_phase2.py
    python configure_phase2.py --server https://panel.atilax.io --user well@atilax.io
"""

import argparse
import logging
import sys
import time
from typing import Any, Dict, List, Optional, Tuple

import requests

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("phase2")

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
    # Device Profiles
    # ------------------------------------------------------------------
    def find_device_profile(self, name: str) -> Optional[Dict]:
        """Find a device profile by exact name."""
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

    # ------------------------------------------------------------------
    # Notification Templates
    # ------------------------------------------------------------------
    def find_notification_template(self, name: str) -> Optional[Dict]:
        """Find a notification template by exact name."""
        page = 0
        while True:
            data = self._get("/notification/templates", params={
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

    def create_notification_template(self, payload: Dict) -> Dict:
        """Create a notification template."""
        return self._post("/notification/template", payload)

    # ------------------------------------------------------------------
    # Notification Rules
    # ------------------------------------------------------------------
    def find_notification_rule(self, name: str) -> Optional[Dict]:
        """Find a notification rule by exact name."""
        page = 0
        while True:
            data = self._get("/notification/rules", params={
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

    def create_notification_rule(self, payload: Dict) -> Dict:
        """Create a notification rule."""
        return self._post("/notification/rule", payload)

    # ------------------------------------------------------------------
    # Notification Targets
    # ------------------------------------------------------------------
    def find_notification_target(self, name: str) -> Optional[Dict]:
        """Find a notification target by exact name."""
        page = 0
        while True:
            data = self._get("/notification/targets", params={
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

    def create_notification_target(self, payload: Dict) -> Dict:
        """Create a notification target."""
        return self._post("/notification/target", payload)


# ===================================================================
# Task 2.4: Stale Data Detection
# ===================================================================
INACTIVITY_TIMEOUT_SECS = 60
DEVICE_PROFILES_TO_CONFIGURE = ["AnalogInput", "DigitalInput"]


def configure_inactivity(client: TBClient) -> None:
    """
    Set inactivity timeout on AnalogInput and DigitalInput device profiles.

    When a device does not send telemetry within the timeout window,
    ThingsBoard automatically generates an Inactivity Event and marks
    the device as inactive.
    """
    for profile_name in DEVICE_PROFILES_TO_CONFIGURE:
        profile = client.find_device_profile(profile_name)
        if not profile:
            log.warning("Device profile '%s' not found — skipping", profile_name)
            continue

        profile_id = profile["id"]["id"]
        full = client.get_device_profile_full(profile_id)

        # Ensure profileData.configuration exists
        profile_data = full.setdefault("profileData", {})
        config = profile_data.setdefault("configuration", {"type": "DEFAULT"})

        current_timeout = config.get("inactivityTimeoutInSec")
        if current_timeout == INACTIVITY_TIMEOUT_SECS:
            log.info("  '%s' already has inactivityTimeoutInSec=%d — skipping",
                     profile_name, INACTIVITY_TIMEOUT_SECS)
            continue

        config["inactivityTimeoutInSec"] = INACTIVITY_TIMEOUT_SECS
        client.save_device_profile(full)
        log.info("  Set inactivityTimeoutInSec=%d on '%s' (id=%s)",
                 INACTIVITY_TIMEOUT_SECS, profile_name, profile_id)


# ===================================================================
# Task 2.5: Notification Center
# ===================================================================
TEMPLATE_NAME = "Historian Alarm Notification"
RULE_NAME = "Critical and Major Alarm Notifications"
TARGET_NAME = "Tenant Administrators"


def build_notification_template() -> Dict:
    """
    Build the notification template payload for alarm events.

    Uses ThingsBoard PE notification template variables:
      ${alarmType}, ${alarmSeverity}, ${alarmStatus},
      ${alarmOriginatorName}, ${alarmOriginatorEntityType}
    """
    return {
        "name": TEMPLATE_NAME,
        "notificationType": "ALARM",
        "configuration": {
            "deliveryMethodsTemplates": {
                "WEB": {
                    "enabled": True,
                    "method": "WEB",
                    "subject": "${alarmSeverity}: ${alarmType} on ${alarmOriginatorName}",
                    "body": (
                        "<b>${alarmSeverity}: ${alarmType}</b><br/>"
                        "Device: ${alarmOriginatorName}<br/>"
                        "Status: ${alarmStatus}<br/>"
                        "Time: ${alarmStartTs}"
                    ),
                },
                "EMAIL": {
                    "enabled": True,
                    "method": "EMAIL",
                    "subject": "[Historian] ${alarmSeverity} — ${alarmType} on ${alarmOriginatorName}",
                    "body": (
                        "<h3>Alarm Notification</h3>"
                        "<table>"
                        "<tr><td><b>Severity</b></td><td>${alarmSeverity}</td></tr>"
                        "<tr><td><b>Type</b></td><td>${alarmType}</td></tr>"
                        "<tr><td><b>Device</b></td><td>${alarmOriginatorName}</td></tr>"
                        "<tr><td><b>Status</b></td><td>${alarmStatus}</td></tr>"
                        "<tr><td><b>Time</b></td><td>${alarmStartTs}</td></tr>"
                        "</table>"
                        "<br/><small>Historian Notification Center</small>"
                    ),
                },
            },
        },
    }


def build_notification_rule(template_id: str, target_id: str) -> Dict:
    """
    Build the notification rule that fires on CRITICAL and MAJOR alarm creation.

    The escalation table key '0' means immediate delivery (0 minutes delay).
    """
    return {
        "name": RULE_NAME,
        "enabled": True,
        "triggerType": "ALARM",
        "triggerConfig": {
            "triggerType": "ALARM",
            "alarmTypes": None,
            "alarmSeverities": ["CRITICAL", "MAJOR"],
            "notifyOn": ["CREATED"],
            "clearRule": None,
        },
        "recipientsConfig": {
            "triggerType": "ALARM",
            "escalationTable": {
                "0": [target_id],
            },
        },
        "templateId": {
            "id": template_id,
            "entityType": "NOTIFICATION_TEMPLATE",
        },
        "additionalConfig": {
            "description": (
                "Fires on CRITICAL and MAJOR alarm creation "
                "(HH/LL → CRITICAL, H/L → MAJOR) for all device types"
            ),
        },
    }


def ensure_notification_target(client: TBClient) -> str:
    """Find or create the 'Tenant Administrators' notification target."""
    target = client.find_notification_target(TARGET_NAME)
    if target:
        target_id = target["id"]["id"]
        log.info("  Notification target '%s' already exists (id=%s)",
                 TARGET_NAME, target_id)
        return target_id

    payload = {
        "name": TARGET_NAME,
        "configuration": {
            "type": "PLATFORM_USERS",
            "usersFilter": {
                "type": "TENANT_ADMINISTRATORS",
            },
            "description": "All tenant administrator users",
        },
    }
    target = client.create_notification_target(payload)
    target_id = target["id"]["id"]
    log.info("  Created notification target '%s' (id=%s)", TARGET_NAME, target_id)
    return target_id


def configure_notifications(client: TBClient) -> Tuple[str, str, str]:
    """
    Create notification target, template, and rule for alarm events.

    Returns:
        (template_id, rule_id, target_id)
    """
    # --- Step 1: Notification Target ---
    target_id = ensure_notification_target(client)

    # --- Step 2: Notification Template ---
    existing_template = client.find_notification_template(TEMPLATE_NAME)
    if existing_template:
        template_id = existing_template["id"]["id"]
        log.info("  Template '%s' already exists (id=%s)", TEMPLATE_NAME, template_id)
    else:
        template_payload = build_notification_template()
        template = client.create_notification_template(template_payload)
        template_id = template["id"]["id"]
        log.info("  Created template '%s' (id=%s)", TEMPLATE_NAME, template_id)

    # --- Step 3: Notification Rule ---
    existing_rule = client.find_notification_rule(RULE_NAME)
    if existing_rule:
        rule_id = existing_rule["id"]["id"]
        log.info("  Rule '%s' already exists (id=%s)", RULE_NAME, rule_id)
    else:
        rule_payload = build_notification_rule(template_id, target_id)
        rule = client.create_notification_rule(rule_payload)
        rule_id = rule["id"]["id"]
        log.info("  Created rule '%s' (id=%s)", RULE_NAME, rule_id)

    return template_id, rule_id, target_id


# ===================================================================
# Main
# ===================================================================
def main() -> None:
    parser = argparse.ArgumentParser(
        description="Configure Phase 2: Stale Data Detection + Notification Center",
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
    # Step 2: Stale Data Detection (Task 2.4)
    # ------------------------------------------------------------------
    log.info("=" * 60)
    log.info("TASK 2.4: Stale Data Detection (Inactivity Timeout)")
    log.info("=" * 60)

    try:
        configure_inactivity(client)
    except requests.exceptions.HTTPError as exc:
        log.error("Failed to configure inactivity: %s", exc)
        log.error("Response: %s", getattr(exc.response, "text", "N/A"))
        sys.exit(1)

    # ------------------------------------------------------------------
    # Step 3: Notification Center (Task 2.5)
    # ------------------------------------------------------------------
    log.info("=" * 60)
    log.info("TASK 2.5: Notification Center")
    log.info("=" * 60)

    try:
        template_id, rule_id, target_id = configure_notifications(client)
    except requests.exceptions.HTTPError as exc:
        log.error("Failed to configure notifications: %s", exc)
        log.error("Response: %s", getattr(exc.response, "text", "N/A"))
        sys.exit(1)

    # ------------------------------------------------------------------
    # Summary
    # ------------------------------------------------------------------
    log.info("=" * 60)
    log.info("PHASE 2 CONFIGURATION COMPLETE")
    log.info("=" * 60)
    log.info("  Inactivity timeout : %ds on %s",
             INACTIVITY_TIMEOUT_SECS, ", ".join(DEVICE_PROFILES_TO_CONFIGURE))
    log.info("  Notification target  : %s (id=%s)", TARGET_NAME, target_id)
    log.info("  Notification template: %s (id=%s)", TEMPLATE_NAME, template_id)
    log.info("  Notification rule    : %s (id=%s)", RULE_NAME, rule_id)
    log.info("")
    log.info("Stale data: Devices inactive >%ds generate Inactivity Event",
             INACTIVITY_TIMEOUT_SECS)
    log.info("Notifications: CRITICAL/MAJOR alarms → WEB + EMAIL to tenant admins")


if __name__ == "__main__":
    main()
