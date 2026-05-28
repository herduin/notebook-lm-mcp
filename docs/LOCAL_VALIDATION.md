# Local Docker Validation

This guide shows how to build, run, and validate the Docker image locally before deployment.

## Prerequisites

- Docker installed
- Google Cloud service account key file
- Required environment variables

## Quick Validation

### 1. Build the Image

```bash
cd /path/to/notebook-lm-mcp
docker build -t notebooklm-mcp:test .
```

Expected output:
```
[+] Building 45.2s (15/15) FINISHED
=> [internal] load build definition
...
=> exporting to image
=> => naming to docker.io/library/notebooklm-mcp:test
```

### 2. Run TypeScript Build Test

```bash
npm install
npm run build
npm run typecheck
```

All should complete without errors.

### 3. Create Test Environment File

Create `.env.test` with your configuration:

```bash
GOOGLE_PROJECT_ID=your-project-id
GOOGLE_PROJECT_NUMBER=your-project-number
GOOGLE_REGION=global
NOTEBOOK_ID=your-notebook-id
GOOGLE_APPLICATION_CREDENTIALS=/app/credentials/key.json
MCP_PORT=3000
MODEL=gemini-2.5-flash
CORS_ORIGIN=*
API_KEY=test-key-change-in-production
CACHE_TTL=300
MAX_RETRIES=3
RETRY_DELAY_MS=1000
REQUEST_TIMEOUT_MS=30000
MAX_QUESTION_LENGTH=4000
LOG_LEVEL=info
```

### 4. Run the Container

```bash
docker run --rm \
  -p 3210:3000 \
  --env-file .env.test \
  -v /path/to/your/service-account-key.json:/app/credentials/key.json:ro \
  --name notebooklm-mcp-test \
  notebooklm-mcp:test
```

Expected startup logs:
```
{"level":"info","msg":"Starting NotebookLM MCP Server (HTTP Transport)..."}
{"level":"info","msg":"Configuration loaded"}
{"level":"info","msg":"Starting MCP HTTP server on 0.0.0.0:3000"}
{"level":"info","msg":"MCP HTTP Server started"}
{"level":"info","msg":"NotebookLM MCP Server started successfully"}
```

### 5. Test Endpoints

Open a new terminal and run:

```bash
# Test health endpoint (no auth)
curl http://localhost:3210/health
# Expected: {"status":"healthy","timestamp":"...","uptime":...}

# Test readiness endpoint (no auth)
curl http://localhost:3210/ready
# Expected: {"ready":true,"checks":{"auth":true,"notebook":true}}

# Test liveness endpoint (no auth)
curl http://localhost:3210/live
# Expected: {"status":"alive"}

# Test root endpoint (no auth)
curl http://localhost:3210/
# Expected: JSON with API information and available endpoints

# Test MCP tools endpoint (requires API key)
curl -H "X-API-Key: test-key-change-in-production" http://localhost:3210/mcp/tools
# Expected: {"tools":[...]}

# Test REST API tools alias (requires API key)
curl -H "X-API-Key: test-key-change-in-production" http://localhost:3210/api/tools
# Expected: {"tools":[...]}

# Test MCP tool call (requires API key)
curl -X POST http://localhost:3210/mcp/call \
  -H "Content-Type: application/json" \
  -H "X-API-Key: test-key-change-in-production" \
  -d '{"tool":"get_notebook_metadata","arguments":{}}'
# Expected: {"content":[{"type":"text","text":"..."}]}

# Test REST API ask endpoint (requires API key)
curl -X POST http://localhost:3210/api/ask \
  -H "Content-Type: application/json" \
  -H "X-API-Key: test-key-change-in-production" \
  -d '{"question":"What is this notebook about?"}'
# Expected: {"answer":"...","notebookId":"...","model":"..."}
```

### 6. Run Automated Smoke Tests

From inside the container:

```bash
docker exec notebooklm-mcp-test /app/scripts/smoke-test.sh
```

Or from the host:

```bash
SMOKE_TEST_HOST=localhost \
SMOKE_TEST_PORT=3210 \
SMOKE_TEST_API_KEY=test-key-change-in-production \
./scripts/smoke-test.sh
```

Expected output:
```
🧪 Starting smoke tests for NotebookLM MCP Server
   Target: http://localhost:3210

=== Health Endpoints (No Auth Required) ===
Testing GET /health ... ✅ PASS (HTTP 200)
Testing GET /ready ... ✅ PASS (HTTP 200)
Testing GET /live ... ✅ PASS (HTTP 200)

=== Root Endpoint ===
Testing GET / ... ✅ PASS (HTTP 200)

=== MCP Endpoints (Auth Required) ===
Testing GET /mcp/tools ... ✅ PASS (HTTP 200)
Testing POST /mcp/call ... ✅ PASS (HTTP 200)

=== REST API Compatibility Endpoints (Auth Required) ===
Testing GET /api/tools ... ✅ PASS (HTTP 200)
Testing POST /api/ask ... ✅ PASS (HTTP 200)

=== Authentication Tests ===
Testing GET /mcp/tools ... ✅ PASS (HTTP 401)
Testing GET /api/tools ... ✅ PASS (HTTP 401)

=========================================
Smoke Test Summary
=========================================
✅ Passed: 10
❌ Failed: 0
=========================================
✅ All critical tests passed!
```

### 7. Verify Network Configuration

Check that the container is listening on the correct port:

```bash
docker exec notebooklm-mcp-test netstat -tulpn
```

Expected output should include:
```
Proto Recv-Q Send-Q Local Address           Foreign Address         State       PID/Program name
tcp        0      0 0.0.0.0:3000            0.0.0.0:*               LISTEN      1/node
```

✅ **Important**: Must show `0.0.0.0:3000`, not `127.0.0.1:3000` (which would prevent external access)

### 8. Test Docker Health Check

```bash
docker inspect notebooklm-mcp-test --format='{{.State.Health.Status}}'
```

Expected: `healthy` (after start_period of 45s)

View health check logs:
```bash
docker inspect notebooklm-mcp-test --format='{{range .State.Health.Log}}{{.Output}}{{end}}'
```

## Acceptance Criteria

Before deploying to production, verify:

- [x] `docker ps` shows container running with `0.0.0.0:3210->3000/tcp`
- [x] `docker exec ... netstat -tulpn` shows `0.0.0.0:3000 LISTEN`
- [x] `curl http://localhost:3210/health` returns 200
- [x] `curl http://localhost:3210/ready` returns 200 with `ready: true`
- [x] `curl -H "X-API-Key: test" http://localhost:3210/mcp/tools` returns tools list
- [x] `curl -H "X-API-Key: test" http://localhost:3210/api/tools` returns tools list (REST alias)
- [x] MCP tool call succeeds with valid metadata
- [x] REST API ask call succeeds with valid response
- [x] No port 3100 or 3211 required
- [x] No HTTP_API_PORT environment variable needed
- [x] All smoke tests pass
- [x] Docker health check reports `healthy`

## Troubleshooting

### Container exits immediately

Check logs:
```bash
docker logs notebooklm-mcp-test
```

Common issues:
- Missing or invalid service account key
- Missing required environment variables
- Invalid GOOGLE_PROJECT_ID or NOTEBOOK_ID

### Health check fails

```bash
# Check if port is listening
docker exec notebooklm-mcp-test wget -qO- http://127.0.0.1:3000/health

# Check logs for errors
docker logs notebooklm-mcp-test --tail 50
```

### API Key authentication fails

Ensure:
- `X-API-Key` header is present (case-insensitive)
- Value matches the `API_KEY` environment variable
- You're using the header for authenticated endpoints

### TypeScript build fails

```bash
# Clean and rebuild
rm -rf node_modules dist
npm install
npm run build
```

## Platform Notes

### Linux AMD64 (x86_64)
✅ **Fully tested and supported**

### Linux ARM64
⚠️ **Image not available** - Build from source on ARM64 machine

See `docs/DOCKER_BUILD.md` for details on ARM64 support.

## Next Steps

After successful local validation:
1. Tag the image for your registry
2. Push to registry
3. Deploy to production using Portainer (see `docs/PORTAINER.md`)
4. Configure Cloudflare Tunnel to point to `http://localhost:3210`
5. Test through public domain
