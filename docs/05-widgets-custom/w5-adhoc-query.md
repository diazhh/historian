# W5 — Ad-hoc Query

> **Fuente**: [`prmpt.md`](../../prmpt.md) Seccion 6 y 8
> **Complejidad**: Media-Alta (3 semanas)
> **Tipo widget**: `static` / `timeseries`
> **FQN**: `historian.adhoc_query`

---

## Descripcion

El **Ad-hoc Query** es un formulario interactivo que permite a los usuarios consultar datos
historicos de forma flexible: seleccionar tags, definir rango temporal, elegir funcion de
agregacion (NONE/AVG/MIN/MAX/SUM/COUNT) e intervalo, y visualizar resultados como tabla y/o
grafico. Incluye exportacion a CSV/Excel.

Este widget cubre el caso de uso donde el operador o ingeniero necesita "extraer datos" del
historiador para analisis puntual — equivalente a PI DataLink en Excel o las queries ad-hoc
de PI Vision.

---

## Fuentes de Datos (APIs)

| API | Endpoint | Uso |
|-----|----------|-----|
| Telemetry REST | `GET /api/plugins/telemetry/{entityType}/{entityId}/values/timeseries` | Query principal de datos historicos |
| Entity API | `GET /api/tenant/devices?textSearch=` | Busqueda de tags para seleccion |
| Attributes API | `GET /api/plugins/telemetry/DEVICE/{id}/values/attributes/SERVER_SCOPE` | Metadatos: unidades, precision |

### Parametros Clave de la API de Telemetria

```
GET /api/plugins/telemetry/DEVICE/{deviceId}/values/timeseries
  ?keys=PV                    // Claves de telemetria
  &startTs={epochMs}          // Inicio del rango
  &endTs={epochMs}            // Fin del rango
  &interval={ms}              // Intervalo de agregacion (0 = sin agregar)
  &agg=AVG                    // Funcion: NONE, AVG, MIN, MAX, SUM, COUNT
  &limit=10000                // Limite de puntos por query
  &orderBy=ASC                // Orden cronologico
```

---

## Funcionalidades Clave

### 1. Formulario de Consulta

| Campo | Tipo de Control | Opciones / Validacion |
|-------|----------------|----------------------|
| Tags | Multi-select con busqueda | Buscar por nombre; max 10 tags simultaneos |
| Fecha/Hora Inicio | Datetime picker | No puede ser posterior a Fin |
| Fecha/Hora Fin | Datetime picker | No puede ser posterior a ahora |
| Funcion de Agregacion | Dropdown | NONE, AVG, MIN, MAX, SUM, COUNT |
| Intervalo | Dropdown + input | 1s, 5s, 10s, 30s, 1min, 5min, 15min, 1h, 1d, Custom |
| Formato de Resultados | Toggle | Tabla, Grafico, Ambos |

Presets rapidos para rango temporal:
- Ultima hora / Ultimas 4 horas / Ultimas 24 horas
- Ultimo dia / Ultima semana / Ultimo mes
- Rango personalizado

### 2. Manejo de DATABASE_TS_MAX_INTERVALS

**Problema critico**: El parametro `DATABASE_TS_MAX_INTERVALS` (default 700) limita el numero
de sub-queries por llamada API. Una query de 1 anio con intervalo de 1 segundo excede este
limite por ordenes de magnitud.

**Estrategia de paginacion temporal**:

```javascript
async function queryWithPagination(deviceId, key, startTs, endTs, interval, agg) {
  const results = [];
  let currentStart = startTs;

  while (currentStart < endTs) {
    // Calcular endTs parcial para no exceder MAX_INTERVALS
    const maxIntervals = 700;
    const partialEnd = Math.min(
      currentStart + (interval * maxIntervals),
      endTs
    );

    const response = await fetchTimeseries({
      entityType: 'DEVICE',
      entityId: deviceId,
      keys: key,
      startTs: currentStart,
      endTs: partialEnd,
      interval: interval,
      agg: agg,
      limit: maxIntervals
    });

    results.push(...response[key]);

    // Usar ultimo timestamp retornado como nuevo startTs
    if (response[key].length > 0) {
      currentStart = response[key][response[key].length - 1].ts + 1;
    } else {
      currentStart = partialEnd;
    }
  }

  return results;
}
```

### 3. Resultados en Tabla

Tabla con columnas dinamicas segun los tags seleccionados:

| Timestamp | TT-101 (degC) | PT-102 (PSI) | FIC-103 (m3/h) |
|-----------|---------------|--------------|----------------|
| 2026-02-20 09:00:00 | 450.23 | 12.51 | 1250.0 |
| 2026-02-20 09:01:00 | 450.45 | 12.48 | 1248.5 |
| ... | ... | ... | ... |

Funcionalidades de la tabla:
- **Ordenamiento** por cualquier columna (click en header)
- **Filtro rapido** por rango de valores en cada columna
- **Resaltado condicional**: valores fuera de rango en rojo
- **Estadisticas en footer**: min, max, avg de cada columna
- **Paginacion**: 100 filas por pagina con scroll virtual

### 4. Resultados en Grafico

Grafico ECharts simplificado (no el Trend Viewer completo) que muestra los resultados:

- Multi-tag con ejes Y independientes por unidad
- Zoom slider para navegar dentro de los resultados
- Sin streaming real-time (solo datos de la query)
- Tooltip con valores de todos los tags en el punto temporal

### 5. Exportacion de Resultados

| Formato | Libreria | Contenido |
|---------|----------|-----------|
| **CSV** | Nativo JS | Headers + datos; separador configurable (coma/punto y coma) |
| **XLSX** | SheetJS | Hoja con formato: headers en bold, columnas con ancho auto, filtros |
| **XLSX Multi-hoja** | SheetJS | Hoja por tag + hoja resumen con estadisticas |

```javascript
// Exportacion Excel con SheetJS
import * as XLSX from 'xlsx';

function exportToExcel(data, tags) {
  const wb = XLSX.utils.book_new();

  // Hoja principal con todos los datos
  const mainSheet = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, mainSheet, 'Datos');

  // Hoja de estadisticas
  const statsData = tags.map(tag => ({
    Tag: tag.name,
    Min: tag.stats.min,
    Max: tag.stats.max,
    Avg: tag.stats.avg,
    Count: tag.stats.count
  }));
  const statsSheet = XLSX.utils.json_to_sheet(statsData);
  XLSX.utils.book_append_sheet(wb, statsSheet, 'Estadisticas');

  XLSX.writeFile(wb, `query_${Date.now()}.xlsx`);
}
```

---

## Enfoque de Implementacion

### Arquitectura del Widget

```
w5-adhoc-query/
├── adhoc-query.component.ts        // Componente principal
├── adhoc-query.module.ts
├── components/
│   ├── query-form.component.ts     // Formulario de consulta
│   ├── results-table.component.ts  // Tabla de resultados
│   ├── results-chart.component.ts  // Grafico de resultados
│   └── export-dialog.component.ts  // Opciones de exportacion
├── services/
│   ├── paginated-query.service.ts  // Query con paginacion temporal
│   ├── tag-selector.service.ts     // Busqueda y seleccion de tags
│   └── export.service.ts           // CSV/Excel export
└── models/
    ├── query-params.model.ts       // Parametros del formulario
    └── query-result.model.ts       // Estructura de resultados
```

### Flujo de Ejecucion

1. Usuario completa formulario y presiona **"Ejecutar Query"**
2. Validar parametros (rango coherente, al menos 1 tag)
3. Mostrar indicador de progreso con estimacion de tiempo
4. Ejecutar queries paginadas en paralelo por cada tag
5. Consolidar resultados por timestamp (merge temporal)
6. Renderizar tabla y/o grafico
7. Habilitar boton de exportacion

### Estimacion de Puntos y Tiempo

Antes de ejecutar, calcular y mostrar al usuario:

```javascript
const totalIntervals = (endTs - startTs) / interval;
const totalQueries = Math.ceil(totalIntervals / 700) * selectedTags.length;
const estimatedTimeMs = totalQueries * 200; // ~200ms por query

// Mostrar advertencia si > 10,000 puntos o > 30s estimado
```

---

## Dependencias

| Dependencia | Version | Motivo |
|-------------|---------|--------|
| Apache ECharts | 5.5+ | Grafico de resultados |
| SheetJS (xlsx) | 0.20+ | Exportacion Excel |
| Angular Material | 17+ | Formulario: datepicker, select, table |
| Angular | 17+ | Framework TB Extensions |

---

## Riesgos y Mitigaciones

| Riesgo | Probabilidad | Mitigacion |
|--------|-------------|------------|
| `DATABASE_TS_MAX_INTERVALS` limita queries | Alta | Paginacion temporal automatica |
| Query de largo rango toma minutos | Media | Barra de progreso; cancelacion; estimacion previa |
| Memoria del browser con >100K puntos en tabla | Media | Virtual scrolling; paginacion client-side |
| Merge temporal de multiples tags con timestamps dispares | Alta | Alinear a grid temporal del intervalo seleccionado |
| Rate limits de API bloqueando queries masivas | Baja | Ejecutar queries secuencialmente con delay de 50ms |
