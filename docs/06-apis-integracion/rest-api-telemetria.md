# REST API de Telemetria — Consultas Historicas

> Referencia completa para consultar series temporales almacenadas en ThingsBoard PE.

---

## Endpoint Principal

```
GET /api/plugins/telemetry/{entityType}/{entityId}/values/timeseries
```

| Parametro | Tipo | Descripcion |
|-----------|------|-------------|
| `entityType` | Path | Tipo de entidad: `DEVICE`, `ASSET`, `ENTITY_VIEW`, etc. |
| `entityId` | Path | UUID de la entidad |
| `keys` | Query | Lista de claves de telemetria separadas por coma (ej: `PV,SP,quality`) |
| `startTs` | Query | Timestamp de inicio en milisegundos (epoch) |
| `endTs` | Query | Timestamp de fin en milisegundos (epoch) |
| `interval` | Query | Intervalo de agregacion en milisegundos (ej: `60000` para 1 minuto) |
| `agg` | Query | Funcion de agregacion: `MIN`, `MAX`, `AVG`, `SUM`, `COUNT`, `NONE` |
| `limit` | Query | Numero maximo de data points a retornar |

---

## Autenticacion

Todas las llamadas requieren un token JWT Bearer obtenido desde el endpoint de login:

```bash
# Paso 1: Obtener JWT token
curl -X POST https://panel.atilax.io/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"well@atilax.io","password":"10203040"}'

# Respuesta:
# {"token":"eyJhbGciOi...","refreshToken":"eyJhbGciOi..."}

# Paso 2: Usar el token en consultas
curl -X GET "https://panel.atilax.io/api/plugins/telemetry/DEVICE/{deviceId}/values/timeseries?keys=PV&startTs=1700000000000&endTs=1700086400000&agg=AVG&interval=60000" \
  -H "X-Authorization: Bearer eyJhbGciOi..."
```

---

## Funciones de Agregacion Nativas

ThingsBoard soporta **6 funciones de agregacion** que se aplican sobre cada sub-intervalo:

| Funcion | Descripcion | Uso tipico |
|---------|-------------|------------|
| `NONE` | Dato crudo sin agregacion | Zoom detallado, exportacion completa |
| `AVG` | Promedio aritmetico del intervalo | Vista general de tendencia |
| `MIN` | Valor minimo del intervalo | Deteccion de valles |
| `MAX` | Valor maximo del intervalo | Deteccion de picos |
| `SUM` | Suma de valores del intervalo | Totalizadores, conteos acumulados |
| `COUNT` | Cantidad de puntos en el intervalo | Diagnostico de frecuencia de datos |

**Nota importante**: No existe promedio ponderado por tiempo (TWA). `AVG` es un promedio aritmetico simple que no considera la duracion entre muestras.

---

## Limites y Configuracion

### DASHBOARD_MAX_DATAPOINTS_LIMIT

- **Default**: ~500 data points por query (configurable)
- **Maximo configurable**: hasta 50,000 data points
- Se configura como variable de entorno o en `thingsboard.yml`
- Aplica tanto a queries REST como a widgets del dashboard

```yaml
# thingsboard.yml
dashboard:
  max_datapoints_limit: 50000
```

### DATABASE_TS_MAX_INTERVALS

- **Default**: 700 sub-queries por llamada API
- Limita la cantidad de sub-intervalos que el motor de base de datos puede procesar en una sola consulta
- Para queries de rango amplio con intervalo fino, este limite se alcanza rapidamente

```yaml
# thingsboard.yml
database:
  ts:
    max_intervals: 700
```

### Ejemplo de calculo de sub-queries

Para una consulta de **1 anio a 1 segundo de intervalo**:

```
Segundos en 1 anio = 365 * 24 * 3600 = 31,536,000
Sub-queries necesarias = 31,536,000 / 700 = ~45,051 llamadas API
```

Esto es **inviable en una sola llamada**. Se requiere:
1. **Agregacion a intervalos mayores** (minutos, horas, dias)
2. **Particion temporal** del query en segmentos mas pequenios

---

## Tecnica de Paginacion Manual

ThingsBoard **NO tiene paginacion nativa con cursores** para telemetria. La tecnica recomendada es dividir el rango temporal y usar el ultimo timestamp retornado como nuevo `startTs`:

```python
import requests
import time

BASE_URL = "https://panel.atilax.io"
TOKEN = "eyJhbGciOi..."  # JWT obtenido del login
DEVICE_ID = "uuid-del-device"
KEY = "PV"

def consultar_rango_completo(start_ts, end_ts, intervalo_ms=60000, agg="AVG"):
    """
    Consulta un rango temporal completo usando paginacion manual.
    Divide el rango en segmentos para respetar DATABASE_TS_MAX_INTERVALS.
    """
    headers = {"X-Authorization": f"Bearer {TOKEN}"}
    todos_los_datos = []

    # Calcular tamanio de segmento basado en max_intervals (700)
    segmento_ms = intervalo_ms * 700  # 700 intervalos por segmento
    current_start = start_ts

    while current_start < end_ts:
        current_end = min(current_start + segmento_ms, end_ts)

        url = (
            f"{BASE_URL}/api/plugins/telemetry/DEVICE/{DEVICE_ID}"
            f"/values/timeseries"
            f"?keys={KEY}"
            f"&startTs={current_start}"
            f"&endTs={current_end}"
            f"&interval={intervalo_ms}"
            f"&agg={agg}"
            f"&limit=700"
        )

        resp = requests.get(url, headers=headers)
        datos = resp.json().get(KEY, [])

        if datos:
            todos_los_datos.extend(datos)
            # Usar el ultimo timestamp + 1 como nuevo inicio
            ultimo_ts = max(d["ts"] for d in datos)
            current_start = ultimo_ts + 1
        else:
            current_start = current_end

        # Respetar rate limits
        time.sleep(0.1)

    return todos_los_datos
```

---

## Ejemplos de Consulta

### Consulta basica — Ultimo valor

```bash
curl -X GET "https://panel.atilax.io/api/plugins/telemetry/DEVICE/{deviceId}/values/timeseries?keys=PV&limit=1" \
  -H "X-Authorization: Bearer $TOKEN"
```

### Consulta historica — Promedios por hora (ultimas 24h)

```bash
# startTs y endTs en milisegundos epoch
START=$(date -d '24 hours ago' +%s%3N)
END=$(date +%s%3N)

curl -X GET "https://panel.atilax.io/api/plugins/telemetry/DEVICE/{deviceId}/values/timeseries?keys=PV,SP&startTs=$START&endTs=$END&interval=3600000&agg=AVG" \
  -H "X-Authorization: Bearer $TOKEN"
```

### Consulta multi-key — Min/Max por dia (ultima semana)

```bash
curl -X GET "https://panel.atilax.io/api/plugins/telemetry/DEVICE/{deviceId}/values/timeseries?keys=PV&startTs=$START_SEMANA&endTs=$END&interval=86400000&agg=MIN" \
  -H "X-Authorization: Bearer $TOKEN"
```

---

## Formato de Respuesta

```json
{
  "PV": [
    {"ts": 1700000000000, "value": "72.5"},
    {"ts": 1700003600000, "value": "73.1"},
    {"ts": 1700007200000, "value": "71.8"}
  ],
  "SP": [
    {"ts": 1700000000000, "value": "75.0"},
    {"ts": 1700003600000, "value": "75.0"},
    {"ts": 1700007200000, "value": "75.0"}
  ]
}
```

**Nota**: Los valores siempre se retornan como strings. El cliente debe parsear a numero cuando sea necesario.

---

## Estrategias de Consulta para el Historiador

### Escenario 1: Trend viewer con zoom progresivo

| Nivel de zoom | Rango | Intervalo | Agregacion | Data points aprox. |
|---------------|-------|-----------|------------|-------------------|
| Vista anual | 1 anio | 1 dia | AVG | 365 |
| Vista mensual | 1 mes | 1 hora | AVG | 720 |
| Vista semanal | 1 semana | 15 min | AVG | 672 |
| Vista diaria | 1 dia | 1 min | AVG | 1,440 |
| Vista horaria | 1 hora | 1 seg | NONE | ~3,600 |

### Escenario 2: Exportacion masiva de datos crudos

Para exportar 1 mes de datos a 1 segundo:
```
Puntos = 30 * 86,400 = 2,592,000
Segmentos necesarios = 2,592,000 / 700 = 3,703 llamadas API
Tiempo estimado (100ms/llamada) = ~6.2 minutos
```

### Escenario 3: Calculo de estadisticas sobre rango

```bash
# Obtener MIN, MAX, AVG en una sola pasada usando interval = rango completo
curl -X GET "https://panel.atilax.io/api/plugins/telemetry/DEVICE/{deviceId}/values/timeseries?keys=PV&startTs=$START&endTs=$END&interval=$(($END-$START))&agg=AVG" \
  -H "X-Authorization: Bearer $TOKEN"
```

---

## Consideraciones de Rendimiento

| Factor | Recomendacion |
|--------|---------------|
| Rate limits REST | Deshabilitados por default. Para queries internas, mantener deshabilitados. Para APIs externas, configurar `"1000:60"` (1000 req/min) |
| Paralelismo | Hasta 10 queries simultaneas por tenant sin degradacion |
| Cache | ThingsBoard cachea `ts_kv_latest` en memoria. Queries de ultimo valor son rapidas |
| Cassandra vs PostgreSQL | Cassandra es ~3x mas rapida en lecturas de rango amplio |
| Indice temporal | Las queries siempre deben incluir `startTs` y `endTs` para aprovechar el indice |

---

## Referencia Rapida

```
POST /api/auth/login                                    → Obtener JWT
GET  /api/plugins/telemetry/{type}/{id}/values/timeseries → Consulta historica
GET  /api/plugins/telemetry/{type}/{id}/values/attributes → Atributos
GET  /api/plugins/telemetry/{type}/{id}/values/timeseries?keys=PV&limit=1 → Ultimo valor
```
