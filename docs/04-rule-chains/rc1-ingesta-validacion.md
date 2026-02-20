# RC1: Rule Chain de Ingesta y Validación

> **Fuente**: [`prmpt.md`](../../prmpt.md) — Sección 7, Rule Chain 1

---

## Propósito

Primer punto de contacto de toda telemetría. Verifica que los datos sean válidos antes de almacenarlos. Rechaza datos fuera de rango y genera alarmas de calidad.

---

## Flujo de Nodos

```
[Message Type Switch]
      │
      ├─ "Post telemetry" ──►
      │
      ▼
[Check Existence Fields]     ← Verificar campos requeridos (PV existe)
      │
      ├─ True ──►
      │
      ▼
[Originator Attributes]      ← Enriquecer con atributos server-side
      │                        ss_rangeLow, ss_rangeHigh, ss_deadband
      ▼
[Script Filter TBEL]         ← Range check
      │
      ├─ True ──► [Save Timeseries]  ← Dato válido, almacenar
      │
      └─ False ──► [Create Alarm]    ← "Out of Range" + [Log]
```

---

## Nodo: Check Existence Fields

Verifica que el mensaje contiene el campo `PV` (Process Value). Sin PV, el dato es inútil.

**Configuración**:
- Message field: `PV`
- Check existence: `true`

---

## Nodo: Originator Attributes

Enriquece el mensaje con atributos del device (server-side scope) necesarios para la validación:

**Atributos a obtener** (server-side):
- `ss_rangeLow` — Límite inferior del rango del instrumento
- `ss_rangeHigh` — Límite superior del rango del instrumento

Estos quedan disponibles en `metadata` para el siguiente nodo.

---

## Nodo: Script Filter TBEL — Range Check

```tbel
return msg.PV >= metadata.ss_rangeLow && msg.PV <= metadata.ss_rangeHigh;
```

- **True**: El PV está dentro del rango del instrumento → Save Timeseries
- **False**: El PV está fuera de rango → Create Alarm

**Manejo de nulls**: Si `ss_rangeLow` o `ss_rangeHigh` son null (tag sin rango configurado), pasar como válido:

```tbel
if (metadata.ss_rangeLow == null || metadata.ss_rangeHigh == null) {
  return true;
}
return msg.PV >= metadata.ss_rangeLow && msg.PV <= metadata.ss_rangeHigh;
```

---

## Nodo: Create Alarm — Out of Range

**Configuración**:
- Alarm type: `OUT_OF_RANGE`
- Severity: `WARNING`
- Propagate: `true` (visible en Assets padre)
- Details script TBEL:

```tbel
var details = {};
details.PV = msg.PV;
details.rangeLow = metadata.ss_rangeLow;
details.rangeHigh = metadata.ss_rangeHigh;
details.message = 'Value ' + msg.PV + ' outside range [' + metadata.ss_rangeLow + ', ' + metadata.ss_rangeHigh + ']';
return details;
```

---

## Notas

- Esta rule chain debe ser la **primera** en la cadena de procesamiento
- Asignar como Root Rule Chain del Device Profile, o encadenar desde el Root Chain del tenant
- Los datos que pasan la validación continúan a RC2 (compresión) si está habilitada
- El Log node es opcional pero útil para debugging en desarrollo
