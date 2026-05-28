# NotebookLM MCP Server

Servidor MCP para consultar un notebook de Google NotebookLM Enterprise con respuestas fundamentadas y citas.

## Qué incluye

- **MCP por stdio** para clientes como Claude Desktop
- **HTTP API opcional** para integraciones remotas
- **Endpoints de salud** en el puerto `3000`
- **Soporte Docker** con imagen publicada en GitHub Container Registry

## Requisitos

- Node.js 22+
- Un proyecto de Google Cloud con NotebookLM Enterprise habilitado
- Un service account con acceso al notebook
- El `NOTEBOOK_ID` del notebook que vas a consultar

## Inicio rápido local

1. Instala dependencias:
   ```bash
   npm ci
   ```
2. Crea tu archivo de entorno:
   ```bash
   cp .env.example .env
   ```
3. Completa como mínimo estas variables:
   - `GOOGLE_PROJECT_ID`
   - `GOOGLE_PROJECT_NUMBER`
   - `GOOGLE_REGION`
   - `GOOGLE_APPLICATION_CREDENTIALS`
   - `NOTEBOOK_ID`
4. Compila el proyecto:
   ```bash
   npm run build
   ```
5. Inícialo:
   ```bash
   npm start
   ```

## Docker

Imagen publicada:

- **Imagen:** `ghcr.io/herduin/notebook-lm-mcp:latest`
- **Paquete:** https://github.com/herduin/notebook-lm-mcp/pkgs/container/notebook-lm-mcp

Guía recomendada: [docs/docker.md](docs/docker.md)

Resumen rápido:

- `3000`: salud, readiness, liveness y cache
- `3100`: HTTP API opcional (`/api/ask`, `/api/tools`, `/mcp/call`, `/mcp/tools`)

## Documentación

- [Docker](docs/docker.md)
- [Portainer](docs/portainer.md)
- [Clientes MCP](docs/mcp-clients.md)
- [Acceso remoto](docs/remote-access.md)
- [GitHub Actions y publicación de imagen](docs/github-actions.md)
- [Problemas conocidos](docs/known-issues.md)

## Archivos útiles del repositorio

- [`Dockerfile`](Dockerfile)
- [`docker-compose.yml`](docker-compose.yml)
- [`portainer-stack-simple.yml`](portainer-stack-simple.yml)
- [`portainer-stack.yml`](portainer-stack.yml)
- [`.env.example`](.env.example)
- [`.env.docker`](.env.docker)

## Comandos de desarrollo

```bash
npm run build
npm run test
npm run lint
```

## Licencia

MIT
