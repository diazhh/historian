# Asset Profiles

## Tres Niveles de Jerarquía

La planta se organiza en 3 niveles de Assets, cada uno con su propio Asset Profile:

| Nivel | Asset Profile | Ejemplo | Descripción |
|-------|--------------|---------|-------------|
| 1 | `Sitio` | "Refinería Norte" | Instalación completa |
| 2 | `AreaProceso` | "CDU", "FCC" | Unidad de proceso |
| 3 | `Equipo` | "T-101", "F-201" | Equipo individual |

---

## Asset Profile: Sitio

**Uso**: Nivel superior de la jerarquía. Típicamente una refinería, planta o campo petrolero.

| Propiedad | Valor |
|-----------|-------|
| Nombre | `Sitio` |
| Atributos típicos | name, location, country, timezone |

### Atributos esperados del Asset:

| Atributo | Tipo | Ejemplo |
|----------|------|---------|
| `location` | string | "Anaco, Venezuela" |
| `country` | string | "VE" |
| `timezone` | string | "America/Caracas" |
| `operator` | string | "PDVSA" |

---

## Asset Profile: AreaProceso

**Uso**: Unidad de proceso o área funcional dentro de un sitio.

| Propiedad | Valor |
|-----------|-------|
| Nombre | `AreaProceso` |
| Atributos típicos | name, areaCode, description |

### Atributos esperados:

| Atributo | Tipo | Ejemplo |
|----------|------|---------|
| `areaCode` | string | "CDU" |
| `description` | string | "Crude Distillation Unit" |

---

## Asset Profile: Equipo

**Uso**: Equipo individual que contiene tags (Device-tags).

| Propiedad | Valor |
|-----------|-------|
| Nombre | `Equipo` |
| Atributos típicos | name, equipmentType, description |

### Atributos esperados:

| Atributo | Tipo | Ejemplo |
|----------|------|---------|
| `equipmentType` | string | "Column", "Heat Exchanger", "Pump", "Well-ESP" |
| `description` | string | "Torre de destilación atmosférica" |
| `manufacturer` | string | "N/A" |
| `model` | string | "N/A" |

---

## Relaciones

Todas las relaciones entre niveles son:
- **Tipo**: `Contains`
- **Dirección**: FROM (padre) → TO (hijo)

```
Sitio ──Contains──→ AreaProceso ──Contains──→ Equipo ──Contains──→ Device-tag
```

---

## Crear Asset Profiles via REST API

```python
# Crear Asset Profile "Sitio"
requests.post(f"{TB_URL}/api/assetProfile", json={
    "name": "Sitio",
    "description": "Nivel superior - Instalación completa"
}, headers=headers)

# Crear Asset Profile "AreaProceso"
requests.post(f"{TB_URL}/api/assetProfile", json={
    "name": "AreaProceso",
    "description": "Unidad de proceso dentro de un sitio"
}, headers=headers)

# Crear Asset Profile "Equipo"
requests.post(f"{TB_URL}/api/assetProfile", json={
    "name": "Equipo",
    "description": "Equipo individual que contiene Device-tags"
}, headers=headers)
```
