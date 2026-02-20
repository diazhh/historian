# Códigos de Quality

## Códigos OPC-UA

El quality es un número que viene del OPC o DCS. Se envía tal cual en la key `Q`:

| Código | Significado | Clase |
|--------|------------|-------|
| `192` | Good | ✅ Bueno |
| `0` | Bad | ❌ Malo |
| `64` | Uncertain | ⚠️ Incierto |
| `24` | Bad - Sensor Failure | ❌ Falla |
| `28` | Bad - Out of Range | ❌ Fuera de rango |
| `32` | Bad - Not Connected | ❌ Sin conexión |

---

## Transformación a Texto

### Opción 1: Calculated Field en Device Profile (server-side)

Se configura un Calculated Field en el Device Profile "Tag" que genera una nueva key `QT` (Quality Text):

```
Nombre: QUALITY_TEXT
Input: telemetry key "Q"
Output: nuevo telemetry key "QT"

Script (TBEL):
var q = $['Q'];
if (q >= 192) return "Good";
if (q >= 64) return "Uncertain";
if (q == 24) return "Sensor Failure";
if (q == 28) return "Out of Range";
if (q == 32) return "Not Connected";
return "Bad";
```

### Opción 2: Utilidad client-side (en los widgets)

```typescript
// shared/utils/quality.util.ts
export function qualityToText(code: number): string {
  if (code >= 192) return 'Good';
  if (code >= 64) return 'Uncertain';
  if (code === 24) return 'Sensor Failure';
  if (code === 28) return 'Out of Range';
  if (code === 32) return 'Not Connected';
  return 'Bad';
}

export function qualityIsGood(code: number): boolean {
  return code >= 192;
}
```

### ¿Cuál usar?

| Criterio | Server-side (Calculated Field) | Client-side (TypeScript) |
|----------|-------------------------------|--------------------------|
| Disponibilidad | En cualquier widget/API sin código extra | Solo en widgets custom |
| Almacenamiento | Ocupa espacio (nueva key QT) | Sin costo de almacenamiento |
| Flexibilidad | Solo TBEL | TypeScript completo |
| Latencia | Cero (ya calculado) | Mínima (cálculo trivial) |

**Recomendación**: Usar ambos. Calculated Field para disponibilidad universal + utilidad client-side para flexibilidad en widgets.

---

## Manejo de Datos con Bad Quality

Cuando `Q < 192`, el dato se considera no confiable:
- Los widgets deben mostrar indicador visual (color gris, icono de warning)
- El Trend Viewer debe marcar puntos de mala calidad con símbolos diferentes
- Los cálculos estadísticos (TWA, min, max) deben excluir puntos con bad quality
- El payload envía `PV: null` cuando quality es Bad
