# Script de Provisioning Masivo

> Guia para desarrollar un script de aprovisionamiento automatizado que cree la jerarquia completa de activos, dispositivos y relaciones en ThingsBoard PE.

---

## Por que se Necesita un Script

El **import CSV nativo** de ThingsBoard tiene una limitacion critica: **no crea relaciones entre entidades**. Solo puede crear entidades (devices o assets) con sus atributos. Para construir la jerarquia completa del historiador (Empresa > Planta > Area > Unidad > Equipo > Tag), se requiere un script que utilice la REST API.

**Este es un esfuerzo unico y reutilizable** — una vez desarrollado, el script sirve para:
- Despliegue inicial de la planta completa
- Agregar nuevos equipos o tags
- Migracion entre instancias de ThingsBoard
- Recreacion del entorno de desarrollo/testing

---

## Flujo de Trabajo del Script

```
┌──────────────────┐
│  Leer Spreadsheet │
│  (CSV / Excel)    │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ 1. Crear Asset    │
│    Profiles       │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ 2. Crear Assets   │
│    (Jerarquia)    │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ 3. Crear Device   │
│    Profiles       │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ 4. Crear Devices  │
│    (Tags)         │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ 5. Crear          │
│    Relaciones     │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ 6. Asignar        │
│    Atributos      │
└────────┘─────────┘
```

---

## Estructura del Spreadsheet de Entrada

### Hoja 1: Jerarquia de Activos

| Nivel | Nombre | Perfil | Padre | Descripcion |
|-------|--------|--------|-------|-------------|
| Empresa | ACME Oil & Gas | Enterprise | — | Empresa principal |
| Planta | Planta Norte | Plant | ACME Oil & Gas | Planta de produccion |
| Area | Area de Pozos | Area | Planta Norte | Area operativa |
| Unidad | Pozo ESP-001 | Unit | Area de Pozos | Pozo con bomba ESP |
| Equipo | Bomba ESP | Equipment | Pozo ESP-001 | Bomba electrosumergible |
| Equipo | Motor ESP | Equipment | Pozo ESP-001 | Motor electrico |
| Equipo | VSD | Equipment | Pozo ESP-001 | Variador de velocidad |

### Hoja 2: Tags (Devices)

| Tag Name | Device Profile | Equipo Padre | Unidad | Rango Min | Rango Max | Deadband | Scan Rate | Descripcion |
|----------|---------------|-------------|--------|-----------|-----------|----------|-----------|-------------|
| ESP001_PIT_001 | Analog Input | Bomba ESP | PSI | 0 | 5000 | 5 | 1s | Presion de intake |
| ESP001_TIT_001 | Analog Input | Motor ESP | degF | 100 | 400 | 1 | 1s | Temperatura de motor |
| ESP001_FIT_001 | Analog Input | Bomba ESP | BPD | 0 | 10000 | 10 | 1s | Caudal de produccion |
| ESP001_AMP_001 | Analog Input | Motor ESP | A | 0 | 200 | 0.5 | 1s | Corriente de motor |
| ESP001_VIB_001 | Analog Input | Bomba ESP | g | 0 | 10 | 0.1 | 5s | Vibracion |
| ESP001_RUN_001 | Digital Input | VSD | — | 0 | 1 | 0 | 1s | Estado run/stop |

---

## Endpoints REST API por Paso

### Paso 0: Autenticacion

```bash
POST /api/auth/login
Content-Type: application/json

{
  "username": "well@atilax.io",
  "password": "10203040"
}
# Respuesta: {"token": "JWT_TOKEN", "refreshToken": "..."}
```

### Paso 1: Crear Asset Profiles

```bash
POST /api/assetProfile
X-Authorization: Bearer $TOKEN
Content-Type: application/json

{
  "name": "Plant",
  "description": "Perfil para activos tipo Planta",
  "default": false
}
```

Perfiles a crear:

| Nombre | Descripcion |
|--------|-------------|
| `Enterprise` | Nivel empresa |
| `Plant` | Nivel planta |
| `Area` | Nivel area operativa |
| `Unit` | Nivel unidad/equipo principal |
| `Equipment` | Nivel equipo individual |

### Paso 2: Crear Assets

```bash
POST /api/asset
X-Authorization: Bearer $TOKEN
Content-Type: application/json

{
  "name": "Planta Norte",
  "type": "Plant",
  "label": "Planta de produccion Norte",
  "assetProfileId": {
    "id": "uuid-del-asset-profile",
    "entityType": "ASSET_PROFILE"
  }
}
# Respuesta: {"id": {"id": "uuid-del-asset", "entityType": "ASSET"}, ...}
```

### Paso 3: Crear Device Profiles

```bash
POST /api/deviceProfile
X-Authorization: Bearer $TOKEN
Content-Type: application/json

{
  "name": "Analog Input",
  "type": "DEFAULT",
  "transportType": "MQTT",
  "description": "Tag analogico de entrada",
  "profileData": {
    "configuration": {
      "type": "DEFAULT"
    },
    "transportConfiguration": {
      "type": "MQTT",
      "deviceTelemetryTopic": "v1/devices/me/telemetry",
      "deviceAttributesTopic": "v1/devices/me/attributes"
    },
    "alarmRules": {}
  }
}
```

Perfiles de dispositivo a crear:

| Nombre | Descripcion | Alarm Rules |
|--------|-------------|-------------|
| `Analog Input` | Senal analogica de entrada | HH, H, L, LL |
| `Digital Input` | Senal digital (0/1) | State change |
| `Calculated` | Tag calculado | Segun formula |
| `Totalizer` | Acumulador / totalizador | Overflow, reset |

### Paso 4: Crear Devices (Tags)

```bash
POST /api/device
X-Authorization: Bearer $TOKEN
Content-Type: application/json

{
  "name": "ESP001_PIT_001",
  "type": "Analog Input",
  "label": "Presion de intake - Pozo ESP-001",
  "deviceProfileId": {
    "id": "uuid-del-device-profile",
    "entityType": "DEVICE_PROFILE"
  }
}
# Respuesta: {"id": {"id": "uuid-del-device", "entityType": "DEVICE"}, ...}
```

### Paso 5: Crear Relaciones

```bash
POST /api/relation
X-Authorization: Bearer $TOKEN
Content-Type: application/json

{
  "from": {
    "id": "uuid-del-equipo",
    "entityType": "ASSET"
  },
  "to": {
    "id": "uuid-del-device",
    "entityType": "DEVICE"
  },
  "type": "Contains",
  "typeGroup": "COMMON"
}
```

La jerarquia de relaciones sigue el patron:

```
Enterprise --Contains--> Plant --Contains--> Area --Contains--> Unit --Contains--> Equipment --Contains--> Device(Tag)
```

### Paso 6: Asignar Atributos del Servidor

```bash
POST /api/plugins/telemetry/DEVICE/{deviceId}/attributes/SERVER_SCOPE
X-Authorization: Bearer $TOKEN
Content-Type: application/json

{
  "ss_unit": "PSI",
  "ss_rangeLow": 0,
  "ss_rangeHigh": 5000,
  "ss_deadband": 5,
  "ss_scanRate": "1s",
  "ss_setpoint": 2500,
  "ss_alarmHH": 4500,
  "ss_alarmH": 4000,
  "ss_alarmL": 500,
  "ss_alarmLL": 200,
  "ss_description": "Presion de intake - Bomba ESP",
  "ss_tagType": "AI",
  "ss_equipment": "Bomba ESP",
  "ss_area": "Area de Pozos"
}
```

---

## Ejemplo de Script Python

```python
"""
Script de provisioning masivo para ThingsBoard PE.
Lee un spreadsheet y crea la jerarquia completa via REST API.

Uso:
    python provision.py --file planta.xlsx --server https://panel.atilax.io
"""

import requests
import pandas as pd
import time
import json
import argparse
from typing import Dict, Optional

class ThingsBoardProvisioner:
    def __init__(self, base_url: str, username: str, password: str):
        self.base_url = base_url.rstrip("/")
        self.token = None
        self.entity_cache: Dict[str, str] = {}  # nombre -> uuid
        self.profile_cache: Dict[str, str] = {}  # nombre -> uuid
        self._login(username, password)

    def _login(self, username: str, password: str):
        """Autenticar y obtener JWT token."""
        resp = requests.post(
            f"{self.base_url}/api/auth/login",
            json={"username": username, "password": password}
        )
        resp.raise_for_status()
        self.token = resp.json()["token"]
        print(f"[OK] Autenticado como {username}")

    def _headers(self):
        return {
            "X-Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }

    # ── Paso 1: Asset Profiles ──────────────────────────────

    def crear_asset_profile(self, nombre: str, descripcion: str = "") -> str:
        """Crear un Asset Profile y retornar su UUID."""
        resp = requests.post(
            f"{self.base_url}/api/assetProfile",
            headers=self._headers(),
            json={
                "name": nombre,
                "description": descripcion,
                "default": False
            }
        )
        resp.raise_for_status()
        uuid = resp.json()["id"]["id"]
        self.profile_cache[f"asset_{nombre}"] = uuid
        print(f"  [Asset Profile] {nombre} -> {uuid}")
        return uuid

    # ── Paso 2: Assets ──────────────────────────────────────

    def crear_asset(self, nombre: str, perfil: str,
                    label: str = "") -> str:
        """Crear un Asset y retornar su UUID."""
        profile_id = self.profile_cache.get(f"asset_{perfil}")
        body = {
            "name": nombre,
            "type": perfil,
            "label": label or nombre
        }
        if profile_id:
            body["assetProfileId"] = {
                "id": profile_id,
                "entityType": "ASSET_PROFILE"
            }

        resp = requests.post(
            f"{self.base_url}/api/asset",
            headers=self._headers(),
            json=body
        )
        resp.raise_for_status()
        uuid = resp.json()["id"]["id"]
        self.entity_cache[nombre] = uuid
        print(f"  [Asset] {nombre} ({perfil}) -> {uuid}")
        return uuid

    # ── Paso 3: Device Profiles ─────────────────────────────

    def crear_device_profile(self, nombre: str,
                              descripcion: str = "") -> str:
        """Crear un Device Profile y retornar su UUID."""
        resp = requests.post(
            f"{self.base_url}/api/deviceProfile",
            headers=self._headers(),
            json={
                "name": nombre,
                "type": "DEFAULT",
                "transportType": "MQTT",
                "description": descripcion,
                "profileData": {
                    "configuration": {"type": "DEFAULT"},
                    "transportConfiguration": {
                        "type": "MQTT",
                        "deviceTelemetryTopic": "v1/devices/me/telemetry",
                        "deviceAttributesTopic": "v1/devices/me/attributes"
                    }
                }
            }
        )
        resp.raise_for_status()
        uuid = resp.json()["id"]["id"]
        self.profile_cache[f"device_{nombre}"] = uuid
        print(f"  [Device Profile] {nombre} -> {uuid}")
        return uuid

    # ── Paso 4: Devices (Tags) ──────────────────────────────

    def crear_device(self, nombre: str, perfil: str,
                     label: str = "") -> str:
        """Crear un Device y retornar su UUID."""
        profile_id = self.profile_cache.get(f"device_{perfil}")
        body = {
            "name": nombre,
            "type": perfil,
            "label": label or nombre
        }
        if profile_id:
            body["deviceProfileId"] = {
                "id": profile_id,
                "entityType": "DEVICE_PROFILE"
            }

        resp = requests.post(
            f"{self.base_url}/api/device",
            headers=self._headers(),
            json=body
        )
        resp.raise_for_status()
        uuid = resp.json()["id"]["id"]
        self.entity_cache[nombre] = uuid
        print(f"  [Device] {nombre} ({perfil}) -> {uuid}")
        return uuid

    # ── Paso 5: Relaciones ──────────────────────────────────

    def crear_relacion(self, padre_nombre: str, padre_tipo: str,
                       hijo_nombre: str, hijo_tipo: str,
                       tipo_relacion: str = "Contains"):
        """Crear una relacion entre dos entidades."""
        from_id = self.entity_cache.get(padre_nombre)
        to_id = self.entity_cache.get(hijo_nombre)

        if not from_id or not to_id:
            print(f"  [WARN] No se encontro UUID para "
                  f"{padre_nombre} o {hijo_nombre}")
            return

        resp = requests.post(
            f"{self.base_url}/api/relation",
            headers=self._headers(),
            json={
                "from": {"id": from_id, "entityType": padre_tipo},
                "to": {"id": to_id, "entityType": hijo_tipo},
                "type": tipo_relacion,
                "typeGroup": "COMMON"
            }
        )
        resp.raise_for_status()
        print(f"  [Relacion] {padre_nombre} --{tipo_relacion}--> "
              f"{hijo_nombre}")

    # ── Paso 6: Atributos ───────────────────────────────────

    def asignar_atributos(self, device_nombre: str,
                          atributos: dict):
        """Asignar atributos de servidor a un device."""
        device_id = self.entity_cache.get(device_nombre)
        if not device_id:
            print(f"  [WARN] Device no encontrado: {device_nombre}")
            return

        resp = requests.post(
            f"{self.base_url}/api/plugins/telemetry/DEVICE/"
            f"{device_id}/attributes/SERVER_SCOPE",
            headers=self._headers(),
            json=atributos
        )
        resp.raise_for_status()
        print(f"  [Atributos] {device_nombre}: "
              f"{len(atributos)} atributos asignados")


def main():
    parser = argparse.ArgumentParser(
        description="Provisioning masivo ThingsBoard PE"
    )
    parser.add_argument("--file", required=True,
                        help="Archivo Excel con datos de planta")
    parser.add_argument("--server",
                        default="https://panel.atilax.io",
                        help="URL del servidor ThingsBoard")
    parser.add_argument("--user", default="well@atilax.io")
    parser.add_argument("--password", default="10203040")
    args = parser.parse_args()

    # Inicializar
    tb = ThingsBoardProvisioner(args.server, args.user, args.password)

    # Leer spreadsheet
    df_assets = pd.read_excel(args.file, sheet_name="Assets")
    df_tags = pd.read_excel(args.file, sheet_name="Tags")

    # Paso 1: Asset Profiles (unicos)
    print("\n=== Paso 1: Crear Asset Profiles ===")
    for perfil in df_assets["Perfil"].unique():
        tb.crear_asset_profile(perfil)
        time.sleep(0.1)

    # Paso 2: Assets (ordenados por nivel jerarquico)
    print("\n=== Paso 2: Crear Assets ===")
    niveles = ["Empresa", "Planta", "Area", "Unidad", "Equipo"]
    for nivel in niveles:
        subset = df_assets[df_assets["Nivel"] == nivel]
        for _, row in subset.iterrows():
            tb.crear_asset(row["Nombre"], row["Perfil"],
                          row.get("Descripcion", ""))
            time.sleep(0.1)

    # Crear relaciones entre assets
    print("\n=== Paso 2b: Relaciones entre Assets ===")
    for _, row in df_assets.iterrows():
        if pd.notna(row.get("Padre")):
            tb.crear_relacion(
                row["Padre"], "ASSET",
                row["Nombre"], "ASSET"
            )
            time.sleep(0.1)

    # Paso 3: Device Profiles (unicos)
    print("\n=== Paso 3: Crear Device Profiles ===")
    for perfil in df_tags["Device Profile"].unique():
        tb.crear_device_profile(perfil)
        time.sleep(0.1)

    # Paso 4: Devices
    print("\n=== Paso 4: Crear Devices (Tags) ===")
    for _, row in df_tags.iterrows():
        tb.crear_device(
            row["Tag Name"],
            row["Device Profile"],
            row.get("Descripcion", "")
        )
        time.sleep(0.1)

    # Paso 5: Relaciones Device -> Asset padre
    print("\n=== Paso 5: Relaciones Equipment -> Device ===")
    for _, row in df_tags.iterrows():
        tb.crear_relacion(
            row["Equipo Padre"], "ASSET",
            row["Tag Name"], "DEVICE"
        )
        time.sleep(0.1)

    # Paso 6: Atributos
    print("\n=== Paso 6: Asignar Atributos ===")
    for _, row in df_tags.iterrows():
        atributos = {
            "ss_unit": str(row.get("Unidad", "")),
            "ss_rangeLow": float(row.get("Rango Min", 0)),
            "ss_rangeHigh": float(row.get("Rango Max", 100)),
            "ss_deadband": float(row.get("Deadband", 0)),
            "ss_scanRate": str(row.get("Scan Rate", "1s")),
            "ss_description": str(row.get("Descripcion", "")),
            "ss_tagType": str(row.get("Device Profile", "AI")),
        }
        tb.asignar_atributos(row["Tag Name"], atributos)
        time.sleep(0.1)

    print(f"\n=== Provisioning completado ===")
    print(f"  Assets creados: {len(df_assets)}")
    print(f"  Devices creados: {len(df_tags)}")
    print(f"  Relaciones creadas: "
          f"{len(df_assets) + len(df_tags) - 1}")


if __name__ == "__main__":
    main()
```

---

## Ejecucion

```bash
# Instalar dependencias
pip install requests pandas openpyxl

# Ejecutar
python provision.py \
  --file planta_norte.xlsx \
  --server https://panel.atilax.io \
  --user well@atilax.io \
  --password 10203040
```

---

## Manejo de Errores y Re-ejecucion

### Idempotencia

El script deberia manejar re-ejecuciones de forma segura:

1. **Verificar existencia antes de crear**: Buscar entidad por nombre antes de crearla
2. **Cache de UUIDs**: Mantener un archivo JSON local con el mapeo nombre -> UUID
3. **Log de progreso**: Registrar cada operacion exitosa para continuar desde el punto de fallo

```python
# Ejemplo: verificar si un device ya existe
def buscar_device_por_nombre(self, nombre: str) -> Optional[str]:
    """Buscar device por nombre, retornar UUID si existe."""
    resp = requests.get(
        f"{self.base_url}/api/tenant/devices"
        f"?deviceName={nombre}",
        headers=self._headers()
    )
    if resp.status_code == 200:
        data = resp.json()
        if data:
            return data["id"]["id"]
    return None
```

### Limites de la API

| Operacion | Rate limit sugerido | Nota |
|-----------|-------------------|------|
| Crear entidades | 10/segundo | Evitar sobrecargar la base de datos |
| Crear relaciones | 20/segundo | Operacion ligera |
| Asignar atributos | 20/segundo | Operacion ligera |
| Login (refresh token) | Cada 15 minutos | El JWT expira |

---

## Verificacion Post-Provisioning

Despues de ejecutar el script, verificar:

```bash
# Contar assets creados
curl -X GET "https://panel.atilax.io/api/tenant/assets?pageSize=1&page=0" \
  -H "X-Authorization: Bearer $TOKEN" | jq '.totalElements'

# Contar devices creados
curl -X GET "https://panel.atilax.io/api/tenant/devices?pageSize=1&page=0" \
  -H "X-Authorization: Bearer $TOKEN" | jq '.totalElements'

# Verificar jerarquia de un asset
curl -X GET "https://panel.atilax.io/api/relations/info?fromId={assetId}&fromType=ASSET" \
  -H "X-Authorization: Bearer $TOKEN" | jq '.[] | .to.entityType + ": " + .toName'
```
