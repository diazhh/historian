# Dashboard States y Navegación

## Concepto

Un dashboard de ThingsBoard puede tener múltiples **estados** (states). Cada estado es una "página" con su propia disposición de widgets. El usuario navega entre estados pasando una entidad como contexto.

---

## Estados del Dashboard Historiador

```
Estado: "default" (Vista general de planta)
├── Widget: Hierarchy Viewer (M14) — árbol a la izquierda
├── Widget: Overview KPIs (M15) — KPIs globales
└── Widget: Alarm Summary (M5) — alarmas activas

Estado: "area" (Vista de un área de proceso)
├── Widget: Hierarchy Viewer (M14) — resaltando área actual
├── Widget: Equipment List — equipos del área
└── Widget: Area Alarms (M5) — alarmas del área

Estado: "equipment" (Vista de un equipo)
├── Widget: Tag Browser (M1) — tags del equipo
├── Widget: Trend Viewer (M2) — gráficas
├── Widget: Data Grid (M3) — tabla de datos
└── Widget: Equipment Alarms (M5) — alarmas del equipo
```

---

## Estados del Dashboard SCADA ESP

```
Estado: "default"      — Vista general P&ID (~70 widgets)
Estado: "esp_detail"   — Detalle bomba ESP y motor (~45 widgets)
Estado: "surface"      — Equipos de superficie (~40 widgets)
Estado: "electrical"   — Sistema eléctrico VSD/Motor (~35 widgets)
Estado: "trends"       — Gráficos de tendencias (~15 widgets)
Estado: "alarms"       — Tabla de alarmas (~10 widgets)
```

Cada estado tiene una **barra de navegación** con 6 botones que se duplican en todos los estados. La barra usa el behavior `GET_DASHBOARD_STATE` para resaltar el botón del estado activo.

---

## Navegación Programática

### Desde un widget custom (Angular):

```typescript
// Navegar a un estado pasando entidad como contexto
this.ctx.stateController.updateState('equipment', {
  entityId: { entityType: 'ASSET', id: equipmentAssetId },
  entityName: equipmentName
});
```

### Desde un widget nativo (Action Button):

Configurar la acción como:
```json
{
  "type": "openDashboardState",
  "targetDashboardStateId": "equipment",
  "setEntityId": true
}
```

---

## Flujo de Navegación

```
[default] Vista general
  Usuario ve la planta completa.
  Hierarchy Viewer: Refinería Norte > CDU, FCC, Utilidades
  Click en "CDU" →

[area] Vista CDU
  selectedEntity = Asset "CDU"
  childAssets: T-101, F-201, E-101
  Alarmas de CDU y propagadas
  Click en "T-101" →

[equipment] Vista T-101
  selectedEntity = Asset "T-101"
  childDevices: TI-101-01, PI-101, XV-101, FIC-101
  Tag Browser muestra Device-tags como hojas
  Trend Viewer grafica PV de los tags seleccionados
  Click en "← CDU" → vuelve a [area]
  Click en "← Planta" → vuelve a [default]
```

---

## Configuración JSON de un Estado

```json
{
  "default": {
    "name": "Vista General",
    "root": true,
    "layouts": {
      "main": {
        "widgets": {
          "widget-hierarchy": { "sizeX": 4, "sizeY": 12, "row": 0, "col": 0 }
        },
        "gridSettings": {
          "columns": 24,
          "margin": 10,
          "autoFillHeight": true
        }
      }
    }
  },
  "equipment": {
    "name": "Detalle Equipo",
    "root": false,
    "layouts": {
      "main": {
        "widgets": {
          "widget-hierarchy": { "sizeX": 3, "sizeY": 12, "row": 0, "col": 0 },
          "widget-trend": { "sizeX": 9, "sizeY": 6, "row": 0, "col": 3 },
          "widget-grid": { "sizeX": 9, "sizeY": 6, "row": 6, "col": 3 }
        }
      }
    }
  }
}
```

**Nota SCADA**: El layout SCADA usa `layoutType: "scada"`, `columns: 48`, `autoFillHeight: false`, `rowHeight: 70` (ver [layout-scada.md](../04-scada-dashboard/layout-scada.md)).
