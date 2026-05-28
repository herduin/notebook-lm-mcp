# Portainer Deployment Guide

## Single-Port Architecture

This deployment consolidates all endpoints (health, MCP, REST API) on a single port (3000 by default).

## Available Endpoints

After deployment, the following endpoints will be available at `http://localhost:3210`:

### Health & Status
- `GET /health` - Health check (no auth)
- `GET /ready` - Readiness check with auth/notebook validation (no auth)
- `GET /live` - Liveness probe (no auth)
- `GET /` - API information and available endpoints

### MCP Protocol
- `GET /mcp/tools` - List available MCP tools (requires X-API-Key)
- `POST /mcp/call` - Call an MCP tool (requires X-API-Key)
- `POST /mcp` - JSON-RPC MCP endpoint (requires X-API-Key)
- `GET /sse` - Server-Sent Events for streaming (requires X-API-Key)

### REST API Compatibility
- `GET /api/tools` - Alias for /mcp/tools (requires X-API-Key)
- `POST /api/ask` - Simplified ask endpoint (requires X-API-Key)

## Deployment Steps

### 1. Prepare Service Account Key

Place your Google Cloud service account key at:
```
/home/ec2-user/notebook-lm/notebook-service-account-lc.json
```

### 2. Deploy with Portainer

1. Go to Portainer UI
2. Select your environment
3. Go to **Stacks** > **Add stack**
4. Name: `notebooklm-mcp`
5. Paste the contents of `portainer-stack-simple.yml`
6. Update the `API_KEY` value to something secure
7. Click **Deploy the stack**

### 3. Verify Deployment

```bash
# Check container is running
docker ps | grep notebooklm-mcp

# Check health
curl http://localhost:3210/health

# Check readiness
curl http://localhost:3210/ready

# Check available endpoints
curl http://localhost:3210/

# List tools (requires API key)
curl -H "X-API-Key: your-api-key" http://localhost:3210/mcp/tools

# Ask a question
curl -X POST http://localhost:3210/api/ask \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{"question":"What is this notebook about?"}'
```

## Cloudflare Tunnel Configuration

Point your Cloudflare Tunnel to:
```
http://localhost:3210
```

Then test through your public domain:
```bash
curl https://notebook-lc.pagegear.co/health
curl https://notebook-lc.pagegear.co/ready
curl -H "X-API-Key: your-api-key" https://notebook-lc.pagegear.co/mcp/tools
```

## Troubleshooting

### Check logs
```bash
docker logs notebooklm-mcp -f
```

### Check listening ports
```bash
docker exec notebooklm-mcp netstat -tulpn
# Should show: 0.0.0.0:3000 LISTEN
```

### Verify from inside container
```bash
docker exec notebooklm-mcp wget -qO- http://127.0.0.1:3000/health
docker exec notebooklm-mcp wget -qO- http://127.0.0.1:3000/ready
```

## Environment Variables

### Required
- `GOOGLE_PROJECT_ID` - Your Google Cloud project ID
- `GOOGLE_PROJECT_NUMBER` - Your Google Cloud project number
- `GOOGLE_REGION` - Region (typically "global")
- `NOTEBOOK_ID` - Your NotebookLM notebook ID
- `GOOGLE_APPLICATION_CREDENTIALS` - Path to service account key in container

### Optional
- `MCP_PORT` - Port to listen on (default: 3000)
- `MODEL` - Gemini model to use (default: gemini-2.5-flash)
- `API_KEY` - API key for authentication (highly recommended)
- `CORS_ORIGIN` - CORS origin (default: *)
- `CACHE_TTL` - Cache TTL in seconds (default: 300)
- `MAX_RETRIES` - Max retry attempts (default: 3)
- `RETRY_DELAY_MS` - Retry delay in ms (default: 1000)
- `REQUEST_TIMEOUT_MS` - Request timeout in ms (default: 30000)
- `MAX_QUESTION_LENGTH` - Max question length (default: 4000)
- `LOG_LEVEL` - Log level (default: info)

### Deprecated (Ignored)
- `ENABLE_HTTP_API` - No longer needed, REST API always available
- `HTTP_API_PORT` - No longer needed, single port for all endpoints

## Migration from Dual-Port Setup

If you're migrating from the old dual-port setup (3000 + 3100):

1. **Update port mapping**: Change from `3210:3000` and `3211:3100` to just `3210:3000`
2. **Update Cloudflare Tunnel**: Point to `http://localhost:3210` instead of `http://localhost:3211`
3. **Remove deprecated env vars**: Remove `ENABLE_HTTP_API` and `HTTP_API_PORT`
4. **Update health checks**: Use `/health` on port 3000 instead of port 3100

All your existing endpoints will work on the new single port.
