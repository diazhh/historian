# Visión del Historiador y Brechas vs PI System

> **Fuente**: [`prmpt.md`](../../prmpt.md) — Secciones 1, 2, 3, 4

---

## Qué Estamos Construyendo

Un **historiador industrial** sobre ThingsBoard PE que:
- Recolecta datos de 10,000–50,000 tags a scan rates de 1 segundo
- Almacena series temporales con retención configurable (TTL)
- Visualiza tendencias con zoom, pan, crosshairs sincronizados
- Detecta alarmas y eventos con umbrales dinámicos
- Calcula valores derivados (deltas, totalizadores, promedios móviles)
- Permite consultas ad-hoc sobre datos históricos

**Equivalencia objetivo**: ~75% de OSIsoft PI System.

---

## Comparativa: TB PE Nativo vs PI System vs Desarrollo Custom

### 1. Trends (Visualización)

| Capacidad | PI Vision | TB PE Nativo | Custom Necesario |
|-----------|-----------|-------------|-----------------|
| Multi-tag, multi-eje Y | ✅ | ✅ (ECharts) | No |
| Plot Values auto-downsampling | ✅ | ❌ | **Alto** — progressive loading |
| Crosshairs sincronizados entre widgets | ✅ | ❌ | **Medio-Alto** — echarts.connect() |
| Interpolación lineal | ✅ | ❌ | Alto — server-side |
| Zoom rubber-band + pan | ✅ | ⚠️ Slider zoom | **Bajo** — ECharts dataZoom inside |
| Drag tag al trend | ✅ | ❌ | **Medio** — tag browser custom |
| Anotaciones de eventos | ✅ | ❌ | **Medio** — overlay alarm bands |
| Streaming + histórico seamless | ✅ | ⚠️ Modos separados | Medio |
| Export CSV/Excel | ✅ | ✅ | No |

### 2. Event Frames (Eventos)

| Capacidad | PI Event Frames | TB Alarmas | Custom Necesario |
|-----------|----------------|-----------|-----------------|
| Inicio/fin temporales | ✅ | ✅ startTs/endTs | No |
| Categoría/tipo | ✅ | ✅ alarm type | No |
| Severidad multinivel | ✅ | ✅ 5 niveles | No |
| Ciclo de vida (ack/clear) | ✅ | ✅ 4 estados | No |
| Datos contextuales JSON | ✅ | ✅ alarm details | No |
| Estadísticas resumen sobre duración | ✅ | ❌ | **Alta** — rule chain acumulador |
| Eventos jerárquicos padre-hijo | ✅ | ❌ | No viable directamente |
| Búsqueda por atributos del evento | ✅ | ❌ | No viable (API limita filtros) |

### 3. Calculated Fields / Analytics

| Cálculo | TB PE 4.0+ | Complejidad | Equivalente PI |
|---------|-----------|-------------|----------------|
| Fórmulas aritméticas | ✅ CF Simple | Baja | PI Performance Equations |
| Promedios móviles | ✅ CF Script + rolling | Baja | PI Analytics rolling |
| Totalizadores/delta | ✅ Calculate Delta node | Baja | PI Totalizer |
| Min/Max por período | ✅ Aggregate Stream (PE) | Baja | PI Summary |
| Rate of change | ✅ Calculate Delta + script | Baja-Media | PI Rate() |
| Cross-entity calculations | ✅ CF Propagation | Media | PI AF Formula |
| Scheduled batch calcs | ✅ Scheduler PE + rule chain | Media | PI Analytics batch |
| **Time-weighted average** | ❌ | **Alta — custom** | PI TimeEq/Summary |
| FFT / estadísticas avanzadas | ❌ | Alta — external | PI PE functions |
| **Quality propagation** | ❌ | **Alta — full custom** | PI Digital States |

### 4. Asset Framework

| Capacidad | PI AF | TB PE | Gap |
|-----------|-------|-------|-----|
| Jerarquía multinivel | ✅ | ✅ Assets + Relations | No |
| Entity Groups + RBAC | ❌ | ✅ (PE exclusivo) | TB gana |
| Dashboard drill-down | ✅ | ✅ Dashboard States | No |
| Entity Views | ❌ | ✅ (subsets de datos) | TB gana |
| **Plantillas con herencia** | ✅ | ❌ | Crítico — no hay enforcement de esquema |
| **Parámetros de sustitución** | ✅ (%Element%) | ❌ | Sin equivalente |
| **Búsqueda por valores de atributos** | ✅ | ❌ | API limita a nombre/relaciones |
| Bulk provisioning con relaciones | ✅ | ⚠️ Solo CSV sin relaciones | Script custom necesario |

---

## Las 3 Brechas Irreconciliables

### 1. Compresión SDT (Swinging Door Trending)
- PI logra 90–99% compresión; TB almacena cada punto
- 50K tags a 1 seg = **~10 GB/día** en Cassandra sin comprimir
- **Solución**: Implementar en edge/gateway, o rule chain deadband, o custom Java rule node

### 2. Códigos de Calidad OPC
- PI propaga flags Good/Bad/Uncertain a través de todos los cálculos
- TB no tiene concepto de calidad por dato
- **Solución**: Telemetría adicional `Q` (quality code) + lógica custom de propagación

### 3. Promedios Ponderados por Tiempo (TWA)
- PI calcula time-weighted averages nativamente (crítico para procesos batch)
- TB solo hace event-weighted AVG (incorrecto para intervalos irregulares)
- **Solución**: Cálculo custom client-side en widgets, o rule chain custom

---

## Decisión Económica

| Concepto | PI System (50K tags) | TB PE + Custom |
|----------|---------------------|----------------|
| Licencias/año | $100K–$300K | $3K–$10K (perpetuo) |
| Infraestructura/año | $20K–$50K | $12K–$24K (Cassandra cluster) |
| Desarrollo custom | $0 | ~$50K–$80K (una vez, 14-17 sem) |
| **Total año 1** | **$120K–$350K** | **$65K–$114K** |
| **Total año 2+** | **$120K–$350K** | **$15K–$34K** |

ROI del desarrollo custom se recupera en el primer año.
