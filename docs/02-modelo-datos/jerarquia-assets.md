# Jerarquía de Assets

## Estructura Jerárquica

La jerarquía de planta se construye con **Assets** en ThingsBoard. Los Device-tags son las hojas del árbol.

```
Asset: "Refinería Norte"        (Asset Profile: Sitio)
├── Contains → Asset: "CDU"     (Asset Profile: AreaProceso)
│   ├── Contains → Asset: "T-101"    (Asset Profile: Equipo)
│   │   ├── Contains → Device: "TI-101-01"  (Device Profile: Tag)
│   │   ├── Contains → Device: "TI-101-02"  (Device Profile: Tag)
│   │   ├── Contains → Device: "PI-101"     (Device Profile: Tag)
│   │   ├── Contains → Device: "FIC-101"    (Device Profile: Tag)
│   │   └── Contains → Device: "XV-101"     (Device Profile: Tag)
│   ├── Contains → Asset: "F-201"    (Asset Profile: Equipo)
│   │   └── Contains → Device: "TI-201-01"  (Device Profile: Tag)
│   └── Contains → Asset: "E-101"    (Asset Profile: Equipo)
│       └── Contains → Device: "TI-301-01"  (Device Profile: Tag)
├── Contains → Asset: "FCC"     (Asset Profile: AreaProceso)
│   └── ...
└── Contains → Asset: "Utilidades" (Asset Profile: AreaProceso)
    └── ...
```

---

## Asset Profiles

Cada nivel del árbol usa un Asset Profile distinto:

| Nivel | Asset Profile | Ejemplo | Descripción |
|-------|--------------|---------|-------------|
| 1 | `Sitio` | "Refinería Norte" | Instalación completa |
| 2 | `AreaProceso` | "CDU", "FCC" | Unidad de proceso |
| 3 | `Equipo` | "T-101", "F-201" | Equipo individual |

Los Devices-tag usan un solo Device Profile:

| Device Profile | Para qué |
|---------------|----------|
| `Tag` | Todos los tags. Contiene Alarm Rules genéricas y Calculated Fields |

---

## Relaciones

Todas las relaciones son:
- **Tipo**: `Contains`
- **Dirección**: `FROM` (padre) `TO` (hijo)

```
Asset "CDU" ──Contains──→ Asset "T-101" ──Contains──→ Device "TI-101-01"
                                         ──Contains──→ Device "PI-101"
                                         ──Contains──→ Device "XV-101"
```

### Reglas:
- Los **Devices NO se relacionan entre sí**. No hay árbol de Devices.
- Un Device-tag pertenece a exactamente un Equipo (Asset).
- Un Equipo pertenece a exactamente un AreaProceso.
- La jerarquía es estricta: Sitio → AreaProceso → Equipo → Device-tag.

---

## Crear la Jerarquía

### Manualmente (Admin TB):
1. Admin TB → Entities → Assets → Crear Asset con profile correspondiente
2. Admin TB → Asset → Relations → Add relation (Contains → hijo)

### Por Script (REST API):

```python
# Crear Asset
asset = requests.post(f"{TB_URL}/api/asset", json={
    "name": "CDU",
    "type": "AreaProceso",
    "label": "Crude Distillation Unit"
}, headers=headers).json()

# Crear Relación
requests.post(f"{TB_URL}/api/relation", json={
    "from": {"entityType": "ASSET", "id": sitio_id},
    "to": {"entityType": "ASSET", "id": asset["id"]["id"]},
    "type": "Contains"
}, headers=headers)
```

### Consultar Hijos (Relations API):

```
GET /api/relations?fromId={parentId}&fromType=ASSET&relationType=Contains
```

Retorna lista de `{to: {entityType, id}, type: "Contains"}`. Los hijos pueden ser Assets (nodos intermedios) o Devices (hojas = tags).

---

## Caso ESP: Jerarquía del Pozo

Para el caso de uso de pozos ESP:

```
Asset: "Campo Anaco"                    (Asset Profile: Sitio)
└── Contains → Asset: "CA-MAC-ANA-01"   (Asset Profile: AreaProceso)
    └── Contains → Asset: "CA-MAC-ANA-01-001"  (Asset Profile: Equipo)
        ├── Contains → Device: "flow_rate_bpd"      (Device Profile: Tag)
        ├── Contains → Device: "motor_current_a"     (Device Profile: Tag)
        ├── Contains → Device: "intake_pressure_psi" (Device Profile: Tag)
        ├── Contains → Device: "motor_temp_f"        (Device Profile: Tag)
        ├── ... (29 tags en total)
        └── Contains → Device: "vibration_y_g"       (Device Profile: Tag)
```

**Nota**: El Asset del pozo ("CA-MAC-ANA-01-001") también tiene sus propias 29 telemetry keys directas (para el dashboard SCADA ESP). Estos datos coexisten con los Device-tags individuales que alimentan al historiador.

---

## Propagación de Alarmas

Las alarmas de los Device-tags se **propagan** automáticamente a los Assets padre. Si `TI-101-01` dispara una alarma HIGH_HIGH, esa alarma aparece tanto en el Device como en el Asset "T-101", "CDU" y "Refinería Norte".

Esto se configura en la Alarm Rule del Device Profile "Tag":
```
Propagate to related entities: YES
```

Permite que el dashboard del historiador muestre alarmas a cualquier nivel de la jerarquía.
