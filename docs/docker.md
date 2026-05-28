# Docker

## Imagen publicada

- **Imagen:** `ghcr.io/herduin/notebook-lm-mcp:latest`
- **Paquete en GitHub:** https://github.com/herduin/notebook-lm-mcp/pkgs/container/notebook-lm-mcp
- **Repositorio GHCR:** `ghcr.io/herduin/notebook-lm-mcp`

La imagen publicada es la forma más simple de levantar el proyecto en Docker. Si estás trabajando sobre cambios locales del repositorio, usa `docker compose` o construye la imagen manualmente.

## Qué expone el contenedor

- **Puerto 3000**: `/health`, `/ready`, `/live`, `/stats/cache`, `/cache/clear`
- **Puerto 3100**: HTTP API opcional con `/api/ask`, `/api/tools`, `/mcp/call`, `/mcp/tools`

## Opción recomendada: usar la imagen publicada

```bash
docker pull ghcr.io/herduin/notebook-lm-mcp:latest

docker run -d \
  --name notebooklm-mcp-server \
  --restart unless-stopped \
  -p 3000:3000 \
  -p 3100:3100 \
  -v /ruta/absoluta/service-account-key.json:/credentials/key.json:ro \
  -e GOOGLE_PROJECT_ID=tu-proyecto \
  -e GOOGLE_PROJECT_NUMBER=123456789012 \
  -e GOOGLE_REGION=us-central1 \
  -e NOTEBOOK_ID=tu-notebook-id \
  -e GOOGLE_APPLICATION_CREDENTIALS=/credentials/key.json \
  -e ENABLE_HTTP_API=true \
  -e HTTP_API_PORT=3100 \
  ghcr.io/herduin/notebook-lm-mcp:latest
```

### Verificación mínima

```bash
curl http://localhost:3000/health
curl http://localhost:3000/ready
curl http://localhost:3100/api/tools
```

## Opción para trabajar desde este repositorio: `docker compose`

1. Copia la plantilla:
   ```bash
   cp .env.docker .env
   ```
2. Completa `.env` con tus datos reales.
3. Asegúrate de que `GOOGLE_CREDENTIALS_PATH` apunte a un archivo existente en el host.
4. Levanta el servicio:
   ```bash
   docker compose up -d --build
   ```

### Variables mínimas en `.env`

```dotenv
GOOGLE_PROJECT_ID=tu-proyecto
GOOGLE_PROJECT_NUMBER=123456789012
GOOGLE_REGION=us-central1
GOOGLE_CREDENTIALS_PATH=/ruta/absoluta/service-account-key.json
NOTEBOOK_ID=tu-notebook-id
ENABLE_HTTP_API=true
HTTP_API_PORT=3100
```

### Verificación con Compose

```bash
docker compose ps
docker compose logs -f notebooklm-mcp
curl http://localhost:3000/health
curl http://localhost:3100/api/tools
```

## Construcción local manual

```bash
docker build -t notebooklm-mcp-server:local .
```

Luego puedes ejecutarla con el mismo `docker run`, cambiando solo la imagen final por `notebooklm-mcp-server:local`.

## Actualizar la imagen publicada

```bash
docker pull ghcr.io/herduin/notebook-lm-mcp:latest
docker stop notebooklm-mcp-server && docker rm notebooklm-mcp-server
```

Vuelve a lanzar el contenedor con el mismo comando usado originalmente.

## Problemas frecuentes

### `Missing required environment variables`

Falta una variable obligatoria o no se cargó el archivo `.env` correcto.

### `ready` devuelve `503`

El contenedor arrancó, pero la autenticación o el acceso al notebook todavía no funcionan. Revisa credenciales, permisos IAM y `NOTEBOOK_ID`.

### El puerto `3100` no responde

Confirma que `ENABLE_HTTP_API=true` y que el puerto `3100` esté publicado por Docker.

## Relacionado

- [README principal](../README.md)
- [Portainer](portainer.md)
- [Acceso remoto](remote-access.md)
