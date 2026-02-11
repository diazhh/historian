# Roadmap — Historiador ThingsBoard PE

## Resumen de Módulos

| # | Módulo | Tipo Widget | Desarrollo | Librería | Fase | Estado |
|---|--------|-------------|------------|----------|------|--------|
| M1 | Tag Browser | `latest` | Custom | mat-tree | 1 | En progreso |
| M2 | Trend Viewer | `timeseries` | Custom | ECharts 5.5.0-TB | 1 | En progreso |
| M3 | Data Grid | `timeseries` | Custom | Mat Table / ag-Grid | 2 | Pendiente |
| M4 | Tag Config Manager | `static` | Custom | SheetJS | 2 | Pendiente |
| M5 | Alarm Viewer | `alarm` | Nativo TB | N/A | 1 | Pendiente (config) |
| M6 | HMI / Mimic Displays | `latest` | SCADA nativo / Custom SVG | SVG | 4 | Pendiente |
| M7 | Report Generator | `timeseries` | Custom + TB Report Server | HTML/PDF | 3 | Pendiente |
| M8 | Calculation Engine UI | `static` | Custom | Mat Forms | 3 | Pendiente |
| M9 | Data Export | N/A | Integrado en M2/M3 | SheetJS/CSV | 2 | Pendiente |
| M10 | Audit Trail | `static` | Custom | Mat Table | 4 | Pendiente |
| M11 | Tag Search | `static` | Custom | Mat Autocomplete | 2 | Pendiente |
| M12 | Comparison View | `timeseries` | Custom | ECharts | 3 | Pendiente |
| M13 | Statistical Analysis | `timeseries` | Custom | ECharts + simple-statistics | 3 | Pendiente |
| M14 | Asset Hierarchy Viewer | `static`/`latest` | Custom | mat-tree | 1 | En progreso |
| M15 | Realtime Dashboard | `latest` | Nativo TB | gauge/cards/LED | 2 | Pendiente |
| M16 | Batch / Event Analysis | `alarm`/`timeseries` | Custom | ECharts Gantt | 4 | Pendiente |

---

## Detalle por Módulo

### M1: Tag Browser
- **Función**: Árbol de navegación de planta. Expande nodos (Sitio > Área > Equipo > Device > Tags). Multi-select de tags para enviar al Trend Viewer.
- **Datos**: Relations API (árbol), client attribute `tagConfig` (metadatos), telemetry latest (valores actuales)
- **Emite**: Broadcast `tagsSelected` → `{deviceId, deviceName, tagKeys[]}`
- **UI**: mat-tree con lazy loading, checkboxes, filtro de texto

### M2: Trend Viewer
- **Función**: Gráfico de series temporales. Múltiples tags, zoom, pan, crosshair, estadísticas. **Módulo más importante.**
- **Datos**: Broadcast `tagsSelected` (qué graficar), timeseries (histórico + real-time), `tagConfig` (unidades, tipo línea, rangos, alarmas)
- **Agregación**: <24h crudo, 1-7d AVG@1min, 7-30d AVG@5min, 30d+ AVG@1h
- **Features**: Step lines (tags digitales), markLine alarmas HH/H/L/LL, barra estadísticas TWA, exportar CSV
- **UI**: ECharts con dataZoom (inside + slider), SVG renderer

### M3: Data Grid
- **Función**: Tabla tipo Excel. Columnas = tags, filas = timestamps a intervalos regulares.
- **Datos**: Timeseries con agg=AVG o NONE, `tagConfig` para alarmas
- **Features**: Selector intervalo (1/5/15 min, 1h), coloreado por alarmas (rojo>HH, naranja>H, amarillo<L, rojo<LL), exportar CSV/Excel
- **UI**: Angular Material Table o ag-Grid Community

### M4: Tag Configuration Manager
- **Función**: Ver y editar metadatos de tags. Importar/exportar masivo desde Excel/CSV.
- **Datos**: Lee client attribute `tagConfig`, escribe server-side attributes via REST
- **Nota**: Client attrs los envía el software de recolección. Modificaciones desde UI van como server attrs (prioridad sobre client).
- **UI**: Tabla editable + SheetJS para Excel

### M5: Alarm Viewer
- **Función**: Lista de alarmas activas e históricas con reconocimiento.
- **Implementación**: Widget nativo de alarmas de TB. Solo configurar filtros por severidad, reconocimiento con comentario, historial, propagación.
- **Custom solo si**: Necesitas KPIs avanzados (alarmas/hora, chattering, bad actors).

### M6: HMI / Mimic Displays
- **Función**: Diagramas P&ID con valores en vivo sobre gráficos SVG de equipos.
- **Implementación**: Evaluar primero SCADA nativo de TB PE. Si no es suficiente, custom con SVG + telemetry latest.
- **Complejidad**: Alta — requiere diseño gráfico de cada P&ID.

### M7: Report Generator
- **Función**: Reportes periódicos (diario, turno, mensual).
- **Dos caminos**:
  1. Widget interactivo: consulta datos agregados, renderiza tabla HTML, exporta PDF/Excel
  2. Automático: TB PE Report Server captura dashboard como PDF programado y envía por email

### M8: Calculation Engine UI
- **Función**: UI para ver y configurar Calculated Fields y Rule Chain calculations.
- **Datos**: REST API de TB para CRUD de Calculated Fields
- **Features**: Lista de campos calculados activos, fórmula, último valor

### M9: Data Export
- **Función**: Exportar datos a CSV/Excel.
- **NO es widget independiente.** Funcionalidad integrada en M2 (Trend Viewer) y M3 (Data Grid).
- Botones "Exportar CSV" y "Exportar Excel" (SheetJS) sobre datos visibles.

### M10: Audit Trail
- **Función**: Historial de cambios en configuración y acciones de usuarios.
- **Datos**: REST API nativa de Audit Logs (`GET /api/audit/logs`). TB registra automáticamente CRUD de entidades.
- **UI**: Tabla con filtros por usuario, entidad, fecha, tipo de acción.

### M11: Tag Search
- **Función**: Búsqueda rápida de tags por nombre, descripción, tipo, área.
- **Estrategia**: Cargar `tagConfig` de todos los Devices al iniciar, índice en memoria, búsqueda local.
- **Emite**: Broadcast `tagsSelected` → al Trend Viewer
- **Nota**: Para 100K tags: ~50MB de memoria. Si es problema, paginar por Device.

### M12: Comparison View
- **Función**: Compara datos del mismo tag en diferentes períodos, o mismo tipo de tag en equipos paralelos.
- **Técnica**: Dos suscripciones de telemetría con rangos de tiempo diferentes. Eje X relativo (hora 0, hora 1...) restando startTime.
- **UI**: ECharts con series superpuestas, colores diferenciados por período

### M13: Statistical Analysis
- **Función**: Estadísticas avanzadas, histogramas, XY scatter, gráficos SPC.
- **Cálculos**: TWA, stddev, min, max (TimeWeightedCalcService), histograma (bins client-side), XY scatter (emparejar por timestamp), SPC I-MR (límites de control)
- **Librerías**: ECharts + `simple-statistics` (npm)

### M14: Asset Hierarchy Viewer
- **Función**: Navegación del árbol de planta. **Widget FUNDACIONAL** — al seleccionar un nodo, todos los otros widgets cambian de contexto.
- **Técnica**: `ctx.stateController.updateState()` con entity alias tipo `stateEntity`
- **UI**: mat-tree con lazy loading, iconos por tipo, búsqueda

### M15: Realtime Dashboard
- **Función**: Vista de overview con KPIs, gauges, indicadores de estado.
- **Implementación**: Widgets nativos TB (gauge, value card, LED indicator, mini timeseries chart).
- **Custom solo para**: Ranking de bad actors, sparklines integradas.

### M16: Batch / Event Analysis
- **Función**: Analizar eventos con límites temporales (regeneración catalizador, carga buques, trips).
- **TB no tiene Event Frames nativos.** Aproximar con alarmas como eventos (alarm rule detecta inicio/fin, alarma tiene start/end time + detalles JSON).
- **UI**: ECharts custom series (Gantt) o librería de Gantt dedicada.

---

## Fases de Implementación

### Fase 1 — MVP
| Orden | Módulo | Semanas |
|-------|--------|---------|
| 0 | Configurar TB: Assets, relaciones, Device Profiles, Calculated Fields, Alarm Rules | 2 |
| 1 | Servicios compartidos (models, utils, TagMetadataService, TimeWeightedCalcService) | 1 |
| 2 | M14: Asset Hierarchy Viewer | 2 |
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

---

## Dependencias entre Módulos

```
Servicios compartidos ← TODO depende de esto
M14 (Hierarchy) ← M1, M2, M3 dependen del contexto que M14 establece
M1 (Tag Browser) ← M2 escucha el broadcast tagsSelected de M1
M9 (Export) ← integrado en M2 y M3
M2 (Trend Viewer) ← M12, M13 son extensiones del patrón de M2
```

---

## Stack Tecnológico

| Componente | Tecnología | Versión |
|-----------|-----------|---------|
| Framework | Angular | 18.2.13 |
| Lenguaje | TypeScript | 5.5.4 |
| Build | ng-packagr + SystemJS | 18.2.1 |
| Gráficos | ECharts (fork TB) | 5.5.0-TB |
| UI Components | Angular Material | 18.2.14 |
| Plataforma | ThingsBoard PE | 4.0+ |
| Data Transport | MQTT (datos) + REST API (widgets) | - |
| State Management | NgRx Store | 18.1.1 |
