# Guía de Implementación — Historiador ThingsBoard PE

**Para**: Desarrolladores de widgets con `thingsboard/thingsboard-extensions`
**Requisitos**: Angular 18, TypeScript, ThingsBoard PE 4.x
**Proyecto base**: `https://github.com/thingsboard/thingsboard-extensions`

---

## 1. Acceso y Entorno

### 1.1 ThingsBoard PE

| Dato | Valor |
|------|-------|
| URL | `https://[TU_SERVIDOR]:443` o `http://[TU_SERVIDOR]:8080` |
| API Base | `https://[TU_SERVIDOR]/api` |
| Login | `POST /api/auth/login` con `{"username": "...", "password": "..."}` |
| Token | El login retorna `{ "token": "...", "refreshToken": "..." }`. Usar el `token` en header `X-Authorization: Bearer {token}` |

**Obtener token por script (útil para CI/CD y scripts de deploy):**

```bash
TOKEN=$(curl -s -X POST https://TU_SERVIDOR/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"tu@email.com","password":"tu_password"}' \
  | jq -r '.token')

echo $TOKEN
```

### 1.2 Clonar el proyecto de extensiones

```bash
git clone https://github.com/thingsboard/thingsboard-extensions.git historian-extensions
cd historian-extensions
yarn install
```

Renombrar el proyecto en `package.json`:

```json
{
  "name": "historian-extensions",
  "version": "0.1.0"
}
```

### 1.3 Versiones

| Herramienta | Versión |
|-------------|---------|
| Node.js | 18.x o 20.x |
| Angular | 18.x (ya viene en el repo) |
| TypeScript | 5.x (ya viene en el repo) |
| yarn | 1.x |
| ThingsBoard PE | 4.0+ (por Calculated Fields) |

---

## 2. Arquitectura

### 2.1 Cómo ThingsBoard carga los widgets custom

ThingsBoard carga widgets custom como **módulos SystemJS en runtime**. El flujo es:

```
Tu código Angular (TypeScript)
    ↓  yarn build
Bundle JavaScript (archivo .js)
    ↓  upload via REST API
TB Resource Library (almacena el .js)
    ↓  Widget Type referencia el resource
Dashboard carga el widget
    ↓  SystemJS importa el módulo
Componente Angular renderiza en el DOM
```

**Lo que tú escribes**: Componentes Angular normales. `@Component`, `@Injectable`, templates HTML, estilos SCSS.

**Lo que TB necesita**: Un `controllerScript` que actúa como puente entre la plataforma y tu componente. Este script registra tu componente en `$scope` para que TB lo instancie dentro del contenedor del widget.

### 2.2 El puente `$scope`

Cada widget en ThingsBoard tiene un `controllerScript` — un string de JavaScript que TB ejecuta cuando carga el widget. Este script recibe `$scope` y es el punto de entrada:

```javascript
// controllerScript (se almacena como string en el Widget Type JSON)
self.onInit = function() {
    self.ctx.$scope.historianWidget = {
        init: function() {
            // TB llama esto cuando el widget está listo
        }
    };
};
```

En tu componente Angular, te conectas a este `$scope` en el `ngOnInit()`:

```typescript
@Component({ ... })
export class TrendViewerComponent implements OnInit {
  @Input() ctx: WidgetContext;

  ngOnInit() {
    const self = this;
    this.ctx.$scope.historianWidget = {
      init: () => {
        // Aquí arranca tu widget — el DOM está listo,
        // las suscripciones de datos están activas
        self.initChart();
      }
    };
  }
}
```

### 2.3 WidgetContext (`ctx`)

El `ctx` es **el objeto más importante**. Te da acceso a todo lo que necesitas:

| Propiedad | Qué da | Ejemplo |
|-----------|--------|---------|
| `ctx.data` | Datos de telemetría suscritos | `ctx.data[0].data` → `[[ts, value], ...]` |
| `ctx.datasources` | Datasources configurados en el widget | `ctx.datasources[0].entityId` |
| `ctx.settings` | Configuración custom del widget (del schema) | `ctx.settings.showGrid` |
| `ctx.stateController` | Control de estado del dashboard | `ctx.stateController.updateState(...)` |
| `ctx.http` | HttpClient de Angular (para REST API) | `ctx.http.get('/api/asset/{id}')` |
| `ctx.attributeService` | Servicio de atributos TB | `ctx.attributeService.getEntityAttributes(...)` |
| `ctx.entityGroupService` | Servicio de entity groups | `ctx.entityGroupService.getEntityGroups(...)` |
| `ctx.aliasController` | Resolución de entity aliases | `ctx.aliasController.getAliases()` |
| `ctx.detectChanges()` | Forzar change detection | Llamar después de actualizar datos async |
| `ctx.defaultSubscription` | Suscripción principal de datos | `ctx.defaultSubscription.subscribe()` |
| `ctx.$scope` | Scope compartido con controllerScript | Bridge para registrar callbacks |

---

## 3. Estructura del Proyecto

```
historian-extensions/
├── package.json
├── tsconfig.json
├── angular.json
├── yarn.lock
│
├── src/
│   └── app/
│       │
│       ├── shared/                              ← SERVICIOS, MODELOS, UTILIDADES
│       │   ├── services/
│       │   │   ├── tag-metadata.service.ts      ← lee client attributes tagConfig
│       │   │   ├── hierarchy.service.ts         ← navega Assets via Relations API
│       │   │   ├── time-weighted.service.ts     ← cálculos ponderados por tiempo
│       │   │   └── broadcast.service.ts         ← comunicación inter-widget
│       │   ├── models/
│       │   │   ├── tag.model.ts                 ← interfaces: TagConfig, TagData
│       │   │   └── hierarchy.model.ts           ← interfaces: TreeNode, AssetNode
│       │   └── utils/
│       │       ├── quality.util.ts              ← qualityToText(), qualityIsGood()
│       │       └── export.util.ts               ← exportToCSV(), exportToExcel()
│       │
│       ├── tag-browser/                         ← M1
│       │   ├── tag-browser.component.ts
│       │   ├── tag-browser.component.html
│       │   ├── tag-browser.component.scss
│       │   └── index.ts                         ← export público
│       │
│       ├── trend-viewer/                        ← M2
│       │   ├── trend-viewer.component.ts
│       │   ├── trend-viewer.component.html
│       │   ├── trend-viewer.component.scss
│       │   └── index.ts
│       │
│       ├── data-grid/                           ← M3
│       │   ├── ...
│       │   └── index.ts
│       │
│       ├── ... (demás módulos M4-M16)
│       │
│       └── historian.module.ts                  ← MÓDULO RAÍZ
│
└── dist/                                        ← output del build
    └── historian-extensions.js
```

### 3.1 `historian.module.ts` — Módulo raíz

Este archivo registra todos los componentes del historiador como un bundle:

```typescript
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

// Servicios compartidos
import { TagMetadataService } from './shared/services/tag-metadata.service';
import { HierarchyService } from './shared/services/hierarchy.service';
import { TimeWeightedCalcService } from './shared/services/time-weighted.service';

// Componentes de widgets
import { TagBrowserComponent } from './tag-browser/tag-browser.component';
import { TrendViewerComponent } from './trend-viewer/trend-viewer.component';
import { DataGridComponent } from './data-grid/data-grid.component';
import { AssetHierarchyComponent } from './asset-hierarchy/asset-hierarchy.component';

@NgModule({
  declarations: [
    TagBrowserComponent,
    TrendViewerComponent,
    DataGridComponent,
    AssetHierarchyComponent,
    // ... demás componentes
  ],
  imports: [
    CommonModule,
  ],
  providers: [
    TagMetadataService,
    HierarchyService,
    TimeWeightedCalcService,
  ],
  exports: [
    TagBrowserComponent,
    TrendViewerComponent,
    DataGridComponent,
    AssetHierarchyComponent,
  ]
})
export class HistorianModule {}
```

---

## 4. Crear un Widget Nuevo — Paso a Paso

Ejemplo: crear el widget **Trend Viewer** (`trend-viewer`).

### Paso 1: Crear los 4 archivos

**`src/app/trend-viewer/trend-viewer.component.ts`**

```typescript
import { Component, OnInit, OnDestroy, Input, ViewChild, ElementRef } from '@angular/core';
import { WidgetContext } from '@home/models/widget-component.models';
import { TagMetadataService } from '../shared/services/tag-metadata.service';
import { qualityToText, qualityIsGood } from '../shared/utils/quality.util';
import * as echarts from 'echarts';

@Component({
  selector: 'historian-trend-viewer',
  templateUrl: './trend-viewer.component.html',
  styleUrls: ['./trend-viewer.component.scss']
})
export class TrendViewerComponent implements OnInit, OnDestroy {

  @Input() ctx: WidgetContext;
  @ViewChild('chartContainer', { static: true }) chartRef: ElementRef;

  private chart: echarts.ECharts;

  constructor(private tagMeta: TagMetadataService) {}

  ngOnInit() {
    const self = this;

    // Registrar el puente $scope para que TB sepa cuándo inicializar
    this.ctx.$scope.historianWidget = {
      init: () => {
        self.initChart();
        self.loadData();
      }
    };
  }

  private initChart() {
    this.chart = echarts.init(this.chartRef.nativeElement);
    this.chart.setOption({
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'time' },
      yAxis: { type: 'value' },
      dataZoom: [
        { type: 'inside' },
        { type: 'slider' }
      ],
      series: []
    });
  }

  private async loadData() {
    // ctx.data contiene los datos de las suscripciones configuradas en el widget
    if (this.ctx.data && this.ctx.data.length > 0) {
      const series = [];

      for (const ds of this.ctx.data) {
        const deviceId = ds.datasource?.entityId;
        const tagKey = ds.dataKey?.name;  // ej: "TI-101-01.PV"

        // Obtener metadatos del tag para unidades y tipo de línea
        let engUnits = '';
        let isStep = false;
        if (deviceId) {
          const config = await this.tagMeta.getTagConfig(this.ctx, deviceId);
          engUnits = this.tagMeta.getEngUnits(config, tagKey);
          isStep = this.tagMeta.isStep(config, tagKey);
        }

        series.push({
          name: `${tagKey} (${engUnits})`,
          type: 'line',
          step: isStep ? 'end' : false,
          data: ds.data.map(([ts, val]) => [ts, val]),
          showSymbol: false
        });
      }

      this.chart.setOption({ series });
    }
  }

  ngOnDestroy() {
    if (this.chart) {
      this.chart.dispose();
    }
  }
}
```

**`src/app/trend-viewer/trend-viewer.component.html`**

```html
<div class="trend-viewer-container">
  <div #chartContainer class="chart-area"></div>
</div>
```

**`src/app/trend-viewer/trend-viewer.component.scss`**

```scss
.trend-viewer-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.chart-area {
  flex: 1;
  min-height: 300px;
}
```

**`src/app/trend-viewer/index.ts`**

```typescript
export { TrendViewerComponent } from './trend-viewer.component';
```

### Paso 2: Registrar en `historian.module.ts`

Agregar el import y declarar en el `@NgModule` (ver Sección 3.1).

### Paso 3: Build

```bash
yarn build
```

Output: `dist/historian-extensions.js`

### Paso 4: Subir y registrar (ver Sección 7)

---

## 5. Patrones de Widget para el Historiador

### 5.1 Widget de entidad única (un Device, datos `latest`)

Para widgets que muestran datos del dispositivo/asset seleccionado actualmente:

```typescript
ngOnInit() {
  this.ctx.$scope.historianWidget = {
    init: () => {
      // La entidad viene del Entity Alias configurado
      const entityId = this.ctx.datasources[0]?.entityId;
      const entityType = this.ctx.datasources[0]?.entityType;

      if (entityId) {
        this.loadEntityData(entityId, entityType);
      }
    }
  };
}
```

**Entity Alias a configurar**: `stateEntity` (tipo "Entity from dashboard state").

### 5.2 Widget multi-entidad (varios tags, datos `timeseries`)

Para el Trend Viewer que puede mostrar múltiples tags de diferentes Devices:

```typescript
ngOnInit() {
  this.ctx.$scope.historianWidget = {
    init: () => {
      // ctx.data contiene TODAS las series configuradas
      // Cada ctx.data[i] tiene:
      //   .datasource.entityId    → ID del Device
      //   .dataKey.name           → nombre del tag (ej: "TI-101-01.PV")
      //   .data                   → [[timestamp, value], ...]

      this.renderAllSeries();
    }
  };
}

// Suscribirse a actualizaciones en tiempo real
private setupSubscription() {
  // Cuando TB recibe nuevos datos, llama onDataUpdated
  this.ctx.defaultSubscription.onDataUpdated = () => {
    this.refreshChart();
    this.ctx.detectChanges();
  };
}
```

### 5.3 Widget estático (sin suscripción de datos)

Para widgets que solo usan REST API (Tag Search, Audit Trail):

```typescript
// En el Widget Type, configurar como tipo "Static"
// No necesita datasources ni entity aliases

ngOnInit() {
  this.ctx.$scope.historianWidget = {
    init: () => {
      // Solo usa ctx.http para llamar APIs
      this.searchTags('');
    }
  };
}

async searchTags(query: string) {
  // Buscar devices y leer sus tagConfig
  const devices = await this.ctx.http.get(
    '/api/tenant/devices?pageSize=100&page=0'
  ).toPromise();
  // ...
}
```

### 5.4 Escuchar broadcasts de otros widgets

Para que un widget reaccione cuando otro widget emite un evento (ej: Tag Browser selecciona tags → Trend Viewer los muestra):

```typescript
ngOnInit() {
  this.ctx.$scope.historianWidget = {
    init: () => {
      // Escuchar cuando Tag Browser selecciona tags
      this.ctx.$scope.$on('tagsSelected', (event, payload) => {
        // payload = { deviceId: '...', tagKeys: ['TI-101-01.PV', 'PI-101.PV'] }
        this.loadTagsData(payload.deviceId, payload.tagKeys);
        this.ctx.detectChanges();
      });
    }
  };
}
```

Para **emitir** un broadcast desde un widget:

```typescript
onTagSelected(deviceId: string, tagKeys: string[]) {
  this.ctx.$scope.$broadcast('tagsSelected', { deviceId, tagKeys });
}
```

---

## 6. Servicios Compartidos — Uso en Widgets

Los servicios definidos en `src/app/shared/services/` se inyectan vía el constructor del componente. Están declarados como `providers` en `historian.module.ts`.

### 6.1 TagMetadataService

```typescript
import { TagMetadataService } from '../shared/services/tag-metadata.service';

@Component({ ... })
export class MyWidgetComponent {

  constructor(private tagMeta: TagMetadataService) {}

  async loadTagInfo(deviceId: string) {
    const config = await this.tagMeta.getTagConfig(this.ctx, deviceId);

    // Iterar tags
    for (const [tagKey, meta] of Object.entries(config)) {
      console.log(`${tagKey}: ${meta.description} (${meta.engUnits})`);
      console.log(`  Rango: ${meta.rangeLo} - ${meta.rangeHi}`);
      console.log(`  Alarmas: LL=${meta.alarmLL} L=${meta.alarmL} H=${meta.alarmH} HH=${meta.alarmHH}`);
      console.log(`  Tipo: ${meta.stepFlag ? 'Discreto' : 'Analógico'}`);
    }
  }
}
```

### 6.2 HierarchyService

```typescript
import { HierarchyService } from '../shared/services/hierarchy.service';

@Component({ ... })
export class TreeWidgetComponent {

  constructor(private hierarchy: HierarchyService) {}

  async loadTree(rootAssetId: string) {
    // Obtener hijos directos
    const children = await this.hierarchy.getChildren(this.ctx, rootAssetId, 'ASSET');

    for (const child of children) {
      if (child.type === 'ASSET') {
        // Es un asset — puede tener más hijos (lazy load al expandir)
        this.tree.push({ ...child, expandable: true, loaded: false });
      } else if (child.type === 'DEVICE') {
        // Es un device — cargar sus tags
        const config = await this.tagMeta.getTagConfig(this.ctx, child.id);
        const tagKeys = Object.keys(config);
        this.tree.push({ ...child, expandable: false, tags: tagKeys });
      }
    }
  }
}
```

### 6.3 TimeWeightedCalcService

```typescript
import { TimeWeightedCalcService } from '../shared/services/time-weighted.service';

@Component({ ... })
export class StatsWidgetComponent {

  constructor(private twCalc: TimeWeightedCalcService) {}

  calculateStats(data: {ts: number, value: number}[]) {
    const avg = this.twCalc.average(data);
    // avg es el promedio PONDERADO POR TIEMPO, no el promedio simple.
    // Esto es fundamental para datos industriales porque un valor que duró
    // 2 horas pesa más que uno que duró 5 segundos.
    console.log(`Promedio ponderado: ${avg}`);
  }
}
```

### 6.4 Quality utility

```typescript
import { qualityToText, qualityIsGood } from '../shared/utils/quality.util';

// En un template:
// <span [class.bad-quality]="!isGood(item.quality)">{{ qualityText(item.quality) }}</span>

qualityText(code: number): string {
  return qualityToText(code);  // 192 → "Good", 64 → "Uncertain", 0 → "Bad"
}

isGood(code: number): boolean {
  return qualityIsGood(code);  // 192 → true, 0 → false
}
```

---

## 7. Build y Despliegue

### 7.1 Build

```bash
cd historian-extensions
yarn build
```

El output es un archivo JavaScript en `dist/`. Por ejemplo: `dist/historian-extensions.js`.

### 7.2 Subir el JS como TB Resource

```bash
# Leer el archivo y convertir a base64 si es necesario (depende de versión TB)
RESOURCE_FILE="dist/historian-extensions.js"

# Subir el recurso
curl -X POST "https://TU_SERVIDOR/api/resource/js" \
  -H "X-Authorization: Bearer $TOKEN" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@${RESOURCE_FILE}" \
  -F "title=historian-extensions" \
  -F "resourceKey=historian-extensions"
```

La respuesta incluye el `resourceId` y la URL del recurso. Guardar la URL, la vas a necesitar para el Widget Type.

```json
{
  "id": { "id": "abc123...", "entityType": "TB_RESOURCE" },
  "title": "historian-extensions",
  "resourceKey": "historian-extensions",
  "link": "/api/resource/js/abc123..."
}
```

### 7.3 Registrar un Widget Type

Cada componente del historiador se registra como un Widget Type en ThingsBoard:

```bash
curl -X POST "https://TU_SERVIDOR/api/widgetType" \
  -H "X-Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d @widget-type-trend-viewer.json
```

**`widget-type-trend-viewer.json`:**

```json
{
  "name": "Historian - Trend Viewer",
  "fqn": "historian.trend_viewer",
  "deprecated": false,
  "descriptor": {
    "type": "timeseries",
    "sizeX": 12,
    "sizeY": 6,
    "resources": [
      {
        "url": "/api/resource/js/abc123...",
        "isModule": true
      }
    ],
    "templateHtml": "<historian-trend-viewer [ctx]=\"ctx\"></historian-trend-viewer>",
    "templateCss": "",
    "controllerScript": "self.onInit = function() { self.ctx.$scope.historianWidget.init(); };",
    "settingsSchema": {},
    "dataKeySettingsSchema": {},
    "defaultConfig": {
      "datasources": [
        {
          "type": "entity",
          "entityAliasId": "stateEntity"
        }
      ],
      "timewindow": {
        "realtime": {
          "timewindowMs": 3600000
        }
      }
    }
  }
}
```

**Campos clave del Widget Type:**

| Campo | Descripción |
|-------|-------------|
| `fqn` | Nombre único global. Formato: `historian.nombre_modulo` |
| `descriptor.type` | Tipo de widget: `timeseries`, `latest`, `alarm`, `static` |
| `descriptor.resources` | Array con la URL del JS bundle. `isModule: true` para SystemJS |
| `descriptor.templateHtml` | El HTML que ThingsBoard inserta. Debe tener el selector de tu componente Angular con `[ctx]="ctx"` |
| `descriptor.controllerScript` | El puente JS que llama a `$scope.historianWidget.init()` |
| `descriptor.defaultConfig` | Configuración por defecto: datasources, timewindow, etc. |

### 7.4 Widget Types por módulo

| Módulo | FQN | Tipo | Template selector |
|--------|-----|------|-------------------|
| M1 Tag Browser | `historian.tag_browser` | `latest` | `<historian-tag-browser>` |
| M2 Trend Viewer | `historian.trend_viewer` | `timeseries` | `<historian-trend-viewer>` |
| M3 Data Grid | `historian.data_grid` | `timeseries` | `<historian-data-grid>` |
| M4 Tag Config | `historian.tag_config` | `static` | `<historian-tag-config>` |
| M5 Alarm Viewer | (widget nativo TB) | `alarm` | N/A |
| M6 HMI Display | `historian.hmi_display` | `latest` | `<historian-hmi-display>` |
| M7 Report Generator | `historian.report_gen` | `timeseries` | `<historian-report-gen>` |
| M8 Calc Engine UI | `historian.calc_engine` | `static` | `<historian-calc-engine>` |
| M9 Data Export | (integrado en M2 y M3) | N/A | N/A |
| M10 Audit Trail | `historian.audit_trail` | `static` | `<historian-audit-trail>` |
| M11 Tag Search | `historian.tag_search` | `static` | `<historian-tag-search>` |
| M12 Comparison | `historian.comparison` | `timeseries` | `<historian-comparison>` |
| M13 Stats | `historian.statistics` | `timeseries` | `<historian-statistics>` |
| M14 Hierarchy | `historian.hierarchy` | `latest` | `<historian-hierarchy>` |
| M15 Realtime | (widgets nativos TB) | `latest` | N/A |
| M16 Batch/Event | `historian.batch_event` | `alarm` | `<historian-batch-event>` |

### 7.5 Script de deploy automatizado

Crear un script `deploy.sh` que haga todo de una vez:

```bash
#!/bin/bash
set -e

TB_URL="https://TU_SERVIDOR"
TB_USER="admin@tudominio.com"
TB_PASS="tu_password"

echo "=== Build ==="
yarn build

echo "=== Login ==="
TOKEN=$(curl -s -X POST "$TB_URL/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$TB_USER\",\"password\":\"$TB_PASS\"}" \
  | jq -r '.token')

echo "=== Upload JS Resource ==="
RESOURCE_RESPONSE=$(curl -s -X POST "$TB_URL/api/resource/js" \
  -H "X-Authorization: Bearer $TOKEN" \
  -F "file=@dist/historian-extensions.js" \
  -F "title=historian-extensions" \
  -F "resourceKey=historian-extensions")

RESOURCE_URL=$(echo $RESOURCE_RESPONSE | jq -r '.link')
echo "Resource URL: $RESOURCE_URL"

echo "=== Done ==="
echo "Actualizar los Widget Types si es primera vez."
echo "Si ya existen, solo se necesitaba subir el nuevo JS."
```

**Importante**: Si ya subiste el recurso antes y solo estás actualizando código, puedes re-subir con el mismo `resourceKey` y los Widget Types existentes apuntarán al nuevo bundle automáticamente (dependiendo de versión TB).

---

## 8. Dashboard: Estados y Navegación

El dashboard del historiador usa **dashboard states** para crear una navegación tipo multi-página sin salir del dashboard.

### 8.1 Concepto de Dashboard States

Un dashboard de ThingsBoard puede tener múltiples **estados** (states). Cada estado tiene su propia disposición de widgets. El usuario navega entre estados pasando una entidad como contexto.

```
Estado: "default" (Vista general de planta)
  ├── Widget: Hierarchy Viewer (M14) — árbol a la izquierda
  ├── Widget: Overview KPIs (M15) — KPIs de toda la planta
  └── Widget: Alarm Summary (M5) — alarmas globales

Estado: "area" (Vista de un área)
  ├── Widget: Hierarchy Viewer (M14) — resaltando el área actual
  ├── Widget: Equipment List — equipos del área
  └── Widget: Area Alarms (M5) — alarmas del área

Estado: "equipment" (Vista de un equipo)
  ├── Widget: Tag Browser (M1) — tags del equipo
  ├── Widget: Trend Viewer (M2) — gráficas
  ├── Widget: Data Grid (M3) — tabla de datos
  └── Widget: Equipment Alarms (M5) — alarmas del equipo
```

### 8.2 Entity Aliases

Los Entity Aliases son la forma en que ThingsBoard resuelve dinámicamente qué entidad debe mostrar cada widget. Para el historiador necesitas estos aliases:

| Alias | Tipo | Descripción |
|-------|------|-------------|
| `selectedEntity` | Entity from dashboard state | La entidad actualmente seleccionada (Asset o Device). Cambia cuando el usuario navega. |
| `rootAsset` | Single entity | El Asset raíz de la planta (ej: "Refinería Norte"). Siempre fijo. |
| `childAssets` | Relations query | Hijos del `selectedEntity` con relación `Contains`. Para listar sub-áreas o equipos. |
| `childDevices` | Relations query | Devices bajo el `selectedEntity` con relación `Contains`. Para acceder a telemetría. |

**Configuración del alias `selectedEntity`:**

```json
{
  "id": "selectedEntity",
  "alias": "Selected Entity",
  "filter": {
    "type": "stateEntity",
    "stateEntityParamName": "entityId",
    "defaultStateEntity": {
      "entityType": "ASSET",
      "id": "ID_DEL_ASSET_RAIZ"
    }
  }
}
```

### 8.3 Navegación entre estados

Cuando el usuario hace clic en un nodo del Hierarchy Viewer:

```typescript
// En el Asset Hierarchy Component (M14)
onNodeClick(node: TreeNode) {
  const targetState = this.resolveState(node.type);

  this.ctx.stateController.updateState(targetState, {
    entityId: { entityType: node.entityType, id: node.id },
    entityName: node.name
  });
}

private resolveState(entityType: string): string {
  // Decidir a qué estado navegar según el tipo de entidad
  switch (entityType) {
    case 'ASSET':
      // Verificar el asset profile para decidir si es área o equipo
      return 'area';  // o 'equipment' según el profile
    case 'DEVICE':
      return 'equipment';
    default:
      return 'default';
  }
}
```

**Navegación con acción de widget (alternativa sin código):**

En el editor de dashboard, se puede configurar una acción de widget tipo "Update dashboard state":

```json
{
  "type": "openDashboardState",
  "targetDashboardStateId": "equipment",
  "setEntityId": true
}
```

Esto se configura visualmente en: Widget → Actions → On Row Click → Navigate to new dashboard state.

### 8.4 Flujo de navegación del historiador

```
[default] Vista general
  El usuario ve la planta completa.
  Hierarchy Viewer muestra: Refinería Norte > CDU, FCC, Utilidades
  Click en "CDU" →

[area] Vista CDU
  selectedEntity = Asset "CDU"
  childAssets alias resuelve: T-101, F-201, E-101
  Alarm Viewer muestra alarmas de CDU y propagadas
  Click en "T-101" →

[equipment] Vista T-101
  selectedEntity = Asset "T-101"
  childDevices alias resuelve: Device "T101-INST"
  Tag Browser carga tagConfig de T101-INST → muestra TI-101-01.PV, PI-101.PV, etc.
  Trend Viewer grafica los tags seleccionados
  Data Grid tabula los valores

  Click en "← CDU" (breadcrumb) → vuelve a [area]
  Click en "← Planta" → vuelve a [default]
```

### 8.5 Breadcrumb de navegación

Para implementar un breadcrumb que muestre la ruta y permita volver atrás:

```typescript
// El stateController mantiene la pila de estados
goBack() {
  // Navegar al estado padre
  this.ctx.stateController.updateState('default', {});
}

// O navegar a un nivel específico
goToArea(areaId: string, areaName: string) {
  this.ctx.stateController.updateState('area', {
    entityId: { entityType: 'ASSET', id: areaId },
    entityName: areaName
  });
}
```

---

## 9. Crear Dashboard vía API

Para crear el dashboard del historiador programáticamente:

```bash
curl -X POST "https://TU_SERVIDOR/api/dashboard" \
  -H "X-Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d @historian-dashboard.json
```

**Estructura simplificada de `historian-dashboard.json`:**

```json
{
  "title": "Historiador de Planta",
  "configuration": {
    "widgets": {
      "widget-hierarchy": {
        "typeFullFqn": "historian.hierarchy",
        "sizeX": 4,
        "sizeY": 12,
        "row": 0,
        "col": 0,
        "config": {
          "datasources": [
            {
              "type": "entity",
              "entityAliasId": "rootAsset"
            }
          ]
        }
      },
      "widget-trend": {
        "typeFullFqn": "historian.trend_viewer",
        "sizeX": 8,
        "sizeY": 6,
        "row": 0,
        "col": 4,
        "config": {
          "datasources": [
            {
              "type": "entity",
              "entityAliasId": "childDevices",
              "dataKeys": []
            }
          ],
          "timewindow": {
            "realtime": { "timewindowMs": 3600000 }
          }
        }
      }
    },
    "states": {
      "default": {
        "name": "Vista General",
        "root": true,
        "layouts": {
          "main": {
            "widgets": {
              "widget-hierarchy": { "sizeX": 4, "sizeY": 12, "row": 0, "col": 0 }
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
              "widget-trend": { "sizeX": 9, "sizeY": 6, "row": 0, "col": 3 }
            }
          }
        }
      }
    },
    "entityAliases": {
      "rootAsset": {
        "id": "rootAsset",
        "alias": "Root Asset",
        "filter": {
          "type": "singleEntity",
          "singleEntity": {
            "entityType": "ASSET",
            "id": "ID_DEL_ASSET_RAIZ"
          }
        }
      },
      "selectedEntity": {
        "id": "selectedEntity",
        "alias": "Selected Entity",
        "filter": {
          "type": "stateEntity"
        }
      },
      "childDevices": {
        "id": "childDevices",
        "alias": "Child Devices",
        "filter": {
          "type": "relationsQuery",
          "rootStateEntity": true,
          "direction": "FROM",
          "maxLevel": 5,
          "filters": [
            {
              "relationType": "Contains",
              "entityTypes": ["DEVICE"]
            }
          ]
        }
      }
    }
  }
}
```

**Nota**: La estructura exacta del JSON de dashboard puede variar entre versiones de TB. Lo más práctico es crear el dashboard visualmente en TB, exportarlo via API (`GET /api/dashboard/{id}`), y usarlo como template para entender la estructura.

---

## 10. Troubleshooting

### 10.1 El widget no aparece / muestra blanco

| Posible causa | Solución |
|---------------|----------|
| El JS resource no se subió correctamente | Verificar: `GET /api/resource/js/{resourceId}` retorna el archivo |
| `templateHtml` no coincide con el selector del componente | Verificar que `<historian-trend-viewer>` coincide con `selector: 'historian-trend-viewer'` en `@Component` |
| `controllerScript` no llama a init() | El controllerScript debe tener `self.onInit = function() { self.ctx.$scope.historianWidget.init(); };` |
| Error en la consola del navegador | F12 → Console. Buscar errores de SystemJS o Angular |
| Falta `[ctx]="ctx"` en templateHtml | El template debe ser `<historian-trend-viewer [ctx]="ctx">` — sin el binding no hay datos |

### 10.2 No llegan datos al widget

| Posible causa | Solución |
|---------------|----------|
| Entity Alias mal configurado | Verificar que el alias resuelve la entidad correcta. Dashboard → Edit → Entity Aliases |
| El Device no tiene telemetry | Verificar: `GET /api/plugins/telemetry/DEVICE/{id}/values/timeseries?keys=TI-101-01.PV` |
| Timewindow no incluye datos | Verificar que el rango de tiempo del widget cubre el período con datos |
| El tipo de widget es incorrecto | Un widget `static` no recibe suscripciones de datos automáticas — usar `timeseries` o `latest` |

### 10.3 `ctx` es undefined

Verificar que el componente tiene `@Input() ctx: WidgetContext` y que el `templateHtml` incluye `[ctx]="ctx"`.

### 10.4 Los atributos tagConfig no se leen

| Posible causa | Solución |
|---------------|----------|
| Se enviaron como `SERVER_SCOPE` en vez de `CLIENT_SCOPE` | Los client attributes los envía el software via MQTT a `v1/devices/me/attributes`. Verificar que el scope sea correcto |
| El JSON de tagConfig es demasiado grande | TB tiene un límite de ~16KB por atributo por defecto. Si tienes muchos tags en un Device, particionar el tagConfig en varios atributos (ej: `tagConfig_1`, `tagConfig_2`) |
| Key inexistente | Verificar: `GET /api/plugins/telemetry/DEVICE/{id}/values/attributes/CLIENT_SCOPE?keys=tagConfig` |

### 10.5 Dashboard state no navega

Verificar:
1. El estado destino existe en la configuración del dashboard (Dashboard → Edit → States)
2. El `stateController.updateState()` recibe el nombre exacto del estado (es case-sensitive)
3. El alias `selectedEntity` está configurado como tipo `stateEntity`

### 10.6 Broadcast entre widgets no funciona

Los broadcasts (`$scope.$broadcast`, `$scope.$on`) funcionan **solo entre widgets del mismo dashboard state**. Si los widgets están en estados diferentes, no se comunicarán. Si necesitas persistir datos entre estados, usar `stateController.updateState()` con parámetros en el state params.

### 10.7 Debug general

```typescript
// Agregar en ngOnInit de cualquier widget para inspeccionar
ngOnInit() {
  console.log('=== WIDGET DEBUG ===');
  console.log('ctx:', this.ctx);
  console.log('datasources:', this.ctx.datasources);
  console.log('data:', this.ctx.data);
  console.log('settings:', this.ctx.settings);
  console.log('stateParams:', this.ctx.stateController?.getStateParams());
}
```

---

## 11. Referencia Rápida

### 11.1 Dónde se almacena cada dato del tag

| Dato | Almacenamiento TB | Scope | Quién lo escribe |
|------|-------------------|-------|------------------|
| Descripción, engUnits, rangos, alarmas, etc. | Client Attribute `tagConfig` en el **Device** | CLIENT_SCOPE | Software de recolección (via MQTT) |
| Valor actual (PV) | Telemetry key `TAGNAME.PV` en el **Device** | Telemetry | Software de recolección (via MQTT) |
| Quality actual | Telemetry key `TAGNAME.Q` en el **Device** | Telemetry | Software de recolección (via MQTT) |
| Quality como texto | Telemetry key `TAGNAME.QT` en el **Device** | Telemetry | Calculated Field (automático) |
| Valores calculados | Telemetry key `CALC.XXX` en el **Device** | Telemetry | Calculated Field o Rule Chain |
| Jerarquía de planta | Relations entre **Assets** y **Devices** | Relations | Configuración manual o script |
| Overrides de config | Server Attribute en el **Device** | SERVER_SCOPE | Widget Tag Config Manager (M4) via REST API |

### 11.2 Endpoints REST API más usados

| Operación | Endpoint |
|-----------|----------|
| Login | `POST /api/auth/login` |
| Telemetry latest | `GET /api/plugins/telemetry/{entityType}/{id}/values/timeseries?keys={keys}` |
| Telemetry histórica | `GET /api/plugins/telemetry/{entityType}/{id}/values/timeseries?keys={keys}&startTs={start}&endTs={end}&agg={AGG}&interval={ms}` |
| Client attributes | `GET /api/plugins/telemetry/{entityType}/{id}/values/attributes/CLIENT_SCOPE?keys={keys}` |
| Server attributes | `GET /api/plugins/telemetry/{entityType}/{id}/values/attributes/SERVER_SCOPE?keys={keys}` |
| Escribir server attrs | `POST /api/plugins/telemetry/{entityType}/{id}/SERVER_SCOPE` con JSON body |
| Relaciones (hijos) | `GET /api/relations?fromId={id}&fromType={type}&relationType=Contains` |
| Info de entidad | `GET /api/asset/{id}` o `GET /api/device/{id}` |
| Alarmas | `GET /api/alarm/{entityType}/{id}?page=0&pageSize=100` |
| Audit logs | `GET /api/audit/logs?page=0&pageSize=100` |
| Subir JS resource | `POST /api/resource/js` multipart |
| Crear widget type | `POST /api/widgetType` |
| Crear dashboard | `POST /api/dashboard` |

### 11.3 Agregaciones disponibles en TB

| Código | Nombre | Nota para historiador |
|--------|--------|----------------------|
| `NONE` | Sin agregación (datos crudos) | Usar para rangos cortos (< 24h) |
| `AVG` | Promedio | **Event-weighted** (no time-weighted). Para promedios correctos usar `TimeWeightedCalcService` client-side |
| `MIN` | Mínimo | Correcto para historiador |
| `MAX` | Máximo | Correcto para historiador |
| `SUM` | Suma | Generalmente no útil para datos de proceso |
| `COUNT` | Conteo | Útil para frecuencia de muestreo |

### 11.4 Mapeo de 16 módulos → documentos

| Módulo | Doc A (datos) | Doc B (módulos) | Doc C (implementación) |
|--------|-------------|----------------|----------------------|
| Datos estáticos (tagConfig) | Sección 4 | — | Sección 6.1 |
| Datos dinámicos (telemetría) | Sección 5 | — | Sección 5.2 |
| Jerarquía de planta | Sección 7 | Sección 2.1 | Sección 8.4 |
| Calculated Fields | — | Sección 2.2, 2.3 | — |
| Alarm Rules | — | Sección 2.4 | — |
| Cada módulo M1-M16 | — | Sección 3 | Sección 7.4 |
| Servicios compartidos | — | Sección 4 | Sección 6 |
| Build y deploy | — | — | Sección 7 |
| Dashboard states | — | — | Sección 8 |
| API REST | — | — | Sección 11.2 |
