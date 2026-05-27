# 🚀 Resumen: GitHub Actions + Docker

## ¿Qué se creó?

Se ha configurado un **GitHub Action** que automáticamente construye y publica la imagen Docker en **GitHub Container Registry** cada vez que hay cambios en el repositorio.

## 📦 Imagen Publicada

```
ghcr.io/herduin/notebook-lm-mcp:latest
```

## ⚙️ ¿Cómo Funciona?

### 1. Triggers Automáticos

El workflow se ejecuta automáticamente cuando:

- ✅ Haces **push a `main`** → Genera tag `latest`
- ✅ Haces **push a `develop`** → Genera tag `develop`
- ✅ Creas un **tag `v*`** (ej: `v1.0.0`) → Genera tags semánticos
- ✅ Abres un **Pull Request** → Construye pero no publica
- ✅ **Manualmente** → Desde GitHub Actions UI

### 2. Multi-Arquitectura

Construye para ambas plataformas:
- **linux/amd64** (Intel/AMD - servidores típicos)
- **linux/arm64** (ARM - Apple Silicon, Raspberry Pi)

### 3. Tags Inteligentes

| Acción | Tags Generados |
|--------|----------------|
| Push a main | `latest`, `main`, `main-abc123` |
| Push a develop | `develop`, `develop-abc123` |
| Tag v1.2.3 | `v1.2.3`, `v1.2`, `v1` |

## 🎯 Uso Inmediato

### Opción 1: Docker Run

```bash
docker pull ghcr.io/herduin/notebook-lm-mcp:latest

docker run -d \
  --name notebooklm-mcp \
  -p 3000:3000 -p 3100:3100 \
  -v $(pwd)/service-account-key.json:/credentials/key.json:ro \
  -e GOOGLE_PROJECT_ID=tu-proyecto \
  -e GOOGLE_PROJECT_NUMBER=123456789 \
  -e GOOGLE_REGION=us-central1 \
  -e NOTEBOOK_ID=tu-notebook \
  -e GOOGLE_APPLICATION_CREDENTIALS=/credentials/key.json \
  ghcr.io/herduin/notebook-lm-mcp:latest
```

### Opción 2: Portainer

El archivo `portainer-stack-simple.yml` ya está configurado:

```yaml
services:
  notebooklm-mcp:
    image: ghcr.io/herduin/notebook-lm-mcp:latest
    # ... resto de configuración
```

**Pasos en Portainer:**
1. Stacks > Add Stack
2. Pegar contenido de `portainer-stack-simple.yml`
3. Agregar variables de entorno
4. Deploy ✅

### Opción 3: Docker Compose

```yaml
version: '3.8'
services:
  notebooklm-mcp:
    image: ghcr.io/herduin/notebook-lm-mcp:latest
    ports:
      - "3000:3000"
      - "3100:3100"
    volumes:
      - ./service-account-key.json:/credentials/key.json:ro
    environment:
      - GOOGLE_PROJECT_ID=tu-proyecto
      # ... otras variables
```

## 🔄 Actualizaciones Automáticas

Cada vez que hagas push a `main`, la imagen se actualizará automáticamente:

1. **Código actualizado** → Push a GitHub
2. **GitHub Actions** → Construye imagen
3. **Publica en ghcr.io** → Disponible en minutos
4. **Pull nueva versión** → `docker pull ghcr.io/herduin/notebook-lm-mcp:latest`
5. **Redeploy** → Contenedor con última versión

## 📊 Monitorear Builds

### Ver el Workflow

1. Ve a tu repositorio en GitHub
2. Click en **Actions**
3. Selecciona "Build and Push Docker Image"
4. Ve el progreso del build en tiempo real

### Ver la Imagen Publicada

1. Ve a: https://github.com/herduin/notebook-lm-mcp/pkgs/container/notebook-lm-mcp
2. Verás todas las versiones publicadas
3. Stats de descargas
4. Información de la imagen

## 🎨 Características Especiales

### 1. Cache Inteligente
- Usa GitHub Actions cache
- Builds subsecuentes son mucho más rápidos
- Primera build: ~5-10 minutos
- Builds posteriores: ~2-3 minutos

### 2. Metadatos OCI
La imagen incluye labels estándar:
```bash
docker inspect ghcr.io/herduin/notebook-lm-mcp:latest | jq '.[0].Config.Labels'
```

Muestra:
- Versión
- Fecha de build
- Commit SHA
- URL del repositorio
- Licencia
- etc.

### 3. Attestation
Genera attestation de provenance para:
- Verificar origen de la imagen
- Seguridad y compliance
- Trazabilidad del build

### 4. Multi-stage Build
- Imagen final optimizada
- Solo dependencias de producción
- Usuario no-root
- Tamaño reducido (~200-300 MB)

## 🔧 Ejecutar Build Manualmente

Si necesitas hacer un build especial:

1. Ve a **Actions** en GitHub
2. Click en "Build and Push Docker Image"
3. Click "Run workflow" (botón a la derecha)
4. Selecciona la rama
5. Click "Run workflow"

## 🏷️ Versionar con Tags

Para crear una versión específica:

```bash
# Localmente
git tag v1.0.0
git push origin v1.0.0
```

Esto generará automáticamente:
- `ghcr.io/herduin/notebook-lm-mcp:v1.0.0`
- `ghcr.io/herduin/notebook-lm-mcp:v1.0`
- `ghcr.io/herduin/notebook-lm-mcp:v1`
- `ghcr.io/herduin/notebook-lm-mcp:latest`

## 🔒 Seguridad

### Imagen Pública
La imagen está configurada como pública, cualquiera puede:
```bash
docker pull ghcr.io/herduin/notebook-lm-mcp:latest
```

### Hacer Imagen Privada
Si necesitas hacerla privada:
1. Ve a: https://github.com/herduin/notebook-lm-mcp/pkgs/container/notebook-lm-mcp/settings
2. Cambia visibilidad a "Private"
3. Necesitarás autenticación para pull:
```bash
docker login ghcr.io -u tu-usuario
```

### Escaneo de Vulnerabilidades
```bash
# Con Docker
docker scan ghcr.io/herduin/notebook-lm-mcp:latest

# Con Trivy
trivy image ghcr.io/herduin/notebook-lm-mcp:latest
```

## 📚 Documentación Adicional

- **DOCKER_IMAGE_GUIDE.md** - Guía completa de uso de la imagen
- **.github/README.md** - Documentación de workflows
- **.github/workflows/docker-build.yml** - Código del workflow

## ✅ Beneficios

1. **No necesitas Docker localmente** - Usa imagen pre-construida
2. **Builds consistentes** - Mismo proceso cada vez
3. **Multi-arquitectura** - Funciona en Intel y ARM
4. **Rápido despliegue** - Solo pull y run
5. **Versionado automático** - Tags inteligentes
6. **CI/CD integrado** - Automatización completa
7. **Gratis** - GitHub Actions y Container Registry sin costo para repos públicos

## 🚀 Siguiente Paso

Después del merge a `main`, el workflow se ejecutará automáticamente y tendrás la imagen disponible en:

```
ghcr.io/herduin/notebook-lm-mcp:latest
```

¡Listo para usar en producción! 🎉
