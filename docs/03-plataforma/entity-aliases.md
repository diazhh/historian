# Entity Aliases

## ¿Qué Son?

Los Entity Aliases son la forma en que ThingsBoard resuelve dinámicamente qué entidad debe mostrar cada widget. Son el puente entre el contexto del dashboard y los datos.

---

## Aliases del Dashboard Historiador

| Alias | Tipo | Descripción |
|-------|------|-------------|
| `selectedEntity` | Entity from dashboard state | Entidad seleccionada actualmente (Asset o Device). Cambia al navegar. |
| `rootAsset` | Single entity | Asset raíz de la planta. Siempre fijo. |
| `childAssets` | Relations query | Assets hijos del `selectedEntity` |
| `childDevices` | Relations query | Device-tags bajo el `selectedEntity` |

### selectedEntity

```json
{
  "id": "selectedEntity",
  "alias": "Selected Entity",
  "filter": {
    "type": "stateEntity",
    "stateEntityParamName": "entityId",
    "defaultStateEntity": {
      "entityType": "ASSET",
      "id": "ID_DEL_ASSET_RAIZ"
    }
  }
}
```

### rootAsset

```json
{
  "id": "rootAsset",
  "alias": "Root Asset",
  "filter": {
    "type": "singleEntity",
    "singleEntity": {
      "entityType": "ASSET",
      "id": "ID_DEL_ASSET_RAIZ"
    }
  }
}
```

### childDevices

```json
{
  "id": "childDevices",
  "alias": "Child Devices",
  "filter": {
    "type": "relationsQuery",
    "rootStateEntity": true,
    "direction": "FROM",
    "maxLevel": 5,
    "filters": [
      {
        "relationType": "Contains",
        "entityTypes": ["DEVICE"]
      }
    ]
  }
}
```

---

## Aliases del Dashboard SCADA ESP

El SCADA ESP usa un alias diferente porque el pozo es un ASSET individual:

| Alias | Tipo | Descripción |
|-------|------|-------------|
| `selected_well` | Single entity | Asset del pozo "CA-MAC-ANA-01-001" |

```json
{
  "id": "alias-uuid",
  "alias": "selected_well",
  "filter": {
    "type": "singleEntity",
    "resolveMultiple": false,
    "singleEntity": {
      "entityType": "ASSET",
      "id": "ASSET-UUID-DEL-POZO"
    }
  }
}
```

### Restricción ASSET vs DEVICE

Cuando la entidad es un **ASSET** (como en SCADA ESP):

| Funcionalidad | ¿Disponible? |
|---------------|-------------|
| GET_TIME_SERIES | ✅ SÍ |
| GET_ATTRIBUTE (SERVER_SCOPE) | ✅ SÍ |
| GET_ATTRIBUTE (CLIENT_SCOPE) | ✅ SÍ |
| GET_ATTRIBUTE (SHARED_SCOPE) | ❌ NO (solo Devices) |
| EXECUTE_RPC | ❌ NO (solo Devices) |
| GET_ALARM_STATUS | ✅ SÍ |

**Implicación para SCADA ESP**: Los behaviors de los HP symbols deben usar `SERVER_SCOPE` para atributos, nunca `SHARED_SCOPE`.
