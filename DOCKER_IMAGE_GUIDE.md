# Usando la Imagen Docker de GitHub Container Registry

Este proyecto se construye automáticamente y se publica en GitHub Container Registry (ghcr.io) cada vez que hay cambios en el repositorio.

## Imagen Disponible

```
ghcr.io/herduin/notebook-lm-mcp:latest
```

## Tags Disponibles

- `latest` - Última versión de la rama main
- `main` - Última versión de la rama main
- `develop` - Última versión de la rama develop
- `v1.0.0` - Versiones específicas (cuando se crean tags)
- `main-abc123` - Versión específica por commit SHA

## Uso Rápido con Docker

### Pull de la imagen

```bash
docker pull ghcr.io/herduin/notebook-lm-mcp:latest
```

### Ejecutar el contenedor

```bash
docker run -d \
  --name notebooklm-mcp \
  --restart unless-stopped \
  -p 3000:3000 \
  -p 3100:3100 \
  -v $(pwd)/service-account-key.json:/credentials/key.json:ro \
  -e GOOGLE_PROJECT_ID=your-project-id \
  -e GOOGLE_PROJECT_NUMBER=123456789 \
  -e GOOGLE_REGION=us-central1 \
  -e NOTEBOOK_ID=your-notebook-id \
  -e GOOGLE_APPLICATION_CREDENTIALS=/credentials/key.json \
  -e MODEL=gemini-1.5-pro-002 \
  -e ENABLE_HTTP_API=true \
  ghcr.io/herduin/notebook-lm-mcp:latest
```

## Uso con Docker Compose

```yaml
version: '3.8'

services:
  notebooklm-mcp:
    image: ghcr.io/herduin/notebook-lm-mcp:latest
    container_name: notebooklm-mcp-server
    restart: unless-stopped
    ports:
      - "3000:3000"
      - "3100:3100"
    volumes:
      - ./service-account-key.json:/credentials/key.json:ro
    environment:
      - NODE_ENV=production
      - GOOGLE_PROJECT_ID=${GOOGLE_PROJECT_ID}
      - GOOGLE_PROJECT_NUMBER=${GOOGLE_PROJECT_NUMBER}
      - GOOGLE_REGION=us-central1
      - NOTEBOOK_ID=${NOTEBOOK_ID}
      - GOOGLE_APPLICATION_CREDENTIALS=/credentials/key.json
      - MODEL=gemini-1.5-pro-002
      - ENABLE_HTTP_API=true
      - HTTP_API_PORT=3100
```

Ejecutar:
```bash
docker-compose up -d
```

## Uso con Portainer

La imagen ya está configurada en `portainer-stack-simple.yml`:

```yaml
services:
  notebooklm-mcp:
    image: ghcr.io/herduin/notebook-lm-mcp:latest
    # ... resto de la configuración
```

1. En Portainer, ir a **Stacks** > **Add Stack**
2. Pegar el contenido de `portainer-stack-simple.yml`
3. Agregar variables de entorno
4. Deploy

## Verificar la Imagen

### Ver metadatos de la imagen

```bash
docker image inspect ghcr.io/herduin/notebook-lm-mcp:latest
```

### Ver labels OCI

```bash
docker inspect ghcr.io/herduin/notebook-lm-mcp:latest | jq '.[0].Config.Labels'
```

### Ver versión

```bash
docker run --rm ghcr.io/herduin/notebook-lm-mcp:latest node -e "console.log(require('/app/package.json').version)"
```

## Actualizar a la Última Versión

```bash
# Pull nueva versión
docker pull ghcr.io/herduin/notebook-lm-mcp:latest

# Detener y eliminar contenedor actual
docker stop notebooklm-mcp
docker rm notebooklm-mcp

# Crear nuevo contenedor con la última imagen
docker run -d \
  --name notebooklm-mcp \
  # ... mismo comando que antes
```

O con Docker Compose:
```bash
docker-compose pull
docker-compose up -d
```

O con Portainer:
- Ve a tu stack
- Click en **Update the stack**
- Marca **Re-pull image and redeploy**
- Click **Update**

## Verificar Salud del Contenedor

```bash
# Ver logs
docker logs notebooklm-mcp -f

# Health check
curl http://localhost:3000/health

# Estado del contenedor
docker ps | grep notebooklm-mcp
```

## Plataformas Soportadas

La imagen se construye automáticamente para múltiples plataformas:
- `linux/amd64` - Intel/AMD 64-bit (servidores, PCs)
- `linux/arm64` - ARM 64-bit (Apple Silicon, Raspberry Pi 4+)

Docker automáticamente descargará la imagen correcta para tu arquitectura.

## Build Local (Opcional)

Si prefieres construir la imagen localmente:

```bash
# Clone el repositorio
git clone https://github.com/herduin/notebook-lm-mcp.git
cd notebook-lm-mcp

# Build la imagen
docker build -t notebooklm-mcp-local:latest .

# Ejecutar
docker run -d \
  --name notebooklm-mcp \
  -p 3000:3000 \
  -p 3100:3100 \
  -v $(pwd)/service-account-key.json:/credentials/key.json:ro \
  -e GOOGLE_PROJECT_ID=your-project-id \
  # ... otras variables
  notebooklm-mcp-local:latest
```

## Seguridad

### La imagen incluye:

✅ Multi-stage build (imagen final más pequeña)
✅ Usuario no-root (nodejs:nodejs, UID 1001)
✅ Read-only root filesystem compatible
✅ Security labels (no-new-privileges)
✅ Health checks integrados
✅ Proper signal handling (dumb-init)

### Escaneo de Vulnerabilidades

La imagen se construye desde imágenes base oficiales de Node.js y se actualiza automáticamente.

Puedes escanear la imagen con:
```bash
docker scan ghcr.io/herduin/notebook-lm-mcp:latest
```

O con Trivy:
```bash
trivy image ghcr.io/herduin/notebook-lm-mcp:latest
```

## Troubleshooting

### Problema: No se puede descargar la imagen

```bash
# La imagen es pública, pero asegúrate de tener acceso
docker pull ghcr.io/herduin/notebook-lm-mcp:latest
```

Si hay problemas de autenticación, la imagen debe ser pública. Verifica en:
https://github.com/herduin/notebook-lm-mcp/pkgs/container/notebook-lm-mcp

### Problema: Arquitectura no soportada

```bash
# Ver tu arquitectura
uname -m

# Forzar plataforma específica
docker run --platform linux/amd64 ghcr.io/herduin/notebook-lm-mcp:latest
```

### Problema: Imagen antigua

```bash
# Forzar pull de la última versión
docker pull ghcr.io/herduin/notebook-lm-mcp:latest --no-cache
```

## CI/CD

La imagen se construye automáticamente cuando:
- Se hace push a `main` → tag `latest`
- Se hace push a `develop` → tag `develop`
- Se crea un tag `v*` → tags semánticos (`v1.0.0`, `v1.0`, `v1`)
- Pull requests → tag temporal con el PR número

Ver el workflow en: `.github/workflows/docker-build.yml`

## Tamaño de la Imagen

La imagen final es compacta gracias al multi-stage build:
- Base: `node:22-alpine`
- Tamaño aproximado: ~200-300 MB

```bash
# Ver tamaño
docker images ghcr.io/herduin/notebook-lm-mcp
```

## Soporte

- GitHub Issues: https://github.com/herduin/notebook-lm-mcp/issues
- Documentación: https://github.com/herduin/notebook-lm-mcp
- Container Registry: https://github.com/herduin/notebook-lm-mcp/pkgs/container/notebook-lm-mcp
