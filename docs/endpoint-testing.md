# Endpoint Testing Guide

## Overview

This guide explains how to properly test all HTTP API endpoints of the NotebookLM MCP Server.

## Important: Browser Limitations

**⚠️ Not all endpoints are accessible via browser!**

When you open a URL in a browser, it makes a **GET request**. However, some of our endpoints only accept **POST requests** with JSON data. These endpoints cannot be directly accessed via browser URL bar.

## Endpoints Summary

### Accessible via Browser (GET requests)

These endpoints can be opened directly in your browser:

1. **`GET http://localhost:3100/`** - API information
2. **`GET http://localhost:3100/api/tools`** - List available tools
3. **`GET http://localhost:3100/mcp/tools`** - List MCP tools (now supports GET!)
4. **`GET http://localhost:3000/health`** - Health check
5. **`GET http://localhost:3000/ready`** - Readiness check
6. **`GET http://localhost:3000/live`** - Liveness probe

### Requires HTTP Client (POST requests)

These endpoints require a proper HTTP client (curl, Postman, fetch API, etc.):

1. **`POST http://localhost:3100/api/ask`** - Ask a question to the notebook
2. **`POST http://localhost:3100/mcp/call`** - Call an MCP tool

## Testing Methods

### Method 1: Using Browser (Limited)

Open these URLs in your browser:

```
http://localhost:3100/
http://localhost:3100/api/tools
http://localhost:3100/mcp/tools
http://localhost:3000/health
```

### Method 2: Using curl (Recommended)

#### GET Endpoints

```bash
# API information
curl http://localhost:3100/

# List available tools
curl http://localhost:3100/api/tools

# List MCP tools
curl http://localhost:3100/mcp/tools

# Health endpoints
curl http://localhost:3000/health
curl http://localhost:3000/ready
curl http://localhost:3000/live
```

#### POST Endpoints

```bash
# Ask a question
curl -X POST http://localhost:3100/api/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "What is this notebook about?"}'

# Call MCP tool
curl -X POST http://localhost:3100/mcp/call \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "ask_notebook",
    "arguments": {
      "question": "What are the main topics?"
    }
  }'

# List MCP tools (POST version)
curl -X POST http://localhost:3100/mcp/tools \
  -H "Content-Type: application/json"
```

### Method 3: Using the Test Script

Run the included test script:

```bash
# Make sure the server is running first
npm start

# In another terminal:
./test-endpoints.sh
```

### Method 4: Using Postman or Insomnia

1. Import the endpoints into your HTTP client
2. Set the method (GET or POST)
3. For POST requests:
   - Set `Content-Type: application/json` header
   - Add the JSON body as shown in the curl examples

### Method 5: Using JavaScript fetch API

```javascript
// GET request (works in browser console)
fetch('http://localhost:3100/api/tools')
  .then(response => response.json())
  .then(data => console.log(data));

// POST request (works in browser console)
fetch('http://localhost:3100/api/ask', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    question: 'What is this notebook about?'
  })
})
  .then(response => response.json())
  .then(data => console.log(data));
```

## Port Configuration

The server uses two ports:

- **Port 3000**: Health and operational endpoints
  - `/health` - Health check
  - `/ready` - Readiness check
  - `/live` - Liveness probe
  - `/cache/stats` - Cache statistics
  - `/cache/clear` - Clear cache (POST)

- **Port 3100** (default): HTTP API endpoints
  - `/` - API information
  - `/api/tools` - List tools (GET)
  - `/api/ask` - Ask question (POST)
  - `/mcp/call` - Call MCP tool (POST)
  - `/mcp/tools` - List MCP tools (GET/POST)

You can change the HTTP API port with the `HTTP_API_PORT` environment variable.

## Expected Responses

### Successful Responses

#### GET /api/tools
```json
{
  "tools": [
    {
      "name": "ask_notebook",
      "description": "Ask a question to the NotebookLM notebook..."
    }
  ]
}
```

#### POST /api/ask
```json
{
  "answer": "Based on the notebook contents...",
  "notebook_id": "your-notebook-id",
  "latency_ms": 1234,
  "cached": false,
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

### Error Responses

#### 400 Bad Request
```json
{
  "error": "Validation error: question is required",
  "requestId": "abc123"
}
```

#### 401 Unauthorized
```json
{
  "error": "Unauthorized - Invalid or missing API key"
}
```

#### 500 Internal Server Error
```json
{
  "error": "Internal server error",
  "requestId": "abc123"
}
```

## Troubleshooting

### "Connection refused" error

The server is not running. Start it with:
```bash
npm start
# or
npm run dev
```

### "Cannot GET /api/ask" error in browser

This is normal! The `/api/ask` endpoint only accepts POST requests. Use curl or another HTTP client.

### CORS errors in browser

If testing from a web application on a different domain, make sure CORS is properly configured:
```bash
export CORS_ORIGIN="*"
# or
export CORS_ORIGIN="https://yourdomain.com"
```

### API Key authentication

If you've set an `API_KEY` environment variable, you need to include it in requests:

```bash
curl -X POST http://localhost:3100/api/ask \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key-here" \
  -d '{"question": "test"}'
```

## Quick Validation

To quickly validate all endpoints are working:

```bash
# Run the test script
./test-endpoints.sh

# Or manually test the most important ones:
curl http://localhost:3100/
curl http://localhost:3100/api/tools
curl http://localhost:3000/health
```

## Changes Made

### Fix for Browser Access

**Issue**: The `/mcp/tools` endpoint was POST-only, making it inaccessible via browser.

**Solution**: Updated `/mcp/tools` to support both GET and POST methods in `src/server/http-api.ts:157-166`.

Now you can access `http://localhost:3100/mcp/tools` directly in your browser!
