# W1 — Industrial Trend Viewer

> **Fuente**: [`prmpt.md`](../../prmpt.md) Seccion 1 y 6
> **Complejidad**: Alta (4-6 semanas)
> **Tipo widget**: `timeseries`
> **FQN**: `historian.trend_viewer`

---

## Descripcion

El **Industrial Trend Viewer** es el widget **mas importante** del historiador. Replica la
funcionalidad core de PI Vision / PI ProcessBook: visualizacion de series temporales con
zoom interactivo, crosshairs sincronizados entre paneles, carga progresiva de datos, y
overlay de eventos/alarmas. Es la pieza central sobre la que los demas widgets se apoyan.

ThingsBoard nativo ofrece Time Series Chart (ECharts) con multi-tag, multi-eje Y, y export,
pero carece de: rubber-band zoom, crosshairs sincronizados, progressive loading, overlay de
alarmas, y transicion seamless entre tiempo real e historico.

---

## Fuentes de Datos (APIs)

| API | Endpoint | Uso |
|-----|----------|-----|
| Telemetry REST | `GET /api/plugins/telemetry/{entityType}/{entityId}/values/timeseries` | Datos historicos con agregacion |
| Telemetry WS | `ws(s)://host/api/ws/plugins/telemetry?token=$JWT` | Streaming tiempo real |
| Alarm API | `GET /api/alarm/{entityType}/{entityId}?searchStatus=ANY&startTime=&endTime=` | Overlay de eventos |
| Attributes API | `GET /api/plugins/telemetry/{entityType}/{entityId}/values/attributes/SERVER_SCOPE` | Metadatos: unidades, rangos, setpoints |

---

## Funcionalidades Clave

### 1. Libreria de Graficos: ECharts o uPlot

**ECharts** (opcion principal):
- Ya integrada nativamente en TB; familiaridad del equipo
- Soporte completo de multi-eje Y, tooltips, leyendas interactivas
- `dataZoom` tipo `inside` para zoom con mouse wheel y drag-to-pan
- `markArea` para overlay de bandas de alarmas/eventos
- `echarts.connect()` para sincronizar crosshairs entre instancias

**uPlot** (alternativa para alto rendimiento):
- Renderiza **100K+ puntos** con aceleracion GPU
- 10-50x mas rapido que ECharts para datasets >50K puntos
- Canvas-based, minimo overhead de memoria
- Ideal si el rendimiento con grandes volumenes es la prioridad

**Recomendacion**: Iniciar con ECharts por su ecosistema maduro. Migrar a uPlot
solo si se confirman problemas de rendimiento con >50K puntos en produccion.

### 2. Zoom Rubber-Band y Navegacion

```javascript
// Configuracion ECharts dataZoom
dataZoom: [
  {
    type: 'inside',        // Zoom con mouse wheel + drag
    xAxisIndex: [0, 1],    // Aplica a todos los ejes X
    filterMode: 'none'     // No filtra datos, solo ajusta vista
  },
  {
    type: 'slider',        // Slider visible en la parte inferior
    xAxisIndex: [0, 1],
    bottom: 10
  }
]
```

- **Mouse wheel**: zoom in/out centrado en posicion del cursor
- **Click + drag**: rubber-band selection para zoom a region especifica
- **Doble click**: reset a vista completa
- **Pan**: drag horizontal manteniendo presionado Shift

### 3. Crosshairs Sincronizados

```javascript
// Conectar multiples instancias ECharts
const chart1 = echarts.init(dom1);
const chart2 = echarts.init(dom2);
const chart3 = echarts.init(dom3);

// Grupo de sincronizacion
echarts.connect([chart1, chart2, chart3]);

// Ahora tooltip, dataZoom y brush se sincronizan automaticamente
```

El widget crea un **contenedor multi-panel**: N sub-graficos ECharts apilados verticalmente,
conectados via `echarts.connect()`. El framework de widgets de TB aisla instancias por defecto;
la solucion es un widget unico que gestiona internamente multiples instancias.

### 4. Carga Progresiva de Datos (Progressive Loading)

Estrategia en dos fases:
1. **Vista inicial**: fetch datos agregados (AVG al intervalo apropiado) para todo el rango
2. **Al hacer zoom-in**: fetch datos mas granulares solo para la ventana visible

### 5. Agregacion Adaptativa

| Rango temporal | Agregacion | Intervalo | Puntos max aprox. |
|----------------|------------|-----------|-------------------|
| < 1 hora | NONE (crudo) | N/A | ~3,600 |
| 1 - 24 horas | NONE (hasta 10K puntos) | N/A | ~10,000 |
| 1 - 7 dias | AVG | 1 minuto | ~10,080 |
| 7 - 30 dias | AVG | 5 minutos | ~8,640 |
| 30 dias - 1 anio | AVG | 1 hora | ~8,760 |
| > 1 anio | AVG | 1 dia | variable |

**Nota**: `DATABASE_TS_MAX_INTERVALS` (default 700) limita sub-queries por llamada API.
Para rangos amplios, dividir el rango temporal y usar el ultimo timestamp como nuevo `startTs`.

### 6. Overlay de Alarmas/Eventos

```javascript
// ECharts markArea para bandas de alarma
series: [{
  markArea: {
    data: alarms.map(a => [{
      xAxis: a.startTs,
      itemStyle: { color: severityColor(a.severity), opacity: 0.2 }
    }, {
      xAxis: a.endTs || Date.now()
    }])
  }
}]
```

Colores por severidad:
- `CRITICAL` = rojo (#FF4444, opacity 0.3)
- `MAJOR` = naranja (#FF8C00, opacity 0.25)
- `MINOR` = amarillo (#FFD700, opacity 0.2)
- `WARNING` = azul (#4488FF, opacity 0.15)

### 7. Modo Real-Time + Historico Seamless

- **Strip chart**: ventana rodante via WebSocket subscription (`tsSubCmds` con `timeWindow`)
- **Pausa**: desuscribirse del WS, congelar vista actual
- **Rewind**: cambiar a modo historico, hacer query REST con rango fijo
- **Reanudacion**: re-suscribirse al WS, transicion suave al presente
- Boton **LIVE** con indicador visual (LED verde parpadeante)

### 8. Multi-Tag, Multi-Eje Y

- Cada engineering unit (degC, PSI, m3/h, %) obtiene un eje Y independiente
- Asignacion automatica: tags con misma unidad comparten eje
- Maximo recomendado: 4 ejes Y (2 izquierda + 2 derecha)
- Leyenda interactiva: click para ocultar/mostrar series individuales

### 9. Exportacion

- **CSV**: datos crudos con headers (timestamp, tag1, tag2, ...)
- **XLS/XLSX**: via SheetJS, con formato de columnas y filtros
- **PNG**: captura del grafico via `chart.getDataURL({ type: 'png' })`

---

## Enfoque de Implementacion

### Arquitectura

```
ThingsBoard Extension (Angular bundle .js)
├── trend-viewer.component.ts     // Componente principal
├── trend-viewer.module.ts        // Modulo Angular
├── services/
│   ├── data-fetcher.service.ts   // Progressive loading + agregacion
│   ├── alarm-overlay.service.ts  // Query y render de alarmas
│   └── realtime.service.ts       // WebSocket management
├── models/
│   ├── chart-config.model.ts     // Configuracion de ejes, series
│   └── aggregation.model.ts      // Reglas de agregacion adaptativa
└── utils/
    ├── time-utils.ts             // Formato timestamps, rangos
    └── export-utils.ts           // CSV/XLS/PNG
```

### Lifecycle del Widget TB

```typescript
onInit() {
  // Inicializar instancias ECharts
  // Configurar dataZoom, tooltips, ejes
  // echarts.connect() entre paneles
}

onDataUpdated() {
  // Actualizar series con datos nuevos
  // Recalcular overlay de alarmas si cambia el rango
}

onResize() {
  // chart.resize() para cada instancia
}

onDestroy() {
  // Desuscribir WebSocket
  // chart.dispose() para cada instancia
}
```

---

## Dependencias

| Dependencia | Version | Motivo |
|-------------|---------|--------|
| Apache ECharts | 5.5+ | Libreria de graficos principal |
| uPlot | 1.6+ | Alternativa para >50K puntos (opcional) |
| SheetJS (xlsx) | 0.20+ | Exportacion Excel |
| RxJS | 7.x | Manejo reactivo de streams de datos |
| Angular | 17+ | Framework de TB Extensions |

---

## Riesgos y Mitigaciones

| Riesgo | Probabilidad | Mitigacion |
|--------|-------------|------------|
| Rendimiento con >50K puntos en ECharts | Media | Implementar downsampling client-side; evaluar migracion a uPlot |
| `DATABASE_TS_MAX_INTERVALS` limita queries | Alta | Dividir queries por sub-rangos temporales |
| Aislamiento de widgets TB impide `echarts.connect()` | Alta | Widget unico multi-panel que gestiona instancias internamente |
| Latencia en carga progresiva | Media | Mostrar datos agregados inmediatamente; refinar en background |
| Memoria con muchos tags simultaneos | Baja | Limitar a 20 tags por widget; paginacion de paneles |
