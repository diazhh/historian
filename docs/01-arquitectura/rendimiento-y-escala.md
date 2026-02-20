# Rendimiento y Escala

> **Fuente**: [`prmpt.md`](../../prmpt.md) — Sección 5

---

## Benchmarks Oficiales TB PE (AWS EC2)

| Configuración | Devices | Data points/sec | Hardware | CPU |
|---------------|---------|-----------------|----------|-----|
| PostgreSQL only | 5,000 | 3,000 | t3.medium (2 vCPU, 4GB) | 27% |
| PG + Kafka | 5,000 | 15,000 | m6a.large (2 vCPU, 8GB) | 95% |
| **PG + Cassandra + Kafka** | **25,000** | **30,000** | **m6a.2xlarge (8 vCPU, 32GB)** | **75%** |
| PG + Cassandra + Kafka | 100,000 | 15,000 | m6a.2xlarge (8 vCPU, 32GB) | 71% |

---

## Sizing por Escenario

### 10,000 tags a 1 segundo (~30K dp/sec)
- **Mínimo**: Hybrid PG + Cassandra + Kafka
- **Hardware**: 8 vCPU, 32GB RAM (monolito)
- PostgreSQL solo NO es viable (bottleneck en `ts_kv_latest` con ~60K updates/sec)

### 50,000 tags a 1 segundo (~150K dp/sec)
- **Requiere**: Cluster microservicios
- 2–3 nodos ThingsBoard (4+ vCPU, 16GB cada uno)
- Cluster Cassandra 3–5 nodos
- Kafka cluster
- PostgreSQL managed
- **Costo**: ~$1,000–$2,000/mes en AWS

---

## Selección de Base de Datos para Telemetría

### Cassandra (RECOMENDADA para historiador)
- **5x menos almacenamiento** que PostgreSQL (29 GiB vs 152 GiB por mil millones de puntos)
- Compresión LZ4 nativa a nivel de SSTable
- TTL nativo por fila
- Escalamiento horizontal transparente
- Diseñada para escrituras masivas

### TimescaleDB (alternativa si se prefiere PostgreSQL)
- Hypertables con particionamiento automático
- Compresión columnar (>90% reducción)
- Continuous aggregates para rollups pre-computados
- `drop_chunks()` para retención
- **Pero**: Documentación TB para TimescaleDB en microservicios es escasa, sin benchmarks públicos

### PostgreSQL puro
- **DESCARTADO** para >5K dp/sec
- Límite práctico escritura atributos: ~20K records/sec
- `ts_kv_latest` se convierte en cuello de botella

---

## Proyecciones de Almacenamiento (1 año, SIN compresión SDT)

| Tags | Scan rate | Puntos/día | Cassandra/año | PostgreSQL/año |
|------|-----------|-----------|---------------|----------------|
| 10,000 | 1 seg | 864M | **~730 GB** | ~3,650 GB |
| 50,000 | 1 seg | 4.32B | **~3,650 GB** | ~18,250 GB |

**CON compresión SDT** (90–95% en edge/gateway):

| Tags | Con SDT | Cassandra/año |
|------|---------|---------------|
| 10,000 | 95% compresión | **~37 GB** |
| 50,000 | 90% compresión | **~365 GB** |

**Conclusión**: La compresión SDT en el edge no es opcional — es la diferencia entre 3.6 TB y 365 GB por año para 50K tags.

---

## Retención y TTL

### Con Cassandra (recomendado)
TTL configurable a 3 niveles con prioridad:
1. Metadata `TTL` del mensaje individual
2. Default TTL del nodo Save Timeseries en rule chain
3. "Default Storage TTL Days" del Tenant Profile

**TTL per-device solo funciona con Cassandra** — PostgreSQL/TimescaleDB aplican TTL uniformemente a nivel de tenant.

### Con PostgreSQL/TimescaleDB
Retención via jobs periódicos: `SQL_TTL_*` en configuración. Drop chunks por antigüedad.

---

## Rate Limits y Tuning para Historiador

Todos los rate limits están **deshabilitados por default** en TB PE.

| Nivel | Formato | Default | Recomendación historiador |
|-------|---------|---------|--------------------------|
| REST API (tenant) | token bucket "1000:60" | Disabled | Mantener disabled para queries internas |
| WebSocket sessions | max_subscriptions_per_tenant | Unlimited | Limitar a 100 suscripciones concurrentes |
| WebSocket updates | "300:1,3000:60" | 300/seg, 3K/min | Aumentar a "1000:1,10000:60" |
| Transport (device) | Per device rate limit | Disabled | Habilitar solo si hay devices ruidosos |
| Cassandra queries | Read/write rate limits | Disabled | Mantener disabled |

**Para historiador con consultas masivas**: mantener límites deshabilitados para APIs internas, aplicar solo para APIs expuestas externamente.

### Parámetros clave de telemetría
- `DATABASE_TS_MAX_INTERVALS`: default 700 — limita sub-queries por llamada API
- `DASHBOARD_MAX_DATAPOINTS_LIMIT`: configurable hasta 50,000 puntos por widget (default 50,000)
- Para 1 año a 1 seg: ~31.5M sub-queries necesarios → **requiere agregación o partición temporal**
