# Instrucciones de Despliegue - Proyecto Historian

## Contexto del Proyecto

Este es el proyecto **Historian**, un sistema historiador industrial que incluye:
- **thingsboard-extensions**: Extensiones Angular para ThingsBoard con componentes de visualización y análisis de datos industriales
- **simulator**: Simulador Node.js que genera datos industriales simulados

## Repositorio GitHub

- **URL**: https://github.com/diazhh/historian
- **Branch principal**: main

## Flujo de Trabajo para Subir Cambios

### 1. Verificar Estado del Repositorio Local

```bash
cd /Users/diazhh/Documents/GitHub/historian
git status
```

### 2. Agregar Cambios al Stage

```bash
# Agregar todos los cambios
git add .

# O agregar archivos específicos
git add <archivo1> <archivo2>
```

### 3. Hacer Commit

```bash
git commit -m "Descripción clara de los cambios realizados"
```

### 4. Subir Cambios a GitHub

```bash
git push origin main
```

## Despliegue en Servidor 144

### 1. Conectarse al Servidor

```bash
ssh usuario@192.168.1.144
```

### 2. Navegar a la Carpeta de Proyectos

```bash
cd /var/proyectos
```

### 3. Clonar o Actualizar el Repositorio

**Si es la primera vez (clonar):**
```bash
git clone https://github.com/diazhh/historian.git
cd historian
```

**Si ya existe (actualizar):**
```bash
cd historian
git pull origin main
```

### 4. Compilar el Simulador

```bash
cd simulator
npm install
```

### 5. Configurar Variables de Entorno

Crear archivo `.env` en la carpeta `simulator` basándose en `.env.example`:

```bash
cp .env.example .env
nano .env
```

Configurar las variables necesarias (ThingsBoard URL, tokens, etc.)

### 6. Levantar el Simulador con PM2

**Iniciar el simulador:**
```bash
pm2 start src/index.js --name historian-simulator
```

**Guardar la configuración de PM2:**
```bash
pm2 save
```

**Configurar PM2 para inicio automático:**
```bash
pm2 startup
```

### 7. Verificar Estado del Simulador

```bash
# Ver procesos activos
pm2 list

# Ver logs en tiempo real
pm2 logs historian-simulator

# Ver logs específicos
pm2 logs historian-simulator --lines 100

# Monitorear recursos
pm2 monit
```

### 8. Comandos Útiles de PM2

```bash
# Reiniciar el simulador
pm2 restart historian-simulator

# Detener el simulador
pm2 stop historian-simulator

# Eliminar del PM2
pm2 delete historian-simulator

# Ver información detallada
pm2 show historian-simulator
```

## Compilar ThingsBoard Extensions (si es necesario)

Si necesitas compilar las extensiones de ThingsBoard:

```bash
cd /var/proyectos/historian/thingsboard-extensions
npm install
npm run build
```

## Notas Importantes

1. **Gitignore**: El proyecto ya tiene configurados los `.gitignore` necesarios para evitar subir:
   - `node_modules/`
   - `.env` (variables de entorno)
   - Archivos de build (`dist/`, `target/`)
   - Archivos de IDE (`.vscode/`, `.idea/`)
   - Archivos del sistema (`.DS_Store`)

2. **Seguridad**: Nunca subir archivos `.env` al repositorio. Siempre configurarlos manualmente en el servidor.

3. **Logs**: Los logs del simulador se pueden encontrar en:
   - PM2 logs: `~/.pm2/logs/`
   - Logs de la aplicación (si están configurados)

4. **Puerto**: Verificar que el puerto configurado en el simulador no esté en uso en el servidor 144.

## Troubleshooting

### El simulador no inicia
```bash
# Verificar logs
pm2 logs historian-simulator --err

# Verificar configuración
cat simulator/.env

# Verificar dependencias
cd simulator && npm install
```

### No se puede hacer pull
```bash
# Verificar cambios locales
git status

# Descartar cambios locales (¡cuidado!)
git reset --hard origin/main

# O hacer stash de cambios
git stash
git pull origin main
git stash pop
```

### PM2 no guarda la configuración
```bash
# Reiniciar PM2
pm2 kill
pm2 resurrect
```

## Resumen del Flujo Completo

```bash
# En tu máquina local
cd /Users/diazhh/Documents/GitHub/historian
git add .
git commit -m "Descripción de cambios"
git push origin main

# En el servidor 144
ssh usuario@192.168.1.144
cd /var/proyectos/historian
git pull origin main
cd simulator
npm install
pm2 restart historian-simulator
pm2 logs historian-simulator
```
