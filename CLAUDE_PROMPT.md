# Prompt para Claude Code - Proyecto Historian

## Contexto del Proyecto

Eres un asistente de IA trabajando en el proyecto **Historian**, un sistema historiador industrial que consiste en:

1. **thingsboard-extensions** (Angular): Componentes personalizados para ThingsBoard que incluyen:
   - Visualizador de tendencias (trend-viewer)
   - Navegador de tags (tag-browser)
   - Análisis estadístico (statistical-analysis)
   - Motor de cálculos (calc-engine)
   - Generador de reportes (report-generator)
   - Y otros componentes para gestión de datos industriales

2. **simulator** (Node.js): Simulador que genera datos industriales para enviar a ThingsBoard

## Repositorio GitHub

- **URL**: https://github.com/diazhh/historian
- **Branch**: main
- **Estructura**:
  ```
  historian/
  ├── .gitignore (raíz)
  ├── simulator/
  │   ├── .gitignore
  │   ├── .env.example
  │   ├── package.json
  │   └── src/
  └── thingsboard-extensions/
      ├── .gitignore
      ├── package.json
      ├── angular.json
      └── src/
  ```

## Tareas que Debes Conocer

### 1. Subir Cambios al Repositorio GitHub

Cuando hagas cambios en el código:

```bash
cd /Users/diazhh/Documents/GitHub/historian
git status                    # Verificar cambios
git add .                     # Agregar todos los cambios
git commit -m "Descripción"   # Hacer commit
git push origin main          # Subir a GitHub
```

### 2. Conectarse al Servidor 144

El servidor de producción está en la IP **192.168.1.144**:

```bash
ssh usuario@192.168.1.144
```

### 3. Actualizar Código en el Servidor (Pull)

Una vez conectado al servidor 144:

```bash
cd /var/proyectos/historian
git pull origin main
```

### 4. Compilar el Simulador

Después de hacer pull:

```bash
cd /var/proyectos/historian/simulator
npm install  # Instalar/actualizar dependencias
```

### 5. Configurar Variables de Entorno

El simulador necesita un archivo `.env` (NO está en el repo por seguridad):

```bash
cd /var/proyectos/historian/simulator
cp .env.example .env
nano .env  # Editar con las credenciales correctas
```

Variables típicas en `.env`:
- `THINGSBOARD_URL`: URL del servidor ThingsBoard
- `DEVICE_TOKEN`: Token del dispositivo
- `INTERVAL`: Intervalo de envío de datos
- Otras configuraciones específicas

### 6. Levantar el Simulador con PM2

PM2 es un gestor de procesos para Node.js que mantiene el simulador corriendo:

```bash
# Primera vez (iniciar)
cd /var/proyectos/historian/simulator
pm2 start src/index.js --name historian-simulator

# Guardar configuración para que persista
pm2 save

# Configurar inicio automático al reiniciar servidor
pm2 startup
```

### 7. Gestionar el Simulador con PM2

```bash
# Ver estado
pm2 list

# Ver logs en tiempo real
pm2 logs historian-simulator

# Reiniciar (después de cambios)
pm2 restart historian-simulator

# Detener
pm2 stop historian-simulator

# Eliminar
pm2 delete historian-simulator

# Monitorear recursos
pm2 monit
```

## Flujo Completo de Despliegue

### Escenario: Has hecho cambios en el código local y quieres desplegarlos

**Paso 1 - En tu máquina local:**
```bash
cd /Users/diazhh/Documents/GitHub/historian
git add .
git commit -m "Descripción clara de los cambios"
git push origin main
```

**Paso 2 - Conectar al servidor 144:**
```bash
ssh usuario@192.168.1.144
```

**Paso 3 - Actualizar código en el servidor:**
```bash
cd /var/proyectos/historian
git pull origin main
```

**Paso 4 - Si cambiaste el simulador:**
```bash
cd simulator
npm install  # Por si hay nuevas dependencias
pm2 restart historian-simulator
pm2 logs historian-simulator  # Verificar que inició correctamente
```

**Paso 5 - Si cambiaste thingsboard-extensions:**
```bash
cd /var/proyectos/historian/thingsboard-extensions
npm install
npm run build
# Copiar el build a donde ThingsBoard lo necesite
```

## Archivos Importantes

### `.gitignore` (ya configurados)

El proyecto tiene `.gitignore` en:
- Raíz del proyecto
- `simulator/`
- `thingsboard-extensions/`

**NO se suben al repo:**
- `node_modules/`
- `.env` (¡importante! contiene credenciales)
- `dist/`, `build/`, `target/`
- Archivos de IDE (`.vscode/`, `.idea/`)
- `.DS_Store` y otros archivos del sistema

### `simulator/.env.example`

Plantilla para crear el `.env` en el servidor. Nunca subir el `.env` real.

## Comandos Útiles

### Git
```bash
git status              # Ver estado
git log --oneline -10   # Ver últimos 10 commits
git diff                # Ver cambios no staged
git branch              # Ver branches
```

### PM2
```bash
pm2 list                          # Listar procesos
pm2 logs historian-simulator      # Ver logs
pm2 restart historian-simulator   # Reiniciar
pm2 stop historian-simulator      # Detener
pm2 delete historian-simulator    # Eliminar
pm2 save                          # Guardar configuración
pm2 resurrect                     # Restaurar procesos guardados
```

### NPM
```bash
npm install             # Instalar dependencias
npm run build           # Compilar (thingsboard-extensions)
npm start               # Iniciar en desarrollo
```

## Troubleshooting

### Error al hacer push
```bash
# Si hay conflictos, primero hacer pull
git pull origin main
# Resolver conflictos si los hay
git add .
git commit -m "Merge"
git push origin main
```

### Simulador no inicia en PM2
```bash
# Ver logs de error
pm2 logs historian-simulator --err

# Verificar que .env existe y está bien configurado
cat /var/proyectos/historian/simulator/.env

# Probar manualmente
cd /var/proyectos/historian/simulator
node src/index.js
```

### No se puede hacer pull en el servidor
```bash
# Ver qué archivos tienen cambios locales
git status

# Opción 1: Guardar cambios locales
git stash
git pull origin main
git stash pop

# Opción 2: Descartar cambios locales (¡cuidado!)
git reset --hard origin/main
git pull origin main
```

### Puerto en uso
```bash
# Ver qué proceso usa el puerto (ejemplo: 3000)
lsof -i :3000
# O
netstat -tuln | grep 3000

# Matar proceso si es necesario
kill -9 <PID>
```

## Notas de Seguridad

1. **Nunca subir `.env` al repositorio** - Contiene credenciales sensibles
2. **Verificar `.gitignore`** antes de hacer commit de archivos nuevos
3. **Usar variables de entorno** para configuraciones sensibles
4. **Revisar logs** después de cada despliegue para detectar errores

## Estructura de Archivos Clave

```
simulator/src/
├── index.js           # Punto de entrada
├── config/            # Configuraciones
├── services/          # Servicios de negocio
└── utils/             # Utilidades

thingsboard-extensions/src/app/components/historian/
├── trend-viewer/      # Visualizador de tendencias
├── tag-browser/       # Navegador de tags
├── calc-engine/       # Motor de cálculos
├── statistical-analysis/  # Análisis estadístico
└── ...
```

## Resumen Rápido

**Para desplegar cambios:**
1. Local: `git add . && git commit -m "msg" && git push`
2. SSH: `ssh usuario@192.168.1.144`
3. Pull: `cd /var/proyectos/historian && git pull`
4. Instalar: `cd simulator && npm install`
5. Reiniciar: `pm2 restart historian-simulator`
6. Verificar: `pm2 logs historian-simulator`

---

**¡Importante!** Siempre verifica los logs después de reiniciar el simulador para asegurarte de que está enviando datos correctamente desde el servidor 144.
