# Modelo 1 Device = 1 Tag

## Concepto Fundamental

Cada **tag** (punto de medición del proceso industrial) es un **Device** independiente en ThingsBoard. El nombre del Device es el nombre del tag.

```
Mundo Industrial                ThingsBoard
─────────────────              ─────────────────
Tag TI-101-01         →        Device "TI-101-01" (Device Profile: "Tag")
Tag PI-101            →        Device "PI-101"    (Device Profile: "Tag")
Tag XV-101            →        Device "XV-101"    (Device Profile: "Tag")
Tag FIC-101           →        Device "FIC-101"   (Device Profile: "Tag")
```

### ¿Por qué este modelo?

| Ventaja | Explicación |
|---------|-------------|
| **Alarm Rules genéricas** | Una sola regla `PV > attribute.alarmHH` en el Device Profile aplica automáticamente a los 500+ tags |
| **Entity Aliases nativos** | Filtrar/agrupar tags con filtros estándar de TB (por tipo, relación, atributo) |
| **Atributos planos** | No se necesita parsear JSON anidado — cada metadato es un atributo directo |
| **Telemetría simple** | Solo dos keys (`PV` y `Q`) — no hay prefijos de tag en los nombres |
| **Escalabilidad** | Cada Device tiene su propio Access Token, histórico independiente |

### Alternativa rechazada: 1 Device = N Tags
En este modelo, un Device representaría un equipo (ej: "T-101") y cada tag sería una key de telemetría (ej: `TI-101-01_PV`). Se rechazó porque:
- Las alarm rules no pueden ser genéricas (cada key necesitaría su propia regla)
- Los entity aliases no pueden filtrar por "tag individual"
- Los atributos del tag tendrían que ser JSON anidados

---

## Estructura de un Device-Tag

Cada Device-tag tiene dos componentes de datos:

### 1. Metadatos Estáticos (Client Attributes)

Los envía el software de recolección una vez al conectar (y cuando cambien):

```json
{
  "description": "Temperatura plato 1 columna T-101",
  "engUnits": "°C",
  "dataType": "FLOAT",
  "rangeLo": 0,
  "rangeHi": 400,
  "typicalValue": 365,
  "scanRateMs": 5000,
  "stepFlag": false,
  "instrumentTag": "ns=2;s=CDU.T101.TI-01",
  "area": "CDU",
  "equipment": "T-101",
  "instrumentType": "TI",
  "alarmHH": 395,
  "alarmH": 380,
  "alarmL": 340,
  "alarmLL": 320,
  "deadbandValue": 0.5,
  "deadbandType": "ABSOLUTE"
}
```

### Campos obligatorios

| Campo | Tipo | Descripción | Ejemplo |
|-------|------|-------------|---------|
| `description` | string | Qué mide este tag | `"Temperatura plato 1"` |
| `engUnits` | string | Unidad de ingeniería | `"°C"`, `"kPa"`, `""` |
| `dataType` | string | Tipo de dato | `"FLOAT"`, `"DIGITAL"`, `"INTEGER"` |
| `rangeLo` | number | Mínimo del rango | `0` |
| `rangeHi` | number | Máximo del rango | `400` |
| `typicalValue` | number | Valor normal esperado | `365` |
| `scanRateMs` | number | Frecuencia de escaneo (ms) | `5000` |
| `stepFlag` | boolean | `true` = discreto, `false` = analógico | `false` |
| `instrumentTag` | string | Dirección OPC/DCS | `"ns=2;s=CDU.T101.TI-01"` |
| `area` | string | Área de proceso | `"CDU"` |
| `equipment` | string | Equipo | `"T-101"` |
| `instrumentType` | string | Tipo ISA-5.1 | `"TI"`, `"FIC"`, `"XV"` |
| `alarmHH` | number/null | Límite alta-alta | `395` |
| `alarmH` | number/null | Límite alta | `380` |
| `alarmL` | number/null | Límite baja | `340` |
| `alarmLL` | number/null | Límite baja-baja | `320` |
| `deadbandValue` | number | Dead-band de reporteo | `0.5` |
| `deadbandType` | string | Tipo dead-band | `"ABSOLUTE"` o `"PERCENT"` |

### Campo adicional para tags DIGITAL

| Campo | Tipo | Descripción | Ejemplo |
|-------|------|-------------|---------|
| `digitalStates` | string (JSON) | Mapeo número → texto | `"{\"0\":\"Cerrada\",\"1\":\"Abierta\"}"` |

### 2. Datos Dinámicos (Telemetría)

Solo **dos keys** por Device-tag:

| Key | Tipo | Descripción |
|-----|------|-------------|
| `PV` | number/null | Valor del proceso (Process Variable) |
| `Q` | number | Código de quality OPC-UA |

```json
{
  "ts": 1706745600000,
  "values": {
    "PV": 365.2,
    "Q": 192
  }
}
```

### Reglas estrictas del payload:
- **`ts`**: Timestamp en milisegundos Unix UTC. Es el timestamp del DCS, no del colector.
- **`PV`**: Siempre `number` para datos válidos. `null` si el dato no es válido.
- **`Q`**: Siempre `number` (código OPC-UA). `192` = Good.
- **Valores numéricos**: Siempre `number` JSON, nunca `string`. ✅ `365.2` ❌ `"365.2"`
- **Valor inválido**: Enviar `PV: null`. No enviar `"BAD"`, `"N/A"`, `-999`

---

## Device Profile "Tag"

**Todos** los Device-tags comparten un único Device Profile llamado `"Tag"`. Este profile contiene:

1. **Alarm Rules** genéricas con umbrales dinámicos (ver [alarm-rules-dinamicas.md](../06-rule-chains-alarmas/alarm-rules-dinamicas.md))
2. **Calculated Fields** para transformar quality numérico a texto (ver [calculated-fields.md](../03-plataforma/calculated-fields.md))
3. **Transport Configuration**: MQTT default

Las reglas de alarma usan atributos del propio Device como umbrales:
```
PV > attribute.alarmHH → Alarma CRITICAL "HIGH_HIGH"
PV > attribute.alarmH  → Alarma MAJOR "HIGH"
PV < attribute.alarmL  → Alarma MAJOR "LOW"
PV < attribute.alarmLL → Alarma CRITICAL "LOW_LOW"
```

Tags sin alarmas configuradas (atributos en `null`) no disparan alarmas.

---

## Caso Especial: Dashboard SCADA ESP

El dashboard SCADA ESP usa un modelo diferente para el **pozo como unidad**:

| Concepto | Modelo Historiador | Modelo SCADA ESP |
|----------|-------------------|------------------|
| Entidad base | Device "TI-101-01" (1 tag) | Asset "CA-MAC-ANA-01-001" (1 pozo) |
| Telemetry keys | `PV`, `Q` | 29 keys (flow_rate_bpd, motor_current_a, ...) |
| Atributos | Metadatos del tag | 384 server attributes del pozo |
| Entity type | DEVICE | ASSET |
| Entity alias | `childDevices` (relationsQuery) | `singleEntity` (directo al Asset) |

Ambos modelos coexisten. El SCADA ESP muestra el pozo como una unidad operativa. El historiador permite navegar hasta el nivel de tag individual.
