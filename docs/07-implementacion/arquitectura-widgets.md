# Arquitectura de Widgets Custom

## Cómo ThingsBoard Carga Widgets

ThingsBoard carga widgets custom como **módulos SystemJS en runtime**:

```
Tu código Angular (TypeScript)
    ↓  yarn build
Bundle JavaScript (.js)
    ↓  upload via REST API
TB Resource Library (almacena el .js)
    ↓  Widget Type referencia el resource
Dashboard carga el widget
    ↓  SystemJS importa el módulo
Componente Angular renderiza en el DOM
```

---

## El Puente $scope

Cada widget tiene un `controllerScript` que actúa como puente entre TB y tu componente Angular:

```javascript
// controllerScript (se almacena como string en el Widget Type JSON)
self.onInit = function() {
    self.ctx.$scope.historianWidget.init();
};
```

En tu componente Angular:

```typescript
@Component({ selector: 'historian-trend-viewer', ... })
export class TrendViewerComponent implements OnInit {
  @Input() ctx: WidgetContext;

  ngOnInit() {
    this.ctx.$scope.historianWidget = {
      init: () => {
        // El DOM está listo, suscripciones activas
        this.initChart();
      }
    };
  }
}
```

---

## WidgetContext (ctx)

El `ctx` es el objeto más importante — da acceso a todo:

| Propiedad | Qué da |
|-----------|--------|
| `ctx.data` | Datos de telemetría suscritos |
| `ctx.datasources` | Datasources configurados |
| `ctx.settings` | Configuración custom del widget |
| `ctx.stateController` | Control de estado del dashboard |
| `ctx.http` | HttpClient de Angular para REST API |
| `ctx.attributeService` | Servicio de atributos TB |
| `ctx.aliasController` | Resolución de entity aliases |
| `ctx.detectChanges()` | Forzar change detection Angular |
| `ctx.defaultSubscription` | Suscripción principal de datos |
| `ctx.$scope` | Scope compartido con controllerScript |

---

## Patrones de Widget

### Patrón 1: Entidad única (latest)
Widget que muestra datos de la entidad seleccionada:

```typescript
ngOnInit() {
  this.ctx.$scope.historianWidget = {
    init: () => {
      const entityId = this.ctx.datasources[0]?.entityId;
      if (entityId) this.loadEntityData(entityId);
    }
  };
}
```

### Patrón 2: Multi-entidad (timeseries)
Widget que muestra datos de múltiples Device-tags:

```typescript
ngOnInit() {
  this.ctx.$scope.historianWidget = {
    init: () => {
      // ctx.data contiene TODAS las series
      this.renderAllSeries();
    }
  };
  // Suscribirse a actualizaciones real-time
  this.ctx.defaultSubscription.onDataUpdated = () => {
    this.refreshChart();
    this.ctx.detectChanges();
  };
}
```

### Patrón 3: Estático (REST API)
Widget sin suscripción de datos:

```typescript
ngOnInit() {
  this.ctx.$scope.historianWidget = {
    init: () => {
      this.ctx.http.get('/api/tenant/devices?type=Tag&pageSize=100&page=0')
        .toPromise().then(devices => { ... });
    }
  };
}
```

### Patrón 4: Broadcast (comunicación inter-widget)

**Emitir:**
```typescript
onTagSelected(devices) {
  this.ctx.$scope.$broadcast('tagsSelected', { devices });
}
```

**Escuchar:**
```typescript
this.ctx.$scope.$on('tagsSelected', (event, payload) => {
  this.loadTagsData(payload.devices);
  this.ctx.detectChanges();
});
```

**Nota**: Broadcasts funcionan solo entre widgets del **mismo dashboard state**.

---

## Widget Type JSON

Cada módulo se registra como un Widget Type:

```json
{
  "name": "Historian - Trend Viewer",
  "fqn": "historian.trend_viewer",
  "descriptor": {
    "type": "timeseries",
    "resources": [{ "url": "/api/resource/js/abc123...", "isModule": true }],
    "templateHtml": "<historian-trend-viewer [ctx]=\"ctx\"></historian-trend-viewer>",
    "controllerScript": "self.onInit = function() { self.ctx.$scope.historianWidget.init(); };",
    "defaultConfig": {
      "datasources": [{ "type": "entity", "entityAliasId": "stateEntity" }],
      "timewindow": { "realtime": { "timewindowMs": 3600000 } }
    }
  }
}
```

Campos clave:
- `fqn`: Nombre único global (formato `historian.nombre_modulo`)
- `descriptor.type`: `timeseries`, `latest`, `alarm`, `static`
- `descriptor.resources`: URL del bundle JS con `isModule: true`
- `descriptor.templateHtml`: Selector Angular con `[ctx]="ctx"`
