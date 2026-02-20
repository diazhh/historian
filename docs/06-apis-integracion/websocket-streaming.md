# WebSocket API — Streaming de Telemetria en Tiempo Real

> Referencia para conexiones WebSocket de telemetria en ThingsBoard PE, incluyendo suscripciones en tiempo real y consultas historicas por socket.

---

## Conexion

### URL de Conexion

```
ws://host:port/api/ws/plugins/telemetry?token=$JWT_TOKEN
wss://host:port/api/ws/plugins/telemetry?token=$JWT_TOKEN
```

Para nuestro servidor:

```
wss://panel.atilax.io/api/ws/plugins/telemetry?token=$JWT_TOKEN
```

### Obtencion del Token

```bash
# Obtener JWT token
TOKEN=$(curl -s -X POST https://panel.atilax.io/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"well@atilax.io","password":"10203040"}' \
  | jq -r '.token')

# Conectar via WebSocket
wscat -c "wss://panel.atilax.io/api/ws/plugins/telemetry?token=$TOKEN"
```

---

## Tipos de Suscripcion

### 1. tsSubCmds — Tiempo Real con Ventana Rodante

Suscripcion en tiempo real que mantiene una ventana temporal deslizante. Los datos fluyen continuamente mientras la suscripcion este activa.

```json
{
  "tsSubCmds": [
    {
      "entityType": "DEVICE",
      "entityId": "uuid-del-device",
      "scope": "LATEST_TELEMETRY",
      "cmdId": 1,
      "keys": "PV,SP,quality",
      "timeWindow": 3600000,
      "interval": 1000,
      "agg": "NONE"
    }
  ]
}
```

| Campo | Descripcion |
|-------|-------------|
| `entityType` | Tipo de entidad: `DEVICE`, `ASSET`, etc. |
| `entityId` | UUID de la entidad a monitorear |
| `scope` | Siempre `LATEST_TELEMETRY` para series temporales |
| `cmdId` | ID unico del comando (para correlacionar respuestas) |
| `keys` | Claves de telemetria separadas por coma |
| `timeWindow` | Ventana temporal en milisegundos (ej: `3600000` = 1 hora) |
| `interval` | Intervalo de agregacion en milisegundos |
| `agg` | Funcion de agregacion: `MIN`, `MAX`, `AVG`, `SUM`, `COUNT`, `NONE` |

### 2. historyCmds — Rango Fijo (Consulta Historica por WebSocket)

Consulta un rango temporal fijo. Retorna los datos y cierra la suscripcion (no es streaming continuo).

```json
{
  "historyCmds": [
    {
      "entityType": "DEVICE",
      "entityId": "uuid-del-device",
      "scope": "LATEST_TELEMETRY",
      "cmdId": 2,
      "keys": "PV",
      "startTs": 1700000000000,
      "endTs": 1700086400000,
      "interval": 60000,
      "agg": "AVG",
      "limit": 500
    }
  ]
}
```

| Campo | Descripcion |
|-------|-------------|
| `startTs` | Timestamp de inicio (epoch ms) |
| `endTs` | Timestamp de fin (epoch ms) |
| `interval` | Intervalo de agregacion en milisegundos |
| `agg` | Funcion de agregacion |
| `limit` | Maximo de data points a retornar |

---

## Formato de Respuesta

### Datos de telemetria

```json
{
  "subscriptionId": 1,
  "data": {
    "PV": [
      [1700000000000, "72.5"],
      [1700000001000, "72.6"],
      [1700000002000, "72.4"]
    ],
    "SP": [
      [1700000000000, "75.0"]
    ]
  }
}
```

Cada valor es un array `[timestamp_ms, valor_string]`.

### Actualizaciones incrementales

Despues del snapshot inicial, las actualizaciones llegan como deltas:

```json
{
  "subscriptionId": 1,
  "data": {
    "PV": [
      [1700000003000, "72.7"]
    ]
  }
}
```

---

## Rate Limits de WebSocket

### Configuracion Default

| Parametro | Default | Descripcion |
|-----------|---------|-------------|
| `max_subscriptions_per_tenant` | Sin limite | Suscripciones totales por tenant |
| `max_updates_per_session` | `"300:1,3000:60"` | 300 actualizaciones/segundo, 3000/minuto |

### Formato de Rate Limit

El formato es token bucket: `"cantidad:periodo_segundos"`, separados por coma para multiples niveles:

```
"300:1,3000:60"
```

Significa:
- Maximo **300 actualizaciones por 1 segundo**
- Maximo **3,000 actualizaciones por 60 segundos**

### Configuracion en thingsboard.yml

```yaml
transport:
  ws:
    max_subscriptions_per_tenant: 0  # 0 = sin limite
    max_updates_per_session: "300:1,3000:60"
```

### Recomendacion para el Historiador

Para un historiador industrial con multiples dashboards activos simultaneamente, los defaults pueden ser insuficientes. **Recomendacion**:

```yaml
transport:
  ws:
    max_subscriptions_per_tenant: 0
    max_updates_per_session: "1000:1,10000:60"
```

Esto permite:
- **1,000 actualizaciones por segundo** (suficiente para ~200 tags a 5 actualizaciones/seg)
- **10,000 actualizaciones por minuto** (margen amplio para rafagas)

---

## Limitacion Conocida: subscriptionId con Multiples Devices

### Problema (GitHub #6799)

Cuando se suscribe a **multiples devices** en la misma sesion WebSocket, los `subscriptionId` en las respuestas pueden **no diferenciarse correctamente**. Esto causa que el cliente no pueda determinar a cual device pertenece cada actualizacion.

### Ejemplo del problema

```json
// Suscripcion a Device A (cmdId: 1)
{"tsSubCmds": [{"entityId": "device-a-uuid", "cmdId": 1, "keys": "PV"}]}

// Suscripcion a Device B (cmdId: 2)
{"tsSubCmds": [{"entityId": "device-b-uuid", "cmdId": 2, "keys": "PV"}]}

// Respuesta — subscriptionId puede no coincidir con cmdId
{"subscriptionId": 1, "data": {"PV": [[1700000000000, "72.5"]]}}
// No es claro si este dato es de Device A o Device B
```

### Workarounds

1. **Una conexion WebSocket por device**: Evita ambiguedad pero consume mas recursos
2. **Usar keys unicos**: Si cada device tiene keys de telemetria diferentes, se puede inferir el origen
3. **Correlacion por timestamp**: Mantener un cache local de ultimo timestamp por device para correlacionar
4. **REST API como fallback**: Para queries historicas multi-device, usar REST API en lugar de WebSocket

---

## Ejemplo Completo: Cliente JavaScript

```javascript
// Ejemplo de cliente WebSocket para el historiador
const JWT_TOKEN = "eyJhbGciOi...";
const WS_URL = `wss://panel.atilax.io/api/ws/plugins/telemetry?token=${JWT_TOKEN}`;

class TelemetryWebSocket {
    constructor() {
        this.ws = null;
        this.cmdId = 0;
        this.subscriptions = new Map();
    }

    connect() {
        this.ws = new WebSocket(WS_URL);

        this.ws.onopen = () => {
            console.log("WebSocket conectado");
        };

        this.ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            this.handleMessage(msg);
        };

        this.ws.onclose = () => {
            console.log("WebSocket desconectado, reconectando en 5s...");
            setTimeout(() => this.connect(), 5000);
        };
    }

    // Suscribirse a telemetria en tiempo real
    subscribeTelemetry(deviceId, keys, timeWindowMs = 3600000) {
        this.cmdId++;
        const cmd = {
            tsSubCmds: [{
                entityType: "DEVICE",
                entityId: deviceId,
                scope: "LATEST_TELEMETRY",
                cmdId: this.cmdId,
                keys: keys.join(","),
                timeWindow: timeWindowMs,
                interval: 1000,
                agg: "NONE"
            }]
        };

        this.subscriptions.set(this.cmdId, { deviceId, keys });
        this.ws.send(JSON.stringify(cmd));
        return this.cmdId;
    }

    // Consulta historica por WebSocket
    queryHistory(deviceId, keys, startTs, endTs, agg = "AVG", intervalMs = 60000) {
        this.cmdId++;
        const cmd = {
            historyCmds: [{
                entityType: "DEVICE",
                entityId: deviceId,
                scope: "LATEST_TELEMETRY",
                cmdId: this.cmdId,
                keys: keys.join(","),
                startTs: startTs,
                endTs: endTs,
                interval: intervalMs,
                agg: agg,
                limit: 500
            }]
        };

        this.ws.send(JSON.stringify(cmd));
        return this.cmdId;
    }

    // Cancelar suscripcion
    unsubscribe(cmdId) {
        const cmd = {
            tsSubCmds: [{
                entityType: "DEVICE",
                entityId: this.subscriptions.get(cmdId)?.deviceId,
                scope: "LATEST_TELEMETRY",
                cmdId: cmdId,
                unsubscribe: true
            }]
        };

        this.ws.send(JSON.stringify(cmd));
        this.subscriptions.delete(cmdId);
    }

    handleMessage(msg) {
        const { subscriptionId, data } = msg;
        // Procesar datos recibidos
        for (const [key, values] of Object.entries(data || {})) {
            for (const [ts, value] of values) {
                console.log(`[Sub ${subscriptionId}] ${key}: ${value} @ ${new Date(ts).toISOString()}`);
            }
        }
    }
}

// Uso
const client = new TelemetryWebSocket();
client.connect();

// Suscribirse a PV y SP de un device
const subId = client.subscribeTelemetry("device-uuid", ["PV", "SP"], 3600000);

// Consultar historial de ultima hora
const histId = client.queryHistory(
    "device-uuid",
    ["PV"],
    Date.now() - 3600000,
    Date.now(),
    "AVG",
    60000
);
```

---

## Comparativa: REST vs WebSocket para el Historiador

| Caso de uso | REST API | WebSocket |
|-------------|----------|-----------|
| Consulta historica puntual | Recomendado | Funcional (historyCmds) |
| Monitoreo en tiempo real | No optimo (polling) | Recomendado (tsSubCmds) |
| Exportacion masiva de datos | Recomendado (paginacion manual) | No recomendado |
| Dashboard con muchos tags | No optimo | Recomendado |
| Multi-device simultaneo | Recomendado | Limitado (ver #6799) |
| Reconexion automatica | N/A (stateless) | Requiere implementacion |

### Recomendacion General

- **Trend Viewer en modo real-time**: WebSocket con `tsSubCmds`
- **Trend Viewer en modo historico**: REST API con paginacion manual
- **Tag Browser / Tag Detail**: REST API para ultimo valor
- **Ad-hoc Query / Exportacion**: REST API exclusivamente
- **Dashboard con >20 tags activos**: WebSocket con rate limits aumentados
