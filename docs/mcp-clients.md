# Clientes MCP

## Recomendación general

Para clientes MCP de escritorio, lo más estable es ejecutar el servidor por **stdio** desde tu máquina local. Docker es útil para integraciones HTTP remotas, no es obligatorio para Claude Desktop.

## Claude Desktop

### macOS

Archivo: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "notebooklm": {
      "command": "node",
      "args": ["/ruta/absoluta/notebook-lm-mcp/dist/index.js"],
      "env": {
        "GOOGLE_PROJECT_ID": "tu-proyecto",
        "GOOGLE_PROJECT_NUMBER": "123456789012",
        "GOOGLE_REGION": "us-central1",
        "NOTEBOOK_ID": "tu-notebook-id",
        "GOOGLE_APPLICATION_CREDENTIALS": "/ruta/absoluta/service-account-key.json",
        "MODEL": "gemini-1.5-pro-002",
        "PORT": "3000",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

### Windows

Archivo: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "notebooklm": {
      "command": "node",
      "args": ["C:\\ruta\\absoluta\\notebook-lm-mcp\\dist\\index.js"],
      "env": {
        "GOOGLE_PROJECT_ID": "tu-proyecto",
        "GOOGLE_PROJECT_NUMBER": "123456789012",
        "GOOGLE_REGION": "us-central1",
        "NOTEBOOK_ID": "tu-notebook-id",
        "GOOGLE_APPLICATION_CREDENTIALS": "C:\\ruta\\absoluta\\service-account-key.json"
      }
    }
  }
}
```

### Linux

Archivo: `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "notebooklm": {
      "command": "node",
      "args": ["/ruta/absoluta/notebook-lm-mcp/dist/index.js"],
      "env": {
        "GOOGLE_PROJECT_ID": "tu-proyecto",
        "GOOGLE_PROJECT_NUMBER": "123456789012",
        "GOOGLE_REGION": "us-central1",
        "NOTEBOOK_ID": "tu-notebook-id",
        "GOOGLE_APPLICATION_CREDENTIALS": "/ruta/absoluta/service-account-key.json"
      }
    }
  }
}
```

## Ejecutarlo desde Docker como servidor MCP

Si quieres que el cliente arranque el contenedor directamente:

```json
{
  "mcpServers": {
    "notebooklm": {
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-i",
        "-e", "GOOGLE_PROJECT_ID=tu-proyecto",
        "-e", "GOOGLE_PROJECT_NUMBER=123456789012",
        "-e", "GOOGLE_REGION=us-central1",
        "-e", "NOTEBOOK_ID=tu-notebook-id",
        "-e", "GOOGLE_APPLICATION_CREDENTIALS=/credentials/key.json",
        "-v", "/ruta/absoluta/service-account-key.json:/credentials/key.json:ro",
        "ghcr.io/herduin/notebook-lm-mcp:latest"
      ]
    }
  }
}
```

## Verificación

Después de configurar el cliente:

1. recompila el proyecto si usas el binario local:
   ```bash
   npm run build
   ```
2. reinicia el cliente MCP;
3. verifica que aparezca la herramienta `ask_notebook`.

## Relacionado

- [README principal](../README.md)
- [Docker](docker.md)
- [Acceso remoto](remote-access.md)
