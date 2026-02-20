# W6 — Batch Comparison

> **Fuente**: [`prmpt.md`](../../prmpt.md) Seccion 6 — Tabla de widgets custom
> **Complejidad**: Media (2 semanas)
> **Tipo widget**: `timeseries`
> **FQN**: `historian.batch_comparison`

---

## Descripcion

El **Batch Comparison** permite comparar los mismos tag(s) en diferentes periodos de tiempo,
mostrando las curvas lado a lado con el eje X alineado en tiempo relativo (desde el inicio de
cada periodo). Incluye estadisticas comparativas (promedio, min, max) para cada periodo.

Este widget es esencial para analisis de batch en procesos industriales: comparar la "receta"
de un lote con otro, identificar desviaciones entre turnos, o evaluar el antes/despues de un
cambio operacional. Equivale a la funcion de "overlay" de PI Vision donde multiples rangos
temporales se superponen en un solo grafico.

---

## Fuentes de Datos (APIs)

| API | Endpoint | Uso |
|-----|----------|-----|
| Telemetry REST | `GET /api/plugins/telemetry/DEVICE/{id}/values/timeseries` | Datos de cada periodo |
| Attributes API | `GET /api/plugins/telemetry/DEVICE/{id}/values/attributes/SERVER_SCOPE` | Metadatos: unidades, rangos |

Se realizan **N llamadas independientes** a la API de Telemetria, una por cada periodo a comparar,
con los mismos tags pero diferentes `startTs`/`endTs`.

---

## Funcionalidades Clave

### 1. Definicion de Periodos

Formulario para definir 2 o mas periodos a comparar:

| Campo | Control | Validacion |
|-------|---------|------------|
| Tag(s) | Multi-select con busqueda | 1-5 tags simultaneos |
| Periodo 1 | Datetime range picker | Inicio < Fin |
| Periodo 2 | Datetime range picker | Inicio < Fin |
| + Periodo N | Boton "Agregar periodo" | Maximo 5 periodos |
| Agregacion | Dropdown | NONE, AVG, MIN, MAX |
| Intervalo | Dropdown | Auto, 1s, 1min, 5min, 1h |

Presets rapidos de comparacion:
- **Turno vs turno**: Hoy 06:00-14:00 vs Ayer 06:00-14:00
- **Semana vs semana**: Esta semana vs semana pasada
- **Mes vs mes**: Este mes vs mes anterior
- **Batch vs batch**: Definir inicio/fin de cada lote manualmente

### 2. Eje X Alineado (Tiempo Relativo)

La clave del widget es la **alineacion temporal**: todas las curvas comienzan en t=0
(inicio de su respectivo periodo) y se grafican en tiempo relativo.

```javascript
// Convertir timestamps absolutos a tiempo relativo
function toRelativeTime(data, periodStartTs) {
  return data.map(point => ({
    ts: point.ts - periodStartTs,  // Offset desde inicio del periodo
    value: point.value
  }));
}

// Ejemplo:
// Periodo 1: 2026-02-20 06:00 a 2026-02-20 14:00
// Periodo 2: 2026-02-19 06:00 a 2026-02-19 14:00
// Ambos se grafican de 0h a 8h en el eje X
```

Formato del eje X: `+0h`, `+1h`, `+2h`, ... o `+0:00`, `+0:30`, `+1:00` para rangos cortos.

### 3. Grafico Superpuesto

```javascript
// Configuracion ECharts para comparacion
option = {
  legend: {
    data: ['TT-101 (20/Feb)', 'TT-101 (19/Feb)', 'TT-101 (18/Feb)']
  },
  xAxis: {
    type: 'value',
    name: 'Tiempo relativo',
    axisLabel: {
      formatter: (ms) => formatDuration(ms)  // "+2h 30m"
    }
  },
  yAxis: {
    type: 'value',
    name: 'degC'
  },
  series: periods.map((period, i) => ({
    name: `${tagName} (${formatDate(period.startTs)})`,
    type: 'line',
    data: toRelativeTime(period.data, period.startTs),
    lineStyle: { type: i === 0 ? 'solid' : 'dashed' }
  }))
};
```

Convenciones visuales:
- **Periodo 1** (referencia): linea solida, color primario
- **Periodo 2+**: lineas punteadas/discontinuas, colores secundarios
- Tooltip muestra valores de todos los periodos en el mismo punto relativo
- Banda de rango normal (setpoint +/- deadband) como area sombreada

### 4. Tabla de Estadisticas Comparativas

| Estadistica | Periodo 1 (20/Feb) | Periodo 2 (19/Feb) | Diferencia | % |
|-------------|--------------------|--------------------|-----------|---|
| Promedio | 450.23 degC | 448.91 degC | +1.32 | +0.29% |
| Minimo | 445.10 degC | 443.80 degC | +1.30 | +0.29% |
| Maximo | 456.80 degC | 455.20 degC | +1.60 | +0.35% |
| Desv. Estandar | 2.45 | 3.12 | -0.67 | -21.5% |
| Muestras | 4,800 | 4,790 | +10 | +0.2% |

Coloreo de la columna "Diferencia":
- **Verde**: desviacion < 1% respecto a referencia
- **Amarillo**: desviacion 1-5%
- **Rojo**: desviacion > 5%

### 5. Vista Side-by-Side (Alternativa)

Ademas del overlay (curvas superpuestas), ofrecer vista de graficos lado a lado:

```
┌────────────────────┐ ┌────────────────────┐
│  Periodo 1 (20/Feb) │ │  Periodo 2 (19/Feb) │
│  TT-101             │ │  TT-101             │
│  ┌──────────────┐   │ │  ┌──────────────┐   │
│  │   ~~~/~~~    │   │ │  │   ~~~/~~~    │   │
│  └──────────────┘   │ │  └──────────────┘   │
│  AVG: 450.23        │ │  AVG: 448.91        │
└────────────────────┘ └────────────────────┘
```

Los graficos side-by-side comparten la misma escala Y para comparacion visual directa.

---

## Enfoque de Implementacion

### Arquitectura del Widget

```
w6-batch-comparison/
├── batch-comparison.component.ts    // Componente principal
├── batch-comparison.module.ts
├── components/
│   ├── period-selector.component.ts  // Formulario de periodos
│   ├── overlay-chart.component.ts    // Grafico superpuesto
│   ├── sidebyside-chart.component.ts // Vista lado a lado
│   └── stats-table.component.ts      // Tabla comparativa
├── services/
│   ├── period-data.service.ts        // Fetch datos por periodo
│   └── comparison-stats.service.ts   // Calculo de estadisticas
└── models/
    ├── period.model.ts               // Definicion de periodo
    └── comparison-result.model.ts    // Resultado comparativo
```

### Flujo de Ejecucion

1. Usuario selecciona tag(s) y define 2+ periodos
2. Ejecutar queries a Telemetry API en **paralelo** (una por periodo)
3. Convertir timestamps a tiempo relativo por periodo
4. Renderizar grafico overlay con ECharts
5. Calcular estadisticas comparativas
6. Mostrar tabla de estadisticas debajo del grafico

### Patron de Queries Paralelas

```javascript
// Fetch todos los periodos en paralelo
const periodPromises = periods.map(period =>
  fetchTimeseries({
    entityId: deviceId,
    keys: 'PV',
    startTs: period.startTs,
    endTs: period.endTs,
    interval: selectedInterval,
    agg: selectedAgg,
    limit: 10000
  })
);

const allData = await Promise.all(periodPromises);
```

---

## Dependencias

| Dependencia | Version | Motivo |
|-------------|---------|--------|
| Apache ECharts | 5.5+ | Graficos de comparacion |
| Angular Material | 17+ | Formulario de periodos |
| Angular | 17+ | Framework TB Extensions |

---

## Riesgos y Mitigaciones

| Riesgo | Probabilidad | Mitigacion |
|--------|-------------|------------|
| Periodos de diferente duracion distorsionan comparacion | Media | Advertencia al usuario; opcion de truncar al periodo mas corto |
| Datos con timestamps irregulares no alinean bien | Media | Interpolar o alinear al grid del intervalo de agregacion |
| Muchos periodos (>3) saturan visualmente el grafico | Baja | Limitar a 5 periodos; colores bien diferenciados |
| Carga de datos lenta para periodos largos | Media | Reutilizar paginacion temporal de W5 |
