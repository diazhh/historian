# Calculated Fields — ThingsBoard 4.0+

> **Fuente**: [`prmpt.md`](../../prmpt.md) — Sección 3

---

## El Avance Clave de TB 4.0

Calculated Fields es la feature más relevante para replicar PI Analytics. Introducida en TB 4.0, cierra la brecha más grande en cálculos derivados.

---

## Los 5 Tipos de Calculated Field

| Tipo | Qué hace | Ejemplo |
|------|----------|---------|
| **Simple** | Expresiones aritméticas directas | `PV_fahrenheit = PV * 9/5 + 32` |
| **Script** | TBEL completo (condicionales, loops) | Quality code → text, clamping, validación |
| **Propagation** | Transformar y propagar a entidades relacionadas | Tag envía PV procesado a Asset padre |
| **Aggregation** | Agregar datos de hijos: min/max/avg/sum/count | Equipo calcula avg de sus tags |
| **Zone** | Evaluación geoespacial | N/A para historiador |

---

## Argumentos Disponibles

| Tipo de argumento | Qué es | Uso |
|------------------|--------|-----|
| **Latest telemetry** | Último valor snapshot | Fórmulas punto a punto |
| **Attributes** | Atributos de la entidad | Constantes, setpoints, rangos |
| **Time Series Rolling** | Ventana temporal histórica | Promedios móviles, estadísticas |

### Rolling Time Series (el más poderoso)

Configurable con:
- **Ventana temporal**: ej. 60 minutos
- **Máximo de valores**: hasta 1,000 puntos en la ventana

**Métodos built-in**:
- `mean()` — Promedio de la ventana
- `sum()` — Suma
- `min()` — Mínimo
- `max()` — Máximo
- `first()` — Primer valor de la ventana
- `last()` — Último valor
- `merge()` — Combinar múltiples rolling series

### Ejemplo: Promedio Móvil de 1 Hora

```
Nombre CF: "PV_1h_avg"
Tipo: Script
Argumento "PV_rolling": Time Series Rolling, ventana 60 min, max 1000 valores
Output: nuevo telemetry key "PV_avg_1h"

Script TBEL:
  return PV_rolling.mean();
```

---

## Ejecución

- Se ejecutan en **tiempo real** con cada telemetría recibida
- **Sin queries a base de datos** — mantienen estado interno con últimos valores
- **Encadenables** — la salida de un CF dispara la evaluación de otros CF
- Se definen a nivel de **Device Profile** → aplican automáticamente a todos los devices del perfil

---

## Reprocesamiento Histórico (TB 4.1+)

Desde ThingsBoard 4.1, los CF soportan **reprocesamiento histórico**:
- Aplica la lógica de cálculo retroactivamente a datos ya almacenados
- Equivalente al **backfilling de PI Analytics**
- Útil cuando se agrega un nuevo CF a un profile con datos históricos

---

## Ejemplos para Historiador

### CF 1: Quality Code → Texto (Script)

```tbel
var q = $['Q'];
if (q >= 192) return "Good";
if (q >= 64) return "Uncertain";
if (q == 24) return "Sensor Failure";
if (q == 28) return "Out of Range";
if (q == 32) return "Not Connected";
return "Bad";
```
Output key: `QT` (Quality Text)

### CF 2: Clamping a Rango (Script)

```tbel
var pv = $['PV'];
var lo = $attr['ss_rangeLow'];
var hi = $attr['ss_rangeHigh'];
if (lo != null && pv < lo) return lo;
if (hi != null && pv > hi) return hi;
return pv;
```
Output key: `PV_clamped`

### CF 3: Desviación del Setpoint (Simple)

```
PV - ss_setpoint
```
Output key: `deviation`

### CF 4: Promedio Móvil (Script + Rolling)

```tbel
return PV_rolling.mean();
```
Con argumento PV_rolling: ventana 60 min

### CF 5: Aggregation Cross-Entity

Definido en el **Asset Profile** (no Device Profile):
- Tipo: Aggregation
- Fuente: Devices hijos (relación Contains)
- Función: AVG sobre key `PV`
- Output: `avg_temperature` en el Asset

---

## Lo que NO Pueden Hacer los CF

| Limitación | Workaround |
|-----------|------------|
| Time-weighted average | Custom en widget (TimeWeightedCalcService) |
| FFT / estadísticas avanzadas | Remote JS Executor con librería npm |
| Quality propagation entre CF | Lógica manual en cada script |
| Queries a base de datos | Usar Rule Chain con Related Attributes |
| Cálculos entre devices no relacionados | Crear relación o usar Rule Chain |

---

## CF vs Rule Chain: Cuándo Usar Cada Uno

| Criterio | Calculated Fields | Rule Chain |
|----------|------------------|------------|
| Datos de 1 solo device | ✅ Preferido | Posible |
| Datos de devices relacionados | ✅ Propagation/Aggregation | ✅ Related Attributes |
| Datos de devices no relacionados | ❌ | ✅ Necesario |
| Rendimiento | ✅ Más rápido (sin DB queries) | Más lento (queries DB) |
| Reprocesamiento histórico | ✅ TB 4.1+ | ❌ No soportado |
| Cálculos con estado (acumuladores) | ❌ | ✅ Aggregate Stream |
| Cálculos periódicos (cron) | ❌ | ✅ Scheduler PE |
