# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Production MCP (Model Context Protocol) server for Google NotebookLM Enterprise. Exposes 7 tools (`ask_notebook`, `get_notebook_metadata`, `list_sources`, `add_source`, `remove_source`, `update_notebook`, `search_in_sources`) over HTTP+SSE to clients like n8n and Claude Code. Single port (default 3000) serves MCP protocol, REST aliases, and health probes. TypeScript ESM, Node ≥ 22.

## Commands

```bash
npm run dev              # tsx watch on src/index.ts (hot reload)
npm run build            # tsc -> dist/
npm start                # node dist/index.js (must build first)
npm run typecheck        # tsc --noEmit
npm run lint             # eslint src --ext .ts
npm run lint:fix
npm run format           # prettier on src/**/*.ts

# Tests — jest runs under ESM via NODE_OPTIONS='--experimental-vm-modules'
npm test
npm run test:unit                            # only src/__tests__/unit/*
npm run test:integration                     # only src/__tests__/integration/*
npm run test:coverage                        # threshold 70% (see jest.config.js)
npx jest src/__tests__/unit/cache.test.ts    # single file
npx jest -t "cache miss"                     # single test by name

# Docker
npm run docker:build
docker-compose up
./test-endpoints.sh                          # smoke against running server
./scripts/smoke-test.sh
```

Required env (see `.env.example`): `GOOGLE_PROJECT_ID`, `GOOGLE_PROJECT_NUMBER`, `GOOGLE_REGION`, `GOOGLE_APPLICATION_CREDENTIALS`, `NOTEBOOK_ID`, `API_KEY`. Deprecated and ignored: `HTTP_API_PORT`, `ENABLE_HTTP_API` (everything on `MCP_PORT` / `PORT`, default 3000 — warnings emitted at startup).

## Architecture

Boot path: `src/index.ts` → `validateEnvironment()` + `loadConfig()` (`src/config`) → wires `AuthManager` (`src/auth`, google-auth-library service account) → `NotebookLMClient` (`src/notebook`, calls Discovery Engine v1alpha at `https://{region}-discoveryengine.googleapis.com/...`) → `NotebookLMTools` (`src/tools`, zod schemas in `src/types/schemas.ts`) → `McpHttpServer` (`src/server/mcp-http.ts`).

`McpHttpServer` is the single integration point. It mounts a Fastify app with `trustProxy: true` (required for Cloudflare Tunnel/Nginx in front) and inside it instantiates the official `@modelcontextprotocol/sdk` `Server`. It registers handlers for `ListToolsRequestSchema` / `CallToolRequestSchema` and also exposes plain REST aliases (`/mcp/tools`, `/mcp/call`, `/api/*`) so non-MCP clients can call the same tool methods. Zod schemas are converted with `zod-to-json-schema` before being advertised to MCP clients.

Auth: every non-health route requires `X-API-Key` (case-insensitive — preserve that in any header-handling change). Health/readiness/liveness on `/health`, `/ready`, `/live` stay unauthenticated.

Caching: `src/cache/index.ts` is an in-memory TTL map keyed by `notebookId + question` and used **only** by `NotebookLMClient.askQuestion`. The other six tools are stateless passthroughs to the Discovery Engine API. TTL controlled by `CACHE_TTL` (seconds, default 300). `POST /cache/clear` flushes it.

Retry: `src/utils/retry.ts` (`retryWithBackoff`) wraps Discovery Engine calls — keep external API calls behind it.

Security: `src/utils/security.ts` — `sanitizeInput` and `validateQuestion` (prompt-injection guard) run before any user text is forwarded to Vertex/Discovery Engine. Apply both when adding new user-text inputs.

## Conventions specific to this repo

- **ESM imports use `.js` extensions** even for `.ts` source (NodeNext resolution + `"type": "module"`). Don't drop them.
- `tsconfig.json` excludes `**/*.test.ts` from the build; tests run via ts-jest directly.
- `jest.config.js` maps `^(\\.{1,2}/.*)\\.js$` → `$1` so test imports can keep the `.js` suffix.
- All logging goes through `createLogger(scope)` from `src/utils/logger.ts` (pino under the hood) — no `console.*` in `src/` except the fatal-error fallback in `src/index.ts`.
- Tool input/output contracts live in `src/types/schemas.ts` (zod). Add a tool by: schema → method on `NotebookLMClient` → entry in `NotebookLMTools.getToolDefinitions()` and its `executeTool` switch → unit test.
- Coverage gate is 70% (not the global 80% from `~/.claude/rules`). Match repo, not global, when touching `jest.config.js`.
- Docker image published to `ghcr.io/herduin/notebook-lm-mcp:latest`. `docker-compose.yml` and the two `portainer-stack*.yml` files are the deployment manifests; `docs/PORTAINER.md` / `docs/portainer.md` / `docs/DOCKER_BUILD.md` / `docs/LOCAL_VALIDATION.md` cover ops detail.
