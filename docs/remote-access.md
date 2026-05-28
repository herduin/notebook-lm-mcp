# Acceso remoto

Si vas a exponer el proyecto para integraciones externas, publica la **HTTP API** del puerto `3100` detrás de un reverse proxy. El puerto `3000` puede quedar reservado para health checks internos.

## Endpoints remotos más útiles

- `GET /api/tools`
- `POST /api/ask`
- `POST /mcp/call`
- `POST /mcp/tools`

## Nginx básico

```nginx
server {
    listen 80;
    server_name mcp.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name mcp.example.com;

    ssl_certificate /etc/letsencrypt/live/mcp.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mcp.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Activar autenticación sencilla

Si quieres proteger la API, define `API_KEY` y envía el header `X-API-Key`.

Ejemplo:

```bash
curl -X POST https://mcp.example.com/api/ask \
  -H "Content-Type: application/json" \
  -H "X-API-Key: tu-clave" \
  -d '{"question":"¿Cuáles son los puntos clave?"}'
```

## Ejemplo sin API key

```bash
curl -X POST http://localhost:3100/api/ask \
  -H "Content-Type: application/json" \
  -d '{"question":"¿Cuáles son los puntos clave?"}'
```

## Recomendaciones

- expón `3100` solo detrás de HTTPS;
- deja `3000` para `/health` y `/ready`;
- usa `API_KEY` si la API va a quedar disponible fuera de tu red;
- limita acceso con firewall o reverse proxy.

## Relacionado

- [Docker](docker.md)
- [Portainer](portainer.md)
