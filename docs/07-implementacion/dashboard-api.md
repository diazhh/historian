# Crear Dashboards via REST API

## Endpoints Principales

| Método | Endpoint | Uso |
|--------|----------|-----|
| `POST` | `/api/dashboard` | Crear nuevo dashboard |
| `PUT` | `/api/dashboard` | Actualizar existente (enviar objeto COMPLETO) |
| `GET` | `/api/dashboard/{id}` | Obtener dashboard por ID |
| `GET` | `/api/tenant/dashboards?pageSize=100&page=0` | Listar dashboards |
| `DELETE` | `/api/dashboard/{id}` | Eliminar dashboard |

---

## Estructura del Dashboard JSON

```json
{
  "title": "Historiador de Planta",
  "configuration": {
    "widgets": { },
    "states": { },
    "entityAliases": { },
    "filters": { },
    "settings": {
      "stateControllerId": "entity",
      "showTitle": false,
      "showDashboardsSelect": true,
      "showEntitiesSelect": true,
      "showDashboardTimewindow": true,
      "toolbarAlwaysOpen": true
    },
    "timewindow": {
      "realtime": { "timewindowMs": 86400000, "quickInterval": "CURRENT_DAY" },
      "aggregation": { "type": "AVG", "limit": 25000 }
    }
  }
}
```

---

## Campos Obligatorios

| Campo | Requerido | Nota |
|-------|----------|------|
| `title` | ✅ | Nombre del dashboard |
| `configuration.widgets` | ✅ | `{}` mínimo |
| `configuration.states` | ✅ | Al menos un estado |
| `configuration.entityAliases` | ✅ | Mapa de aliases |
| `configuration.filters` | ✅ | `{}` vacío está bien |
| `cssResources` | ⚠️ | NUNCA `null`, siempre `[]` |

---

## Notas Importantes

1. **`cssResources` NUNCA null** — Siempre `[]` vacío
2. **`row/col` en top level** del layout widget entry
3. **Dashboard completo puede pesar 2-3 MB** — normal para SCADA
4. **Token JWT expira** — regenerar si la sesión es larga
5. **PUT requiere objeto COMPLETO** — no solo la configuración
6. **UUIDs v4 para widgets y aliases** — usar `uuid.uuid4()`
7. **Verificar después de crear** — GET y confirmar widget count
8. **Clonar widgets existentes** — GET dashboard funcional → extraer configs → modificar

---

## Flujo del Script Python (SCADA ESP)

```python
# 1. Autenticarse
token = get_token()

# 2. Obtener asset ID del pozo
asset_id = get_asset_id("CA-MAC-ANA-01-001")

# 3. Generar UUIDs
alias_uuid = str(uuid.uuid4())
widget_uuids = {f"widget_{i}": str(uuid.uuid4()) for i in range(200)}

# 4. Construir entity aliases
entity_aliases = build_entity_aliases(alias_uuid, asset_id)

# 5. Construir widgets para cada estado
widgets = {}
state_layouts = {}
for state in ["default", "esp_detail", "surface", "electrical", "trends", "alarms"]:
    state_widgets, state_layout = build_state(state, alias_uuid, widget_uuids)
    widgets.update(state_widgets)
    state_layouts[state] = state_layout

# 6. Construir y POST el dashboard
dashboard = build_dashboard(widgets, state_layouts, entity_aliases)
response = requests.post(f"{TB_URL}/api/dashboard", json=dashboard, headers=headers)
```
