# Historiador Industrial sobre ThingsBoard PE

## Documento Fuente

**Todo en este directorio se basa en**: [`/prmpt.md`](../prmpt.md) — Investigación técnica completa de cómo construir un historiador industrial sobre ThingsBoard PE, incluyendo gaps vs PI System, benchmarks de rendimiento, y plan de implementación.

---

## Qué es Este Proyecto

Convertir una instancia de **ThingsBoard Professional Edition (4.0+)** en un **historiador industrial** equivalente al ~75% de OSIsoft PI System, para 10,000–50,000 tags con scan rates de 1 segundo.

**Justificación económica**: TB PE $15K–$25K/año vs PI System $100K–$300K/año para 50K tags.

**Las 3 brechas irreconciliables** (requieren desarrollo custom):
1. **Compresión SDT** — TB no tiene swinging door trending; implementar en edge/gateway o rule chain
2. **Códigos de calidad OPC** — TB no propaga flags Good/Bad/Uncertain; modelo custom completo
3. **Promedios ponderados por tiempo (TWA)** — TB solo hace event-weighted; cálculo custom client-side

---

## Servidor ThingsBoard PE

| Dato | Valor |
|------|-------|
| URL | `https://panel.atilax.io` |
| API Base | `https://panel.atilax.io/api` |
| Swagger | `https://panel.atilax.io/swagger-ui/index.html` |
| Usuario | `well@atilax.io` |
| Clave | `10203040` |

---

## Mapa de Documentación

```
docs/
├── README.md                              ← ESTÁS AQUÍ
│
├── 01-arquitectura/                       ← Visión, gaps vs PI, sizing
│   ├── vision-y-gaps.md                   ← Qué es, 3 brechas, comparativa PI
│   ├── rendimiento-y-escala.md            ← Benchmarks, Cassandra vs PG, storage
│   └── componentes-del-sistema.md         ← Diagrama de bloques
│
├── 02-modelo-datos/                       ← Jerarquía, tags, MQTT
│   ├── asset-framework.md                 ← Jerarquía Assets, gaps vs PI AF
│   ├── modelo-device-tag.md               ← 1 Device = 1 Tag, atributos, telemetry
│   ├── integracion-mqtt.md                ← Protocolo, tópicos, payloads
│   └── quality-codes.md                   ← Modelo custom de calidad OPC
│
├── 03-plataforma/                         ← Configuración TB PE (sin código)
│   ├── device-profiles.md                 ← Profiles por tipo de tag + alarm rules
│   ├── asset-profiles.md                  ← Plant, Area, Unit, Equipment
│   ├── calculated-fields.md               ← 5 tipos TB4.0, rolling args, reprocessing
│   ├── entity-aliases.md                  ← stateEntity, relationsQuery
│   └── dashboard-states.md                ← 5 estados de navegación drill-down
│
├── 04-rule-chains/                        ← Las 4 rule chains del historiador
│   ├── README.md                          ← Arquitectura de 4 rule chains
│   ├── rc1-ingesta-validacion.md          ← Range check, existence, save
│   ├── rc2-compresion-deadband.md         ← Deadband filter, SDT custom node
│   ├── rc3-calculos-derivados.md          ← Calculated Fields, Aggregate Stream, Scheduler
│   └── rc4-deteccion-eventos.md           ← Rate-of-change, stale data, alarm details
│
├── 05-widgets-custom/                     ← 7 widgets a desarrollar
│   ├── README.md                          ← Resumen: qué construir vs qué reusar
│   ├── w1-industrial-trend-viewer.md      ← Multi-tag, zoom, crosshairs, progressive loading
│   ├── w2-tag-browser-search.md           ← Búsqueda + add-to-trend
│   ├── w3-tag-detail-panel.md             ← Último valor, quality, mini-trend, stats 24h
│   ├── w4-event-frame-timeline.md         ← Timeline alarmas/eventos con ECharts markArea
│   ├── w5-adhoc-query.md                  ← Formulario consulta: rango, tags, agregación
│   ├── w6-batch-comparison.md             ← Comparar mismo tag en diferentes períodos
│   └── w7-tag-configuration.md            ← Editar atributos de tags con validación
│
├── 06-apis-integracion/                   ← REST API, WebSocket, rate limits
│   ├── rest-api-telemetria.md             ← GET timeseries, límites, paginación temporal
│   ├── websocket-streaming.md             ← Suscripciones real-time, rate limits
│   └── provisioning-script.md             ← Script Python/Node para bulk create
│
└── 07-implementacion/                     ← Cómo construir
    ├── entorno-desarrollo.md              ← thingsboard-extensions, Angular 18, yarn
    ├── arquitectura-widgets.md            ← Extensions framework, lifecycle hooks, ctx
    ├── build-deploy.md                    ← Build bundle .js, upload, register
    └── troubleshooting.md                 ← Errores comunes
```

---

## Flujo de Lectura

### Para entender el proyecto:
1. [`prmpt.md`](../prmpt.md) — **LEER PRIMERO** — La investigación completa
2. [Visión y Gaps](./01-arquitectura/vision-y-gaps.md) — Resumen ejecutivo de brechas vs PI
3. [Rendimiento y Escala](./01-arquitectura/rendimiento-y-escala.md) — Sizing para 10K–50K tags

### Para configurar TB PE:
1. [Asset Framework](./02-modelo-datos/asset-framework.md) — Jerarquía de planta
2. [Device Profiles](./03-plataforma/device-profiles.md) — Profile por tipo de tag
3. [Calculated Fields](./03-plataforma/calculated-fields.md) — 5 tipos, rolling, reprocessing
4. [4 Rule Chains](./04-rule-chains/README.md) — Ingesta, compresión, cálculos, eventos

### Para desarrollar widgets:
1. [Entorno de Desarrollo](./07-implementacion/entorno-desarrollo.md) — Setup
2. [Arquitectura Widgets](./07-implementacion/arquitectura-widgets.md) — Extensions framework
3. [Industrial Trend Viewer](./05-widgets-custom/w1-industrial-trend-viewer.md) — El widget principal
4. [Tag Browser](./05-widgets-custom/w2-tag-browser-search.md) — Navegación de tags

---

## Plan de Implementación (resumen)

| Fase | Semanas | Contenido |
|------|---------|-----------|
| **1. Infraestructura** | 2 | Deploy TB PE, Asset/Device Profiles, jerarquía, provisioning script |
| **2. Ingesta y alarmas** | 3 | 4 rule chains, alarm rules HH/H/L/LL, stale data, notifications |
| **3. Cálculos** | 3 | Calculated Fields, Aggregate Stream, rate-of-change, Scheduler |
| **4. Widgets core** | 4–6 | Industrial Trend Viewer, Tag Browser, Tag Detail, dashboards |
| **5. Widgets avanzados** | 2–3 | Event Timeline, Ad-hoc Query, Batch Comparison |
| **Total** | **14–17** | Sistema historiador ~75% PI System |

Detalle completo en [`ROADMAP.md`](../ROADMAP.md).
