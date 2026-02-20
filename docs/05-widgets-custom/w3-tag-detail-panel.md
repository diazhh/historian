# W3 — Tag Detail Panel

> **Fuente**: [`prmpt.md`](../../prmpt.md) Seccion 6 — Tabla de widgets custom
> **Complejidad**: Baja-Media (1-2 semanas)
> **Tipo widget**: `latest`
> **FQN**: `historian.tag_detail`

---

## Descripcion

El **Tag Detail Panel** muestra informacion completa de un tag individual: ultimo valor con
calidad y timestamp, todos los atributos configurados (descripcion, unidades, rangos, setpoints,
limites de alarma), un mini-trend (sparkline) de las ultimas 24 horas, y estadisticas basicas
(min, max, avg, stddev) sobre el mismo periodo.

Funciona como panel lateral o popup que se activa al hacer click en un tag desde el Tag Browser
(W2) o desde el Trend Viewer (W1). Es el equivalente a la "Tag Properties" de PI System.

---

## Fuentes de Datos (APIs)

| API | Endpoint | Uso |
|-----|----------|-----|
| Telemetry API | `GET /api/plugins/telemetry/DEVICE/{id}/values/timeseries?keys=PV&startTs=&endTs=` | Datos 24h para sparkline |
| Telemetry API (latest) | `GET /api/plugins/telemetry/DEVICE/{id}/values/timeseries?keys=PV` (latest) | Ultimo valor |
| Attributes API | `GET /api/plugins/telemetry/DEVICE/{id}/values/attributes/SERVER_SCOPE` | Atributos server-side |
| Attributes API | `GET /api/plugins/telemetry/DEVICE/{id}/values/attributes/SHARED_SCOPE` | Atributos compartidos |
| Telemetry WS | `ws(s)://host/api/ws/plugins/telemetry?token=$JWT` | Actualizacion en tiempo real |

---

## Funcionalidades Clave

### 1. Ultimo Valor con Calidad

Seccion superior del panel con formato prominente:

```
┌─────────────────────────────────────┐
│  TT-101 — Temperatura Reactor       │
│                                     │
│     450.23 °C                       │
│     ● Good    15:32:45 20/02/2026   │
└─────────────────────────────────────┘
```

| Campo | Fuente | Formato |
|-------|--------|---------|
| Nombre | `device.name` | Bold, 16px |
| Descripcion | Atributo `description` | Subtitulo gris |
| Valor | Latest telemetry `PV` | Grande (32px), precision segun `ss_precision` |
| Unidad | Atributo `ss_units` | Junto al valor |
| Calidad | Atributo `quality_code` | Circulo coloreado: verde/amarillo/rojo |
| Timestamp | Timestamp del PV | Formato `HH:mm:ss dd/MM/yyyy` |

Coloreo del valor segun limites de alarma:
- **Rojo**: valor > `ss_alarmHH` o valor < `ss_alarmLL`
- **Naranja**: valor > `ss_alarmH` o valor < `ss_alarmL`
- **Verde**: valor dentro de rango normal

### 2. Tabla de Atributos

Todos los server-side attributes del tag:

| Atributo | Clave | Ejemplo | Editable |
|----------|-------|---------|----------|
| Descripcion | `description` | "Temp reactor principal" | No (ver W7) |
| Unidades | `ss_units` | "degC" | No |
| Rango bajo | `ss_rangeLow` | 0 | No |
| Rango alto | `ss_rangeHigh` | 600 | No |
| Setpoint | `ss_setpoint` | 450 | No |
| Deadband | `ss_deadband` | 0.5 | No |
| Alarma HH | `ss_alarmHH` | 520 | No |
| Alarma H | `ss_alarmH` | 480 | No |
| Alarma L | `ss_alarmL` | 400 | No |
| Alarma LL | `ss_alarmLL` | 350 | No |
| Scan Rate | `ss_scanRate` | 1000 (ms) | No |
| Tipo de tag | `ss_tagType` | "AI" (Analog Input) | No |
| Device Profile | (metadata) | "AnalogInput" | No |

Link a W7 (Tag Configuration) para editar atributos.

### 3. Mini-Trend (Sparkline) 24 Horas

Grafico compacto tipo sparkline que muestra las ultimas 24 horas del tag:

- Dimensiones: 100% ancho del panel x 80px alto
- Sin ejes ni leyenda (solo la linea de datos)
- Linea de setpoint como referencia horizontal punteada
- Bandas de rango normal (verde claro) y alarma (rojo claro)
- Click en sparkline abre W1 (Trend Viewer) con este tag

```javascript
// Query para sparkline: 24h con agregacion AVG@1min = 1440 puntos
const params = {
  keys: 'PV',
  startTs: Date.now() - 86400000, // 24h atras
  endTs: Date.now(),
  interval: 60000,   // 1 minuto
  agg: 'AVG',
  limit: 1440
};
```

Implementacion con ECharts en modo minimalista o con un `<canvas>` custom ligero.

### 4. Estadisticas 24 Horas

Tabla compacta de estadisticas calculadas sobre los datos del sparkline:

| Estadistica | Calculo | Formato |
|-------------|---------|---------|
| Minimo | `Math.min(...values)` | Valor + timestamp de ocurrencia |
| Maximo | `Math.max(...values)` | Valor + timestamp de ocurrencia |
| Promedio | `values.reduce((a,b) => a+b) / values.length` | Valor con precision |
| Desv. Estandar | `sqrt(sum((x - avg)^2) / n)` | Valor con precision |
| Muestras | `values.length` | Entero |

Alternativamente, usar agregaciones server-side con la API:

```javascript
// Queries paralelas para estadisticas
const [minData, maxData, avgData] = await Promise.all([
  fetchTimeseries({ keys: 'PV', agg: 'MIN', interval: 86400000 }),
  fetchTimeseries({ keys: 'PV', agg: 'MAX', interval: 86400000 }),
  fetchTimeseries({ keys: 'PV', agg: 'AVG', interval: 86400000 })
]);
```

---

## Enfoque de Implementacion

### Arquitectura del Widget

```
w3-tag-detail/
├── tag-detail.component.ts       // Componente principal
├── tag-detail.module.ts
├── components/
│   ├── value-display.component.ts  // Ultimo valor con calidad
│   ├── attributes-table.component.ts // Tabla de atributos
│   ├── sparkline.component.ts      // Mini-trend 24h
│   └── stats-card.component.ts     // Estadisticas resumidas
└── services/
    └── tag-data.service.ts         // Fetch telemetry + attributes
```

### Widget Editor vs Extension

Dada la complejidad **Baja-Media**, este widget puede implementarse directamente en el
**Widget Editor** de TB sin necesidad del framework Extensions completo:

- HTML: layout con sections para valor, atributos, sparkline, stats
- CSS: estilos responsivos con flexbox
- JS: lifecycle hooks `onInit`, `onDataUpdated`, `onDestroy`
- Librerias via CDN: ECharts (para sparkline) ya disponible en TB

### Activacion por Dashboard Action

```javascript
// Recibir evento desde W2 (Tag Browser) o W1 (Trend Viewer)
self.ctx.defaultSubscription.subscribeForEntity(
  deviceId,
  ['PV'],  // keys
  'LATEST' // tipo
);
```

---

## Dependencias

| Dependencia | Version | Motivo |
|-------------|---------|--------|
| ECharts | 5.5+ | Sparkline (ya disponible en TB) |
| Angular | 17+ | Si se usa Extension framework |

**Sin dependencias externas adicionales** si se implementa via Widget Editor.

---

## Riesgos y Mitigaciones

| Riesgo | Probabilidad | Mitigacion |
|--------|-------------|------------|
| Atributos no estandarizados entre tags | Media | Definir schema en Device Profile; validar en W7 |
| Latencia en carga de sparkline | Baja | AVG@1min = 1440 puntos, query rapido |
| Stddev no disponible server-side | Alta | Calcular client-side sobre datos del sparkline |
| Layout responsive en panel lateral estrecho | Media | Disenar mobile-first; sparkline se adapta al ancho |
