# Build y Deploy

## Proceso de Build

```bash
cd historian-extensions
yarn build
```

Output: `dist/historian-extensions.js`

---

## Script de Deploy Automatizado

```bash
#!/bin/bash
set -e

TB_URL="http://144.126.150.120:8080"
TB_USER="well@atilax.io"
TB_PASS="10203040"

echo "=== Build ==="
yarn build

echo "=== Login ==="
TOKEN=$(curl -s -X POST "$TB_URL/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$TB_USER\",\"password\":\"$TB_PASS\"}" \
  | jq -r '.token')

echo "=== Upload JS Resource ==="
RESOURCE_RESPONSE=$(curl -s -X POST "$TB_URL/api/resource/js" \
  -H "X-Authorization: Bearer $TOKEN" \
  -F "file=@dist/historian-extensions.js" \
  -F "title=historian-extensions" \
  -F "resourceKey=historian-extensions")

RESOURCE_URL=$(echo $RESOURCE_RESPONSE | jq -r '.link')
echo "Resource URL: $RESOURCE_URL"

echo "=== Done ==="
```

---

## Registrar Widget Type

Cada componente se registra como Widget Type:

```bash
curl -X POST "$TB_URL/api/widgetType" \
  -H "X-Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d @widget-type-trend-viewer.json
```

Si ya existe el recurso y solo actualizas código, re-subir con el mismo `resourceKey` actualiza automáticamente los Widget Types que lo referencian.

---

## Verificación

```bash
# Verificar que el recurso se subió
curl -s "$TB_URL/api/resource/js?pageSize=10&page=0" \
  -H "X-Authorization: Bearer $TOKEN" | jq '.data[].title'

# Verificar dashboard
curl -s "$TB_URL/api/dashboard/{dashboardId}" \
  -H "X-Authorization: Bearer $TOKEN" | jq '.configuration.widgets | length'
```
