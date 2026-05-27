# Configuración para Acceso Remoto desde mcp.example.com

Este documento explica cómo configurar y usar el servidor NotebookLM MCP cuando está desplegado en un servidor remoto (`mcp.example.com`).

## Configuración del Servidor

### 1. Desplegar en mcp.example.com

#### Opción A: Con Portainer

1. **Desplegar el stack** siguiendo la guía de `PORTAINER_GUIDE.md`

2. **Configurar acceso externo** editando el stack para exponer el puerto:

```yaml
services:
  notebooklm-mcp:
    ports:
      - "3000:3000"  # Expone en todas las interfaces
```

#### Opción B: Con Docker Compose

```bash
# En el servidor mcp.example.com
cd /opt/notebooklm-mcp
docker-compose up -d
```

### 2. Configurar Reverse Proxy (Recomendado)

Para producción, usa Nginx o Traefik como reverse proxy con HTTPS.

#### Nginx Configuration

```nginx
# /etc/nginx/sites-available/notebooklm-mcp
server {
    listen 80;
    listen [::]:80;
    server_name mcp.example.com;

    # Redirigir a HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name mcp.example.com;

    # Certificados SSL (usar Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/mcp.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mcp.example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Configuración de proxy
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts para operaciones largas
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Health check endpoint
    location /health {
        proxy_pass http://localhost:3000/health;
        access_log off;
    }
}
```

Activar la configuración:
```bash
sudo ln -s /etc/nginx/sites-available/notebooklm-mcp /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

#### Obtener Certificado SSL con Let's Encrypt

```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d mcp.example.com
```

### 3. Configurar Firewall

```bash
# Permitir tráfico HTTP/HTTPS
sudo ufw allow 'Nginx Full'

# O si usas iptables
sudo iptables -A INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 443 -j ACCEPT
```

## Uso desde Diferentes Clientes

### 1. Claude Desktop (Acceso Local al Servidor Remoto)

Claude Desktop no puede conectarse directamente a servidores HTTP remotos. Necesitas una de estas opciones:

#### Opción A: SSH Tunnel (Recomendado)

Crea un túnel SSH desde tu máquina local al servidor:

```bash
# En tu máquina local
ssh -L 3000:localhost:3000 user@mcp.example.com -N
```

Luego configura Claude Desktop para usar `localhost:3000`:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "notebooklm": {
      "command": "node",
      "args": ["-e", "
        const http = require('http');
        const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
        const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');

        // Proxy MCP calls to remote HTTP server
        async function proxyToRemote(toolName, args) {
          return new Promise((resolve, reject) => {
            const data = JSON.stringify({ tool: toolName, arguments: args });
            const options = {
              hostname: 'localhost',
              port: 3000,
              path: '/mcp/call',
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Content-Length': data.length
              }
            };

            const req = http.request(options, (res) => {
              let body = '';
              res.on('data', (chunk) => body += chunk);
              res.on('end', () => resolve(JSON.parse(body)));
            });

            req.on('error', reject);
            req.write(data);
            req.end();
          });
        }

        const server = new Server({ name: 'notebooklm-remote', version: '1.0.0' });
        const transport = new StdioServerTransport();
        server.connect(transport);
      "]
    }
  }
}
```

#### Opción B: Cliente Local que Proxy al Servidor Remoto

Crea un wrapper local que se conecte al servidor remoto via HTTP.

### 2. Claude Code (VS Code Extension)

Similar a Claude Desktop, necesitas un proxy local o SSH tunnel:

```json
// .claude/config.json en tu workspace
{
  "mcpServers": {
    "notebooklm": {
      "command": "node",
      "args": ["${workspaceFolder}/mcp-http-proxy.js"],
      "env": {
        "MCP_SERVER_URL": "https://mcp.example.com"
      }
    }
  }
}
```

Crea el archivo `mcp-http-proxy.js`:

```javascript
// mcp-http-proxy.js
const https = require('https');
const http = require('http');
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');

const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'https://mcp.example.com';

async function callRemoteServer(endpoint, data) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, MCP_SERVER_URL);
    const client = url.protocol === 'https:' ? https : http;

    const postData = JSON.stringify(data);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = client.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error(`Invalid JSON response: ${body}`));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

const server = new Server(
  { name: 'notebooklm-http-proxy', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// List tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const response = await callRemoteServer('/mcp/tools', {});
  return response;
});

// Call tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const response = await callRemoteServer('/mcp/call', {
    tool: name,
    arguments: args
  });
  return response;
});

const transport = new StdioServerTransport();
server.connect(transport);

console.error('MCP HTTP Proxy started, connecting to:', MCP_SERVER_URL);
```

### 3. n8n Integration

n8n puede conectarse directamente al servidor via HTTP.

#### Configurar Nodo HTTP Request en n8n

1. **Agregar nodo "HTTP Request"**
2. **Configurar el nodo:**

```json
{
  "method": "POST",
  "url": "https://mcp.example.com/ask",
  "authentication": "none",
  "sendHeaders": true,
  "headerParameters": {
    "parameters": [
      {
        "name": "Content-Type",
        "value": "application/json"
      }
    ]
  },
  "sendBody": true,
  "bodyParameters": {
    "parameters": [
      {
        "name": "question",
        "value": "={{ $json.question }}"
      }
    ]
  },
  "options": {
    "timeout": 30000,
    "redirect": {
      "redirect": {}
    }
  }
}
```

#### Workflow de Ejemplo en n8n

```json
{
  "name": "NotebookLM Query Workflow",
  "nodes": [
    {
      "parameters": {
        "method": "POST",
        "url": "https://mcp.example.com/api/ask",
        "authentication": "none",
        "jsonParameters": true,
        "options": {},
        "bodyParametersJson": "={{ JSON.stringify({\"question\": $json.question}) }}"
      },
      "name": "Query NotebookLM",
      "type": "n8n-nodes-base.httpRequest",
      "position": [250, 300]
    },
    {
      "parameters": {
        "values": {
          "string": [
            {
              "name": "answer",
              "value": "={{ $json.answer }}"
            },
            {
              "name": "sources",
              "value": "={{ JSON.stringify($json.sources) }}"
            }
          ]
        }
      },
      "name": "Format Response",
      "type": "n8n-nodes-base.set",
      "position": [450, 300]
    }
  ],
  "connections": {
    "Query NotebookLM": {
      "main": [[{ "node": "Format Response", "type": "main", "index": 0 }]]
    }
  }
}
```

### 4. cURL (Línea de Comandos)

Uso directo desde terminal:

#### Verificar Health

```bash
curl https://mcp.example.com/health
```

#### Hacer una Pregunta

```bash
curl -X POST https://mcp.example.com/api/ask \
  -H "Content-Type: application/json" \
  -d '{
    "question": "¿Cuáles son los puntos clave del informe Q4?"
  }'
```

#### Respuesta de Ejemplo

```json
{
  "answer": "Los puntos clave del informe Q4 son...",
  "sources": ["notebook://abc123def456"],
  "citations": [
    {
      "source": "Q4 Financial Report",
      "text": "Los ingresos aumentaron un 25%...",
      "title": "Reporte Q4 Sección 2"
    }
  ],
  "latency_ms": 1234,
  "notebook_id": "abc123def456",
  "model": "gemini-1.5-pro-002",
  "cached": false
}
```

#### Script Bash para Consultas Múltiples

```bash
#!/bin/bash
# query-notebook.sh

API_URL="https://mcp.example.com/api/ask"

# Función para hacer consulta
query_notebook() {
    local question="$1"

    echo "Pregunta: $question"
    echo "---"

    response=$(curl -s -X POST "$API_URL" \
        -H "Content-Type: application/json" \
        -d "{\"question\": \"$question\"}")

    echo "$response" | jq -r '.answer'
    echo ""
    echo "Fuentes:"
    echo "$response" | jq -r '.sources[]'
    echo "---"
}

# Ejemplos de uso
query_notebook "¿Cuál es el resumen ejecutivo?"
query_notebook "¿Cuáles son las métricas clave?"
query_notebook "¿Qué recomendaciones se mencionan?"
```

Uso:
```bash
chmod +x query-notebook.sh
./query-notebook.sh
```

### 5. Python Client

```python
# notebook_client.py
import requests
import json
from typing import Dict, List, Optional

class NotebookLMClient:
    def __init__(self, base_url: str = "https://mcp.example.com"):
        self.base_url = base_url.rstrip('/')
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json'
        })

    def health_check(self) -> Dict:
        """Verificar estado del servidor"""
        response = self.session.get(f"{self.base_url}/health")
        response.raise_for_status()
        return response.json()

    def ask_question(self, question: str, cache: bool = True) -> Dict:
        """Hacer una pregunta al notebook"""
        payload = {
            "question": question
        }

        response = self.session.post(
            f"{self.base_url}/api/ask",
            json=payload,
            timeout=30
        )
        response.raise_for_status()
        return response.json()

    def get_cache_stats(self) -> Dict:
        """Obtener estadísticas del cache"""
        response = self.session.get(f"{self.base_url}/stats/cache")
        response.raise_for_status()
        return response.json()

    def clear_cache(self) -> Dict:
        """Limpiar el cache"""
        response = self.session.post(f"{self.base_url}/cache/clear")
        response.raise_for_status()
        return response.json()

# Ejemplo de uso
if __name__ == "__main__":
    client = NotebookLMClient("https://mcp.example.com")

    # Verificar salud
    print("Health:", client.health_check())

    # Hacer pregunta
    result = client.ask_question("¿Cuáles son los puntos principales?")
    print("Respuesta:", result['answer'])
    print("Latencia:", result['latency_ms'], "ms")

    # Ver estadísticas
    stats = client.get_cache_stats()
    print("Cache size:", stats['size'])
```

### 6. JavaScript/TypeScript Client

```typescript
// notebooklm-client.ts
import axios, { AxiosInstance } from 'axios';

interface AskNotebookResponse {
  answer: string;
  sources: string[];
  citations: Citation[];
  latency_ms: number;
  notebook_id: string;
  model: string;
  cached: boolean;
}

interface Citation {
  source: string;
  text: string;
  title?: string;
  pageNumber?: number;
}

class NotebookLMClient {
  private client: AxiosInstance;

  constructor(baseURL: string = 'https://mcp.example.com') {
    this.client = axios.create({
      baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  async healthCheck(): Promise<any> {
    const { data } = await this.client.get('/health');
    return data;
  }

  async askQuestion(question: string): Promise<AskNotebookResponse> {
    const { data } = await this.client.post('/api/ask', { question });
    return data;
  }

  async getCacheStats(): Promise<any> {
    const { data } = await this.client.get('/stats/cache');
    return data;
  }

  async clearCache(): Promise<any> {
    const { data } = await this.client.post('/cache/clear');
    return data;
  }
}

// Uso
const client = new NotebookLMClient('https://mcp.example.com');

client.askQuestion('¿Cuáles son los hallazgos clave?')
  .then(response => {
    console.log('Answer:', response.answer);
    console.log('Latency:', response.latency_ms, 'ms');
    console.log('Cached:', response.cached);
  })
  .catch(error => {
    console.error('Error:', error.message);
  });
```

## Seguridad y Mejores Prácticas

### 1. Autenticación (Opcional pero Recomendado)

Si necesitas proteger el endpoint, agrega autenticación:

#### API Key Authentication

Modifica el servidor para requerir API key:

```typescript
// En src/middleware/auth.ts
import { FastifyRequest, FastifyReply } from 'fastify';

export async function apiKeyAuth(request: FastifyRequest, reply: FastifyReply) {
  const apiKey = request.headers['x-api-key'];

  if (!apiKey || apiKey !== process.env.API_KEY) {
    reply.code(401).send({ error: 'Unauthorized' });
  }
}
```

Uso desde curl:
```bash
curl -X POST https://mcp.example.com/api/ask \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-secret-key" \
  -d '{"question": "..."}'
```

### 2. Rate Limiting

Implementa rate limiting para prevenir abuso:

```bash
# Nginx rate limiting
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;

location /api {
    limit_req zone=api_limit burst=20;
    proxy_pass http://localhost:3000;
}
```

### 3. CORS (si es necesario)

Para aplicaciones web:

```typescript
// En src/server/index.ts
import cors from '@fastify/cors';

app.register(cors, {
  origin: ['https://tu-app.com'],
  methods: ['GET', 'POST']
});
```

### 4. Monitoreo

Configura monitoreo para el servidor:

```bash
# Prometheus + Grafana
docker-compose -f monitoring-stack.yml up -d
```

## Troubleshooting

### Problema: No se puede conectar desde Claude Desktop

**Solución**: Usa SSH tunnel o un proxy local que se conecte al servidor remoto.

### Problema: Timeouts en consultas largas

**Solución**: Aumenta los timeouts en nginx y en el cliente:

```nginx
proxy_read_timeout 120s;
```

### Problema: CORS errors en navegador

**Solución**: Configura CORS en el servidor o usa un proxy.

### Problema: SSL/TLS errors

**Solución**: Verifica que el certificado SSL esté correctamente configurado:

```bash
curl -v https://mcp.example.com/health
```

## Conclusión

Con esta configuración, tu servidor NotebookLM MCP en `mcp.example.com` estará accesible desde:

- ✅ **Claude Desktop**: Via SSH tunnel o proxy local
- ✅ **Claude Code**: Via proxy local
- ✅ **n8n**: Directamente via HTTP Request node
- ✅ **curl**: Directamente desde línea de comandos
- ✅ **Clientes personalizados**: Via API HTTP

Para producción, asegúrate de:
1. Usar HTTPS con certificados válidos
2. Implementar autenticación si es necesario
3. Configurar rate limiting
4. Monitorear el uso y rendimiento
5. Hacer backups regulares de la configuración
