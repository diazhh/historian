# Especificación de Integración de Datos — Historiador ThingsBoard PE

**Para**: El software/equipo que recolecta datos del DCS/PLC
**Protocolo**: MQTT
**Destino**: ThingsBoard Professional Edition

---

## 1. Concepto General

Tu software se conecta a ThingsBoard como un **Device**. Cada Device agrupa un conjunto de tags. Tu software envía dos cosas:

1. **Datos estáticos del tag** (descripción, unidades, rangos, alarmas) → van como **client-side attributes**
2. **Datos dinámicos del tag** (valor, timestamp, quality) → van como **telemetría**

La jerarquía de planta (Sitio → Área → Equipo) se construye por separado con **Assets** en ThingsBoard. Eso no es responsabilidad del software de recolección. Los Assets se conectan a los Devices mediante relaciones. Tu software solo envía datos a Devices.

```
ASSETS (los crea el equipo de ThingsBoard, NO tu software):
  Asset: "Refinería Norte"
    └── Asset: "CDU"
        └── Asset: "Columna T-101"
            └── relación Contains → Device: "T101-INST"  ← TU SOFTWARE ENVÍA AQUÍ

DEVICES (tu software se conecta como Device vía MQTT):
  Device: "T101-INST"
    ├── Client Attributes: metadatos estáticos de cada tag
    └── Telemetry: valores + timestamp + quality de cada tag
```

---

## 2. Agrupación: ¿Cuántos Devices crear?

Un Device = un grupo lógico de tags. La agrupación depende de cómo esté organizada tu fuente de datos:

| Criterio | Ejemplo de Device | Tags dentro |
|----------|------------------|-------------|
| Por equipo | `T101-INST` | Todos los instrumentos de la columna T-101 |
| Por controlador/PLC | `PLC-CDU-01` | Todos los tags de un PLC específico |
| Por sección | `CDU-OVERHEAD` | Todos los instrumentos del overhead de la CDU |

**Límite recomendado**: 200-500 tags por Device. Si un equipo tiene más, subdividir (ej: `T101-TEMPS`, `T101-PRESS`, `T101-FLOWS`).

Cada Device tiene su propio **Access Token** (lo da el equipo de ThingsBoard).

---

## 3. Conexión MQTT

| Parámetro | Valor |
|-----------|-------|
| Broker | `mqtt://[IP_THINGSBOARD]:1883` o `mqtts://[IP]:8883` (TLS) |
| Client ID | Nombre del Device (ej: `T101-INST`) |
| Username | Access Token del Device (te lo da el equipo TB) |
| Password | _(vacío)_ |
| Keep Alive | 60 seg |
| QoS | 1 |

---

## 4. Envío de Datos Estáticos (Client-Side Attributes)

**Tópico MQTT**: `v1/devices/me/attributes`

**Cuándo enviar**: Al conectar, y cuando cambie algún dato estático (ej: se reconfigura un tag en el DCS).

Tu software tiene toda la información del tag en el DCS. La parte estática la envías como un JSON donde la clave es el nombre del tag:

```json
{
  "tagConfig": {
    "TI-101-01.PV": {
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
    },
    "PI-101.PV": {
      "description": "Presión tope columna T-101",
      "engUnits": "kPa",
      "dataType": "FLOAT",
      "rangeLo": 0,
      "rangeHi": 300,
      "typicalValue": 152,
      "scanRateMs": 5000,
      "stepFlag": false,
      "instrumentTag": "ns=2;s=CDU.T101.PI-01",
      "area": "CDU",
      "equipment": "T-101",
      "instrumentType": "PI",
      "alarmHH": 200,
      "alarmH": 180,
      "alarmL": 100,
      "alarmLL": 80,
      "deadbandValue": 0.3,
      "deadbandType": "ABSOLUTE"
    },
    "XV-101.PV": {
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
      "digitalStates": {
        "0": "Cerrada",
        "1": "Abierta",
        "2": "En tránsito",
        "3": "Falla"
      }
    }
  }
}
```

### Campos obligatorios por tag

| Campo | Tipo | Descripción | Ejemplo |
|-------|------|-------------|---------|
| `description` | string | Qué mide este tag | `"Temperatura plato 1 columna T-101"` |
| `engUnits` | string | Unidad de ingeniería (vacío para discretos) | `"°C"`, `"kPa"`, `"m³/h"`, `""` |
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
| `digitalStates` | object | Mapeo número → texto | `{"0": "Cerrada", "1": "Abierta"}` |

### Atributos adicionales del colector (mismo tópico, se pueden enviar juntos o aparte)

```json
{
  "collectorStatus": "running",
  "dcsConnectionStatus": "connected",
  "tagsConfigured": 45,
  "tagsActive": 43,
  "tagsInError": 2,
  "collectorVersion": "2.1.0",
  "hostName": "collector-server-01"
}
```

---

## 5. Envío de Datos Dinámicos (Telemetría)

**Tópico MQTT**: `v1/devices/me/telemetry`

**Cuándo enviar**: Cada ciclo de escaneo (o cuando cambie el valor más que el dead-band).

### Formato del payload

Cada tag envía **dos** telemetry keys: el valor y su quality.

```json
{
  "ts": 1706745600000,
  "values": {
    "TI-101-01.PV": 365.2,
    "TI-101-01.Q": 192,
    "TI-101-02.PV": 342.8,
    "TI-101-02.Q": 192,
    "PI-101.PV": 152.3,
    "PI-101.Q": 192,
    "FIC-101.PV": 680.5,
    "FIC-101.Q": 192,
    "LI-101.PV": 62.1,
    "LI-101.Q": 192,
    "XV-101.PV": 1,
    "XV-101.Q": 192
  }
}
```

### Reglas del payload

| Regla | Detalle |
|-------|---------|
| **`ts`** | Timestamp en milisegundos Unix UTC. Obligatorio. Es el timestamp del DCS, no del colector. |
| **`TAGNAME.PV`** | El valor del tag. `number` para analógicos y discretos. `null` si el dato no es válido. |
| **`TAGNAME.Q`** | Quality del tag. Siempre `number` (código OPC-UA). |
| Valores numéricos | Siempre `number` JSON, nunca `string`. Correcto: `365.2`. Incorrecto: `"365.2"` |
| Valor inválido | Enviar `null`. No enviar `"BAD"`, `"N/A"`, `-999`, `"ERROR"` |
| Nombres de tags | Mayúsculas, sin espacios. Solo `A-Z`, `0-9`, `-`, `.` |

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

Del lado de ThingsBoard se convertirá a texto legible mediante un Calculated Field. Tu software solo envía el número.

### Ejemplo con dato malo

```json
{
  "ts": 1706745600000,
  "values": {
    "TI-101-01.PV": 365.2,
    "TI-101-01.Q": 192,
    "TI-101-02.PV": null,
    "TI-101-02.Q": 0
  }
}
```

Tag `TI-101-02` tiene quality `0` (Bad), así que el valor se envía como `null`.

---

## 6. Envío Batch (Datos Acumulados)

Si tu software pierde conexión MQTT y acumula datos en buffer, al reconectar puede enviar todo como array:

**Tópico**: `v1/devices/me/telemetry`

```json
[
  {
    "ts": 1706745600000,
    "values": {
      "TI-101-01.PV": 365.2,
      "TI-101-01.Q": 192
    }
  },
  {
    "ts": 1706745605000,
    "values": {
      "TI-101-01.PV": 365.4,
      "TI-101-01.Q": 192
    }
  },
  {
    "ts": 1706745610000,
    "values": {
      "TI-101-01.PV": 365.1,
      "TI-101-01.Q": 192
    }
  }
]
```

ThingsBoard almacena cada uno con su timestamp original.

---

## 7. Sobre los Devices y la Jerarquía

**Los Devices NO se relacionan entre sí.** No hay árbol de Devices.

La jerarquía de planta se hace con Assets (que crea el equipo de ThingsBoard). Los Assets se conectan a los Devices mediante relaciones "Contains":

```
Asset "CDU" ──Contains──→ Asset "T-101" ──Contains──→ Device "T101-INST"
```

**Tu software no necesita saber nada de los Assets ni de las relaciones.** Solo se conecta al Device con su Access Token y envía datos.

Lo único que necesitas del equipo de ThingsBoard por cada Device:

| Dato | Ejemplo | Para qué |
|------|---------|----------|
| Nombre del Device | `T101-INST` | Para que sepas qué tags van a cada Device |
| Access Token | `ABC123xyz789` | Para conectar vía MQTT (va como username) |

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

Esto reduce tráfico ~70%. El `deadbandValue` y `deadbandType` están en los datos estáticos de cada tag.

Si tu software NO implementa dead-band, simplemente envía todos los valores cada ciclo de escaneo. ThingsBoard los almacena todos.

---

## 9. Resumen: Lo Que Tu Software Hace

| Paso | Qué | Tópico MQTT | Cuándo |
|------|-----|-------------|--------|
| 1 | Conectar | - | Al iniciar |
| 2 | Enviar datos estáticos de todos los tags | `v1/devices/me/attributes` | Al conectar y cuando cambien |
| 3 | Enviar estado del colector | `v1/devices/me/attributes` | Al conectar y cuando cambie |
| 4 | Enviar valores + quality de los tags | `v1/devices/me/telemetry` | Cada ciclo de escaneo |
| 5 | Si se desconectó, enviar batch acumulado | `v1/devices/me/telemetry` | Al reconectar |

Eso es todo. No necesitas crear Assets, ni relaciones, ni configurar alarmas, ni nada más en ThingsBoard.

---

## 10. Ejemplo Completo: Una Sesión

```
── CONECTAR ──────────────────────────────────────────────
MQTT CONNECT
  Broker: mqtt://192.168.10.50:1883
  ClientID: T101-INST
  Username: ABC123xyz789
  Password: (vacío)

── ENVIAR DATOS ESTÁTICOS ────────────────────────────────
PUBLISH v1/devices/me/attributes
{
  "collectorStatus": "running",
  "dcsConnectionStatus": "connected",
  "tagsConfigured": 3,
  "tagsActive": 3,
  "tagConfig": {
    "TI-101-01.PV": {
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
    },
    "PI-101.PV": {
      "description": "Presión tope columna T-101",
      "engUnits": "kPa",
      "dataType": "FLOAT",
      "rangeLo": 0,
      "rangeHi": 300,
      "typicalValue": 152,
      "scanRateMs": 5000,
      "stepFlag": false,
      "instrumentTag": "ns=2;s=CDU.T101.PI-01",
      "area": "CDU",
      "equipment": "T-101",
      "instrumentType": "PI",
      "alarmHH": 200,
      "alarmH": 180,
      "alarmL": 100,
      "alarmLL": 80,
      "deadbandValue": 0.3,
      "deadbandType": "ABSOLUTE"
    },
    "XV-101.PV": {
      "description": "Válvula bloqueo alimentación",
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
      "digitalStates": {"0": "Cerrada", "1": "Abierta"}
    }
  }
}

── ENVIAR TELEMETRÍA (cada 5 segundos) ───────────────────
PUBLISH v1/devices/me/telemetry
{
  "ts": 1706745600000,
  "values": {
    "TI-101-01.PV": 365.2,
    "TI-101-01.Q": 192,
    "PI-101.PV": 152.3,
    "PI-101.Q": 192,
    "XV-101.PV": 1,
    "XV-101.Q": 192
  }
}

── 5 SEGUNDOS DESPUÉS ────────────────────────────────────
PUBLISH v1/devices/me/telemetry
{
  "ts": 1706745605000,
  "values": {
    "TI-101-01.PV": 365.4,
    "TI-101-01.Q": 192,
    "PI-101.PV": 152.1,
    "PI-101.Q": 192
  }
}
(XV-101.PV no se envió porque no cambió)
```
