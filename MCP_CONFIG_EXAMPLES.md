# MCP Client Configuration Examples

This document provides detailed configuration examples for various MCP clients.

## Claude Desktop

### macOS Configuration

Location: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "notebooklm": {
      "command": "node",
      "args": [
        "/Users/username/projects/notebook-lm-mcp/dist/index.js"
      ],
      "env": {
        "GOOGLE_PROJECT_ID": "my-project-123",
        "GOOGLE_PROJECT_NUMBER": "123456789012",
        "GOOGLE_REGION": "us-central1",
        "NOTEBOOK_ID": "abc123def456",
        "GOOGLE_APPLICATION_CREDENTIALS": "/Users/username/.gcloud/notebooklm-key.json",
        "MODEL": "gemini-1.5-pro-002",
        "PORT": "3000",
        "CACHE_TTL": "300",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

### Windows Configuration

Location: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "notebooklm": {
      "command": "node",
      "args": [
        "C:\\Users\\username\\projects\\notebook-lm-mcp\\dist\\index.js"
      ],
      "env": {
        "GOOGLE_PROJECT_ID": "my-project-123",
        "GOOGLE_PROJECT_NUMBER": "123456789012",
        "GOOGLE_REGION": "us-central1",
        "NOTEBOOK_ID": "abc123def456",
        "GOOGLE_APPLICATION_CREDENTIALS": "C:\\Users\\username\\.gcloud\\notebooklm-key.json",
        "MODEL": "gemini-1.5-pro-002",
        "PORT": "3000",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

### Linux Configuration

Location: `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "notebooklm": {
      "command": "node",
      "args": [
        "/home/username/projects/notebook-lm-mcp/dist/index.js"
      ],
      "env": {
        "GOOGLE_PROJECT_ID": "my-project-123",
        "GOOGLE_PROJECT_NUMBER": "123456789012",
        "GOOGLE_REGION": "us-central1",
        "NOTEBOOK_ID": "abc123def456",
        "GOOGLE_APPLICATION_CREDENTIALS": "/home/username/.gcloud/notebooklm-key.json",
        "MODEL": "gemini-1.5-pro-002",
        "PORT": "3000",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

## Claude Code (VS Code Extension)

Create `.claude/config.json` in your workspace root:

```json
{
  "mcpServers": {
    "notebooklm": {
      "command": "node",
      "args": [
        "${workspaceFolder}/dist/index.js"
      ],
      "env": {
        "GOOGLE_PROJECT_ID": "my-project-123",
        "GOOGLE_PROJECT_NUMBER": "123456789012",
        "GOOGLE_REGION": "us-central1",
        "NOTEBOOK_ID": "abc123def456",
        "GOOGLE_APPLICATION_CREDENTIALS": "${workspaceFolder}/service-account-key.json",
        "MODEL": "gemini-1.5-pro-002",
        "PORT": "3000",
        "LOG_LEVEL": "debug"
      }
    }
  }
}
```

### Using Environment Variables

```json
{
  "mcpServers": {
    "notebooklm": {
      "command": "node",
      "args": [
        "${workspaceFolder}/dist/index.js"
      ],
      "env": {
        "GOOGLE_PROJECT_ID": "${env:GOOGLE_PROJECT_ID}",
        "GOOGLE_PROJECT_NUMBER": "${env:GOOGLE_PROJECT_NUMBER}",
        "GOOGLE_REGION": "${env:GOOGLE_REGION}",
        "NOTEBOOK_ID": "${env:NOTEBOOK_ID}",
        "GOOGLE_APPLICATION_CREDENTIALS": "${env:GOOGLE_APPLICATION_CREDENTIALS}",
        "MODEL": "gemini-1.5-pro-002"
      }
    }
  }
}
```

## Paperclip

Create `paperclip.config.yaml`:

```yaml
mcp_servers:
  - name: notebooklm
    description: "NotebookLM Enterprise MCP Server"
    command: node
    args:
      - /path/to/notebook-lm-mcp/dist/index.js
    env:
      GOOGLE_PROJECT_ID: my-project-123
      GOOGLE_PROJECT_NUMBER: "123456789012"
      GOOGLE_REGION: us-central1
      NOTEBOOK_ID: abc123def456
      GOOGLE_APPLICATION_CREDENTIALS: /path/to/service-account-key.json
      MODEL: gemini-1.5-pro-002
      PORT: "3000"
      CACHE_TTL: "300"
      MAX_RETRIES: "3"
      LOG_LEVEL: info
    enabled: true
```

## Docker-based MCP Client Configuration

If running the MCP server in Docker, configure clients to connect to the containerized version:

```json
{
  "mcpServers": {
    "notebooklm": {
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-i",
        "--env-file", "/path/to/.env",
        "-v", "/path/to/service-account-key.json:/credentials/key.json:ro",
        "notebooklm-mcp-server:latest"
      ]
    }
  }
}
```

## Testing Your Configuration

After configuring your MCP client, verify the connection:

### 1. Check Server Logs

Look for successful startup messages:
```
[info] NotebookLM MCP Server started successfully
[info] Authentication verification successful
[info] Notebook verification successful
```

### 2. Test the Tool

Try using the `ask_notebook` tool:

**In Claude Desktop:**
```
Can you use the ask_notebook tool to query "What is this notebook about?"
```

**Expected Response:**
```json
{
  "answer": "This notebook contains...",
  "sources": ["notebook://abc123def456"],
  "citations": [...],
  "latency_ms": 1234,
  "notebook_id": "abc123def456",
  "model": "gemini-1.5-pro-002",
  "cached": false
}
```

### 3. Verify Health Endpoint

If configured with PORT, check the health endpoint:
```bash
curl http://localhost:3000/health
```

## Troubleshooting

### Common Issues

1. **Server Not Starting**
   - Verify all paths are absolute
   - Check that Node.js is in PATH
   - Ensure all required environment variables are set

2. **Authentication Errors**
   - Verify service account key path is correct
   - Check that the key file has proper permissions (600)
   - Ensure GOOGLE_APPLICATION_CREDENTIALS is an absolute path

3. **Permission Errors on Windows**
   - Use forward slashes in paths: `C:/Users/...`
   - Or escape backslashes: `C:\\Users\\...`

4. **MCP Client Not Finding Tool**
   - Restart the MCP client after configuration changes
   - Check client logs for connection errors
   - Verify the server is actually running

## Advanced Configuration

### Multiple Notebooks

Configure multiple notebook servers:

```json
{
  "mcpServers": {
    "notebooklm-research": {
      "command": "node",
      "args": ["/path/to/notebook-lm-mcp/dist/index.js"],
      "env": {
        "GOOGLE_PROJECT_ID": "my-project-123",
        "GOOGLE_PROJECT_NUMBER": "123456789012",
        "GOOGLE_REGION": "us-central1",
        "NOTEBOOK_ID": "research-notebook-id",
        "GOOGLE_APPLICATION_CREDENTIALS": "/path/to/key.json",
        "PORT": "3001"
      }
    },
    "notebooklm-docs": {
      "command": "node",
      "args": ["/path/to/notebook-lm-mcp/dist/index.js"],
      "env": {
        "GOOGLE_PROJECT_ID": "my-project-123",
        "GOOGLE_PROJECT_NUMBER": "123456789012",
        "GOOGLE_REGION": "us-central1",
        "NOTEBOOK_ID": "docs-notebook-id",
        "GOOGLE_APPLICATION_CREDENTIALS": "/path/to/key.json",
        "PORT": "3002"
      }
    }
  }
}
```

### Performance Tuning

For high-performance scenarios:

```json
{
  "mcpServers": {
    "notebooklm": {
      "command": "node",
      "args": [
        "--max-old-space-size=2048",
        "/path/to/notebook-lm-mcp/dist/index.js"
      ],
      "env": {
        "GOOGLE_PROJECT_ID": "my-project-123",
        "GOOGLE_PROJECT_NUMBER": "123456789012",
        "GOOGLE_REGION": "us-central1",
        "NOTEBOOK_ID": "abc123def456",
        "GOOGLE_APPLICATION_CREDENTIALS": "/path/to/key.json",
        "CACHE_TTL": "600",
        "MAX_RETRIES": "5",
        "REQUEST_TIMEOUT_MS": "60000",
        "LOG_LEVEL": "warn"
      }
    }
  }
}
```

### Debug Mode

Enable debug logging for troubleshooting:

```json
{
  "mcpServers": {
    "notebooklm": {
      "command": "node",
      "args": ["/path/to/notebook-lm-mcp/dist/index.js"],
      "env": {
        "GOOGLE_PROJECT_ID": "my-project-123",
        "GOOGLE_PROJECT_NUMBER": "123456789012",
        "GOOGLE_REGION": "us-central1",
        "NOTEBOOK_ID": "abc123def456",
        "GOOGLE_APPLICATION_CREDENTIALS": "/path/to/key.json",
        "LOG_LEVEL": "debug",
        "NODE_ENV": "development"
      }
    }
  }
}
```

## Security Best Practices

1. **Never commit configuration files with credentials**
   ```bash
   # Add to .gitignore
   .claude/
   *_config.json
   *.yaml
   service-account-key.json
   ```

2. **Use environment variables for sensitive data**
   - Store credentials in system environment
   - Reference with `${env:VAR_NAME}`

3. **Restrict service account permissions**
   - Use minimum required IAM roles
   - Create separate service accounts per environment

4. **Rotate credentials regularly**
   - Set up automated key rotation
   - Use Secret Manager for production

## Support

For configuration help:
- GitHub Issues: https://github.com/herduin/notebook-lm-mcp/issues
- Documentation: See README.md
