# Portainer

## Archivo recomendado

Usa [`../portainer-stack-simple.yml`](../portainer-stack-simple.yml). Ya está preparado para desplegar la imagen publicada en:

- `ghcr.io/herduin/notebook-lm-mcp:latest`

## Antes de desplegar

1. Copia el JSON del service account al host Docker.
2. Guarda el archivo en una ruta estable, por ejemplo:
   ```bash
   sudo mkdir -p /opt/notebooklm
   sudo cp service-account-key.json /opt/notebooklm/service-account-key.json
   sudo chmod 600 /opt/notebooklm/service-account-key.json
   ```
3. Toma nota de esa ruta para `GOOGLE_CREDENTIALS_PATH`.

## Despliegue

1. En Portainer entra en **Stacks** → **Add stack**.
2. Ponle nombre, por ejemplo `notebooklm-mcp`.
3. Pega el contenido de `portainer-stack-simple.yml`.
4. Carga estas variables de entorno:

```dotenv
GOOGLE_PROJECT_ID=tu-proyecto
GOOGLE_PROJECT_NUMBER=123456789012
GOOGLE_REGION=us-central1
NOTEBOOK_ID=tu-notebook-id
GOOGLE_CREDENTIALS_PATH=/opt/notebooklm/service-account-key.json
ENABLE_HTTP_API=true
HTTP_API_PORT=3100
```

Variables opcionales:

```dotenv
MODEL=gemini-1.5-pro-002
CORS_ORIGIN=*
API_KEY=
CACHE_TTL=300
MAX_RETRIES=3
RETRY_DELAY_MS=1000
REQUEST_TIMEOUT_MS=30000
MAX_QUESTION_LENGTH=4000
LOG_LEVEL=info
```

5. Pulsa **Deploy the stack**.

## Verificación

- El contenedor debe quedar en estado **running**.
- El healthcheck debe pasar después del arranque.
- Prueba:
  ```bash
  curl http://TU_HOST:3000/health
  curl http://TU_HOST:3100/api/tools
  ```

## Cuándo usar el stack avanzado

[`../portainer-stack.yml`](../portainer-stack.yml) solo tiene sentido si necesitas adaptar la gestión de credenciales o la definición de recursos. Para la mayoría de despliegues, el stack simple es suficiente.

## Relacionado

- [Docker](docker.md)
- [Acceso remoto](remote-access.md)
