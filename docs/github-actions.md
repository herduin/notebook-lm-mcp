# GitHub Actions y publicación de imagen

El workflow [`../.github/workflows/docker-build.yml`](../.github/workflows/docker-build.yml) construye y publica la imagen Docker en GitHub Container Registry.

## Imagen publicada

- `ghcr.io/herduin/notebook-lm-mcp:latest`
- https://github.com/herduin/notebook-lm-mcp/pkgs/container/notebook-lm-mcp

## Cuándo se publica

- push a `main`
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

## Relacionado

- [Docker](docker.md)
- [Portainer](portainer.md)
