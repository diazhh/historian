# W2 — Tag Browser / Search

> **Fuente**: [`prmpt.md`](../../prmpt.md) Seccion 6 — Tabla de widgets custom
> **Complejidad**: Media (2-3 semanas)
> **Tipo widget**: `latest`
> **FQN**: `historian.tag_browser`

---

## Descripcion

El **Tag Browser / Search** permite buscar tags por nombre, descripcion, atributos y posicion
en la jerarquia de activos. Los resultados se presentan en tabla con ultimo valor, calidad,
unidades, y timestamp. Su funcion principal es la **seleccion de tags para enviar al Trend
Viewer (W1)** mediante dashboard actions.

ThingsBoard nativo ofrece el widget **Entities Table** con busqueda full-text y columnas
customizables. W2 extiende este concepto con filtros avanzados por atributos, vista de ultimo
valor en tiempo real, y la accion critica de "add-to-trend".

---

## Fuentes de Datos (APIs)

| API | Endpoint | Uso |
|-----|----------|-----|
| Entity API | `GET /api/tenant/devices?pageSize=&page=&textSearch=` | Busqueda por nombre |
| Entity API | `GET /api/relations/info?fromId=&fromType=ASSET` | Navegacion jerarquica |
| Telemetry API | `GET /api/plugins/telemetry/DEVICE/{id}/values/timeseries?keys=PV` | Ultimo valor de cada tag |
| Attributes API | `GET /api/plugins/telemetry/DEVICE/{id}/values/attributes` | Metadatos: unidades, descripcion, tipo |
| Entity Groups API (PE) | `GET /api/entityGroup/{groupId}/entities?pageSize=&page=` | Filtrar por grupo de devices |

---

## Funcionalidades Clave

### 1. Busqueda Multi-Criterio

| Criterio | Implementacion | Ejemplo |
|----------|---------------|---------|
| Nombre del tag | `textSearch` en Entity API | `FIC-101`, `TT-*` |
| Descripcion | Filtro client-side sobre atributo `description` | "temperatura reactor" |
| Unidad de ingenieria | Filtro por atributo `ss_units` | "degC", "PSI" |
| Area / Unidad | Navegacion por relaciones desde Asset padre | Area: "Destilacion" |
| Tipo de tag | Filtro por Device Profile label | "Analog Input", "Calculated" |

**Nota**: La busqueda server-side de TB solo filtra por nombre de entidad. Los filtros por
atributos requieren: (a) cargar entidades por paginas, (b) enriquecer con atributos, (c)
filtrar client-side. Para volumen alto (>1,000 tags), implementar cache local de metadatos.

### 2. Tabla de Resultados

Columnas de la tabla de resultados:

| Columna | Fuente | Formato |
|---------|--------|---------|
| Nombre | `device.name` | String |
| Descripcion | Atributo `description` | String, truncado 50 chars |
| Ultimo Valor | Latest telemetry `PV` | Numerico con precision del tag |
| Unidad | Atributo `ss_units` | String (degC, PSI, %, m3/h) |
| Timestamp | Timestamp del ultimo PV | `HH:mm:ss dd/MM` |
| Calidad | Atributo `quality_code` | Icono: verde=Good, amarillo=Uncertain, rojo=Bad |
| Area | Asset padre via relacion | Breadcrumb: Planta > Area > Unidad |

### 3. Add-to-Trend (Funcion Critica)

Flujo de seleccion y envio al Trend Viewer:

1. El usuario marca checkboxes en la tabla de resultados
2. Boton **"Agregar a Trend"** se activa (minimo 1 tag seleccionado)
3. Al hacer click, se emite un **dashboard action** `tagsSelected`:

```javascript
// Emision via dashboard action
self.ctx.actionsApi.handleWidgetAction(
  event,
  descriptors['tagsSelected'],
  selectedDeviceIds  // Array de device IDs
);
```

4. El Trend Viewer (W1) recibe los IDs y suscribe a sus telemetrias

### 4. Favoritos y Recientes

- **Favoritos**: Almacenar device IDs en `localStorage` del browser
- **Recientes**: Ultimos 20 tags visualizados, persistidos en sesion
- **Pestanias**: "Todos", "Favoritos", "Recientes" como filtros rapidos

### 5. Vista de Arbol Jerarquico

Modo alternativo a la tabla: arbol expandible que refleja la jerarquia de activos.

```
Planta Petroleo
├── Area Destilacion
│   ├── Unidad CDU-01
│   │   ├── TT-101 (450.2 degC)
│   │   ├── PT-101 (12.5 PSI)
│   │   └── FIC-101 (1250.0 m3/h)
│   └── Unidad CDU-02
│       └── ...
└── Area Servicios
    └── ...
```

Implementar con `mat-tree` (Angular Material) o arbol custom con lazy-loading por nivel.

---

## Enfoque de Implementacion

### Base: Entities Table Nativo

Se puede partir del widget nativo **Entities Table** y extender con:

1. Barra de busqueda con filtros desplegables (tipo, unidad, area)
2. Columnas adicionales con latest telemetry
3. Checkboxes de seleccion multiple
4. Boton de accion "Agregar a Trend"
5. Toggle entre vista tabla y vista arbol

### Arquitectura del Widget

```
w2-tag-browser/
├── tag-browser.component.ts      // Componente principal
├── tag-browser.module.ts
├── components/
│   ├── search-bar.component.ts   // Barra de busqueda con filtros
│   ├── results-table.component.ts // Tabla paginada de resultados
│   └── tree-view.component.ts    // Vista jerarquica alternativa
├── services/
│   ├── tag-search.service.ts     // Queries a Entity API + cache
│   └── favorites.service.ts      // Persistencia localStorage
└── models/
    └── tag-result.model.ts       // Interface de resultado de busqueda
```

### Comunicacion con Otros Widgets

```
W2 --[tagsSelected]--> W1 (Trend Viewer)    // Agregar tags a grafico
W2 --[tagClicked]----> W3 (Tag Detail)      // Ver detalle de tag
W2 --[tagClicked]----> W7 (Tag Config)      // Configurar tag
```

---

## Dependencias

| Dependencia | Version | Motivo |
|-------------|---------|--------|
| Angular Material | 17+ | mat-tree, mat-table, mat-autocomplete |
| RxJS | 7.x | Debounce en busqueda, streams de datos |
| Angular | 17+ | Framework TB Extensions |

---

## Riesgos y Mitigaciones

| Riesgo | Probabilidad | Mitigacion |
|--------|-------------|------------|
| Busqueda por atributos requiere filtro client-side | Alta | Cache de metadatos en memoria; paginacion server-side |
| Rendimiento con >10K tags en tabla | Media | Virtual scrolling (cdk-virtual-scroll); lazy load |
| Entity API no soporta busqueda combinada | Alta | Componer queries: primero por nombre, luego enriquecer |
| Latencia al cargar ultimo valor de muchos tags | Media | Batch telemetry API; actualizar solo tags visibles |
