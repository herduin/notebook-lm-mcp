# GitHub Actions Workflows

Este directorio contiene los workflows de CI/CD para el proyecto NotebookLM MCP Server.

## Workflows Disponibles

### `docker-build.yml` - Build y Push de Imagen Docker

Este workflow construye automáticamente la imagen Docker y la publica en GitHub Container Registry (ghcr.io).

#### Triggers

El workflow se ejecuta en los siguientes eventos:

- **Push a `main`**: Crea tag `latest`
- **Push a `develop`**: Crea tag `develop`
- **Tags `v*`**: Crea tags semánticos (ej: `v1.0.0`, `v1.0`, `v1`)
- **Pull Requests a `main`**: Construye pero no publica
- **Manual**: Puede ejecutarse manualmente desde GitHub Actions

#### Características

✅ **Multi-arquitectura**: Construye para `linux/amd64` y `linux/arm64`
✅ **Cache**: Usa GitHub Actions cache para builds más rápidos
✅ **Metadatos**: Labels OCI estándar con información del build
✅ **Attestation**: Genera attestation de provenance para seguridad
✅ **Tags automáticos**: Tags inteligentes basados en branch/tag

#### Tags Generados

| Evento | Tags Generados |
|--------|----------------|
| Push a `main` | `latest`, `main`, `main-abc123` (SHA) |
| Push a `develop` | `develop`, `develop-abc123` (SHA) |
| Tag `v1.2.3` | `v1.2.3`, `v1.2`, `v1`, `main-abc123` |
| PR #42 | `pr-42` (solo build, no push) |

#### Uso de la Imagen

```bash
# Última versión
docker pull ghcr.io/herduin/notebook-lm-mcp:latest

# Versión específica
docker pull ghcr.io/herduin/notebook-lm-mcp:v1.0.0

# Rama develop
docker pull ghcr.io/herduin/notebook-lm-mcp:develop
```

#### Permisos Requeridos

El workflow necesita:
- `contents: read` - Para leer el código del repositorio
- `packages: write` - Para publicar en GitHub Container Registry

Estos permisos están configurados automáticamente vía `GITHUB_TOKEN`.

#### Variables de Build

Las siguientes build args se pasan automáticamente:

- `BUILD_DATE`: Fecha de actualización del repositorio
- `VCS_REF`: SHA del commit
- `VERSION`: Versión del tag (si aplica)

#### Verificación del Build

1. Ve a **Actions** en GitHub
2. Selecciona el workflow "Build and Push Docker Image"
3. Ve el último run y verifica que:
   - ✅ Build completó exitosamente
   - ✅ Tests pasaron (si aplica)
   - ✅ Imagen se publicó en ghcr.io

4. Verifica la imagen en:
   https://github.com/herduin/notebook-lm-mcp/pkgs/container/notebook-lm-mcp

#### Troubleshooting

**Problema: Build falla**
- Verifica los logs en GitHub Actions
- Asegúrate que el Dockerfile es válido
- Verifica que todas las dependencias existen

**Problema: No puede publicar imagen**
- Verifica que el repositorio tiene permisos de packages
- Asegúrate que GITHUB_TOKEN tiene `packages: write`

**Problema: Build muy lento**
- El cache de GitHub Actions debería acelerar builds subsecuentes
- Primera ejecución siempre será más lenta

#### Ejecutar Manualmente

1. Ve a **Actions** en GitHub
2. Selecciona "Build and Push Docker Image"
3. Click "Run workflow"
4. Selecciona la rama
5. Click "Run workflow"

## Agregar Más Workflows

Para agregar nuevos workflows:

1. Crea un nuevo archivo `.yml` en este directorio
2. Define los triggers y jobs
3. Commit y push
4. El workflow se ejecutará automáticamente

### Ejemplo: Workflow de Tests

```yaml
name: Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - run: npm ci
      - run: npm test
```

## Seguridad

### Secrets

No es necesario configurar secrets para el workflow de Docker build, ya que usa el `GITHUB_TOKEN` automático.

Si necesitas agregar secrets:
1. Ve a **Settings** > **Secrets and variables** > **Actions**
2. Click "New repository secret"
3. Agrega el secret
4. Úsalo en el workflow: `${{ secrets.YOUR_SECRET }}`

### Permisos

Los workflows tienen permisos limitados por defecto. Si necesitas permisos adicionales, agrégalos en el workflow:

```yaml
permissions:
  contents: read
  packages: write
  security-events: write
```

## Referencias

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Docker Build Push Action](https://github.com/docker/build-push-action)
- [GitHub Container Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)
