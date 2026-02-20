# Asset Framework — Jerarquía de Planta

> **Fuente**: [`prmpt.md`](../../prmpt.md) — Sección 4

---

## Modelo Jerárquico

```
Empresa (Asset)
└── Planta (Asset)
    └── Área (Asset)
        └── Unidad (Asset)
            └── Equipo (Asset)
                ├── Tag Analog (Device)
                ├── Tag Digital (Device)
                └── Tag Calculated (Device)
```

- **Assets**: Niveles superiores (organizacionales)
- **Devices**: Nodos hoja (tags = puntos de medición)
- **Relaciones**: Tipo `Contains`, dirección FROM padre TO hijo. Tipos custom soportados.
- **Profundidad**: Sin límite

---

## Entity Groups (PE Exclusivo)

Colecciones planas de devices/assets con:
- Columnas customizables
- Acciones bulk
- Base del RBAC
- Un device puede pertenecer a **múltiples grupos**

---

## Dashboard States (Drill-Down)

```
Plant Overview → Area View → Unit View → Equipment View → Tag Detail
```

- Alias `Entity from dashboard state` resuelve entidad actual
- Widget **Entities Hierarchy** (PE) muestra árboles clickeables
- **Entity Views** exponen subsets de datos a customers sin duplicar

---

## Brechas vs PI Asset Framework

| Capacidad | PI AF | TB PE | Gap |
|-----------|-------|-------|-----|
| Jerarquía multinivel | ✅ | ✅ | No |
| Entity Groups + RBAC | ❌ | ✅ PE | TB gana |
| Dashboard drill-down | ✅ | ✅ States | No |
| **Plantillas con herencia** | ✅ | ❌ | Crítico |
| **Parámetros de sustitución** | ✅ `%Element%` | ❌ | Sin equivalente |
| **Búsqueda por valores de atributos** | ✅ | ❌ | API limitada |
| Bulk provisioning con relaciones | ✅ | ⚠️ CSV sin relaciones | Script custom |

---

## Plan de Implementación

1. **Device Profiles por tipo de tag**: Analog Input, Digital Input, Calculated — cada uno con alarm rules y calculated fields propios
2. **Asset Profiles por nivel**: Plant, Area, Unit, Equipment
3. **Script de provisioning** (Python/Node.js): Lee spreadsheet → crea Assets, Devices, Relations, atributos via REST API
4. **Dashboards con 5 states**: Plant Overview → Area → Unit → Equipment → Tag Detail
5. **Entity Views** para clientes externos

**Complejidad**: Media-Alta (3–4 semanas)

---

## Atributos Estándar por Device-Tag

El provisioning script debe crear estos **server-side attributes** (`ss_` prefix):

| Atributo | Tipo | Requerido | Descripción |
|----------|------|-----------|-------------|
| `ss_description` | string | ✅ | Descripción legible |
| `ss_engUnits` | string | ✅ | Unidades de ingeniería |
| `ss_dataType` | string | ✅ | ANALOG, DIGITAL, CALCULATED |
| `ss_rangeLow` | number | ✅ (analog) | Rango bajo del instrumento |
| `ss_rangeHigh` | number | ✅ (analog) | Rango alto del instrumento |
| `ss_setpoint` | number | ❌ | Valor objetivo |
| `ss_deadband` | number | ❌ | Dead-band para compresión |
| `ss_alarmHH` | number | ❌ | Límite high-high |
| `ss_alarmH` | number | ❌ | Límite high |
| `ss_alarmL` | number | ❌ | Límite low |
| `ss_alarmLL` | number | ❌ | Límite low-low |
| `ss_rateThreshold` | number | ❌ | Threshold rate-of-change |
| `ss_scanRate` | number | ❌ | Scan rate (segundos) |
| `ss_instrumentType` | string | ❌ | TI, PI, FI, LI, etc. |
