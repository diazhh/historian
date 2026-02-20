# Arquitectura de Rule Chains — El Sistema Nervioso del Historiador

> **Fuente**: [`prmpt.md`](../../prmpt.md) — Sección 7

Se necesitan **4 rule chains especializadas**, cada una asignada a device profiles específicos.

---

## Visión General

```
Telemetría MQTT
      │
      ▼
┌─────────────────────────────┐
│  RC1: Ingesta y Validación  │  ← Verifica campos, range check
│  ├─ Check Existence         │
│  ├─ Range Check (TBEL)      │
│  ├─ Save Timeseries         │
│  └─ Create Alarm si falla   │
└──────────┬──────────────────┘
           │ (datos validados)
           ▼
┌─────────────────────────────┐
│  RC2: Compresión Deadband   │  ← Filtra datos redundantes
│  ├─ Get Last Value          │
│  ├─ Deadband Filter (TBEL)  │
│  └─ Save solo si cambia     │
└──────────┬──────────────────┘
           │ (datos significativos)
           ▼
┌─────────────────────────────┐
│  RC3: Cálculos Derivados    │  ← Fórmulas, totalizadores
│  ├─ Calculated Fields (CF)  │
│  ├─ Aggregate Stream (PE)   │
│  └─ Scheduler periódico     │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│  RC4: Detección Eventos     │  ← Alarmas, rate-of-change
│  ├─ Device Profile alarms   │
│  ├─ Calculate Delta → rate  │
│  ├─ Stale data detection    │
│  └─ Alarm details TBEL      │
└─────────────────────────────┘
```

---

## Asignación a Device Profiles

| Rule Chain | Device Profile | Razón |
|-----------|---------------|-------|
| RC1 Ingesta | Todos los profiles de tag | Validación universal |
| RC2 Compresión | Analog Input, Calculated | Los que generan más volumen |
| RC3 Cálculos | Tags con fórmulas definidas | Solo donde hay cálculos |
| RC4 Eventos | Todos con alarm rules | Detección universal |

---

## Mejores Prácticas a Escala

1. **TBEL siempre, JavaScript nunca** — TBEL es ~1,000x más rápido (12ms vs 16s para 1K ejecuciones)
2. **Rule chains separadas por Device Profile** — evita evaluación innecesaria
3. **Kafka como message queue** — durabilidad y backpressure (no in-memory)
4. **Deshabilitar "Persist alarm rule state"** salvo Duration/Repeating — cada msg extra = 1 DB write
5. **Minimizar queries DB en rule chains** — preferir Calculated Fields que cachean estado interno

---

## Documentos Detallados

- [RC1: Ingesta y Validación](./rc1-ingesta-validacion.md)
- [RC2: Compresión Deadband](./rc2-compresion-deadband.md)
- [RC3: Cálculos Derivados](./rc3-calculos-derivados.md)
- [RC4: Detección de Eventos](./rc4-deteccion-eventos.md)
