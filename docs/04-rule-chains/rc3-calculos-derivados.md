# RC3: Rule Chain de Cálculos Derivados

> **Fuente**: [`prmpt.md`](../../prmpt.md) — Secciones 3 y 7 (Rule Chain 3)

---

## Propósito

Implementa cálculos que transforman datos crudos en valores derivados. Combina tres mecanismos de TB PE:

1. **Calculated Fields** (Device Profile) — Fórmulas simples, promedios móviles
2. **Aggregate Stream Node** (PE exclusivo) — Totalizadores por período
3. **Scheduler** (PE exclusivo) — Disparar resúmenes periódicos

---

## Mecanismo 1: Calculated Fields (TB 4.0+)

### Los 5 Tipos Disponibles

| Tipo | Qué hace | Ejemplo historiador |
|------|----------|-------------------|
| **Simple** | Expresión aritmética directa | `PV_celsius = (PV - 32) * 5/9` |
| **Script** | TBEL con condicionales y loops | Quality code → text, clamping |
| **Propagation** | Transformar y propagar a entidades relacionadas | Tag envía dato procesado a Asset padre |
| **Aggregation** | Agregar datos de entidades hijas (min/max/avg/sum/count) | Asset "Equipo" calcula avg de sus tags |
| **Zone** | Evaluación geoespacial | N/A para historiador |

### Argumentos Rolling (Time Series)

Los CF Script pueden usar argumentos de tipo **rolling time-series** con ventana temporal configurable:

```
Argumento: PV_rolling
  Tipo: Time Series Rolling
  Ventana: 60 minutos
  Máximo: 1000 valores
```

Métodos built-in disponibles sobre el rolling:
- `mean()` — Promedio de la ventana
- `sum()` — Suma
- `min()` / `max()` — Extremos
- `first()` / `last()` — Primero/último de la ventana
- `merge()` — Combinar múltiples rolling

**Ejemplo: Promedio móvil de 1 hora**:
```tbel
var avg1h = PV_rolling.mean();
return avg1h;
```

### Reprocesamiento Histórico (TB 4.1+)

Desde ThingsBoard 4.1, los Calculated Fields soportan **reprocesamiento histórico** — aplicar la lógica de cálculo retroactivamente a datos ya almacenados. Equivalente al backfilling de PI Analytics.

### Ejecución

- Se ejecutan en **tiempo real** con cada telemetría recibida
- **Sin queries a base de datos** — mantienen estado interno con últimos valores
- **Encadenables** — la salida de un CF puede disparar otro CF
- Se definen a nivel de **Device Profile** → aplican a todos los devices del perfil

---

## Mecanismo 2: Aggregate Stream Node (PE Exclusivo)

El nodo **Aggregate Stream** calcula MIN/MAX/SUM/AVG/COUNT sobre datos en streaming:

- **Agrupa por**: Originator (device) + intervalo temporal configurable
- **Genera**: POST_TELEMETRY_REQUEST con resultados agregados
- **Función**: Totalizador por período

### Configuración

```
Nombre: "Hourly Aggregation"
Interval: 3600000 (1 hora en ms)
Aggregation: AVG
Output key: PV_hourly_avg
```

### Ejemplo: Totalizador de flujo por hora

```
Input: Telemetry "flow_rate" (m³/h) cada 10 seg
Aggregation: AVG sobre 1 hora
Output: "flow_hourly_total" = AVG * 1 (si rate ya es m³/h)
```

---

## Mecanismo 3: Scheduler PE

Dispara eventos en horarios **Daily/Weekly** que entran al Root Rule Chain.

### Ejemplo: Resumen diario

1. Scheduler genera evento a las 00:00
2. Rule chain recibe evento → consulta estadísticas del día anterior
3. Almacena como atributos en el Asset (daily_avg, daily_min, daily_max)

**Configuración**:
- Schedule: Daily a las 00:00
- Entity filter: Device Group "All Tags" o Entity Group específico
- Output: POST_TELEMETRY_REQUEST con { "daily_summary": {...} }

---

## Cálculos Cross-Entity

Para cálculos que involucran datos de **múltiples devices-tag**:

### Con Calculated Fields Propagation (preferido)
- CF tipo Propagation en el Device Profile
- Transforma PV del device y propaga a Asset padre
- El Asset padre usa CF Aggregation para combinar valores de hijos

### Con Rule Chain (si CF no es suficiente)

```
[Message Type Switch] → "Post telemetry"
      ▼
[Originator Attributes] → Enriquecer con atributos propios
      ▼
[Related Attributes] → Obtener telemetría de devices relacionados
      ▼
[Script TBEL] → Cálculo
      ▼
[Save Timeseries] → Guardar en Asset padre
```

### Ejemplos

| Cálculo | Tags involucrados | Fórmula | Output |
|---------|-------------------|---------|--------|
| Caída de presión | PI-BOTTOM, PI-TOP | `PI_bottom.PV - PI_top.PV` | Asset attribute `delta_P` |
| Eficiencia | Flow_in, Flow_out | `(Flow_out.PV / Flow_in.PV) * 100` | Asset telemetry `efficiency` |
| Heat duty | Flow, T_in, T_out | `Flow.PV * Cp * (T_out.PV - T_in.PV)` | Asset telemetry `heat_duty` |

---

## Lo que NO Existe en TB (requiere custom)

| Capacidad PI | Status en TB | Workaround |
|-------------|-------------|------------|
| ~200+ funciones built-in (FFT, trigonométricas) | ❌ | Librería JS externa en Remote JS Executor |
| Time-weighted averages | ❌ | Custom client-side en widgets |
| Quality propagation en cálculos | ❌ | Lógica manual en cada script |
