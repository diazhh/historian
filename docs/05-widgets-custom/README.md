# Widgets Custom del Historiador Industrial

> **Fuente**: [`prmpt.md`](../../prmpt.md) Seccion 6 — "Widgets custom: que construir y que reusar"

---

## Resumen

El historiador industrial sobre ThingsBoard PE requiere **7 widgets custom** que cubren las brechas
funcionales respecto a PI Vision / PI ProcessBook. Estos widgets se desarrollan como extensiones
Angular (framework Extensions de TB v3.6+) y se despliegan como bundles `.js` en el Widget Library.

El desarrollo total estimado es de **15-19 semanas** para un desarrollador full-time.

---

## Tabla de Widgets Custom

| # | Widget | Complejidad | Semanas | Fase | Dependencias |
|---|--------|-------------|---------|------|--------------|
| W1 | [Industrial Trend Viewer](./w1-industrial-trend-viewer.md) | **Alta** | 4-6 | 4 | ECharts/uPlot, Alarm API, Telemetry API |
| W2 | [Tag Browser / Search](./w2-tag-browser-search.md) | Media | 2-3 | 4 | Entity API, Dashboard Actions |
| W3 | [Tag Detail Panel](./w3-tag-detail-panel.md) | Baja-Media | 1-2 | 4 | Telemetry API, Attributes API |
| W4 | [Event Frame Timeline](./w4-event-frame-timeline.md) | Media | 2-3 | 5 | Alarm API, ECharts markArea |
| W5 | [Ad-hoc Query](./w5-adhoc-query.md) | Media-Alta | 3 | 5 | REST API getTimeseries |
| W6 | [Batch Comparison](./w6-batch-comparison.md) | Media | 2 | 5 | Telemetry API, ECharts |
| W7 | [Tag Configuration](./w7-tag-configuration.md) | Baja-Media | 1-2 | 5 | Attributes API, SheetJS |
| | **TOTAL** | | **15-19** | | |

---

## Widgets Nativos de TB Directamente Utiles

ThingsBoard PE incluye **600+ widgets** organizados en bundles. Para el historiador industrial,
los siguientes son reutilizables **sin desarrollo custom**:

| Widget Nativo | Bundle TB | Uso en Historiador | Notas |
|---------------|-----------|-------------------|-------|
| **Time Series Chart** (ECharts) | Charts | Base del trend viewer; multi-tag, multi-eje Y, zoom slider, export CSV/XLS | Es la base sobre la que W1 extiende |
| **Entities Table** | Entity widgets | Tag browser basico; columnas custom (atributos, latest telemetry), busqueda full-text | W2 puede extender este widget |
| **Alarms Table** | Alarm widgets | Vista principal de alarmas; filtrado status/severity/type, acknowledge/clear inline | Se usa directamente, no requiere custom |
| **Entities Hierarchy** (PE) | Entity widgets | Arbol navegable de entidades por relaciones; navegador de activos | Exclusivo PE, ideal para drill-down |
| **Single Entity Widget** | Cards | Ultimo valor de un tag con formato condicional | Combinar con W3 para panel completo |
| **Multiple Entity Widget** | Cards | Vista de multiples tags en formato card/gauge | Dashboard de tiempo real |
| **Digital Gauge / Analog Gauge** | Gauge widgets | Indicadores visuales para KPIs | Dashboards operacionales |
| **HTML Card / Markdown Card** | Cards | Texto dinamico con variables | Paneles informativos |

### Que es Nativo (reusar) vs Custom (construir)

**Reusar directamente:**
- Alarmas: Alarms Table nativo cubre el 90% del caso de uso
- Jerarquia: Entities Hierarchy (PE) para navegacion de activos
- Tiempo real: Gauges, cards, single/multiple entity widgets
- Exportacion basica: CSV/XLS integrado en Time Series Chart nativo

**Construir custom (los 7 widgets de este directorio):**
- Trend viewer industrial con zoom rubber-band, crosshairs sincronizados, progressive loading
- Tag browser con busqueda avanzada y add-to-trend
- Panel de detalle de tag con sparkline y estadisticas
- Timeline de eventos con colores por severidad
- Consulta ad-hoc con formulario de agregacion
- Comparacion de periodos lado a lado
- Configuracion de tags con validacion y bulk import

---

## Arquitectura de Desarrollo

### Framework Extensions (TB v3.6+)

Los widgets complejos (especialmente W1) se desarrollan como **componentes Angular** compilados
en bundles `.js` usando el framework Extensions de ThingsBoard. Esto permite:

- TypeScript con tipado estricto
- RxJS para manejo reactivo de datos
- State management sofisticado
- Dependencias NPM (ECharts, uPlot, SheetJS)
- Testing con Jasmine/Karma

### Widget Editor Integrado

Para widgets mas simples (W3, W7), el **Widget Editor** de TB ofrece un mini-IDE con:

- HTML/CSS/JS en un solo archivo
- Lifecycle hooks: `onInit`, `onDataUpdated`, `onResize`, `onDestroy`
- Acceso al contexto: `self.ctx.data`, `self.ctx.datasources`
- CDN para librerias externas

### Comunicacion entre Widgets

Los widgets se comunican via **Dashboard Actions** y **State Parameters**:

```
W2 (Tag Browser) --[tagsSelected]--> W1 (Trend Viewer)
W1 (Trend Viewer) --[tagClicked]---> W3 (Tag Detail)
W4 (Timeline) ------[timeRange]----> W1 (Trend Viewer)
```

---

## Fases de Implementacion

### Fase 4 — Widgets Core (4-6 semanas)

| Orden | Widget | Semanas | Prerrequisitos |
|-------|--------|---------|----------------|
| 1 | W1: Industrial Trend Viewer | 4-6 | Device Profiles, Alarm Rules configuradas |
| 2 | W2: Tag Browser / Search | 2-3 | Asset hierarchy creada |
| 3 | W3: Tag Detail Panel | 1-2 | Atributos de tags definidos |

### Fase 5 — Widgets Avanzados (2-3 semanas)

| Orden | Widget | Semanas | Prerrequisitos |
|-------|--------|---------|----------------|
| 4 | W4: Event Frame Timeline | 2-3 | Alarm rules operativas |
| 5 | W5: Ad-hoc Query | 3 | W1 como referencia de patron |
| 6 | W6: Batch Comparison | 2 | W1 como base de graficos |
| 7 | W7: Tag Configuration | 1-2 | Schema de atributos definido |

---

## Dependencias entre Widgets

```
W2 (Tag Browser) ────► W1 (Trend Viewer) ◄──── W4 (Timeline)
       │                      │                      │
       ▼                      ▼                      │
W3 (Tag Detail)         W6 (Batch Comp.)             │
                              │                      │
                              ▼                      ▼
                        W5 (Ad-hoc Query)      Alarm API
                              │
                              ▼
                        W7 (Tag Config)
```

**W1 (Industrial Trend Viewer)** es el widget central y mas critico. Los demas widgets
envian datos hacia el o consumen patrones establecidos por el.
