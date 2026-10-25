# Prompt para Claude Code Desktop - Dashboard Industrial Historian

## Contexto

Estoy construyendo un Industrial Historian sobre ThingsBoard PE 4.x. Ya tengo:
- 7 widget types custom registrados en un bundle
- Un JS resource (SystemJS module) compilado y subido
- 24 dispositivos simulando datos cada 5 segundos (PV + Q telemetry)
- Un dashboard creado via API que NO funciona correctamente

Necesito que accedas al navegador, revises el dashboard actual, diagnostiques los errores, y lo arregles hasta que funcione.

## Acceso a ThingsBoard

- **URL**: https://panel.atilax.io
- **Usuario**: well@atilax.io
- **Password**: 10203040
- **Dashboard actual**: https://panel.atilax.io/dashboards/88d37b00-0e8b-11f1-90c6-8f12f97ce13a

## Arquitectura del Proyecto

### Modelo de datos: 1 Device = 1 Tag
Cada tag industrial es un Device en ThingsBoard con:
- Telemetry key `PV` (Process Value, float)
- Telemetry key `Q` (Quality code, int 192 = Good)
- Server attributes: `ss_rangeLow`, `ss_rangeHigh`, `ss_engUnits`, `ss_description`, `ss_deadband`, `ss_alarmHH`, `ss_alarmH`, `ss_alarmL`, `ss_alarmLL`, `ss_instrumentType`, `ss_dataType`, `ss_scanRate`, `ss_setpoint`

### Jerarquia ISA-95 (Assets -> Devices)
```
ACME Oil & Gas (Enterprise)  [id: a18102c0-0e82-11f1-90c6-8f12f97ce13a]
  └── Planta Norte (Plant)
        ├── ESP-001 (Equipment - Asset)
        │     ├── ESP001_PIT_001 (Device - Pressure tag)
        │     ├── ESP001_FIT_001 (Device - Flow tag)
        │     ├── ESP001_TIT_001 (Device - Temperature tag)
        │     └── ... (6 tags total per equipment)
        ├── ESP-002 (Equipment)
        │     └── ... (6 tags)
        ├── C-001 (Compressor)
        │     └── ... (6 tags)
        └── C-002 (Compressor)
              └── ... (6 tags)
```
Relations: Asset "Contains" -> child Assets/Devices

### Widget Bundle registrado
- **Bundle**: "Industrial Historian" (id: `62eae400-0e8b-11f1-90c6-8f12f97ce13a`)
- **JS Resource**: `/api/resource/js_module/tenant/thingsboard-extension-widgets_(1).js`

### 7 Widget Types (fqn -> selector -> type)
| FQN | Angular Selector | TB Type | Descripcion |
|-----|-----------------|---------|-------------|
| `historian.trend_viewer` | `<historian-trend-viewer>` | timeseries | Multi-pen time-series chart (ECharts) |
| `historian.tag_browser` | `<historian-tag-browser>` | latest | ISA-95 tree browser with search, favorites, recents |
| `historian.tag_detail` | `<historian-tag-detail>` | latest | Single tag detail panel (live value, attributes, sparkline) |
| `historian.event_timeline` | `<historian-event-timeline>` | alarm | Alarm/event list with acknowledge |
| `historian.adhoc_query` | `<historian-adhoc-query>` | static | Flexible query tool with table/chart/stats views |
| `historian.batch_comparison` | `<historian-batch-comparison>` | timeseries | Compare time ranges side by side |
| `historian.tag_config` | `<historian-tag-config>` | static | Edit tag server attributes |

Todos los widgets usan el mismo controllerScript:
```javascript
self.onInit = function() { self.ctx.$scope.historianWidget.init(); };
self.onDataUpdated = function() {};
self.onDestroy = function() {};
```

Y cada templateHtml es simplemente:
```html
<historian-XXXX [ctx]="ctx"></historian-XXXX>
```

Los widgets NO usan datasources de ThingsBoard. Internamente hacen HTTP calls via `ctx.http.get(...)` al API REST de ThingsBoard.

### Entity Aliases necesarios en el dashboard
1. **selectedEntity** -- `stateEntity` (resolves from dashboard state params)
2. **rootAsset** -- `singleEntity` pointing to ACME Oil & Gas (id: `a18102c0-0e82-11f1-90c6-8f12f97ce13a`)
3. **childDevices** -- `relationsQuery` from state entity, direction FROM, maxLevel 5, filter Contains -> DEVICE

## Lo que necesito que hagas

### Paso 1: Diagnosticar
1. Abre https://panel.atilax.io en el navegador
2. Login con las credenciales
3. Navega al dashboard Industrial Historian
4. Abre la consola del navegador (F12 -> Console)
5. Identifica los errores que impiden que cargue

### Paso 2: Arreglar el Dashboard
Segun los errores, puede ser necesario:

**Opcion A**: Si los widgets no renderizan (Angular component not found):
- Verifica que el JS resource se carga (Network tab -> busca `thingsboard-extension-widgets`)
- Si no carga, revisa la URL del resource en los widget types
- Puede ser necesario recrear los widget types con la URL correcta

**Opcion B**: Si el dashboard carga pero esta vacio o mal configurado:
- Entra en modo edicion del dashboard
- Configura correctamente los widgets en sus posiciones
- El layout ideal para el state "default" (Plant Overview) es:
  - Tag Browser (izquierda, 3 columnas, altura completa)
  - Trend Viewer (centro-derecha, 9 columnas, mitad superior)
  - Event Timeline (centro-derecha, 9 columnas, mitad inferior)
- El state "equipment" (Equipment Detail) deberia tener:
  - Tag Browser (izquierda, 3 columnas)
  - Tag Detail (centro, 3 columnas)
  - Trend Viewer (derecha, 6 columnas, arriba)
  - Ad-hoc Query (derecha, 6 columnas, abajo)

**Opcion C**: Si hay errores de JavaScript en la consola:
- Identifica el error especifico
- Puede ser un problema con el build del Angular module
- El codigo fuente esta en: `/Users/diazhh/Documents/GitHub/historian/thingsboard-extensions/`
- Para recompilar: `cd /Users/diazhh/Documents/GitHub/historian/thingsboard-extensions && yarn build`
- El build genera: `target/generated-resources/thingsboard-extension-widgets.js`
- Para re-subir el JS, usar el API de ThingsBoard (ver abajo)

### Paso 3: Verificar
1. Navega al dashboard
2. Verifica que el Tag Browser muestra la jerarquia de assets
3. Haz click en un tag (ej: ESP001_PIT_001)
4. Verifica que el Trend Viewer muestra datos (hay datos de los ultimos ~30 minutos y un backfill de 24 horas)
5. Toma screenshot del dashboard funcionando

## API REST util

```bash
# Auth token
curl -X POST 'https://panel.atilax.io/api/auth/login' \
  -H 'Content-Type: application/json' \
  -d '{"username":"well@atilax.io","password":"10203040"}'
# Token is in response.token, use as: -H "X-Authorization: Bearer $TOKEN"

# Get dashboard
GET /api/dashboard/88d37b00-0e8b-11f1-90c6-8f12f97ce13a

# Update dashboard (POST, not PUT!)
POST /api/dashboard  (body = full dashboard JSON with id)

# Widget types in bundle
GET /api/widgetTypesDetails?widgetsBundleId=62eae400-0e8b-11f1-90c6-8f12f97ce13a

# Update/create widget type
POST /api/widgetType?updateExistingByFqn=true

# Upload new JS resource (multipart)
POST /api/resource/upload  with form fields:
  - resourceType=JS_MODULE
  - resourceSubType=EXTENSION
  - title=historian-extensions
  - file=@thingsboard-extension-widgets.js;type=application/javascript

# Check telemetry (verify data exists)
# Device ESP001_PIT_001: id=a702c530-0e82-11f1-90c6-8f12f97ce13a
GET /api/plugins/telemetry/DEVICE/a702c530-0e82-11f1-90c6-8f12f97ce13a/values/timeseries?keys=PV,Q&useStrictDataTypes=true
```

## Codigo fuente relevante

El proyecto esta en `/Users/diazhh/Documents/GitHub/historian/`. Los widgets estan en:
- `thingsboard-extensions/src/app/components/historian/w1-trend-viewer/` -- Trend Viewer
- `thingsboard-extensions/src/app/components/historian/w2-tag-browser/` -- Tag Browser
- `thingsboard-extensions/src/app/components/historian/w3-tag-detail/` -- Tag Detail
- `thingsboard-extensions/src/app/components/historian/w4-event-timeline/` -- Event Timeline
- `thingsboard-extensions/src/app/components/historian/w5-adhoc-query/` -- Ad-hoc Query
- `thingsboard-extensions/src/app/components/historian/w6-batch-comparison/` -- Batch Comparison
- `thingsboard-extensions/src/app/components/historian/w7-tag-config/` -- Tag Config

Cada widget tiene: `.component.ts`, `.component.html`, `.component.scss`, `.module.ts`

El modulo raiz: `thingsboard-extensions/src/app/components/historian/historian.module.ts`
El build genera: `thingsboard-extensions/target/generated-resources/thingsboard-extension-widgets.js`

Para compilar: `cd /Users/diazhh/Documents/GitHub/historian/thingsboard-extensions && yarn build`
