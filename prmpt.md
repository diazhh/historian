# Construir un historiador industrial sobre ThingsBoard PE: guía técnica completa

ThingsBoard Professional Edition puede funcionar como historiador industrial para 10,000–50,000 tags, pero requiere desarrollo custom significativo en áreas clave donde los historiadores dedicados como OSIsoft PI brillan nativamente. **Las mayores brechas son la ausencia de compresión swinging door (SDT), la falta de códigos de calidad OPC nativos, y la inexistencia de promedios ponderados por tiempo.** La plataforma ofrece una base sólida con su Rule Engine, sistema de alarmas, Calculated Fields (desde v4.0), y APIs de series temporales, pero el camino hacia un reemplazo completo de PI System exige planificación arquitectónica cuidadosa y ~8–12 semanas de desarrollo custom en widgets y rule chains.

La decisión de usar ThingsBoard PE como historiador se justifica económicamente: licencias PI System típicamente cuestan $50K–$200K+ versus $3K–$10K para ThingsBoard PE perpetuo. La arquitectura abierta (PostgreSQL/Cassandra/TimescaleDB, APIs REST, Kafka) elimina el vendor lock-in y permite escalar horizontalmente con infraestructura commodity.

---

## 1. Trends: el motor de visualización requiere un widget industrial custom

### Lo que ThingsBoard PE ofrece nativamente

ThingsBoard migró sus gráficos de la librería Flot a **Apache ECharts** en 2024, un salto significativo en capacidades. Los gráficos nativos de series temporales ahora soportan: **múltiples ejes Y independientes** con asignación explícita de series a cada eje, zoom client-side mediante sliders, líneas de umbral configurables, comparación de períodos (dato actual vs hace 1 mes), y exportación CSV/XLS/XLSX integrada. Cada widget puede operar en modo real-time (ventana rodante via WebSocket) o histórico (rango fijo con query al backend).

La plataforma soporta **6 funciones de agregación** nativas: MIN, MAX, AVG, SUM, COUNT, y NONE (dato crudo). El parámetro `DATABASE_TS_MAX_INTERVALS` (default 700) limita el número de sub-queries por llamada API. El `DASHBOARD_MAX_DATAPOINTS_LIMIT` es configurable hasta 50,000 puntos por widget (default 50,000 desde versiones recientes).

Cualquier librería JavaScript puede incorporarse en widgets custom vía CDN: ECharts (ya nativa), Plotly, uPlot, Chart.js, D3.js. El Widget Editor integrado ofrece un mini-IDE con HTML/CSS/JS, lifecycle hooks (`onInit`, `onDataUpdated`, `onResize`, `onDestroy`), y acceso al contexto de datos via `self.ctx.data`.

### Brechas críticas vs PI ProcessBook/PI Vision

La ausencia más significativa es el **algoritmo Plot Values**: PI Vision selecciona automáticamente los puntos más representativos visualmente según el ancho en píxeles del gráfico (típicamente 300–1,000 puntos sin importar el rango temporal). ThingsBoard no tiene equivalente — requiere selección manual del intervalo de agregación. Esto significa que un operador visualizando 1 año de datos a 1 segundo no obtiene automáticamente una vista óptima; debe configurar manualmente la agregación a horas o días.

**No hay crosshairs sincronizados** entre múltiples widgets de gráfico. PI Vision sincroniza automáticamente el cursor entre todos los trends de una pantalla. En ThingsBoard, la librería ECharts soporta `echarts.connect()` para sincronización, pero el framework de widgets aísla cada instancia de ECharts, impidiendo la conexión directa. La solución requiere un **widget custom multi-panel** que contenga múltiples sub-gráficos ECharts conectados internamente.

**No existe interpolación nativa** (linear interpolation entre puntos almacenados a timestamps equidistantes). Tampoco hay step interpolation ni "previous value" retrieval. ThingsBoard retorna datos crudos o agregados, nunca interpolados. No hay modo "compressed" ni señales de calidad por dato individual.

El **zoom es slider-based** (no rubber-band selection como PI Vision). No hay pan/scroll horizontal ni keyboard shortcuts para navegación temporal. Las transiciones entre modo real-time e histórico requieren cambio explícito en la UI de time window — PI Vision ofrece strip chart continuo que se puede pausar y retroceder sin interrumpir.

| Capacidad | PI Vision | ThingsBoard PE nativo | Desarrollo custom |
|---|---|---|---|
| Multi-tag, multi-eje Y | ✅ | ✅ (ECharts) | No necesario |
| Plot Values auto-downsampling | ✅ | ❌ | Alto — progressive loading |
| Crosshairs sincronizados | ✅ | ❌ | Medio-Alto — multi-panel widget |
| Interpolación lineal | ✅ | ❌ | Alto — server-side |
| Zoom rubber-band + pan | ✅ | ⚠️ Slider zoom | Bajo — ECharts `dataZoom: inside` |
| Ad-hoc drag tag a trend | ✅ | ❌ | Medio — custom tag browser |
| Anotaciones de eventos | ✅ | ❌ | Medio — overlay alarm bands |
| Streaming real-time + histórico seamless | ✅ | ⚠️ Modos separados | Medio |
| Export CSV/Excel | ✅ | ✅ | No necesario |

### Recomendación de implementación

Construir un **"Industrial Trend Viewer" widget custom** usando ECharts directamente. El widget debe implementar: (a) `dataZoom` tipo `inside` para zoom con mouse wheel y drag-to-pan, (b) multiple ECharts instances conectadas via `echarts.connect()` para crosshairs sincronizados, (c) progressive data loading que haga fetch agregado primero y granular al hacer zoom-in, (d) overlay de bandas coloreadas para alarmas/eventos consultadas via Alarm API. La librería **uPlot** es una alternativa viable si el rendimiento con >50K puntos es prioritario (uPlot renderiza 100K+ puntos con GPU acceleration). **Complejidad estimada: Alta (4–6 semanas de desarrollo).**

---

## 2. Event Frames: las alarmas de ThingsBoard cubren el 70% del caso

### Mapeo de alarmas como Event Frames

Las alarmas de ThingsBoard PE almacenan nativamente `startTs` y `endTs` (timestamps de inicio y fin), `type` (nombre/categoría), 5 niveles de severidad (CRITICAL, MAJOR, MINOR, WARNING, INDETERMINATE), y un ciclo de vida de 4 estados: ACTIVE_UNACK → ACTIVE_ACK → CLEARED_UNACK → CLEARED_ACK. El campo `details` es un JSON libre donde se pueden almacenar valores de proceso capturados al momento del trigger. Esto mapea razonablemente a PI Event Frames.

Las **alarm rules en Device Profiles** son el mecanismo de plantilla: todas las devices asignadas a un perfil heredan las reglas de alarma automáticamente. Soportan condiciones Simple (umbral inmediato), Duration (condición sostenida N segundos), y Repeating (condición ocurre N veces). Los umbrales pueden ser dinámicos — referenciando atributos del device, customer o tenant con herencia jerárquica ("Inherit from owner").

Para **excursiones HH/H/L/LL**, una sola alarm rule puede tener múltiples condiciones de creación con diferentes severidades evaluadas en orden descendente (Critical primero). La detección de **rate-of-change** usa el nodo Calculate Delta del Rule Engine, que calcula `delta = valorActual - valorAnterior` y `periodInMs`, permitiendo computar derivadas. La **detección de datos estancados** es nativa via device inactivity timeout que genera Inactivity Events automáticamente.

### Gaps vs PI Event Frames

PI Event Frames capturan **estadísticas resumen** (promedio, min, max) sobre la duración completa del evento — ThingsBoard no calcula esto nativamente. Se necesitaría un rule chain que acumule min/max/avg en el JSON de `details` durante la vida del alarma, o una consulta post-hoc al API de telemetría usando `startTs`/`endTs` del alarma.

**Eventos jerárquicos** (padre-hijo para batch tracking) no tienen equivalente directo. La propagación de alarmas a entidades padre es unidireccional y no crea relaciones padre-hijo entre alarmas. **Búsqueda de eventos por valores de atributos** no existe — la API de alarmas filtra por entity, type, severity, status y rango temporal, pero no por contenido del JSON de details.

El **Notification Center** de ThingsBoard PE es comparable a PI Notifications: soporta email, SMS (Twilio), Slack, Microsoft Teams, mobile push, y notificaciones web. Incluye cadenas de escalamiento con delays configurables y templates de notificación con variables dinámicas.

### Complejidad y plan de implementación

| Funcionalidad | Complejidad | Enfoque |
|---|---|---|
| Alarmas HH/H/L/LL | Baja | Device profile alarm rules nativas |
| Rate-of-change alarms | Media | Calculate Delta + Script + Create Alarm en rule chain |
| Deadband violations | Media | Enrichment + Script filter en rule chain |
| Stale data detection | Baja | Inactivity timeout nativo |
| Captura de valores contextuales | Media | Script TBEL en alarm details |
| Estadísticas resumen sobre evento | Alta | Rule chain acumulador o post-query API |
| Timeline widget de eventos | Media | Widget custom con ECharts markArea |
| Anotaciones en trends | Media-Alta | Widget custom que overlay alarms sobre gráfico |

---

## 3. Calculated Fields y el Rule Engine reemplazan PI Analytics parcialmente

### Calculated Fields: el avance clave de ThingsBoard 4.0

La feature más relevante para replicar PI es **Calculated Fields**, introducida en ThingsBoard 4.0. Ofrece 5 tipos de campo calculado: **Simple** (expresiones aritméticas directas), **Script** (TBEL completo con condicionales y loops), **Propagation** (transformar y propagar datos a entidades relacionadas), **Aggregation** (agregar datos de entidades hijas — min/max/avg/sum/count), y **Zone** (evaluación geoespacial).

Los argumentos pueden ser **latest telemetry** (último valor snapshot), **attributes**, o **time series rolling** (ventana temporal histórica configurable con hasta 1,000 valores y métodos built-in: `mean()`, `sum()`, `min()`, `max()`, `first()`, `last()`, `merge()`). Esto permite **promedios móviles** nativos: definir un argumento rolling de 60 minutos y aplicar `mean()`.

Los Calculated Fields se ejecutan en tiempo real con cada telemetría recibida, **sin queries a base de datos** (mantienen estado interno con últimos valores). Pueden encadenarse (la salida de un campo calculado dispara otro). Desde ThingsBoard 4.1, soportan **reprocesamiento histórico** — aplicar la lógica de cálculo retroactivamente a datos ya almacenados, equivalente al backfilling de PI Analytics. Se definen a nivel de Device Profile y aplican a todos los devices del perfil.

### Rule Engine para cálculos complejos

El **Aggregate Stream Node** (exclusivo PE) calcula MIN/MAX/SUM/AVG/COUNT sobre datos en streaming, agrupando por originator y intervalo temporal configurable. Genera POST_TELEMETRY_REQUEST con resultados agregados — funciona como totalizador por período. El **Calculate Delta Node** computa delta entre valores consecutivos con detección de reset de contador, ideal para totalizadores de energía y caudalímetros.

**TBEL (ThingsBoard Expression Language)** es ~1,000x más rápido que JavaScript Nashorn para scripts simples (12ms vs 16s para 1,000 ejecuciones). Soporta aritmética, strings, colecciones, condicionales, y bucles. Para cálculos que requieren la potencia completa de JavaScript, los Remote JS Executors ejecutan Node.js como microservicio separado, pero con mayor latencia por comunicación via queue.

El **Scheduler** (exclusivo PE) permite disparar eventos en horarios Daily/Weekly que entran al Root Rule Chain, habilitando cálculos periódicos tipo cron sobre entidades individuales o grupos completos.

### Lo que falta vs PI Analytics

PI Performance Equations incluyen **~200+ funciones built-in** (FFT, distribuciones estadísticas, funciones trigonométricas avanzadas). ThingsBoard TBEL tiene solo funciones matemáticas básicas (sqrt, pow, abs). No hay **promedios ponderados por tiempo** — PI calcula time-weighted averages nativamente, críticos para análisis de procesos batch. No hay **códigos de calidad de datos** — PI propaga flags Good/Bad/Uncertain a través de todos los cálculos. Implementing a quality propagation system in ThingsBoard requires fully custom logic.

| Cálculo | ThingsBoard PE | Complejidad | Equivalente PI |
|---|---|---|---|
| Fórmulas aritméticas | ✅ Calculated Fields Simple | Baja | PI Performance Equations |
| Promedios móviles | ✅ Calculated Fields Script + rolling | Baja | PI Analytics rolling |
| Totalizadores/delta | ✅ Calculate Delta node | Baja | PI Totalizer |
| Min/Max por período | ✅ Aggregate Stream node | Baja | PI Summary |
| Rate of change | ✅ Calculate Delta + script | Baja-Media | PI Rate() |
| Cross-entity calculations | ✅ Calculated Fields Propagation | Media | PI AF Formula |
| Scheduled batch calcs | ✅ Scheduler PE + rule chain | Media | PI Analytics batch |
| Time-weighted average | ❌ | Alta — custom | PI TimeEq/Summary |
| FFT / estadísticas avanzadas | ❌ | Alta — external | PI PE functions |
| Quality propagation | ❌ | Alta — full custom | PI Digital States |

---

## 4. Asset Framework: la jerarquía funciona, las plantillas no

### Modelado jerárquico con Assets y Relations

ThingsBoard modela la jerarquía Empresa > Planta > Área > Unidad > Equipo > Tag usando **Assets** para los niveles superiores y **Devices** como nodos hoja (tags). Las **relaciones dirigidas** tipo "Contains" conectan niveles. Las relaciones soportan tipos custom (strings arbitrarios como "Supports", "Monitors"), dirección From/To, y son consultables por profundidad. No hay límite en la profundidad de la jerarquía.

Los **Entity Groups** (exclusivo PE) permiten agrupar devices/assets en colecciones planas con columnas customizables, acciones bulk, y son la base del RBAC (Role-Based Access Control). Un device puede pertenecer a múltiples grupos simultáneamente.

Los **Dashboard States** implementan navegación drill-down: cada state funciona como una "página" dentro del dashboard, con acciones de widget que navegan entre states pasando el contexto de la entidad seleccionada. El alias "Entity from dashboard state" resuelve automáticamente la entidad actual. El widget **Entities Hierarchy** (exclusivo PE) muestra árboles de entidades clickeables.

Las **Entity Views** exponen subsets de datos (atributos y telemetría seleccionados) a customers sin duplicar datos, con restricciones de ventana temporal.

### Brechas críticas vs PI Asset Framework

La brecha más significativa es **la ausencia de plantillas de atributos con herencia**. PI AF Element Templates definen esquemas completos de atributos que todos los elementos del template heredan automáticamente. En ThingsBoard, los Device Profiles definen alarm rules y calculated fields, pero **no prescriben qué atributos debe tener un device**. Cada device gestiona sus atributos independientemente. No hay enforcement de esquema ni propagación automática de cambios.

**No existe herencia de templates** (base → derivado). PI AF permite crear un template "Motor" base y derivar "Motor_AC" y "Motor_DC" que heredan y extienden. ThingsBoard no tiene este concepto. **No hay parámetros de sustitución** — PI AF usa `%Element%`, `%@Attribute%` para generar nombres de tags dinámicamente basados en la posición en la jerarquía. Tampoco existe **búsqueda server-side por valores de atributos** a nivel de API — la búsqueda REST es primariamente por nombre de entidad y relaciones.

El **bulk provisioning** via CSV import no soporta creación de relaciones — solo crea entidades con atributos. Construir la jerarquía completa requiere scripting via REST API (crear assets, crear devices, crear relaciones). Se recomienda desarrollar un **script Python/Node.js de provisioning** que lea un spreadsheet con la estructura jerárquica y use el API para crear todo en batch. Este es un esfuerzo único, reutilizable.

### Plan de implementación

Para replicar PI AF operativamente: (1) Definir Device Profiles por tipo de tag (Analog Input, Digital Input, Calculated, etc.) con sus alarm rules y calculated fields. (2) Crear Asset Profiles por nivel jerárquico (Plant, Area, Unit, Equipment). (3) Desarrollar un **script de provisioning** que enforce el esquema de atributos al crear entities (setpoints, rangos, unidades, descripción, tipo, scan rate). (4) Construir un **dashboard con 4–5 states** para navegación: Plant Overview → Area View → Unit View → Equipment View → Tag Detail. (5) Usar el widget Entities Hierarchy como navegador principal. **Complejidad total: Media-Alta (3–4 semanas).**

---

## 5. Rendimiento y escala: viable con arquitectura correcta

### Benchmarks oficiales para el escenario 10K–50K tags

ThingsBoard ha publicado benchmarks en AWS EC2 que directamente informan el sizing:

| Configuración | Devices | Data points/sec | Hardware | CPU |
|---|---|---|---|---|
| PostgreSQL only | 5,000 | 3,000 | t3.medium (2 vCPU, 4GB) | 27% |
| PG + Kafka | 5,000 | 15,000 | m6a.large (2 vCPU, 8GB) | 95% |
| PG + Cassandra + Kafka | 25,000 | 30,000 | m6a.2xlarge (8 vCPU, 32GB) | 75% |
| PG + Cassandra + Kafka | 100,000 | 15,000 | m6a.2xlarge (8 vCPU, 32GB) | 71% |

Para **10,000 tags a 1 segundo** (~10K msg/sec con ~3 data points cada uno = ~30K dp/sec), se necesita como mínimo **Hybrid PG+Cassandra** con un servidor de **8 vCPU y 32GB RAM**, más Kafka como message queue. PostgreSQL solo soporta hasta ~5K dp/sec confortablemente; exceder esto causa bottleneck en la tabla `ts_kv_latest` con hasta 60K updates/sec.

Para **50,000 tags a 1 segundo** (~150K dp/sec), se requiere **despliegue en cluster microservicios**: 2–3 nodos ThingsBoard (4+ vCPU, 16GB cada uno), cluster Cassandra de 3–5 nodos, Kafka cluster, PostgreSQL managed. Costo estimado: **$1,000–$2,000/mes en AWS**.

### Selección de base de datos: Cassandra gana para historiador

**Cassandra** es la opción recomendada para el backend de telemetría en escenarios de historiador. Consume **5x menos almacenamiento** que PostgreSQL (29 GiB vs 152 GiB por mil millones de puntos) gracias a compresión LZ4 nativa a nivel de SSTable. Soporta TTL nativo por fila, escalamiento horizontal transparente, y está diseñada para escrituras masivas.

**TimescaleDB** es una alternativa viable si se prefiere permanecer en el ecosistema PostgreSQL. Ofrece hypertables con particionamiento automático, compresión columnar (>90% reducción), continuous aggregates para rollups pre-computados, y `drop_chunks()` para retención. Sin embargo, la documentación de ThingsBoard para TimescaleDB en modo microservicios es escasa y no hay benchmarks públicos comparándolo con Cassandra.

**PostgreSQL puro** queda descartado para >5K dp/sec. El límite práctico de escritura de atributos es ~20K records/sec, y la tabla `ts_kv_latest` se convierte en cuello de botella.

### Proyecciones de almacenamiento (1 año, sin compresión SDT)

| Tags | Scan rate | Puntos/día | Cassandra/año | PostgreSQL/año |
|---|---|---|---|---|
| 10,000 | 1 seg | 864M | ~730 GB | ~3,650 GB |
| 50,000 | 1 seg | 4.32B | ~3,650 GB | ~18,250 GB |

Estos números subrayan por qué **la compresión SDT debe implementarse en el edge/gateway**: sin ella, 50K tags generan ~10 GB/día solo en Cassandra. Con SDT típico (90–95% compresión), esto baja a ~0.5–1 GB/día.

### Retención y TTL

Con Cassandra, el TTL puede configurarse a tres niveles con prioridad: (1) metadata `TTL` del mensaje, (2) Default TTL del nodo Save Timeseries, (3) "Default Storage TTL Days" del Tenant Profile. Con PostgreSQL/TimescaleDB, la retención usa jobs periódicos configurados via `SQL_TTL_*`. **El TTL per-device solo funciona con Cassandra** — PostgreSQL/TimescaleDB aplican TTL uniformemente a nivel de tenant.

### Compresión: la brecha más grande

**ThingsBoard no tiene algoritmo de compresión de datos built-in.** Ni swinging door trending (SDT), ni deadband filtering, ni report-by-exception. Cada punto recibido se almacena íntegramente. Esto contrasta con PI Data Archive que logra 90–99% de compresión con SDT, almacenando 5x más datos por servidor.

La implementación debe ocurrir **antes de que los datos lleguen a ThingsBoard**: (a) en el gateway/PLC configurando deadband y scan-on-exception, (b) via rule chain con un Script Filter que compare el valor actual con el último almacenado y solo pase si el cambio excede un umbral, o (c) implementando un **custom Java rule node** para SDT completo (mantiene estado de corredor, pendientes superior/inferior). La opción (b) es factible con complejidad media; la opción (c) requiere desarrollo Java con complejidad alta.

---

## 6. Widgets custom: qué construir y qué reusar

### Widgets nativos aprovechables

ThingsBoard PE incluye **600+ widgets** organizados en bundles. Para un historiador industrial, los directamente útiles son:

- **Time Series Chart** (ECharts): Multi-tag, multi-eje, zoom slider, exportación — es la base del trend viewer.
- **Entities Table**: Lista devices con columnas customizables (atributos, latest telemetry) y búsqueda full-text — funciona como tag browser básico.
- **Alarms Table**: Tabla de alarmas con filtrado por status/severity/type, acknowledge/clear inline — la vista principal de alarmas.
- **Entities Hierarchy** (PE): Árbol navegable de entidades por relaciones — el navegador de activos.
- **Single/Multiple Entity widgets**: Cards para mostrar último valor, atributos, estadísticas.

### Widgets que requieren desarrollo custom

| Widget | Descripción | Complejidad | Dependencias |
|---|---|---|---|
| **Industrial Trend Viewer** | Multi-tag, multi-eje, rubber-band zoom, pan, crosshairs sincronizados, progressive loading, overlay de eventos | Alta (4–6 sem) | ECharts o uPlot, Alarm API |
| **Tag Browser/Search** | Búsqueda por nombre, descripción, atributos, jerarquía con resultados en tabla. Add-to-trend capability | Media (2–3 sem) | Entity API, dashboard actions |
| **Tag Detail Panel** | Último valor, quality, timestamp, atributos completos, mini-trend, estadísticas 24h | Baja-Media (1–2 sem) | Telemetry API, Attributes API |
| **Event Frame Timeline** | Timeline horizontal de eventos/alarmas con colores por severidad, click para detalle | Media (2–3 sem) | Alarm API, ECharts markArea |
| **Ad-hoc Query** | Formulario para consultar datos por rango temporal, tags seleccionados, agregación, con tabla/gráfico de resultados | Media-Alta (3 sem) | REST API getTimeseries |
| **Batch Comparison** | Comparar mismo tag(s) en diferentes períodos lado a lado | Media (2 sem) | Telemetry API, ECharts |
| **Tag Configuration** | Editar atributos de tags (setpoints, rangos, UOM) con validación | Baja-Media (1–2 sem) | Attributes API, input widgets |

El framework de **Extensions** de ThingsBoard (v3.6+) permite crear componentes Angular compilados como bundles `.js`, lo que es ideal para widgets complejos como el Industrial Trend Viewer que requieren TypeScript, RxJS, y state management sofisticado.

---

## 7. Rule chains: el sistema nervioso del historiador

### Arquitectura de rule chains recomendada

Se necesitan **4 rule chains especializadas** asignadas a device profiles específicos:

**Rule Chain 1 — Ingesta y validación de datos**: Message Type Switch → Check Existence Fields (verificar campos requeridos) → Script Filter TBEL para range check (`return msg.PV >= metadata.ss_rangeLow && msg.PV <= metadata.ss_rangeHigh;`, con rangos enriquecidos desde server attributes via Originator Attributes node) → en rama True: Save Timeseries; en rama False: Create Alarm tipo "Out of Range" + Log. Agregar Calculate Delta node para detección de datos estancados (si `periodInMs` > threshold → Create Alarm "Stale Data").

**Rule Chain 2 — Compresión deadband**: Originator Telemetry enrichment (obtener último valor almacenado) → Script Filter TBEL (`return Math.abs(msg.PV - metadata.lastPV) > metadata.ss_deadband;`) → solo valores que excedan deadband pasan a Save Timeseries. Para SDT completo, desarrollar un **custom Java rule node** que mantenga estado del corredor SDT por device.

**Rule Chain 3 — Cálculos derivados**: Usar Calculated Fields a nivel de Device Profile para fórmulas simples y promedios móviles. Para totalizadores periódicos, usar Aggregate Stream node con intervalo configurable (1 hora, 1 día). Para cálculos cross-entity (eficiencia de planta = producción / consumo), usar Calculated Fields tipo Aggregation que promedien valores de devices hijos. Scheduler PE para disparar resúmenes diarios.

**Rule Chain 4 — Detección de eventos/alarmas**: Device Profile alarm rules para HH/H/L/LL (4 condiciones de creación con severidades descendentes). Rule chain adicional para rate-of-change: Calculate Delta → Script Transformation (computar `rate = delta / (periodInMs / 1000)`) → Filter (`rate > threshold`) → Create Alarm. Los alarm details capturan valores contextuales via script TBEL: `var details = {PV: msg.PV, SP: metadata.ss_setpoint, delta: msg.delta}; return details;`.

### Mejores prácticas para rule chains a escala

Usar **TBEL en lugar de JavaScript** — 1,000x más rápido y sin overhead de comunicación con microservicio externo. Asignar **rule chains separadas por Device Profile** en lugar de un root chain complejo — evita evaluación de condiciones innecesarias para cada mensaje. Configurar **Kafka como message queue** (no in-memory) para durabilidad y backpressure. Deshabilitar "Persist alarm rule state" a menos que se necesiten condiciones Duration/Repeating — cada mensaje adiciona un DB write. Minimizar queries a base de datos dentro de rule chains; preferir Calculated Fields que cachean estado internamente.

---

## 8. APIs: capacidades y limitaciones para consultas históricas

### REST API de telemetría

El endpoint principal es `GET /api/plugins/telemetry/{entityType}/{entityId}/values/timeseries` con parámetros `keys`, `startTs`, `endTs`, `interval`, `agg`, y `limit`. El **límite default es ~500 data points** por query (configurable reconstruyendo, o via `DASHBOARD_MAX_DATAPOINTS_LIMIT` para widgets). No existe paginación nativa con cursores — la técnica es **dividir el rango temporal** y usar el último timestamp retornado como nuevo `startTs`.

El `DATABASE_TS_MAX_INTERVALS` (default 700) limita sub-queries por llamada. Para queries de 1 año con intervalo de 1 segundo, se necesitan ~31.5M sub-queries — esto excede el límite y requiere agregación a intervalos mayores o partición temporal del query.

### WebSocket API para streaming

Conexión via `ws(s)://host:port/api/ws/plugins/telemetry?token=$JWT_TOKEN`. Soporta suscripciones `tsSubCmds` (tiempo real con `timeWindow` rodante) y `historyCmds` (rango fijo). Los rate limits de WebSocket son configurables: `max_subscriptions_per_tenant`, `max_updates_per_session` (default "300:1,3000:60" = 300/seg, 3000/min). Limitación conocida: cuando se suscribe a múltiples devices, los `subscriptionId` pueden no diferenciarse correctamente (GitHub #6799).

### Rate limits y tuning

Todos los rate limits están **deshabilitados por default**. Se configuran en `thingsboard.yml` con formato token bucket: `"1000:60"` = máximo 1,000 requests por 60 segundos. Niveles: REST API (tenant/customer), WebSocket (sessions/subscriptions/updates), Transport (tenant/device), Cassandra queries. Para un historiador con consultas masivas, es crítico configurar límites generosos o mantenerlos deshabilitados para queries internas, y aplicar límites solo para APIs expuestas externamente.

---

## 9. Mapa de dependencias y plan de implementación

### Dependencias entre módulos

```
Asset Framework (Fase 1) ──────► Provisioning Script
        │                              │
        ▼                              ▼
Rule Chains Ingesta (Fase 2) ──► Rule Chains Cálculos (Fase 3)
        │                              │
        ▼                              ▼
Device Profile Alarms (Fase 2) ─► Event Detection RC (Fase 3)
        │                              │
        ▼                              ▼
Tag Browser Widget (Fase 4) ───► Industrial Trend Widget (Fase 4)
        │                              │
        ▼                              ▼
Tag Detail Widget (Fase 4) ────► Event Timeline Widget (Fase 5)
                                       │
                                       ▼
                                Ad-hoc Query Widget (Fase 5)
```

### Plan de implementación por fases

**Fase 1 (2 semanas)**: Infraestructura base — desplegar ThingsBoard PE con Hybrid PG+Cassandra+Kafka, definir Asset Profiles y Device Profiles, crear jerarquía de activos, desarrollar script de provisioning masivo, configurar TTL y particionamiento.

**Fase 2 (3 semanas)**: Ingesta y alarmas — implementar rule chain de validación/deadband, configurar alarm rules en device profiles para HH/H/L/LL, implementar detección de stale data, configurar Notification Center para alertas email/SMS.

**Fase 3 (3 semanas)**: Cálculos derivados — configurar Calculated Fields para fórmulas, implementar Aggregate Stream para totalizadores, rule chain de rate-of-change, Scheduler para resúmenes periódicos.

**Fase 4 (4–6 semanas)**: Widgets core — Industrial Trend Viewer (multi-tag, zoom, crosshairs), Tag Browser con search, Tag Detail panel, dashboards de navegación jerárquica con estados.

**Fase 5 (2–3 semanas)**: Widgets avanzados — Event Frame Timeline, Ad-hoc Query, Batch Comparison, refinamiento UX.

**Total estimado: 14–17 semanas** para un sistema historiador funcional equivalente al ~75% de PI System.

---

## Conclusión: un historiador viable con concesiones conocidas

ThingsBoard PE puede servir como historiador industrial para 10,000–50,000 tags con una inversión de desarrollo significativa pero acotada. **Los Calculated Fields de TB 4.0 son el game-changer** que cierra la brecha más grande en cálculos derivados, y el sistema de alarmas cubre razonablemente el caso de Event Frames para la mayoría de aplicaciones de monitoreo de proceso.

Las tres brechas irreconciliables sin desarrollo externo son: **compresión SDT** (implementar como custom Java rule node o en el edge), **códigos de calidad OPC** (requiere modelo custom completo de quality flags como telemetría adicional), y **promedios ponderados por tiempo** (requiere cálculo custom que considere intervalos irregulares entre datos). Si la aplicación requiere extensivamente estas capacidades, considerar una arquitectura híbrida donde un historiador dedicado (como Canary Labs, significativamente más barato que PI) maneja el almacenamiento comprimido y ThingsBoard PE sirve como capa de visualización, alarmas y analytics.

La ventaja económica es innegable: **ThingsBoard PE con la infraestructura Cassandra descrita cuesta ~$15K–$25K/año** (licencia + cloud) versus **$100K–$300K/año** para PI System con PI Vision + PI AF + PI Analytics a 50K tags. El ROI del desarrollo custom se recupera en el primer año.