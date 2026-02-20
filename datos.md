> ⚠️ **LEGACY** — Este archivo ha sido migrado a `docs/02-modelo-datos/`. La documentación canónica está en:
> - [docs/02-modelo-datos/modelo-1-device-1-tag.md](./docs/02-modelo-datos/modelo-1-device-1-tag.md)
> - [docs/02-modelo-datos/integracion-mqtt.md](./docs/02-modelo-datos/integracion-mqtt.md)
> - [docs/02-modelo-datos/jerarquia-assets.md](./docs/02-modelo-datos/jerarquia-assets.md)
> - [docs/02-modelo-datos/quality-codes.md](./docs/02-modelo-datos/quality-codes.md)

# Especificación de Integración de Datos — Historiador ThingsBoard PE

**Para**: El software/equipo que recolecta datos del DCS/PLC
**Protocolo**: MQTT
**Destino**: ThingsBoard Professional Edition

---

## 1. Concepto General

Cada tag (punto de medición) del proceso industrial es un **Device** en ThingsBoard. El nombre del Device es el nombre del tag (ej: `TI-101-01`).

Cada Device-tag envía dos cosas:

1. **Metadatos estáticos** (descripción, unidades, rangos, alarmas) → van como **client-side attributes** del Device
2. **Datos dinámicos** (valor y quality) → van como **telemetría** del Device con keys `PV` y `Q`

La jerarquía de planta (Sitio → Área → Equipo) se construye con **Assets** en ThingsBoard. Los Assets se conectan a los Devices-tag mediante relaciones `Contains`. La hoja del árbol siempre es un Device = un tag.

```
ASSETS (jerarquía de planta):
  Asset: "Refinería Norte"        (Asset Profile: Sitio)
    └── Asset: "CDU"              (Asset Profile: AreaProceso)
        └── Asset: "T-101"        (Asset Profile: Equipo)
            ├── Contains → Device: "TI-101-01"  ← tag de temperatura
            ├── Contains → Device: "PI-101"     ← tag de presión
            └── Contains → Device: "XV-101"     ← tag de válvula

DEVICES (cada uno es un tag individual):
  Device: "TI-101-01"
    ├── Client Attributes: description, engUnits, rangeLo, rangeHi, alarmH, alarmHH, ...
    └── Telemetry: PV (valor), Q (quality)
```

---

## 2. Modelo: 1 Device = 1 Tag

Cada tag es su propio Device. El nombre del Device es el nombre del tag.

| Concepto | Implementación en ThingsBoard |
|----------|-------------------------------|
| Tag individual | Device (nombre = nombre del tag, ej: `TI-101-01`) |
| Metadatos del tag | Client Attributes directos en el Device |
| Valor del tag | Telemetry key `PV` |
| Quality del tag | Telemetry key `Q` |
| Agrupación por equipo | Asset con relación `Contains` → Device |

**Ventajas de este modelo**:
- **Alarm Rules genéricas**: Una sola regla `PV > attribute.alarmHH` en el Device Profile aplica automáticamente a los 500 tags
- **Entity Aliases nativos**: Filtrar/agrupar tags con filtros estándar de TB (por tipo, por relación, por atributo)
- **Atributos planos**: No se necesita parsear JSON anidado — cada metadato es un atributo directo del Device
- **Telemetría simple**: Solo dos keys (`PV` y `Q`) — no hay prefijos de tag en los nombres

Cada Device tiene su propio **Access Token** (lo da el equipo de ThingsBoard o se genera por script).

---

## 3. Conexión MQTT

| Parámetro | Valor |
|-----------|-------|
| Broker | `mqtt://[IP_THINGSBOARD]:1883` o `mqtts://[IP]:8883` (TLS) |
| Client ID | Nombre del tag (ej: `TI-101-01`) |
| Username | Access Token del Device (te lo da el equipo TB) |
| Password | _(vacío)_ |
| Keep Alive | 60 seg |
| QoS | 1 |

**Nota**: Si el software de recolección maneja muchos tags, puede multiplexar la conexión MQTT usando un **Gateway Device** de TB. El gateway se conecta una vez y publica datos en nombre de múltiples dispositivos usando el tópico `v1/gateway/telemetry` y `v1/gateway/attributes`. Esto evita tener 500 conexiones MQTT simultáneas.

---

## 4. Envío de Metadatos Estáticos (Client-Side Attributes)

**Tópico MQTT**: `v1/devices/me/attributes`

**Cuándo enviar**: Al conectar, y cuando cambie algún dato estático.

Los metadatos se envían como atributos planos directamente en el Device:

### Ejemplo — Tag analógico (temperatura)

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

### Ejemplo — Tag digital (válvula)

```json
{
  "description": "Válvula bloqueo alimentación T-101",
  "engUnits": "",
  "dataType": "DIGITAL",
  "rangeLo": 0,
  "rangeHi": 1,
  "typicalValue": 1,
  "scanRateMs": 1000,
  "stepFlag": true,
  "instrumentTag": "ns=2;s=CDU.T101.XV-01",
  "area": "CDU",
  "equipment": "T-101",
  "instrumentType": "XV",
  "alarmHH": null,
  "alarmH": null,
  "alarmL": null,
  "alarmLL": null,
  "deadbandValue": 0,
  "deadbandType": "ABSOLUTE",
  "digitalStates": "{\"0\":\"Cerrada\",\"1\":\"Abierta\",\"2\":\"En tránsito\",\"3\":\"Falla\"}"
}
```

### Campos obligatorios

| Campo | Tipo | Descripción | Ejemplo |
|-------|------|-------------|---------|
| `description` | string | Qué mide este tag | `"Temperatura plato 1 columna T-101"` |
| `engUnits` | string | Unidad de ingeniería (vacío para discretos) | `"°C"`, `"kPa"`, `""` |
| `dataType` | string | Tipo de dato | `"FLOAT"`, `"DIGITAL"`, `"INTEGER"`, `"STRING"` |
| `rangeLo` | number | Mínimo del rango | `0` |
| `rangeHi` | number | Máximo del rango | `400` |
| `typicalValue` | number | Valor normal esperado | `365` |
| `scanRateMs` | number | Frecuencia de escaneo en milisegundos | `5000` |
| `stepFlag` | boolean | `true` = discreto (step), `false` = analógico (lineal) | `false` |
| `instrumentTag` | string | Dirección OPC o referencia en el DCS | `"ns=2;s=CDU.T101.TI-01"` |
| `area` | string | Área de proceso | `"CDU"` |
| `equipment` | string | Equipo | `"T-101"` |
| `instrumentType` | string | Tipo de instrumento ISA-5.1 | `"TI"`, `"FIC"`, `"XV"` |
| `alarmHH` | number o null | Límite alarma alta-alta | `395` o `null` si no aplica |
| `alarmH` | number o null | Límite alarma alta | `380` |
| `alarmL` | number o null | Límite alarma baja | `340` |
| `alarmLL` | number o null | Límite alarma baja-baja | `320` |
| `deadbandValue` | number | Dead-band de reporteo | `0.5` |
| `deadbandType` | string | Tipo de dead-band | `"ABSOLUTE"` o `"PERCENT"` |

### Campo adicional solo para tags DIGITAL

| Campo | Tipo | Descripción | Ejemplo |
|-------|------|-------------|---------|
| `digitalStates` | string (JSON) | Mapeo número → texto (serializado) | `"{\"0\":\"Cerrada\",\"1\":\"Abierta\"}"` |

---

## 5. Envío de Datos Dinámicos (Telemetría)

**Tópico MQTT**: `v1/devices/me/telemetry`

**Cuándo enviar**: Cada ciclo de escaneo (o cuando cambie el valor más que el dead-band).

### Formato del payload

Cada Device-tag envía solo **dos** telemetry keys: `PV` y `Q`.

```json
{
  "ts": 1706745600000,
  "values": {
    "PV": 365.2,
    "Q": 192
  }
}
```

### Reglas del payload

| Regla | Detalle |
|-------|---------|
| **`ts`** | Timestamp en milisegundos Unix UTC. Obligatorio. Es el timestamp del DCS, no del colector. |
| **`PV`** | El valor del tag. `number` para analógicos y discretos. `null` si el dato no es válido. |
| **`Q`** | Quality del tag. Siempre `number` (código OPC-UA). |
| Valores numéricos | Siempre `number` JSON, nunca `string`. Correcto: `365.2`. Incorrecto: `"365.2"` |
| Valor inválido | Enviar `PV: null`. No enviar `"BAD"`, `"N/A"`, `-999`, `"ERROR"` |

### Códigos de Quality

El quality es el número que viene del OPC o DCS. Enviarlo tal cual:

| Código | Significado |
|--------|------------|
| `192` | Good |
| `0` | Bad |
| `64` | Uncertain |
| `24` | Bad - Sensor Failure |
| `28` | Bad - Out of Range |
| `32` | Bad - Not Connected |

Del lado de ThingsBoard se convertirá a texto legible mediante un Calculated Field en el Device Profile. Tu software solo envía el número.

### Ejemplo con dato malo

```json
{
  "ts": 1706745600000,
  "values": {
    "PV": null,
    "Q": 0
  }
}
```

Quality `0` (Bad), así que PV se envía como `null`.

---

## 6. Envío Batch (Datos Acumulados)

Si tu software pierde conexión MQTT y acumula datos en buffer, al reconectar puede enviar todo como array:

**Tópico**: `v1/devices/me/telemetry`

```json
[
  {
    "ts": 1706745600000,
    "values": { "PV": 365.2, "Q": 192 }
  },
  {
    "ts": 1706745605000,
    "values": { "PV": 365.4, "Q": 192 }
  },
  {
    "ts": 1706745610000,
    "values": { "PV": 365.1, "Q": 192 }
  }
]
```

ThingsBoard almacena cada uno con su timestamp original.

### Envío batch via Gateway

Si se usa un Gateway Device para publicar en nombre de múltiples tags:

**Tópico**: `v1/gateway/telemetry`

```json
{
  "TI-101-01": [
    { "ts": 1706745600000, "values": { "PV": 365.2, "Q": 192 } },
    { "ts": 1706745605000, "values": { "PV": 365.4, "Q": 192 } }
  ],
  "PI-101": [
    { "ts": 1706745600000, "values": { "PV": 152.3, "Q": 192 } }
  ]
}
```

---

## 7. Sobre los Devices y la Jerarquía

**Los Devices (tags) NO se relacionan entre sí.** No hay árbol de Devices.

La jerarquía de planta se hace con Assets. Los Assets se conectan a los Devices-tag mediante relaciones `Contains`:

```
Asset "CDU" ──Contains──→ Asset "T-101" ──Contains──→ Device "TI-101-01"
                                         ──Contains──→ Device "PI-101"
                                         ──Contains──→ Device "XV-101"
```

Cada nivel del árbol usa un Asset Profile distinto:

| Nivel | Asset Profile | Ejemplo |
|-------|--------------|---------|
| Sitio | `Sitio` | "Refinería Norte" |
| Área | `AreaProceso` | "CDU", "FCC" |
| Equipo | `Equipo` | "T-101", "F-201" |

Los Devices-tag usan un solo Device Profile:

| Device Profile | Para qué |
|---------------|----------|
| `Tag` | Todos los tags. Contiene Alarm Rules genéricas y Calculated Fields |

### Alarm Rules en el Device Profile "Tag"

Como todos los tags comparten el mismo Device Profile, las reglas de alarma se definen una vez y aplican a todos:

```
Alarm: "HIGH_HIGH"
  Create: PV > attribute.alarmHH  (dynamic threshold)
  Clear:  PV < attribute.alarmHH - attribute.deadbandValue
  Severity: CRITICAL
  Propagate: YES

Alarm: "HIGH"
  Create: PV > attribute.alarmH
  Severity: MAJOR

Alarm: "LOW"
  Create: PV < attribute.alarmL
  Severity: MAJOR

Alarm: "LOW_LOW"
  Create: PV < attribute.alarmLL
  Severity: CRITICAL
```

Los umbrales vienen de los atributos del propio Device (`alarmHH`, `alarmH`, etc.), así que cada tag tiene sus propios límites.

---

## 8. Dead-Band (Filtrado de Reporteo)

Si tu software implementa dead-band, solo envía un valor cuando:

```
|valor_nuevo - ultimo_valor_enviado| >= deadbandValue
```

O cuando pasó el tiempo máximo sin enviar (heartbeat):

```
tiempo_desde_ultimo_envio >= heartbeatMaxMs  (recomendado: 300000 = 5 min)
```

Esto reduce tráfico ~70%. El `deadbandValue` y `deadbandType` están en los atributos del Device.

Si tu software NO implementa dead-band, simplemente envía todos los valores cada ciclo de escaneo. ThingsBoard los almacena todos.

---

## 9. Resumen: Lo Que Tu Software Hace

| Paso | Qué | Tópico MQTT | Cuándo |
|------|-----|-------------|--------|
| 1 | Conectar al Device del tag | - | Al iniciar |
| 2 | Enviar metadatos estáticos del tag | `v1/devices/me/attributes` | Al conectar y cuando cambien |
| 3 | Enviar valor + quality | `v1/devices/me/telemetry` | Cada ciclo de escaneo |
| 4 | Si se desconectó, enviar batch acumulado | `v1/devices/me/telemetry` | Al reconectar |

Eso es todo por tag. Si usas un Gateway, la conexión es una sola y publicas datos para todos los tags.

---

## 10. Ejemplo Completo: Una Sesión (Device directo)

```
── CONECTAR ──────────────────────────────────────────────
MQTT CONNECT
  Broker: mqtt://192.168.10.50:1883
  ClientID: TI-101-01
  Username: <access_token_del_device_TI-101-01>
  Password: (vacío)

── ENVIAR METADATOS ESTÁTICOS ─────────────────────────────
PUBLISH v1/devices/me/attributes
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

── ENVIAR TELEMETRÍA (cada 5 segundos) ────────────────────
PUBLISH v1/devices/me/telemetry
{
  "ts": 1706745600000,
  "values": {
    "PV": 365.2,
    "Q": 192
  }
}

── 5 SEGUNDOS DESPUÉS ─────────────────────────────────────
PUBLISH v1/devices/me/telemetry
{
  "ts": 1706745605000,
  "values": {
    "PV": 365.4,
    "Q": 192
  }
}
```

---

## 11. Ejemplo: Sesión con Gateway (múltiples tags)

Si el software de recolección usa un Gateway Device para manejar todos los tags desde una sola conexión MQTT:

```
── CONECTAR ──────────────────────────────────────────────
MQTT CONNECT
  Broker: mqtt://192.168.10.50:1883
  ClientID: COLLECTOR-01
  Username: <access_token_del_gateway>
  Password: (vacío)

── ENVIAR ATRIBUTOS DE MÚLTIPLES TAGS ─────────────────────
PUBLISH v1/gateway/attributes
{
  "TI-101-01": {
    "description": "Temperatura plato 1 columna T-101",
    "engUnits": "°C",
    "dataType": "FLOAT",
    "rangeLo": 0,
    "rangeHi": 400,
    "alarmHH": 395,
    "alarmH": 380,
    "alarmL": 340,
    "alarmLL": 320
  },
  "PI-101": {
    "description": "Presión tope columna T-101",
    "engUnits": "kPa",
    "dataType": "FLOAT",
    "rangeLo": 0,
    "rangeHi": 300,
    "alarmHH": 200,
    "alarmH": 180,
    "alarmL": 100,
    "alarmLL": 80
  }
}

── ENVIAR TELEMETRÍA DE MÚLTIPLES TAGS ────────────────────
PUBLISH v1/gateway/telemetry
{
  "TI-101-01": [
    { "ts": 1706745600000, "values": { "PV": 365.2, "Q": 192 } }
  ],
  "PI-101": [
    { "ts": 1706745600000, "values": { "PV": 152.3, "Q": 192 } }
  ],
  "XV-101": [
    { "ts": 1706745600000, "values": { "PV": 1, "Q": 192 } }
  ]
}
```
