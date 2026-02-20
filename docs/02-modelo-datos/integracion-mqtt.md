# Integración MQTT

## Conexión

| Parámetro | Valor |
|-----------|-------|
| Broker | `mqtt://[IP_THINGSBOARD]:1883` o `mqtts://[IP]:8883` (TLS) |
| Client ID | Nombre del tag (ej: `TI-101-01`) |
| Username | Access Token del Device (generado por TB) |
| Password | _(vacío)_ |
| Keep Alive | 60 seg |
| QoS | 1 |

---

## Dos Modos de Conexión

### Modo 1: Device Directo (1 conexión por tag)
Cada tag se conecta individualmente a TB.

```
MQTT CONNECT
  Broker: mqtt://192.168.10.50:1883
  ClientID: TI-101-01
  Username: <access_token_del_device_TI-101-01>
```

### Modo 2: Gateway Device (1 conexión para N tags) — RECOMENDADO
Un Gateway Device se conecta una vez y publica datos para todos los tags.

```
MQTT CONNECT
  Broker: mqtt://192.168.10.50:1883
  ClientID: COLLECTOR-01
  Username: <access_token_del_gateway>
```

**El modo Gateway** evita tener 500 conexiones MQTT simultáneas.

---

## Envío de Metadatos Estáticos

### Device Directo
**Tópico**: `v1/devices/me/attributes`

```json
{
  "description": "Temperatura plato 1 columna T-101",
  "engUnits": "°C",
  "dataType": "FLOAT",
  "rangeLo": 0,
  "rangeHi": 400,
  "alarmHH": 395,
  "alarmH": 380,
  "alarmL": 340,
  "alarmLL": 320,
  "deadbandValue": 0.5,
  "deadbandType": "ABSOLUTE"
}
```

### Gateway Device
**Tópico**: `v1/gateway/attributes`

```json
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
```

**Cuándo enviar**: Al conectar, y cuando cambie algún dato estático.

---

## Envío de Telemetría

### Device Directo
**Tópico**: `v1/devices/me/telemetry`

```json
{
  "ts": 1706745600000,
  "values": {
    "PV": 365.2,
    "Q": 192
  }
}
```

### Gateway Device
**Tópico**: `v1/gateway/telemetry`

```json
{
  "TI-101-01": [
    { "ts": 1706745600000, "values": { "PV": 365.2, "Q": 192 } }
  ],
  "PI-101": [
    { "ts": 1706745600000, "values": { "PV": 152.3, "Q": 192 } }
  ]
}
```

**Cuándo enviar**: Cada ciclo de escaneo, o cuando el valor cambie más que el dead-band.

---

## Envío Batch (Datos Acumulados)

Si el software pierde conexión y acumula datos en buffer:

### Device Directo
**Tópico**: `v1/devices/me/telemetry`

```json
[
  { "ts": 1706745600000, "values": { "PV": 365.2, "Q": 192 } },
  { "ts": 1706745605000, "values": { "PV": 365.4, "Q": 192 } },
  { "ts": 1706745610000, "values": { "PV": 365.1, "Q": 192 } }
]
```

### Gateway Device
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

ThingsBoard almacena cada registro con su timestamp original.

---

## Dead-Band (Filtrado de Reporteo)

Si el software implementa dead-band, solo envía un valor cuando:

```
|valor_nuevo - ultimo_valor_enviado| >= deadbandValue
```

O cuando pase el tiempo máximo sin enviar (heartbeat):

```
tiempo_desde_ultimo_envio >= heartbeatMaxMs  (recomendado: 300000 = 5 min)
```

Esto reduce tráfico ~70%. El `deadbandValue` y `deadbandType` están en los atributos del Device.

---

## Resumen del Flujo

| Paso | Qué | Tópico MQTT | Cuándo |
|------|-----|-------------|--------|
| 1 | Conectar al Device del tag | - | Al iniciar |
| 2 | Enviar metadatos estáticos | `v1/devices/me/attributes` | Al conectar + cambios |
| 3 | Enviar valor + quality | `v1/devices/me/telemetry` | Cada ciclo de escaneo |
| 4 | Enviar batch acumulado | `v1/devices/me/telemetry` | Al reconectar |
