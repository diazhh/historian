> ⚠️ **LEGACY** — Este archivo ha sido migrado a `docs/05-widgets-custom/`. La documentación canónica está en:
> - [docs/05-widgets-custom/README.md](./docs/05-widgets-custom/README.md) — Resumen de 16 módulos
> - [docs/05-widgets-custom/servicios-compartidos.md](./docs/05-widgets-custom/servicios-compartidos.md)
> - Specs individuales: `docs/05-widgets-custom/m01-tag-browser.md` ... `m16-batch-event-analysis.md`

# Especificación de Módulos — Historiador ThingsBoard PE

**Para**: Desarrollo de widgets con `thingsboard/thingsboard-extensions`
**Framework**: Angular 18 + TypeScript

---

## 1. Dónde Vive Cada Cosa

### Lo que se hace en ThingsBoard (configuración, no código)

| Qué | Dónde en ThingsBoard | Quién lo hace |
|-----|---------------------|---------------|
| Crear Assets (jerarquía de planta) | Admin TB → Entities → Assets | Tú, manualmente o por script |
| Crear Devices (1 por tag) | Admin TB → Entities → Devices | Tú, uno por cada tag |
| Crear relaciones (Asset Contains Device) | Admin TB → Asset → Relations | Tú |
| Alarm rules (límites HH/H/L/LL) | Admin TB → Device Profiles → Alarm Rules | Tú |
| Calculated Fields (quality a texto, etc.) | Admin TB → Device Profiles → Calculated Fields | Tú |
| Rule Chains (cálculos multi-device) | Admin TB → Rule Chains | Tú |
| Entity Groups (categorización) | Admin TB → Entity Groups | Tú |

### Lo que se hace en el proyecto de extensiones (código Angular)

| Qué | Dónde en el proyecto | Cómo |
|-----|---------------------|------|
| Servicios compartidos | `src/app/shared/services/*.ts` | Clases TypeScript `@Injectable()` que se inyectan en los widgets |
| Modelos / interfaces | `src/app/shared/models/*.ts` | Interfaces TypeScript para tipar datos |
| Utilidades | `src/app/shared/utils/*.ts` | Funciones puras de ayuda |
| Cada módulo (widget) | `src/app/[nombre-modulo]/*.ts` | Componentes Angular que se registran como widgets TB |

**Los servicios compartidos son clases Angular normales.** Se crean dentro del proyecto `thingsboard-extensions`. Son archivos `.ts` que importan de `@angular/core` y de `@thingsboard/thingsboard-pe-ui-types`. No necesitan nada especial de ThingsBoard para existir — son parte de tu bundle.

```
thingsboard-extensions/
└── src/app/
    ├── shared/                          ← servicios, modelos, utilidades
    │   ├── services/
    │   │   ├── tag-metadata.service.ts  ← lee atributos del Device-tag
    │   │   ├── hierarchy.service.ts     ← navega Assets con Relations API
    │   │   └── time-weighted.service.ts ← cálculos ponderados por tiempo
    │   ├── models/
    │   │   └── tag.model.ts             ← interfaces TypeScript
    │   └── utils/
    │       └── quality.util.ts          ← mapeo quality code → texto
    │
    ├── tag-browser/                     ← Módulo 1
    │   ├── tag-browser.component.ts
    │   ├── tag-browser.component.html
    │   └── tag-browser.component.scss
    │
    ├── trend-viewer/                    ← Módulo 2
    ├── data-grid/                       ← Módulo 3
    ├── ...                              ← Módulos 4-16
    │
    └── historian.module.ts              ← Módulo raíz que registra todo
```

---

## 2. Configuración en ThingsBoard (sin código)

Antes de escribir una línea de código en extensiones, configurar esto en la plataforma:

### 2.1 Jerarquía de Assets y Devices-Tag

Crear manualmente o por script via REST API:

```
Asset: "Refinería Norte"     (Asset Profile: Sitio)
├── Contains → Asset: "CDU"  (Asset Profile: AreaProceso)
│   ├── Contains → Asset: "T-101"  (Asset Profile: Equipo)
│   │   ├── Contains → Device: "TI-101-01"  (Device Profile: Tag)
│   │   ├── Contains → Device: "TI-101-02"  (Device Profile: Tag)
│   │   ├── Contains → Device: "PI-101"     (Device Profile: Tag)
│   │   ├── Contains → Device: "FIC-101"    (Device Profile: Tag)
│   │   └── Contains → Device: "XV-101"     (Device Profile: Tag)
│   ├── Contains → Asset: "F-201"  (Asset Profile: Equipo)
│   │   └── Contains → Device: "TI-201-01"  (Device Profile: Tag)
│   └── Contains → Asset: "E-101"  (Asset Profile: Equipo)
│       └── Contains → Device: "TI-301-01"  (Device Profile: Tag)
├── Contains → Asset: "FCC"
│   └── ...
└── Contains → Asset: "Utilidades"
    └── ...
```

Las relaciones son tipo `Contains`, dirección `FROM` Asset padre `TO` Asset/Device hijo.

Cada Device-tag tiene sus metadatos como atributos planos (no un JSON `tagConfig`):
- `description`, `engUnits`, `dataType`, `rangeLo`, `rangeHi`, `alarmHH`, `alarmH`, `alarmL`, `alarmLL`, etc.

### 2.2 Calculated Fields para Quality

En el **Device Profile** "Tag", crear un Calculated Field que convierta el quality numérico a texto legible. Solo se necesita **uno** porque todos los tags tienen la misma key `Q`:

**Calculated Field tipo Script (TBEL):**

```
Nombre: QUALITY_TEXT
Input: telemetry key "Q"
Output: nuevo telemetry key "QT"

Script:
var q = $['Q'];
if (q >= 192) return "Good";
if (q >= 64) return "Uncertain";
if (q == 24) return "Sensor Failure";
if (q == 28) return "Out of Range";
if (q == 32) return "Not Connected";
return "Bad";
```

**Alternativa client-side** (en el widget, sin Calculated Field):

```typescript
// shared/utils/quality.util.ts
export function qualityToText(code: number): string {
  if (code >= 192) return 'Good';
  if (code >= 64) return 'Uncertain';
  if (code === 24) return 'Sensor Failure';
  if (code === 28) return 'Out of Range';
  if (code === 32) return 'Not Connected';
  return 'Bad';
}

export function qualityIsGood(code: number): boolean {
  return code >= 192;
}
```

### 2.3 Calculated Fields para valores derivados

Estos se configuran en **Rule Chains** (no en Device Profile), ya que involucran datos de **múltiples Devices-tag**:

| Cálculo | Tipo | Tags involucrados | Output |
|---------|------|-------------------|--------|
| Caída de presión | Rule Chain | PI-101-BOTTOM.PV - PI-101-TOP.PV | Asset attribute o nuevo Device |
| Rendimiento overhead | Rule Chain | FIC-OVERHEAD.PV / FIC-FEED.PV * 100 | Asset attribute |
| Approach temperature | Rule Chain | TI-HOTOUT.PV - TI-COLDIN.PV | Asset attribute |

**Nota**: Con 1 Device = 1 tag, los Calculated Fields del Device Profile solo tienen acceso a `PV` y `Q` del propio tag. Para cálculos entre tags se usa Rule Engine con `Related Attributes` para obtener telemetría de otros Devices.

### 2.4 Alarm Rules en Device Profile "Tag"

Como todos los tags comparten el Device Profile "Tag", las reglas se definen **una sola vez** con umbrales dinámicos:

```
Alarm: "HIGH_HIGH"
  Create condition: PV > [dynamic value: attribute 'alarmHH']
  Clear condition: PV < [attribute 'alarmHH' - attribute 'deadbandValue']
  Severity: CRITICAL
  Propagate to related entities: YES (para que aparezca en Assets padre)

Alarm: "HIGH"
  Create condition: PV > [dynamic value: attribute 'alarmH']
  Severity: MAJOR
  Propagate: YES

Alarm: "LOW"
  Create condition: PV < [dynamic value: attribute 'alarmL']
  Severity: MAJOR

Alarm: "LOW_LOW"
  Create condition: PV < [dynamic value: attribute 'alarmLL']
  Severity: CRITICAL
```

**Los umbrales (`alarmHH`, `alarmH`, etc.) son atributos directos de cada Device-tag.** Cada tag tiene sus propios límites. Tags sin alarmas tienen estos atributos en `null` y las alarm rules no disparan.

### 2.5 Rule Chain para cálculos multi-device

Cuando un cálculo necesita datos de **varios tags** (ej: totalizar flujos de distintas alimentaciones), usar Rule Engine:

```
Nodo 1: [Message Type Switch] → solo "Post telemetry"
Nodo 2: [Originator Attributes] → enriquece con atributos del device-tag
Nodo 3: [Related Attributes] → obtiene telemetría de devices-tag relacionados
Nodo 4: [Script Transformation] → cálculo TBEL
Nodo 5: [Save Timeseries] → guarda resultado en el Asset padre
```

---

## 3. Módulos a Desarrollar

---

### M1: Tag Browser

**Qué hace**: Árbol de navegación de la planta. El usuario expande nodos (Sitio → Área → Equipo → Tags). Al seleccionar tags, los envía al Trend Viewer.

**Tipo widget TB**: `latest`

**Datos que lee**:
- REST API Relations → para construir el árbol de Assets y Devices-tag
- Atributos del Device-tag (`description`, `engUnits`, `instrumentType`) → para mostrar metadatos junto a cada tag
- Telemetry latest `PV` → para mostrar valor actual junto a cada tag

**Datos que emite**:
- Broadcast `tagsSelected` → al Trend Viewer y Data Grid con `{devices: [{deviceId, deviceName}]}`

**Cómo el árbol se construye**:
1. Pedir hijos del Asset raíz: `GET /api/relations?fromId={rootAssetId}&fromType=ASSET&relationType=Contains`
2. Eso retorna Assets hijos y/o Devices-tag
3. Al expandir un nodo, pedir sus hijos (lazy loading)
4. Al llegar a un Device-tag (hoja), leer sus atributos para mostrar descripción y último valor

**Librería UI**: `mat-tree` de Angular Material

---

### M2: Trend Viewer

**Qué hace**: Gráfico de series temporales. Múltiples tags, zoom, pan, crosshair, estadísticas. **El módulo más importante.**

**Tipo widget TB**: `timeseries`

**Datos que lee**:
- Broadcast `tagsSelected` → qué tags graficar
- Telemetry timeseries key `PV` de cada Device-tag → datos históricos y real-time
- Atributos del Device-tag → `engUnits` (para ejes Y), `stepFlag` (para tipo de línea), `rangeLo/rangeHi` (para escala)

**Estrategia de consulta**:

| Rango visible | Agregación | Intervalo | Resultado |
|---------------|-----------|-----------|-----------|
| < 1 hora | `NONE` (crudo) | - | Todos los puntos |
| 1h – 24h | `NONE` | - | Hasta 10,000 puntos |
| 1d – 7d | `AVG` | 60,000 ms (1 min) | ~10,000 puntos |
| 7d – 30d | `AVG` | 300,000 ms (5 min) | ~8,600 puntos |
| 30d – 1 año | `AVG` | 3,600,000 ms (1 hora) | ~8,760 puntos |

**Estadísticas en la barra inferior**: Usar `TimeWeightedCalcService` (no el AVG de ThingsBoard, porque TB hace event-weighted).

**Librería**: ECharts (el repo de extensiones ya trae un ejemplo `example-chart`)

---

### M3: Data Grid

**Qué hace**: Tabla tipo Excel. Columnas = tags, filas = timestamps. Valores a intervalos regulares.

**Tipo widget TB**: `timeseries`

**Datos que lee**:
- Telemetry timeseries key `PV` de cada Device-tag con `agg=AVG` o `agg=NONE`
- Atributos del Device-tag → alarmas para coloreado de celdas

**Funcionalidades**:
- Selector de intervalo (1 min, 5 min, 15 min, 1 hora)
- Coloreado: rojo si PV > alarmHH, naranja si > alarmH, amarillo si < alarmL, rojo si < alarmLL
- Exportar a CSV/Excel

**Librería**: ag-Grid Community o Angular Material Table

---

### M4: Tag Configuration Manager

**Qué hace**: Interfaz para ver y editar los metadatos de tags. También importar/exportar masivo desde Excel/CSV.

**Tipo widget TB**: `static`

**Datos que lee/escribe**:
- Atributos del Device-tag (lectura directa — `description`, `engUnits`, `rangeLo`, etc.)
- Si necesitas modificar, escribir server-side attributes via REST API: `POST /api/plugins/telemetry/DEVICE/{id}/SERVER_SCOPE`

**Nota**: Los client attributes los envía el software de recolección. Si tú quieres modificar metadatos desde el widget, escríbelos como **server-side attributes** (que tienen prioridad sobre client-side para display). O acuerda con el equipo de recolección un mecanismo de sincronización.

**Librería de parseo**: SheetJS para importar/exportar Excel

---

### M5: Alarm Viewer

**Qué hace**: Lista de alarmas activas e históricas con reconocimiento.

**Tipo widget TB**: `alarm`

**Implementación**: **Usar el widget nativo de alarmas de ThingsBoard** como base. Solo crear extensión custom si necesitas KPIs avanzados (alarmas/hora, detección de chattering, análisis de "bad actors").

El widget nativo ya soporta: filtrado por severidad, reconocimiento con comentario, historial, propagación.

---

### M6: HMI / Mimic Displays

**Qué hace**: Diagramas P&ID con valores en vivo sobre gráficos SVG de equipos.

**Tipo widget TB**: `latest`

**Enfoque**: Evaluar primero el **widget SCADA nativo de TB PE**. Si no es suficiente, crear extensión custom con SVG.

**Datos que lee**: Telemetry latest `PV` de cada Device-tag para mostrar valores actuales sobre el gráfico

---

### M7: Report Generator

**Qué hace**: Genera reportes periódicos (diario, turno, mensual) con datos del historiador.

**Tipo widget TB**: `timeseries`

**Dos caminos**:
1. **Widget interactivo**: consulta datos agregados y renderiza tabla HTML con estadísticas. Exporta a PDF/Excel.
2. **Automático**: TB PE Report Server captura un dashboard como PDF programado y lo envía por email.

---

### M8: Calculation Engine UI

**Qué hace**: Interfaz para ver y configurar los Calculated Fields y Rule Chain calculations.

**Tipo widget TB**: `static`

**Los cálculos se configuran en ThingsBoard** (ver Sección 2.3 y 2.5). Este módulo solo es una UI amigable para:
- Ver lista de campos calculados activos
- Ver su fórmula y último valor
- Crear/editar fórmulas (llamando al REST API de TB para Calculated Fields)

---

### M9: Data Export

**Qué hace**: Exportar datos a CSV/Excel desde cualquier vista.

**No es un widget independiente.** Es funcionalidad integrada en M2 (Trend Viewer) y M3 (Data Grid):

- Botón "Exportar CSV" que toma los datos visibles y genera descarga
- Botón "Exportar Excel" usando SheetJS

```typescript
function exportToCSV(headers: string[], rows: any[][], filename: string) {
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

---

### M10: Audit Trail

**Qué hace**: Muestra historial de cambios en configuración y acciones de usuarios.

**Tipo widget TB**: `static`

**Datos que lee**: REST API nativa de Audit Logs: `GET /api/audit/logs`

ThingsBoard ya registra automáticamente creación/edición/borrado de entidades. Este módulo solo es una UI para consultar y filtrar esos logs.

---

### M11: Tag Search

**Qué hace**: Búsqueda rápida de tags por nombre, descripción, tipo, área.

**Tipo widget TB**: `static`

**Estrategia**: Buscar Devices del Profile "Tag" usando los Entity Filters nativos de TB. Se puede filtrar por atributos (`area`, `equipment`, `instrumentType`, `description`).

- `GET /api/tenant/devices?type=Tag&textSearch={query}` para búsqueda por nombre
- Para búsqueda avanzada por atributos: usar Entity Query API con filtros de atributos

**Datos que emite**: Broadcast `tagsSelected` → al Trend Viewer

---

### M12: Comparison View

**Qué hace**: Compara datos del mismo tag en diferentes períodos, o el mismo tipo de tag en equipos paralelos.

**Tipo widget TB**: `timeseries`

**Técnica**: Crear dos suscripciones de telemetría (`PV`) con rangos de tiempo diferentes. Alinear en eje X relativo (hora 0, hora 1, ...) restando el startTime de cada serie.

---

### M13: Statistical Analysis

**Qué hace**: Estadísticas avanzadas, histogramas, XY scatter, gráficos SPC.

**Tipo widget TB**: `timeseries`

**Cálculos**:
- Estadísticas básicas: `TimeWeightedCalcService` (promedio time-weighted, stddev, min, max)
- Histograma: calcular bins client-side sobre `PV`, mostrar con ECharts bar chart
- XY Scatter: consultar `PV` de dos Device-tags, emparejar por timestamp, plotear con ECharts scatter
- SPC (I-MR): calcular límites de control client-side (xBar, mrBar, UCL, LCL)

**Librería de cálculo**: `simple-statistics` (npm) para regresión, percentiles, etc.

---

### M14: Asset Hierarchy Viewer

**Qué hace**: Navegación del árbol de la planta. **Widget fundacional** — al seleccionar un nodo, todos los otros widgets del dashboard cambian de contexto.

**Tipo widget TB**: `static` o `latest`

**Técnica clave — `stateController`**:

```typescript
// Cuando el usuario selecciona un nodo
onNodeClick(node) {
  this.ctx.stateController.updateState('default', {
    entityId: { entityType: node.type, id: node.id },
    entityName: node.name
  });
}
```

Esto hace que todos los widgets del dashboard que usen un **alias tipo "entity from dashboard state"** automáticamente muestren datos del nodo seleccionado.

Es la base de la experiencia: seleccionar un equipo en el árbol → los widgets muestran los Device-tags relacionados.

---

### M15: Realtime Dashboard

**Qué hace**: Vista de overview con KPIs, gauges, indicadores de estado.

**Implementación**: **Usar widgets nativos de ThingsBoard** — gauge, value card, LED indicator, mini timeseries chart. Solo crear extensión para widgets específicos de refinería (ranking de bad actors, sparklines integradas).

---

### M16: Batch / Event Analysis

**Qué hace**: Analizar eventos con límites temporales (regeneración de catalizador, carga de buques, trips).

**Tipo widget TB**: `alarm` o `timeseries`

**ThingsBoard no tiene Event Frames nativos.** Aproximar con:

1. **Alarmas como eventos**: Definir alarm rule que detecta inicio/fin del evento. La alarma tiene start time, end time, y detalles JSON.
2. **Consultar alarmas** con tipo específico: `GET /api/alarm/DEVICE/{id}?type=CATALYST_REGEN`
3. **Mostrar en Gantt**: ECharts custom series o librería de Gantt

---

## 4. Servicios Compartidos (detalle)

Estos son archivos TypeScript dentro de `src/app/shared/services/`. Son clases `@Injectable()` que se inyectan en los componentes de los widgets. **No necesitan nada especial de ThingsBoard para compilar** — son Angular puro que usa el `ctx` del widget para acceder a APIs.

### TagMetadataService

**Qué hace**: Lee los atributos de un Device-tag y los cachea.

```typescript
import { Injectable } from '@angular/core';

@Injectable()
export class TagMetadataService {
  private cache: Map<string, any> = new Map();

  /**
   * Lee atributos del Device-tag.
   * ctx = WidgetContext que el componente del widget le pasa.
   */
  async getTagAttributes(ctx: any, deviceId: string): Promise<Record<string, any>> {
    if (this.cache.has(deviceId)) {
      return this.cache.get(deviceId);
    }

    // Leer atributos del device-tag (CLIENT_SCOPE + SERVER_SCOPE)
    const attrs = await ctx.attributeService.getEntityAttributes(
      { entityType: 'DEVICE', id: deviceId },
      'CLIENT_SCOPE',
      ['description', 'engUnits', 'dataType', 'rangeLo', 'rangeHi',
       'typicalValue', 'stepFlag', 'instrumentType', 'area', 'equipment',
       'alarmHH', 'alarmH', 'alarmL', 'alarmLL', 'deadbandValue']
    ).toPromise();

    const config: Record<string, any> = {};
    for (const attr of attrs) {
      config[attr.key] = attr.value;
    }
    this.cache.set(deviceId, config);
    return config;
  }

  getEngUnits(config: any): string {
    return config?.engUnits || '';
  }

  isStep(config: any): boolean {
    return config?.stepFlag === true;
  }

  getAlarmLimits(config: any) {
    return {
      hh: config?.alarmHH,
      h: config?.alarmH,
      l: config?.alarmL,
      ll: config?.alarmLL
    };
  }
}
```

### HierarchyService

**Qué hace**: Navega el árbol de Assets/Devices via Relations API.

```typescript
@Injectable()
export class HierarchyService {

  async getChildren(ctx: any, parentId: string, parentType: string = 'ASSET') {
    const url = `/api/relations?fromId=${parentId}&fromType=${parentType}&relationType=Contains`;
    const relations = await ctx.http.get(url).toPromise();

    return relations.map(rel => ({
      id: rel.to.id,
      type: rel.to.entityType,  // 'ASSET' o 'DEVICE'
    }));
    // Luego resolver nombres con GET /api/asset/{id} o GET /api/device/{id}
    // Los Devices son tags — su nombre es el nombre del tag
  }
}
```

### TimeWeightedCalcService

**Qué hace**: Cálculos ponderados por tiempo (porque ThingsBoard solo hace event-weighted).

```typescript
@Injectable()
export class TimeWeightedCalcService {

  average(data: {ts: number, value: number}[], endTs?: number): number {
    if (!data || data.length === 0) return 0;
    if (data.length === 1) return data[0].value;

    const sorted = [...data].sort((a, b) => a.ts - b.ts);
    const end = endTs || sorted[sorted.length - 1].ts;

    let weightedSum = 0;
    let totalDuration = 0;

    for (let i = 0; i < sorted.length; i++) {
      const nextTs = i < sorted.length - 1 ? sorted[i + 1].ts : end;
      const duration = nextTs - sorted[i].ts;
      if (duration > 0) {
        weightedSum += sorted[i].value * duration;
        totalDuration += duration;
      }
    }

    return totalDuration > 0 ? weightedSum / totalDuration : 0;
  }

  // min, max, stddev, etc. — misma lógica de ponderación
}
```

---

## 5. Prioridad de Implementación

### Fase 1 — MVP

| Orden | Módulo | Semanas |
|-------|--------|---------|
| 0 | Configurar TB: Assets, relaciones, Device Profile "Tag", Calculated Fields, Alarm Rules | 2 |
| 1 | Servicios compartidos (shared/) | 1 |
| 2 | M14: Asset Hierarchy Viewer (controla el contexto) | 2 |
| 3 | M1: Tag Browser | 2 |
| 4 | M2: Trend Viewer | 3 |
| 5 | M5: Alarm Viewer (widget nativo TB, solo configurar) | 1 |

### Fase 2 — Operacional

| Orden | Módulo | Semanas |
|-------|--------|---------|
| 6 | M3: Data Grid | 2 |
| 7 | M11: Tag Search | 1 |
| 8 | M4: Tag Config Manager | 2 |
| 9 | M15: Realtime Dashboard (widgets nativos TB) | 1 |

### Fase 3 — Analítico

| Orden | Módulo | Semanas |
|-------|--------|---------|
| 10 | M8: Calculation Engine UI | 1 |
| 11 | M13: Statistical Analysis | 2 |
| 12 | M12: Comparison View | 2 |
| 13 | M7: Report Generator | 2 |

### Fase 4 — Avanzado

| Orden | Módulo | Semanas |
|-------|--------|---------|
| 14 | M6: HMI Displays | 3 |
| 15 | M10: Audit Trail | 1 |
| 16 | M16: Batch/Event Analysis | 3 |
