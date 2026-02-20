# Entorno de Desarrollo

## Requisitos

| Herramienta | Versión | Notas |
|-------------|---------|-------|
| Node.js | 18.x o 20.x | Para build de extensiones |
| Angular | 18.x | Ya viene en el repo |
| TypeScript | 5.x | Ya viene en el repo |
| yarn | 1.x | Package manager |
| Python | 3.x | Para scripts de deploy SCADA |
| ThingsBoard PE | 4.0+ | Servidor (Calculated Fields requieren 4.0+) |

---

## Setup del Proyecto de Extensiones

```bash
# Clonar el repo base de ThingsBoard
git clone https://github.com/thingsboard/thingsboard-extensions.git historian-extensions
cd historian-extensions
yarn install
```

### Configurar package.json:

```json
{
  "name": "historian-extensions",
  "version": "0.1.0"
}
```

---

## Estructura del Proyecto

```
historian-extensions/
├── package.json
├── tsconfig.json
├── angular.json
├── yarn.lock
│
├── src/
│   └── app/
│       ├── shared/                         ← Servicios, modelos, utilidades
│       ├── tag-browser/                    ← M1
│       ├── trend-viewer/                   ← M2
│       ├── data-grid/                      ← M3
│       ├── ... (M4-M16)
│       └── historian.module.ts             ← Módulo raíz Angular
│
└── dist/                                   ← Output del build
    └── historian-extensions.js
```

---

## Servidor ThingsBoard

| Dato | Valor |
|------|-------|
| URL | `http://144.126.150.120:8080` |
| API Base | `http://144.126.150.120:8080/api` |
| Swagger | `http://144.126.150.120:8080/swagger-ui/index.html` |
| Login | `POST /api/auth/login` |

### Obtener token:

```bash
TOKEN=$(curl -s -X POST http://144.126.150.120:8080/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"well@atilax.io","password":"10203040"}' \
  | jq -r '.token')
```

---

## Build y Deploy

```bash
# Build
yarn build
# Output: dist/historian-extensions.js

# Upload resource to TB
curl -X POST "http://144.126.150.120:8080/api/resource/js" \
  -H "X-Authorization: Bearer $TOKEN" \
  -F "file=@dist/historian-extensions.js" \
  -F "title=historian-extensions" \
  -F "resourceKey=historian-extensions"
```

Ver [build-deploy.md](./build-deploy.md) para el proceso completo.
