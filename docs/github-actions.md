# GitHub Actions y publicación de imagen

El workflow [`../.github/workflows/docker-build.yml`](../.github/workflows/docker-build.yml) construye y publica la imagen Docker en GitHub Container Registry.

## Imagen publicada

- `ghcr.io/herduin/notebook-lm-mcp:latest`
- https://github.com/herduin/notebook-lm-mcp/pkgs/container/notebook-lm-mcp

## Cuándo se publica

- push a `master`
- push a `develop`
- tags `v*`
- ejecución manual con `workflow_dispatch`

En pull requests se construye la imagen, pero la parte importante para despliegue es la publicación sobre ramas o tags.

## Tags principales

- `latest`
- `main`
- `develop`
- `vX.Y.Z`
- tags con SHA corto de la rama

## Plataformas

- `linux/amd64`
- `linux/arm64`

## Uso recomendado

Para despliegues normales, consume la imagen publicada desde GHCR en vez de reconstruir desde cero en cada servidor.

## Redeploy automático en Portainer

El último paso del workflow (`Trigger Portainer redeploy webhook`) hace `POST` a un webhook de Portainer para que el stack haga `pull` de la imagen recién publicada y recree el contenedor sin intervención manual.

### Cuándo se dispara

Solo en `push` al branch por defecto (`master`). PRs, `develop`, tags `v*` y `workflow_dispatch` quedan fuera para evitar redeploys ruidosos en cada experimento.

### Configuración

1. **En Portainer**, abre el stack (`notebooklm-mcp`) → pestaña **Webhooks** → habilita el webhook del stack y copia la URL. Tiene este formato:

   ```
   https://<portainer-host>/api/stacks/webhooks/<uuid>
   ```

   La acción del webhook es "redeploy stack with pull image" (Portainer hace `docker pull` antes de recrear).

2. **En GitHub**, repo → **Settings → Secrets and variables → Actions → New repository secret**:

   - **Name:** `PORTAINER_WEBHOOK_URL`
   - **Value:** la URL del paso 1.

3. Hacé un push a `master` (o re-corré el último run). Verás el step `Trigger Portainer redeploy webhook` con `HTTP 200`/`204` y mensaje `Redeploy disparado OK.`

### Comportamiento ante errores

| Caso | Resultado del step |
|---|---|
| Secret no configurado | Warning `PORTAINER_WEBHOOK_URL no configurado; se omite redeploy.`, build queda verde |
| Webhook responde `2xx` | OK, redeploy disparado |
| Webhook responde no-`2xx` o falla red | `::error::`, deja los primeros 500 bytes de la respuesta y el step falla |
| Timeout (>30s) | Reintenta hasta 3 veces antes de fallar |

El workflow ya hizo `build + push + attestation` antes de este step, así que un fallo del webhook **no** invalida la imagen publicada; solo no se redeplegó automáticamente y podés disparar el webhook a mano o redeployar desde Portainer.

### Rotación del webhook

Si el UUID del webhook se filtra (queda en logs externos, etc.):

1. En Portainer regenerás el webhook del stack (crea nueva URL, invalida la anterior).
2. Actualizás el secret `PORTAINER_WEBHOOK_URL` en GitHub.

## Relacionado

- [Docker](docker.md)
- [Portainer](portainer.md)
