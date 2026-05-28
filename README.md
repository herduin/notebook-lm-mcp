# NotebookLM MCP Server

Servidor MCP (Model Context Protocol) para gestión completa de notebooks de Google NotebookLM Enterprise. Proporciona acceso HTTP con streaming (SSE) compatible con n8n, Claude Code, y otros clientes MCP modernos.

## 🚀 Características

- **Protocolo MCP sobre HTTP** - Compatible con n8n MCP nodes, Claude Code, y otros clientes
- **Streaming SSE** - Soporte para Server-Sent Events para comunicación en tiempo real
- **Autenticación X-API-Key** - Seguridad mediante header case-insensitive
- **7 Herramientas Completas** - Gestión total de notebooks y fuentes
- **Respuestas Fundamentadas** - Todas las respuestas incluyen citas y fuentes verificables
- **Caché Inteligente** - Optimización de rendimiento para consultas repetidas
- **Documentación Detallada** - Esquemas JSON Schema comprensivos para cada herramienta
- **Compatible con Cloudflare Tunnels** - Sin necesidad de SSL local

## 📋 Requisitos

- Node.js 22+
- Un proyecto de Google Cloud con NotebookLM Enterprise habilitado
- Un service account con acceso al notebook
- El `NOTEBOOK_ID` del notebook que vas a gestionar

## 🛠️ Herramientas Disponibles

### 1. `ask_notebook`
Consulta el notebook con preguntas y obtén respuestas fundamentadas con citas.

**Características:**
- Respuestas basadas exclusivamente en contenido del notebook
- Citas con referencias exactas al texto fuente
- Protección contra prompt injection
- Caché automático

### 2. `get_notebook_metadata`
Obtén información detallada sobre un notebook (ID, título, fechas, descripción).

### 3. `list_sources`
Lista todas las fuentes del notebook con paginación.

**Retorna:** ID, nombre, tipo (PDF, URL, TEXT, etc.), tamaño, estado de procesamiento.

### 4. `add_source`
Agrega nuevas fuentes al notebook.

**Tipos soportados:**
- PDF, TEXT, MARKDOWN, URL, GOOGLE_DOC, YOUTUBE, AUDIO

### 5. `remove_source`
Elimina fuentes del notebook (operación permanente).

### 6. `update_notebook`
Actualiza título y descripción del notebook.

### 7. `search_in_sources`
Busca texto específico en las fuentes del notebook con contexto y relevancia.

## 🚀 Inicio Rápido

### Instalación Local

```bash
# 1. Clonar repositorio
git clone https://github.com/herduin/notebook-lm-mcp.git
cd notebook-lm-mcp

# 2. Instalar dependencias
npm ci

# 3. Configurar variables de entorno
cp .env.example .env
# Edita .env con tus credenciales

# 4. Compilar
npm run build

# 5. Iniciar servidor
npm start
```

### Variables de Entorno Requeridas

```bash
# Google Cloud Configuration
GOOGLE_PROJECT_ID=tu-proyecto-id
GOOGLE_PROJECT_NUMBER=123456789
GOOGLE_REGION=us-central1
GOOGLE_APPLICATION_CREDENTIALS=/ruta/a/credentials.json
NOTEBOOK_ID=tu-notebook-id

# Server Configuration
PORT=3000                    # Puerto para health endpoints
MCP_PORT=3000               # Puerto para MCP (por defecto usa PORT)
API_KEY=tu-api-key-secreto  # Requerido para autenticación

# Optional
MODEL=gemini-1.5-pro-002
LOG_LEVEL=info
CACHE_TTL=300
```

## 🔌 Uso con Clientes MCP

### n8n MCP Nodes

```javascript
// Configuración del nodo MCP en n8n
{
  "mcpServer": "http://tu-servidor:3000",
  "headers": {
    "X-API-Key": "tu-api-key"
  },
  "tool": "ask_notebook",
  "arguments": {
    "question": "¿Cuáles son los puntos principales?"
  }
}
```

### Claude Code

Agrega a tu configuración de Claude Code:

```json
{
  "mcpServers": {
    "notebooklm": {
      "url": "http://tu-servidor:3000/mcp",
      "headers": {
        "X-API-Key": "tu-api-key"
      }
    }
  }
}
```

### cURL (Testing)

```bash
# Listar herramientas disponibles
curl -H "X-API-Key: tu-api-key" \
  http://localhost:3000/mcp/tools

# Hacer una pregunta
curl -X POST http://localhost:3000/mcp/call \
  -H "Content-Type: application/json" \
  -H "X-API-Key: tu-api-key" \
  -d '{
    "tool": "ask_notebook",
    "arguments": {
      "question": "¿De qué trata este notebook?"
    }
  }'

# Listar fuentes
curl -X POST http://localhost:3000/mcp/call \
  -H "Content-Type: application/json" \
  -H "X-API-Key: tu-api-key" \
  -d '{
    "tool": "list_sources",
    "arguments": {}
  }'
```

### JavaScript/TypeScript

```typescript
// Usando fetch API
const response = await fetch('http://localhost:3000/mcp/call', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'tu-api-key'
  },
  body: JSON.stringify({
    tool: 'ask_notebook',
    arguments: {
      question: '¿Cuáles son las conclusiones principales?'
    }
  })
});

const result = await response.json();
console.log(result);
```

## 🐳 Docker

Imagen publicada: `ghcr.io/herduin/notebook-lm-mcp:latest`

```bash
docker run -d \
  -p 3000:3000 \
  -e GOOGLE_PROJECT_ID=tu-proyecto \
  -e GOOGLE_PROJECT_NUMBER=123456789 \
  -e GOOGLE_REGION=us-central1 \
  -e NOTEBOOK_ID=tu-notebook-id \
  -e API_KEY=tu-api-key \
  -v /ruta/a/credentials.json:/app/credentials.json:ro \
  -e GOOGLE_APPLICATION_CREDENTIALS=/app/credentials.json \
  ghcr.io/herduin/notebook-lm-mcp:latest
```

Ver [docs/docker.md](docs/docker.md) para más detalles.

## 🌐 Endpoints

### MCP Protocol

- **POST /mcp** - JSON-RPC endpoint para protocolo MCP completo
- **GET /sse** - Server-Sent Events para streaming
- **GET /mcp/tools** - Lista de herramientas disponibles
- **POST /mcp/call** - Llamada directa a herramientas

### Health & Monitoring

- **GET /health** - Health check
- **GET /ready** - Readiness probe
- **GET /live** - Liveness probe
- **GET /** - Información del servidor y endpoints

### Autenticación

Todas las peticiones (excepto health) requieren el header `X-API-Key`:

```bash
curl -H "X-API-Key: tu-api-key" http://localhost:3000/mcp/tools
```

**Nota:** El header es case-insensitive (`X-API-Key`, `x-api-key`, `X-Api-Key` funcionan igual).

## 📊 Arquitectura

```
┌─────────────────────────────────────────────┐
│         Clientes MCP                        │
│  (n8n, Claude Code, Custom Apps)            │
└─────────────────┬───────────────────────────┘
                  │ HTTP + SSE
┌─────────────────▼───────────────────────────┐
│      NotebookLM MCP Server (Port 3000)      │
│  ┌──────────────────────────────────────┐   │
│  │   MCP Protocol Handler (JSON-RPC)    │   │
│  ├──────────────────────────────────────┤   │
│  │   7 Tools (ask, list, add, etc.)     │   │
│  ├──────────────────────────────────────┤   │
│  │   X-API-Key Authentication           │   │
│  ├──────────────────────────────────────┤   │
│  │   Cache Layer (TTL: 5min)            │   │
│  └──────────────────────────────────────┘   │
└─────────────────┬───────────────────────────┘
                  │ Google Cloud API
┌─────────────────▼───────────────────────────┐
│   Google Cloud NotebookLM Enterprise API    │
│   (Vertex AI + Discovery Engine)            │
└─────────────────────────────────────────────┘
```

## 🔒 Seguridad

- **Autenticación obligatoria** vía `X-API-Key` header
- **Sin SSL local** - Diseñado para uso con Cloudflare Tunnels o reverse proxy
- **Validación de entrada** - Protección contra prompt injection
- **Sanitización** - Limpieza automática de inputs
- **Rate limiting** - Configurable a nivel de reverse proxy
- **Trust proxy** - Configurado para trabajar detrás de proxies

## 🚀 Despliegue en Producción

### Con Cloudflare Tunnel

```bash
# 1. Instalar cloudflared
# 2. Configurar tunnel
cloudflared tunnel create notebooklm-mcp

# 3. Configurar routing
cloudflared tunnel route dns notebooklm-mcp mcp.tudominio.com

# 4. Ejecutar tunnel
cloudflared tunnel run \
  --url http://localhost:3000 \
  notebooklm-mcp
```

### Con Nginx Reverse Proxy

```nginx
server {
    listen 443 ssl http2;
    server_name mcp.tudominio.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Para SSE
        proxy_buffering off;
        proxy_cache off;
        proxy_set_header Connection '';
        proxy_http_version 1.1;
        chunked_transfer_encoding off;
    }
}
```

## 📚 Documentación Adicional

- [Endpoints y Testing](docs/endpoint-testing.md)
- [Docker Deployment](docs/docker.md)
- [Portainer Stack](docs/portainer.md)
- [Clientes MCP](docs/mcp-clients.md)
- [Acceso Remoto](docs/remote-access.md)
- [GitHub Actions](docs/github-actions.md)

## 🧪 Testing

```bash
# Lint
npm run lint

# Build
npm run build

# Tests (si están configurados)
npm test
```

## 🔧 Desarrollo

```bash
# Modo desarrollo con watch
npm run dev

# Ver logs
tail -f logs/app.log

# Limpiar cache
curl -X POST http://localhost:3000/cache/clear \
  -H "X-API-Key: tu-api-key"
```

## 📝 Esquemas de Herramientas

Todas las herramientas incluyen esquemas JSON Schema detallados que son autodescubiertos por los clientes MCP. Los agentes pueden actuar con precisión quirúrgica sobre el notebook gracias a la documentación exhaustiva en cada esquema.

Para ver los esquemas completos:

```bash
curl -H "X-API-Key: tu-api-key" \
  http://localhost:3000/mcp/tools | jq
```

## 🤝 Contribuir

Las contribuciones son bienvenidas. Por favor:

1. Fork el proyecto
2. Crea un branch para tu feature
3. Commit tus cambios
4. Push al branch
5. Abre un Pull Request

## 📄 Licencia

MIT

## 🔗 Links

- **Repositorio:** https://github.com/herduin/notebook-lm-mcp
- **Issues:** https://github.com/herduin/notebook-lm-mcp/issues
- **Container Registry:** https://github.com/herduin/notebook-lm-mcp/pkgs/container/notebook-lm-mcp

## 💡 Soporte

Para preguntas o problemas, abre un issue en GitHub.
