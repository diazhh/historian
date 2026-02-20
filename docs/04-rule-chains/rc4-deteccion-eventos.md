# RC4: Rule Chain de Detección de Eventos y Alarmas

> **Fuente**: [`prmpt.md`](../../prmpt.md) — Secciones 2 y 7 (Rule Chain 4)

---

## Propósito

Detecta condiciones anormales y genera alarmas que sirven como **Event Frames** del historiador. Incluye: alarmas de proceso (HH/H/L/LL), rate-of-change, datos estancados, y captura de contexto.

---

## Componente 1: Alarm Rules en Device Profile (sin rule chain)

Las alarmas HH/H/L/LL se configuran **directamente en el Device Profile**, no en una rule chain separada:

### Configuración

```
Alarm Rule: "Process Alarm"

  Create condition 1 (CRITICAL): PV > dynamic_value(attribute: ss_alarmHH)
  Create condition 2 (MAJOR):    PV > dynamic_value(attribute: ss_alarmH)
  Create condition 3 (MAJOR):    PV < dynamic_value(attribute: ss_alarmL)
  Create condition 4 (CRITICAL): PV < dynamic_value(attribute: ss_alarmLL)

  Clear condition: PV < dynamic_value(attribute: ss_alarmH) AND PV > dynamic_value(attribute: ss_alarmL)

  Propagate to related entities: YES
```

Las condiciones se evalúan en **orden descendente de severidad** (Critical primero).

### Tipos de Condición

| Tipo | Qué hace | Uso en historiador |
|------|----------|-------------------|
| **Simple** | Umbral inmediato | Alarmas HH/H/L/LL estándar |
| **Duration** | Condición sostenida N segundos | "Temp > 400°C por más de 60 seg" |
| **Repeating** | Condición ocurre N veces | "Presión oscilante N veces en X minutos" |

### Umbrales Dinámicos con Herencia

Los umbrales referencian atributos del device: `ss_alarmHH`, `ss_alarmH`, etc. Soportan **herencia jerárquica** ("Inherit from owner"):
- Si el device no tiene `ss_alarmHH`, busca en el Customer
- Si el Customer no lo tiene, busca en el Tenant
- Permite defaults a nivel de planta que se sobreescriben por tag

---

## Componente 2: Rate-of-Change (Rule Chain)

Detecta cambios bruscos en el valor del proceso.

```
[Calculate Delta]            ← delta = PV_actual - PV_anterior, periodInMs
      ▼
[Script Transformation TBEL] ← Calcular rate
      ▼
[Script Filter TBEL]         ← ¿rate > threshold?
      │
      ├─ True ──► [Create Alarm] "RATE_OF_CHANGE"
      └─ False ──► (continuar)
```

### Script: Calcular Rate

```tbel
var rate = msg.delta / (msg.periodInMs / 1000.0);  // unidades/segundo
msg.rate = rate;
msg.ratePerMinute = rate * 60;  // unidades/minuto
return {msg: msg, metadata: metadata, msgType: msgType};
```

### Script: Filtrar por Threshold

```tbel
// Threshold de rate-of-change desde atributos del device
var threshold = metadata.ss_rateThreshold;
if (threshold == null) {
  return false;  // Sin threshold configurado, no alarmar
}
return Math.abs(msg.ratePerMinute) > threshold;
```

---

## Componente 3: Detección de Datos Estancados

TB tiene **Inactivity Events** nativos:

### Configuración en Device Profile

```
Inactivity timeout: 300 (segundos = 5 minutos)
```

Si un device no envía telemetría en 5 minutos, TB genera automáticamente un **Inactivity Event** que puede:
- Crear una alarma "STALE_DATA"
- Enviar notificación
- Ejecutar acciones en rule chain

### Rule Chain complementaria: Detección de valor estancado

Si el device envía datos pero el **valor no cambia** (sensor pegado):

```
[Calculate Delta]
      ▼
[Script Filter TBEL]
      │
      └─ msg.delta == 0 && msg.periodInMs > 300000  ──► [Create Alarm] "STALE_VALUE"
```

---

## Componente 4: Captura de Contexto en Alarm Details

Cuando se crea una alarma, capturar valores contextuales del proceso:

### Script TBEL para Alarm Details

```tbel
var details = {};

// Valor que disparó la alarma
details.PV = msg.PV;
details.timestamp = metadata.ts;

// Setpoint y límites
details.setpoint = metadata.ss_setpoint;
details.alarmHH = metadata.ss_alarmHH;
details.alarmH = metadata.ss_alarmH;
details.alarmL = metadata.ss_alarmL;
details.alarmLL = metadata.ss_alarmLL;

// Desviación del setpoint
if (metadata.ss_setpoint != null) {
  details.deviation = msg.PV - metadata.ss_setpoint;
  details.deviationPct = ((msg.PV - metadata.ss_setpoint) / metadata.ss_setpoint) * 100;
}

// Rate of change si disponible
if (msg.ratePerMinute != null) {
  details.ratePerMinute = msg.ratePerMinute;
}

return details;
```

Estos details quedan almacenados en el JSON de la alarma y son consultables via API.

---

## Mapeo: Alarmas TB → Event Frames

| Concepto PI | Equivalente TB | Campo |
|-------------|---------------|-------|
| Event start time | `startTs` | Automático al crear alarma |
| Event end time | `endTs` | Automático al limpiar alarma |
| Event type | `type` | alarm type string |
| Event severity | `severity` | CRITICAL/MAJOR/MINOR/WARNING/INDETERMINATE |
| Event state | `status` | ACTIVE_UNACK → ACTIVE_ACK → CLEARED_UNACK → CLEARED_ACK |
| Event attributes | `details` | JSON libre |

### Lo que FALTA vs PI Event Frames

| Capacidad | Status | Workaround |
|-----------|--------|------------|
| Estadísticas resumen (avg/min/max durante evento) | ❌ | Post-query: usar startTs/endTs para consultar telemetría y calcular |
| Eventos jerárquicos padre-hijo | ❌ | Propagación de alarmas es unidireccional, no crea relaciones |
| Búsqueda por valores de details | ❌ | API filtra por entity/type/severity/status, NO por contenido JSON |

---

## Notification Center (TB PE)

Comparable a PI Notifications:

| Canal | Soporte |
|-------|---------|
| Email | ✅ |
| SMS (Twilio) | ✅ |
| Slack | ✅ |
| Microsoft Teams | ✅ |
| Mobile push | ✅ |
| Web notifications | ✅ |

Soporta cadenas de escalamiento con delays configurables y templates con variables dinámicas.
