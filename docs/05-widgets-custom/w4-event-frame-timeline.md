# W4 — Event Frame Timeline

> **Fuente**: [`prmpt.md`](../../prmpt.md) Seccion 2 y 6
> **Complejidad**: Media (2-3 semanas)
> **Tipo widget**: `alarm`
> **FQN**: `historian.event_timeline`

---

## Descripcion

El **Event Frame Timeline** muestra una linea de tiempo horizontal de eventos y alarmas del
historiador, coloreadas por severidad. Cada bloque en la linea temporal representa una alarma
con su duracion (startTs a endTs). Al hacer click en un evento se despliega su detalle completo.

Este widget implementa la funcionalidad de "Event Frames" de PI System usando el sistema de
alarmas de ThingsBoard como backend. Las alarmas de TB almacenan nativamente `startTs`, `endTs`,
`type`, severidad (5 niveles), y un campo `details` JSON libre — esto mapea al modelo de
Event Frames para la mayoria de los casos de uso de monitoreo de proceso.

---

## Fuentes de Datos (APIs)

| API | Endpoint | Uso |
|-----|----------|-----|
| Alarm API | `GET /api/alarm/{entityType}/{entityId}?searchStatus=ANY&startTime=&endTime=` | Consulta de alarmas por entidad y rango temporal |
| Alarm API | `GET /api/alarm/{entityType}/{entityId}?typeList=&severityList=&statusList=` | Filtros por tipo, severidad, estado |
| Alarm API | `GET /api/alarm/info/{alarmId}` | Detalle completo de una alarma |
| Telemetry API | `GET /api/plugins/telemetry/DEVICE/{id}/values/timeseries` | Valores de proceso durante el evento |

### Parametros de Query Principales

```
GET /api/alarm/{entityType}/{entityId}
  ?searchStatus=ANY           // ACTIVE, CLEARED, ACK, UNACK, ANY
  &startTime={epochMs}        // Inicio del rango
  &endTime={epochMs}          // Fin del rango
  &typeList=HH,H,L,LL        // Filtrar por tipos de alarma
  &severityList=CRITICAL,MAJOR // Filtrar por severidad
  &statusList=ACTIVE_UNACK    // Filtrar por estado
  &pageSize=100               // Paginacion
  &page=0
  &sortProperty=startTs
  &sortOrder=DESC
```

---

## Funcionalidades Clave

### 1. Timeline Horizontal

Representacion visual como linea de tiempo con bloques horizontales:

```
09:00    10:00    11:00    12:00    13:00    14:00    15:00
─────────────────────────────────────────────────────────
TT-101  ████████             ███████████
PT-102       ██████
FIC-103                              ████
─────────────────────────────────────────────────────────
        CRIT    MAJOR       MINOR    CRIT
```

Cada fila corresponde a una entidad (device/tag). Los bloques se extienden desde `startTs`
hasta `endTs` (o hasta el momento actual si la alarma sigue activa).

### 2. Colores por Severidad

| Severidad | Color | Hex | Prioridad Visual |
|-----------|-------|-----|------------------|
| CRITICAL | Rojo | `#FF4444` | Maxima — siempre visible sobre otros |
| MAJOR | Naranja | `#FF8C00` | Alta |
| MINOR | Amarillo | `#FFD700` | Media |
| WARNING | Azul | `#4488FF` | Baja |
| INDETERMINATE | Gris | `#999999` | Minima |

### 3. Renderizado con ECharts markArea

```javascript
// Configuracion ECharts para timeline
option = {
  xAxis: {
    type: 'time',
    min: startTime,
    max: endTime
  },
  yAxis: {
    type: 'category',
    data: entityNames  // ['TT-101', 'PT-102', 'FIC-103']
  },
  series: [{
    type: 'custom',
    renderItem: (params, api) => {
      const startX = api.coord([alarm.startTs, entityIndex])[0];
      const endX = api.coord([alarm.endTs || Date.now(), entityIndex])[0];
      const y = api.coord([0, entityIndex])[1];
      return {
        type: 'rect',
        shape: { x: startX, y: y - barHeight/2, width: endX - startX, height: barHeight },
        style: { fill: severityColor(alarm.severity), opacity: 0.8 }
      };
    },
    data: alarmData
  }]
};
```

Alternativa: usar ECharts tipo `heatmap` custom o serie `bar` horizontal con posiciones calculadas.

### 4. Click para Detalle del Evento

Al hacer click en un bloque de alarma, se abre un panel/popup con:

| Campo | Fuente | Formato |
|-------|--------|---------|
| Tipo de alarma | `alarm.type` | String (ej: "HighHigh") |
| Severidad | `alarm.severity` | Badge coloreado |
| Estado | `alarm.status` | ACTIVE_UNACK / ACTIVE_ACK / CLEARED_UNACK / CLEARED_ACK |
| Inicio | `alarm.startTs` | `dd/MM/yyyy HH:mm:ss.SSS` |
| Fin | `alarm.endTs` | `dd/MM/yyyy HH:mm:ss.SSS` o "ACTIVA" |
| Duracion | `endTs - startTs` | `Xh Ym Zs` |
| Entidad | `alarm.originatorName` | Nombre del device/tag |
| Detalles | `alarm.details` (JSON) | Tabla key-value del JSON |

El campo `details` contiene valores contextuales capturados al momento del trigger:

```json
{
  "PV": 523.5,
  "SP": 450.0,
  "delta": 73.5,
  "rate": 2.1
}
```

### 5. Filtros Interactivos

Panel de filtros en la parte superior del widget:

- **Severidad**: Checkboxes para CRITICAL, MAJOR, MINOR, WARNING
- **Estado**: Dropdown con ACTIVE, CLEARED, ANY
- **Tipo**: Multi-select con tipos de alarma definidos
- **Rango temporal**: Selector de fecha/hora inicio y fin
- **Entidades**: Multi-select de tags/devices a incluir

### 6. Zoom y Navegacion

- **Zoom horizontal**: Mouse wheel sobre el eje X (ECharts `dataZoom: inside`)
- **Pan**: Click + drag horizontal
- **Click en evento**: Sincronizar rango temporal con W1 (Trend Viewer)

```javascript
// Al hacer click en un evento, enviar rango temporal a W1
const action = {
  timeRange: {
    startTs: alarm.startTs - 300000,  // 5 min antes del evento
    endTs: (alarm.endTs || Date.now()) + 300000  // 5 min despues
  },
  entityId: alarm.originator.id
};
self.ctx.actionsApi.handleWidgetAction(event, descriptors['viewInTrend'], action);
```

---

## Enfoque de Implementacion

### Arquitectura del Widget

```
w4-event-timeline/
├── event-timeline.component.ts     // Componente principal
├── event-timeline.module.ts
├── components/
│   ├── timeline-chart.component.ts  // ECharts timeline render
│   ├── filter-panel.component.ts    // Filtros de severidad/estado/tipo
│   └── event-detail.component.ts    // Popup de detalle
├── services/
│   ├── alarm-query.service.ts       // Queries a Alarm API
│   └── alarm-formatter.service.ts   // Formato de duracion, colores
└── models/
    └── alarm-event.model.ts         // Interface de evento
```

### Flujo de Datos

1. Al inicializar, query a Alarm API con rango temporal del dashboard
2. Agrupar alarmas por entidad (device) para las filas
3. Renderizar bloques coloreados con ECharts custom series
4. Suscribir a actualizaciones de alarmas via WebSocket para tiempo real
5. Al cambiar filtros, re-query y re-renderizar

---

## Dependencias

| Dependencia | Version | Motivo |
|-------------|---------|--------|
| Apache ECharts | 5.5+ | Renderizado de timeline con custom series |
| Angular | 17+ | Framework TB Extensions |
| RxJS | 7.x | Manejo de streams de alarmas |

---

## Riesgos y Mitigaciones

| Riesgo | Probabilidad | Mitigacion |
|--------|-------------|------------|
| Alto volumen de alarmas satura la vista | Media | Paginacion; agrupar por tipo; colapsar periodos sin eventos |
| Alarm API no filtra por contenido de `details` | Alta | Filtro client-side post-query |
| Rendimiento con >1000 alarmas en rango visible | Media | Virtualizar: renderizar solo alarmas visibles en viewport |
| Alarmas activas sin `endTs` | Baja | Renderizar hasta `Date.now()` con patron de animacion |
