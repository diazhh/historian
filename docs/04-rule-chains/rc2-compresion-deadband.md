# RC2: Rule Chain de Compresión Deadband

> **Fuente**: [`prmpt.md`](../../prmpt.md) — Sección 5 (Compresión) y Sección 7 (Rule Chain 2)

---

## Propósito

Filtra datos redundantes para reducir almacenamiento. Solo almacena valores que cambien significativamente respecto al último valor guardado. **ThingsBoard no tiene compresión built-in** — esta rule chain implementa deadband filtering.

**Impacto**: Con deadband típico, reduce almacenamiento 70–95%.

---

## Flujo de Nodos

```
[Originator Telemetry]       ← Obtener último PV almacenado
      │                        (key: PV, latest: true)
      ▼
[Script Filter TBEL]         ← Deadband check
      │
      ├─ True ──► [Save Timeseries]  ← Cambio significativo, almacenar
      │
      └─ False ──► (descarta)        ← Dato redundante, no almacenar
```

---

## Nodo: Originator Telemetry (Latest)

Enriquece metadata con el último valor de telemetría almacenado:

**Configuración**:
- Fetch mode: `LATEST`
- Keys: `PV`
- Output key en metadata: `lastPV`

---

## Nodo: Script Filter TBEL — Deadband Check

```tbel
// Si no hay valor previo, siempre almacenar
if (metadata.lastPV == null) {
  return true;
}

// Obtener deadband del device (enriched por RC1 o por este chain)
var deadband = metadata.ss_deadband;
if (deadband == null || deadband <= 0) {
  // Sin deadband configurado, almacenar todo
  return true;
}

return Math.abs(msg.PV - metadata.lastPV) > deadband;
```

- **True**: `|nuevo - último| > deadband` → valor significativo, Save
- **False**: Cambio menor que deadband → descartar silenciosamente

---

## Configuración del Deadband por Tag

El deadband se configura como **server-side attribute** de cada Device-tag:

| Atributo | Tipo | Ejemplo | Descripción |
|----------|------|---------|-------------|
| `ss_deadband` | number | `0.5` | Cambio mínimo para almacenar (en unidades de ingeniería) |

Para un transmisor de temperatura con rango 0–500°C y deadband de 0.5°C:
- Si último valor guardado = 395.0, solo guarda si nuevo valor < 394.5 o > 395.5

---

## SDT Completo (Opción Avanzada)

El deadband simple es "exception-based reporting". Para **Swinging Door Trending** completo (el algoritmo de PI Data Archive), se necesita un **custom Java rule node** que mantenga:

- Corredor (corridor) definido por pendientes superior e inferior
- Estado por device (último punto almacenado, pendientes actuales)
- Lógica: solo almacenar cuando un nuevo punto "rompe" el corredor

**Complejidad**: Alta — requiere desarrollo Java, compilar como plugin TB, mantener estado en memoria.

**Alternativa pragmática**: Implementar SDT en el edge/gateway (PLC, IoT gateway) antes de enviar a TB. Esto es lo que la mayoría de implementaciones industriales hacen con PI también.

---

## Impacto en Almacenamiento

| Escenario | Sin deadband | Con deadband 0.5 | Con SDT 95% |
|-----------|-------------|-------------------|-------------|
| 10K tags, 1 seg, 1 año | 730 GB (Cassandra) | ~73–146 GB | ~37 GB |
| 50K tags, 1 seg, 1 año | 3,650 GB | ~365–730 GB | ~183 GB |

---

## Notas

- El deadband NO debe aplicarse a tags digitales (on/off) — solo a analógicos
- Considerar un deadband de tiempo máximo: si un tag no cambia en X minutos, forzar almacenamiento para confirmar que el sensor sigue vivo
- Los tags de tipo "Calculated" no necesitan deadband propio si sus inputs ya lo tienen
- Si se implementa en el edge/gateway, esta rule chain puede omitirse
