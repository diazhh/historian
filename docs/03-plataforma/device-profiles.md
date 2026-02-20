# Device Profiles

## Device Profile "Tag"

**Todos** los Device-tags del historiador comparten un único Device Profile llamado `"Tag"`. Este es el componente más crítico de configuración de plataforma.

### Características del Profile:

| Propiedad | Valor |
|-----------|-------|
| Nombre | `Tag` |
| Transport | MQTT (Default) |
| Provisioning | Disabled (se crean por script o manualmente) |
| Alarm Rules | 4 reglas genéricas (HH, H, L, LL) |
| Calculated Fields | 1 (Quality text) |

---

## Alarm Rules Genéricas

Como todos los tags comparten el Device Profile, las reglas se definen **una sola vez** con umbrales dinámicos que leen los atributos del propio Device:

### Alarma HIGH_HIGH (CRITICAL)

```
Nombre: HIGH_HIGH
Severity: CRITICAL

Create Condition:
  Key: PV (telemetry)
  Operator: GREATER_THAN
  Value type: DYNAMIC → attribute "alarmHH"

Clear Condition:
  Key: PV (telemetry)
  Operator: LESS_THAN
  Value type: DYNAMIC → attribute "alarmHH" - attribute "deadbandValue"

Propagate: YES (a entidades relacionadas)
```

### Alarma HIGH (MAJOR)

```
Nombre: HIGH
Severity: MAJOR

Create Condition:
  Key: PV (telemetry)
  Operator: GREATER_THAN
  Value type: DYNAMIC → attribute "alarmH"

Clear Condition:
  Key: PV (telemetry)
  Operator: LESS_THAN
  Value type: DYNAMIC → attribute "alarmH" - attribute "deadbandValue"

Propagate: YES
```

### Alarma LOW (MAJOR)

```
Nombre: LOW
Severity: MAJOR

Create Condition:
  Key: PV (telemetry)
  Operator: LESS_THAN
  Value type: DYNAMIC → attribute "alarmL"

Clear Condition:
  Key: PV (telemetry)
  Operator: GREATER_THAN
  Value type: DYNAMIC → attribute "alarmL" + attribute "deadbandValue"

Propagate: YES
```

### Alarma LOW_LOW (CRITICAL)

```
Nombre: LOW_LOW
Severity: CRITICAL

Create Condition:
  Key: PV (telemetry)
  Operator: LESS_THAN
  Value type: DYNAMIC → attribute "alarmLL"

Clear Condition:
  Key: PV (telemetry)
  Operator: GREATER_THAN
  Value type: DYNAMIC → attribute "alarmLL" + attribute "deadbandValue"

Propagate: YES
```

### Comportamiento:
- Tags con atributos de alarma en `null` → las reglas **no disparan** (TB ignora condiciones con null)
- Los umbrales se actualizan automáticamente si cambian los atributos del Device
- La propagación hace que las alarmas aparezcan en los Assets padre (Equipo → Área → Sitio)
- El clear condition incluye el dead-band para evitar chattering

---

## Calculated Fields

### Quality Text (Q → QT)

```
Tipo: Script (TBEL)
Input: telemetry key "Q"
Output: telemetry key "QT"

Script:
var q = $['Q'];
if (q >= 192) return "Good";
if (q >= 64) return "Uncertain";
if (q == 24) return "Sensor Failure";
if (q == 28) return "Out of Range";
if (q == 32) return "Not Connected";
return "Bad";
```

Esto genera automáticamente una key `QT` con el texto legible del quality para cada punto de telemetría.

---

## Crear el Device Profile via REST API

```python
device_profile = requests.post(f"{TB_URL}/api/deviceProfile", json={
    "name": "Tag",
    "type": "DEFAULT",
    "transportType": "MQTT",
    "defaultRuleChainId": None,
    "profileData": {
        "configuration": {"type": "DEFAULT"},
        "transportConfiguration": {"type": "MQTT"},
        "alarmRules": [
            # ... (alarm rules JSON)
        ]
    }
}, headers=headers).json()
```

**Nota**: La estructura exacta de `alarmRules` en JSON depende de la versión de TB PE. Lo más práctico es:
1. Crear el Device Profile manualmente en la UI
2. Configurar las 4 alarm rules visualmente
3. Exportar via API: `GET /api/deviceProfile/{id}`
4. Usar ese JSON como template para automatización
