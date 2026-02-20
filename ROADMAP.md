# Roadmap — Historiador Industrial sobre ThingsBoard PE

> Plan de implementacion en 5 fases (14-17 semanas) para construir un historiador industrial funcional equivalente al ~75% de PI System.

---

## Diagrama de Dependencias

```
Asset Framework (Fase 1) ──────► Provisioning Script
        │                              │
        ▼                              ▼
Rule Chains Ingesta (Fase 2) ──► Rule Chains Calculos (Fase 3)
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

---

## Fase 1 — Infraestructura Base (2 semanas)

**Objetivo**: Tener la plataforma desplegada y configurada con la jerarquia completa de activos y dispositivos.

| # | Tarea | Duracion | Tipo | Detalle |
|---|-------|----------|------|---------|
| 1.1 | Desplegar ThingsBoard PE | 3 dias | Infraestructura | Configuracion Hybrid PostgreSQL + Cassandra + Kafka |
| 1.2 | Definir Asset Profiles | 1 dia | Configuracion | Perfiles: Enterprise, Plant, Area, Unit, Equipment |
| 1.3 | Definir Device Profiles | 2 dias | Configuracion | Perfiles: Analog Input, Digital Input, Calculated, Totalizer. Incluye alarm rules y calculated fields base |
| 1.4 | Crear jerarquia de activos | 1 dia | Configuracion | Estructura completa Empresa > Planta > Area > Unidad > Equipo |
| 1.5 | Desarrollar script de provisioning masivo | 3 dias | Desarrollo | Script Python/Node.js que lee spreadsheet y crea Assets, Devices, Relations y Atributos via REST API |
| 1.6 | Configurar TTL y particionamiento | 1 dia | Configuracion | TTL en Cassandra por nivel (crudo: 90 dias, agregado: 2 anios), particionamiento temporal |

### Entregables Fase 1
- Instancia ThingsBoard PE operativa con Hybrid PG+Cassandra+Kafka
- Jerarquia completa de activos creada
- Script de provisioning reutilizable
- Politicas de retencion configuradas

### Configuracion de Base de Datos

| Componente | Rol | Configuracion |
|-----------|-----|---------------|
| PostgreSQL | Metadata, entidades, relaciones, alarmas | Base principal |
| Cassandra | Telemetria (series temporales) | 5x menos almacenamiento que PG, TTL nativo por fila |
| Kafka | Cola de mensajes | Durabilidad, backpressure, desacoplamiento |

### Proyecciones de Almacenamiento (1 anio)

| Tags | Scan rate | Puntos/dia | Cassandra/anio | PostgreSQL/anio |
|------|-----------|------------|----------------|-----------------|
| 10,000 | 1 seg | 864M | ~730 GB | ~3,650 GB |
| 50,000 | 1 seg | 4.32B | ~3,650 GB | ~18,250 GB |

---

## Fase 2 — Ingesta y Alarmas (3 semanas)

**Objetivo**: Datos validados ingresando al sistema con alarmas operativas para HH/H/L/LL, datos estancados y violaciones de deadband.

| # | Tarea | Duracion | Tipo | Detalle |
|---|-------|----------|------|---------|
| 2.1 | Implementar RC1: Validacion de datos | 3 dias | Rule Chain | Message Type Switch > Check Existence Fields > Script Filter TBEL para range check > Save Timeseries o Create Alarm |
| 2.2 | Implementar RC2: Compresion deadband | 3 dias | Rule Chain | Originator Telemetry enrichment > Script Filter TBEL (comparar con ultimo valor) > Solo pasar si excede deadband |
| 2.3 | Configurar alarm rules HH/H/L/LL | 2 dias | Device Profile | 4 condiciones de creacion con severidades descendentes (Critical > Major > Minor > Warning) en Device Profiles |
| 2.4 | Implementar deteccion de stale data | 1 dia | Configuracion | Device inactivity timeout nativo + Calculate Delta para periodo excesivo |
| 2.5 | Configurar Notification Center | 2 dias | Configuracion | Alertas email/SMS via Twilio, templates de notificacion, cadenas de escalamiento |
| 2.6 | Pruebas de ingesta a escala | 4 dias | Testing | Simulador MQTT con carga realista, verificar alarmas, medir rendimiento |

### Arquitectura de Rule Chains

```
RC1 — Validacion e Ingesta:
  Message Type Switch
    └── Check Existence Fields
          └── Originator Attributes (enriquecer con rangos)
                └── Script Filter TBEL (range check)
                      ├── True: Save Timeseries
                      └── False: Create Alarm "Out of Range" + Log

RC2 — Compresion Deadband:
  Originator Telemetry (ultimo valor)
    └── Script Filter TBEL (|actual - anterior| > deadband)
          ├── True: Save Timeseries
          └── False: Descartar (no almacenar)
```

### Alarm Rules en Device Profile

| Severidad | Condicion | Tipo | Ejemplo |
|-----------|-----------|------|---------|
| CRITICAL | PV >= ss_alarmHH | Simple | Presion > 4500 PSI |
| MAJOR | PV >= ss_alarmH | Simple | Presion > 4000 PSI |
| MINOR | PV <= ss_alarmL | Simple | Presion < 500 PSI |
| WARNING | PV <= ss_alarmLL | Simple | Presion < 200 PSI |

Los umbrales son **dinamicos** — referencian atributos del servidor (`ss_alarmHH`, `ss_alarmH`, etc.) con herencia jerarquica ("Inherit from owner").

### Entregables Fase 2
- Rule chains de validacion y deadband operativas
- Alarmas HH/H/L/LL generandose correctamente
- Deteccion de datos estancados activa
- Notificaciones por email/SMS configuradas

---

## Fase 3 — Calculos Derivados (3 semanas)

**Objetivo**: Formulas, totalizadores, rate-of-change y resumenes periodicos operativos.

| # | Tarea | Duracion | Tipo | Detalle |
|---|-------|----------|------|---------|
| 3.1 | Configurar Calculated Fields para formulas | 3 dias | Configuracion | Campos calculados tipo Simple y Script en Device Profiles para formulas aritmeticas y promedios moviles |
| 3.2 | Implementar Aggregate Stream para totalizadores | 2 dias | Rule Chain | Nodo Aggregate Stream (PE) con MIN/MAX/SUM/AVG/COUNT por intervalo configurable (1h, 1 dia) |
| 3.3 | Implementar rule chain de rate-of-change | 3 dias | Rule Chain | Calculate Delta > Script Transformation (rate = delta / periodo) > Filter (rate > threshold) > Create Alarm |
| 3.4 | Configurar Scheduler para resumenes periodicos | 2 dias | Configuracion | Scheduler PE con eventos Daily/Weekly que entran al Root Rule Chain para generar resumenes |
| 3.5 | Implementar deteccion de eventos via rule chain | 3 dias | Rule Chain | Rule chain que captura valores contextuales en alarm details y acumula estadisticas durante vida del alarma |
| 3.6 | Pruebas de calculos con datos historicos | 2 dias | Testing | Reprocesamiento historico (TB 4.1+) para validar calculos retroactivamente |

### Calculated Fields Disponibles (TB 4.0+)

| Tipo | Descripcion | Uso en historiador |
|------|-------------|-------------------|
| Simple | Expresiones aritmeticas directas | Conversiones de unidades, formulas basicas |
| Script | TBEL completo con condicionales y loops | Promedios moviles, logica condicional |
| Propagation | Transformar y propagar datos a entidades relacionadas | Rollup de datos de tags a equipo |
| Aggregation | Agregar datos de entidades hijas (min/max/avg/sum/count) | Promedios de area, totales de planta |

### Entregables Fase 3
- Calculated Fields activos en Device Profiles
- Totalizadores generando datos agregados por periodo
- Rate-of-change detectando cambios bruscos
- Resumenes periodicos (diarios/semanales) automaticos

---

## Fase 4 — Widgets Core (4-6 semanas)

**Objetivo**: Dashboard historiador funcional con navegacion jerarquica, busqueda de tags, tendencias industriales y panel de detalle.

| # | Tarea | Duracion | Tipo | Detalle |
|---|-------|----------|------|---------|
| 4.1 | Industrial Trend Viewer | 2-3 sem | Widget Custom | Multi-tag, multi-eje Y, rubber-band zoom (ECharts dataZoom inside), pan, crosshairs sincronizados (echarts.connect), progressive data loading, overlay de alarmas/eventos |
| 4.2 | Tag Browser con busqueda | 1-2 sem | Widget Custom | Busqueda por nombre, descripcion, atributos, jerarquia. Multi-select. Capacidad de arrastrar tags al trend viewer |
| 4.3 | Tag Detail Panel | 1 sem | Widget Custom | Ultimo valor, quality, timestamp, atributos completos, mini-trend 24h, estadisticas |
| 4.4 | Dashboards de navegacion jerarquica | 1 sem | Configuracion | 4-5 dashboard states: Plant Overview > Area View > Unit View > Equipment View > Tag Detail. Uso de alias "Entity from dashboard state" |

### Arquitectura del Industrial Trend Viewer

```
┌─────────────────────────────────────────────────────┐
│  Industrial Trend Viewer (Widget Custom - Angular)   │
│                                                       │
│  ┌──────────────────────────────────────────────┐    │
│  │  Toolbar: Rango temporal | Agregacion | Tags  │    │
│  ├──────────────────────────────────────────────┤    │
│  │                                                │    │
│  │  ECharts Instance 1 (Panel superior)           │    │
│  │  - Eje Y1: Presion (PSI)                       │    │
│  │  - Eje Y2: Temperatura (degF)                  │    │
│  │  - Bandas de alarma HH/H/L/LL                  │    │
│  │                                                │    │
│  ├──────────────────────────────────────────────┤    │
│  │                                                │    │
│  │  ECharts Instance 2 (Panel inferior)           │    │
│  │  - echarts.connect() para crosshairs sync      │    │
│  │  - Eje Y: Caudal (BPD)                         │    │
│  │                                                │    │
│  ├──────────────────────────────────────────────┤    │
│  │  DataZoom slider compartido                    │    │
│  └──────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

### Dashboard States para Navegacion

| State | Contenido | Alias | Accion de navegacion |
|-------|-----------|-------|---------------------|
| `default` | Vista general de planta | Entities Hierarchy | Click asset > navegar a `area_view` |
| `area_view` | Equipos del area | Entity from dashboard state | Click equipo > navegar a `unit_view` |
| `unit_view` | Tags del equipo | Relations query (hijos) | Click tag > navegar a `tag_detail` |
| `tag_detail` | Detalle completo del tag | Entity from dashboard state | Tag Detail Panel + Trend Viewer |

### Entregables Fase 4
- Industrial Trend Viewer funcional con zoom, pan, crosshairs
- Tag Browser con busqueda y seleccion multiple
- Tag Detail Panel con informacion completa
- Dashboard con navegacion jerarquica drill-down

---

## Fase 5 — Widgets Avanzados (2-3 semanas)

**Objetivo**: Capacidades avanzadas de analisis y visualizacion de eventos.

| # | Tarea | Duracion | Tipo | Detalle |
|---|-------|----------|------|---------|
| 5.1 | Event Frame Timeline | 1 sem | Widget Custom | Timeline horizontal de eventos/alarmas con colores por severidad, click para detalle, ECharts markArea |
| 5.2 | Ad-hoc Query | 1 sem | Widget Custom | Formulario para consultar datos por rango temporal, tags seleccionados, agregacion. Resultado en tabla y grafico |
| 5.3 | Batch Comparison | 0.5-1 sem | Widget Custom | Comparar mismo tag(s) en diferentes periodos lado a lado |
| 5.4 | Refinamiento UX | 0.5 sem | Mejora | Pulir interacciones, responsive design, keyboard shortcuts, estados de carga |

### Entregables Fase 5
- Timeline de eventos con visualizacion por severidad
- Herramienta de consulta ad-hoc para analisis exploratorio
- Comparacion de periodos para analisis de batch
- UX refinada y profesional

---

## Resumen de Tiempos

| Fase | Semanas | Tipo principal | Dependencia |
|------|---------|---------------|-------------|
| Fase 1: Infraestructura | 2 | Configuracion + Script | Ninguna |
| Fase 2: Ingesta y Alarmas | 3 | Rule Chains + Config | Fase 1 |
| Fase 3: Calculos Derivados | 3 | Calculated Fields + RC | Fase 2 |
| Fase 4: Widgets Core | 4-6 | Angular + TypeScript | Fases 1-3 |
| Fase 5: Widgets Avanzados | 2-3 | Angular + TypeScript | Fase 4 |
| **TOTAL** | **14-17 semanas** | — | — |

---

## Resultado Esperado

Un sistema historiador industrial funcional con:

- **Navegacion jerarquica** completa de la planta (Empresa > Planta > Area > Equipo > Tag)
- **Tendencias industriales** con zoom, pan, crosshairs sincronizados y progressive loading
- **Alarmas operativas** HH/H/L/LL con notificaciones por email/SMS
- **Calculos derivados** en tiempo real (formulas, totalizadores, rate-of-change)
- **Busqueda de tags** por nombre, descripcion y atributos
- **Analisis de eventos** con timeline y consulta ad-hoc
- **Comparacion de periodos** para analisis batch

Equivalente aproximado al **~75% de PI System** a una fraccion del costo ($3K-$10K ThingsBoard PE vs $50K-$200K+ PI System).

---

## Stack Tecnologico

| Componente | Tecnologia | Version |
|-----------|-----------|---------|
| Plataforma | ThingsBoard PE | 4.0+ |
| Widgets Custom | Angular | 18.2.13 |
| Lenguaje | TypeScript | 5.5.4 |
| Graficos | ECharts (fork TB) | 5.5.0-TB |
| Build | ng-packagr + SystemJS | 18.2.1 |
| UI Components | Angular Material | 18.2.14 |
| State Management | NgRx Store | 18.1.1 |
| Base de datos (telemetria) | Cassandra | 4.x |
| Base de datos (metadata) | PostgreSQL | 14+ |
| Cola de mensajes | Apache Kafka | 3.x |
| Simulador | Node.js + MQTT | 18.x/20.x |
| Provisioning Script | Python + requests | 3.x |

---

## Servidor de Desarrollo

| Parametro | Valor |
|-----------|-------|
| URL | https://panel.atilax.io |
| Usuario | well@atilax.io |
| Password | 10203040 |
