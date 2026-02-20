# W7 — Tag Configuration

> **Fuente**: [`prmpt.md`](../../prmpt.md) Seccion 4 y 6
> **Complejidad**: Baja-Media (1-2 semanas)
> **Tipo widget**: `static`
> **FQN**: `historian.tag_config`

---

## Descripcion

El **Tag Configuration** permite editar los atributos server-side de los tags del historiador:
setpoints, rangos de operacion, limites de alarma, deadband, unidades de ingenieria, y descripcion.
Incluye validacion de coherencia entre valores (ej: rangeLow < rangeHigh, alarmLL < alarmL <
alarmH < alarmHH) y capacidad de importar/exportar configuraciones masivas desde/hacia Excel.

Es el equivalente al editor de atributos de PI AF, enfocado en los parametros operacionales
del tag que afectan la visualizacion, las alarmas, y los calculos.

---

## Fuentes de Datos (APIs)

| API | Endpoint | Uso |
|-----|----------|-----|
| Attributes API (GET) | `GET /api/plugins/telemetry/DEVICE/{id}/values/attributes/SERVER_SCOPE` | Leer atributos actuales |
| Attributes API (POST) | `POST /api/plugins/telemetry/DEVICE/{id}/SERVER_SCOPE` | Guardar atributos editados |
| Entity API | `GET /api/tenant/devices?pageSize=&page=&textSearch=` | Buscar tags para configurar |
| Entity Groups API (PE) | `GET /api/entityGroup/{groupId}/entities` | Listar tags de un grupo |

### Endpoint de Escritura

```
POST /api/plugins/telemetry/DEVICE/{deviceId}/SERVER_SCOPE
Content-Type: application/json
X-Authorization: Bearer $JWT

{
  "ss_setpoint": 450,
  "ss_rangeLow": 0,
  "ss_rangeHigh": 600,
  "ss_alarmHH": 520,
  "ss_alarmH": 480,
  "ss_alarmL": 400,
  "ss_alarmLL": 350,
  "ss_deadband": 0.5,
  "ss_units": "degC",
  "description": "Temperatura reactor principal"
}
```

---

## Funcionalidades Clave

### 1. Formulario de Edicion de Atributos

Formulario organizado por secciones:

**Seccion: Identificacion**

| Campo | Clave Atributo | Tipo | Validacion |
|-------|---------------|------|------------|
| Descripcion | `description` | text | Max 200 caracteres |
| Unidades | `ss_units` | select | Lista predefinida (degC, degF, PSI, bar, %, m3/h, ...) |
| Tipo de tag | `ss_tagType` | select | AI, AO, DI, DO, Calc |
| Scan rate (ms) | `ss_scanRate` | number | Min 100, max 60000 |
| Precision decimal | `ss_precision` | number | 0-6 |

**Seccion: Rangos de Operacion**

| Campo | Clave Atributo | Tipo | Validacion |
|-------|---------------|------|------------|
| Rango bajo | `ss_rangeLow` | number | < rangeHigh |
| Rango alto | `ss_rangeHigh` | number | > rangeLow |
| Setpoint | `ss_setpoint` | number | >= rangeLow y <= rangeHigh |
| Deadband | `ss_deadband` | number | >= 0 |

**Seccion: Limites de Alarma**

| Campo | Clave Atributo | Tipo | Validacion |
|-------|---------------|------|------------|
| Alarma LL | `ss_alarmLL` | number | >= rangeLow |
| Alarma L | `ss_alarmL` | number | > alarmLL |
| Alarma H | `ss_alarmH` | number | > alarmL y > setpoint |
| Alarma HH | `ss_alarmHH` | number | > alarmH y <= rangeHigh |

### 2. Validacion de Coherencia

Reglas de validacion que se verifican antes de guardar:

```javascript
function validateAlarmLimits(config) {
  const errors = [];

  // Rangos
  if (config.ss_rangeLow >= config.ss_rangeHigh) {
    errors.push('Rango bajo debe ser menor que rango alto');
  }

  // Setpoint dentro de rango
  if (config.ss_setpoint < config.ss_rangeLow ||
      config.ss_setpoint > config.ss_rangeHigh) {
    errors.push('Setpoint debe estar dentro del rango');
  }

  // Orden de alarmas: LL < L < H < HH
  if (config.ss_alarmLL >= config.ss_alarmL) {
    errors.push('Alarma LL debe ser menor que alarma L');
  }
  if (config.ss_alarmL >= config.ss_alarmH) {
    errors.push('Alarma L debe ser menor que alarma H');
  }
  if (config.ss_alarmH >= config.ss_alarmHH) {
    errors.push('Alarma H debe ser menor que alarma HH');
  }

  // Alarmas dentro de rango
  if (config.ss_alarmLL < config.ss_rangeLow) {
    errors.push('Alarma LL debe ser >= rango bajo');
  }
  if (config.ss_alarmHH > config.ss_rangeHigh) {
    errors.push('Alarma HH debe ser <= rango alto');
  }

  return errors;
}
```

Visualizacion grafica de rangos y limites (barra vertical):

```
  rangeHigh ──── 600 ┄┄┄┄┄┄┄
  alarmHH  ──── 520 ═══ ROJO
  alarmH   ──── 480 ═══ NARANJA
  setpoint ──── 450 ─── VERDE (linea central)
  alarmL   ──── 400 ═══ NARANJA
  alarmLL  ──── 350 ═══ ROJO
  rangeLow ──── 0   ┄┄┄┄┄┄┄
```

### 3. Bulk Import desde Spreadsheet (SheetJS)

Importar configuracion de multiples tags desde archivo Excel:

**Formato del Excel de entrada:**

| DeviceName | description | ss_units | ss_rangeLow | ss_rangeHigh | ss_setpoint | ss_alarmHH | ss_alarmH | ss_alarmL | ss_alarmLL | ss_deadband |
|------------|------------|----------|-------------|-------------|------------|-----------|---------|---------|----------|-----------|
| TT-101 | Temp reactor | degC | 0 | 600 | 450 | 520 | 480 | 400 | 350 | 0.5 |
| PT-102 | Presion salida | PSI | 0 | 50 | 25 | 45 | 40 | 10 | 5 | 0.1 |

```javascript
import * as XLSX from 'xlsx';

async function importFromExcel(file) {
  const workbook = XLSX.read(await file.arrayBuffer());
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);

  const results = { success: 0, errors: [] };

  for (const row of rows) {
    // 1. Buscar device por nombre
    const device = await findDeviceByName(row.DeviceName);
    if (!device) {
      results.errors.push(`Device no encontrado: ${row.DeviceName}`);
      continue;
    }

    // 2. Validar coherencia
    const errors = validateAlarmLimits(row);
    if (errors.length > 0) {
      results.errors.push(`${row.DeviceName}: ${errors.join(', ')}`);
      continue;
    }

    // 3. Escribir atributos
    await saveAttributes(device.id.id, row);
    results.success++;
  }

  return results;
}
```

### 4. Bulk Export a Spreadsheet

Exportar configuracion actual de todos los tags (o grupo seleccionado) a Excel:

```javascript
async function exportToExcel(deviceIds) {
  const rows = [];

  for (const id of deviceIds) {
    const attrs = await getAttributes(id, 'SERVER_SCOPE');
    const device = await getDevice(id);
    rows.push({
      DeviceName: device.name,
      ...attrsToObject(attrs)
    });
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Configuracion');
  XLSX.writeFile(wb, `tag_config_${Date.now()}.xlsx`);
}
```

### 5. Historial de Cambios

Registrar cada modificacion de atributos como telemetria para auditoria:

```javascript
// Despues de guardar exitosamente
await saveTelemetry(deviceId, {
  config_change: JSON.stringify({
    user: currentUser.email,
    timestamp: Date.now(),
    field: 'ss_setpoint',
    oldValue: 450,
    newValue: 460
  })
});
```

---

## Enfoque de Implementacion

### Arquitectura del Widget

```
w7-tag-configuration/
├── tag-config.component.ts          // Componente principal
├── tag-config.module.ts
├── components/
│   ├── config-form.component.ts     // Formulario de edicion
│   ├── range-visualizer.component.ts // Barra grafica de rangos
│   ├── import-dialog.component.ts   // Dialog de importacion Excel
│   └── export-dialog.component.ts   // Dialog de exportacion
├── services/
│   ├── attributes.service.ts        // CRUD de atributos server-side
│   ├── validation.service.ts        // Validacion de coherencia
│   └── excel-io.service.ts          // Import/export SheetJS
└── models/
    └── tag-config.model.ts          // Interface de configuracion
```

### Widget Editor vs Extension

Dada la complejidad **Baja-Media**, el formulario basico puede implementarse en el Widget
Editor. La funcionalidad de import/export Excel requiere SheetJS, que se carga via CDN.

Para funcionalidad completa (validacion visual, bulk import con progreso), usar Extension.

### Permisos

Solo usuarios con rol **TENANT_ADMIN** o con permisos de escritura sobre el device
deben poder editar atributos. Verificar permisos antes de mostrar botones de edicion.

---

## Dependencias

| Dependencia | Version | Motivo |
|-------------|---------|--------|
| SheetJS (xlsx) | 0.20+ | Import/export Excel |
| Angular Material | 17+ | Formularios, dialogs, snackbar |
| Angular | 17+ | Framework TB Extensions |

---

## Riesgos y Mitigaciones

| Riesgo | Probabilidad | Mitigacion |
|--------|-------------|------------|
| Escritura masiva de atributos genera carga en DB | Media | Rate limit en bulk import (50ms entre writes) |
| Error en import corrompe configuracion | Media | Validar TODOS los rows antes de escribir; rollback manual |
| Cambio de limites de alarma no actualiza alarm rules | Alta | Alarm rules usan "Inherit from owner" con dynamic thresholds |
| Permisos insuficientes para escribir atributos | Baja | Verificar permisos pre-edicion; UI read-only si no tiene permiso |
| Schema de atributos no estandarizado | Media | Template Excel con headers fijos; validacion de columnas al importar |
