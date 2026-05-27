# Configuración Rápida para mcp.example.com

Resumen ejecutivo para desplegar y usar el servidor desde `mcp.example.com`.

## Despliegue Rápido

### 1. Desplegar con Portainer

```bash
# En mcp.example.com
cd /opt
git clone https://github.com/herduin/notebook-lm-mcp.git
cd notebook-lm-mcp

# Copiar credenciales
sudo mkdir -p /opt/notebooklm
sudo cp service-account-key.json /opt/notebooklm/
sudo chmod 600 /opt/notebooklm/service-account-key.json
```

En Portainer:
1. Stacks > Add Stack
2. Nombre: `notebooklm-mcp`
3. Pegar contenido de `portainer-stack-simple.yml`
4. Variables de entorno:
   ```
   GOOGLE_PROJECT_ID=tu-proyecto
   GOOGLE_PROJECT_NUMBER=123456789
   GOOGLE_REGION=us-central1
   NOTEBOOK_ID=tu-notebook-id
   GOOGLE_CREDENTIALS_PATH=/opt/notebooklm/service-account-key.json
   API_KEY=tu-clave-secreta (opcional)
   ```
5. Deploy

### 2. Configurar Nginx (Recomendado)

```nginx
# /etc/nginx/sites-available/notebooklm
server {
    listen 80;
    server_name mcp.example.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name mcp.example.com;

    ssl_certificate /etc/letsencrypt/live/mcp.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mcp.example.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3100;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Activar:
```bash
sudo ln -s /etc/nginx/sites-available/notebooklm /etc/nginx/sites-enabled/
sudo certbot --nginx -d mcp.example.com
sudo systemctl reload nginx
```

## Uso desde Clientes

### curl

```bash
# Health check
curl https://mcp.example.com/health

# Hacer pregunta
curl -X POST https://mcp.example.com/api/ask \
  -H "Content-Type: application/json" \
  -H "X-API-Key: tu-clave-secreta" \
  -d '{"question": "¿Cuáles son los puntos clave?"}'
```

### n8n

Node HTTP Request:
- Method: POST
- URL: `https://mcp.example.com/api/ask`
- Headers: `X-API-Key: tu-clave-secreta`
- Body: `{"question": "{{ $json.question }}"}`

### Python

```python
import requests

response = requests.post(
    "https://mcp.example.com/api/ask",
    headers={"X-API-Key": "tu-clave-secreta"},
    json={"question": "¿Cuáles son los hallazgos?"}
)
print(response.json()['answer'])
```

### Claude Desktop

Requiere SSH tunnel:
```bash
ssh -L 3100:localhost:3100 user@mcp.example.com -N
```

Ver `REMOTE_ACCESS_GUIDE.md` para configuración completa.

## Puertos

- **3000**: Health checks (Fastify)
- **3100**: HTTP API (endpoints públicos)

## Endpoints Disponibles

- `GET /health` - Estado del servidor
- `GET /ready` - Readiness check
- `POST /api/ask` - Hacer pregunta al notebook
- `GET /api/tools` - Listar herramientas disponibles
- `GET /stats/cache` - Estadísticas del cache
- `POST /cache/clear` - Limpiar cache

## Seguridad

1. **API Key**: Agregar `API_KEY=tu-clave` en variables de entorno
2. **HTTPS**: Usar certificado SSL (Let's Encrypt)
3. **Firewall**: Solo exponer puertos 80, 443
4. **Rate Limiting**: Configurar en Nginx

## Monitoreo

```bash
# Ver logs
docker logs notebooklm-mcp-server -f

# Estadísticas
curl https://mcp.example.com/stats/cache

# Health
curl https://mcp.example.com/health
```

## Documentación Completa

- `REMOTE_ACCESS_GUIDE.md` - Guía detallada de acceso remoto
- `PORTAINER_GUIDE.md` - Guía de despliegue en Portainer
- `README.md` - Documentación general
