# NotebookLM MCP Server

Production-ready MCP (Model Context Protocol) server for Google NotebookLM Enterprise API. This server enables AI agents like Claude, Paperclip, and other MCP clients to perform grounded question-answering against specific NotebookLM notebooks.

## Features

- ✅ **Official Google Cloud APIs**: Uses Vertex AI and NotebookLM Enterprise APIs
- ✅ **MCP Protocol**: Full Model Context Protocol support
- ✅ **Grounded Answers**: Responses based exclusively on notebook content with citations
- ✅ **Production Ready**: Enterprise-grade architecture with proper error handling
- ✅ **Caching**: Configurable TTL cache for improved performance
- ✅ **Retry Logic**: Exponential backoff with configurable retries
- ✅ **Security**: Input validation, sanitization, and prompt injection protection
- ✅ **Observability**: Structured logging with Pino, request IDs, and metrics
- ✅ **Health Checks**: Kubernetes-ready health and readiness endpoints
- ✅ **Docker Support**: Optimized multi-stage builds with security hardening
- ✅ **Type Safety**: Full TypeScript with strict mode
- ✅ **Testing**: Comprehensive unit and integration tests

## Architecture

```
src/
├── config/          # Configuration management and validation
├── types/           # TypeScript types and Zod schemas
├── auth/            # Google Cloud authentication
├── utils/           # Logger, retry logic, security utilities
├── cache/           # TTL-based caching layer
├── notebook/        # NotebookLM client implementation
├── tools/           # MCP tool definitions and handlers
├── server/          # MCP server implementation
├── health/          # Health check endpoints (Fastify)
└── index.ts         # Main entry point
```

## Prerequisites

- **Node.js**: v22.0.0 or higher
- **Google Cloud Project**: With NotebookLM Enterprise enabled
- **Service Account**: With appropriate IAM permissions
- **NotebookLM Notebook**: Created via Enterprise API or UI

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/herduin/notebook-lm-mcp.git
cd notebook-lm-mcp
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Build the Project

```bash
npm run build
```

## Google Cloud Setup

### 1. Enable Required APIs

```bash
gcloud services enable aiplatform.googleapis.com
gcloud services enable discoveryengine.googleapis.com
```

### 2. Create Service Account

```bash
# Create service account
gcloud iam service-accounts create notebooklm-mcp \
  --display-name="NotebookLM MCP Server" \
  --description="Service account for NotebookLM MCP Server"

# Get your project ID
export PROJECT_ID=$(gcloud config get-value project)
export SA_EMAIL="notebooklm-mcp@${PROJECT_ID}.iam.gserviceaccount.com"
```

### 3. Grant IAM Permissions

```bash
# Required roles for NotebookLM and Vertex AI
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/aiplatform.user"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/discoveryengine.admin"
```

### 4. Create and Download Service Account Key

```bash
gcloud iam service-accounts keys create service-account-key.json \
  --iam-account="${SA_EMAIL}"

# Keep this file secure!
chmod 600 service-account-key.json
```

### 5. Get Your Project Number

```bash
gcloud projects describe $PROJECT_ID --format="value(projectNumber)"
```

## Configuration

### Environment Variables

Create a `.env` file from the template:

```bash
cp .env.example .env
```

Edit `.env` with your values:

```bash
# Google Cloud Configuration (REQUIRED)
GOOGLE_PROJECT_ID=your-project-id
GOOGLE_PROJECT_NUMBER=123456789
GOOGLE_REGION=us-central1
GOOGLE_APPLICATION_CREDENTIALS=./service-account-key.json

# NotebookLM Configuration (REQUIRED)
NOTEBOOK_ID=your-notebook-id

# Model Configuration
MODEL=gemini-1.5-pro-002

# Server Configuration
PORT=3000
NODE_ENV=production

# Cache Configuration (seconds)
CACHE_TTL=300

# Retry Configuration
MAX_RETRIES=3
RETRY_DELAY_MS=1000

# Timeout Configuration (milliseconds)
REQUEST_TIMEOUT_MS=30000

# Security Configuration
MAX_QUESTION_LENGTH=4000

# Logging Configuration
LOG_LEVEL=info
```

### Getting Your Notebook ID

#### Option 1: Create via API

```bash
export ACCESS_TOKEN=$(gcloud auth print-access-token)
export PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")
export REGION="us-central1"

curl -X POST \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  "https://${REGION}-discoveryengine.googleapis.com/v1alpha/projects/${PROJECT_NUMBER}/locations/${REGION}/notebooks" \
  -d '{
    "title": "My MCP Notebook"
  }'
```

The response will contain the notebook ID.

#### Option 2: List Existing Notebooks

```bash
curl -X GET \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  "https://${REGION}-discoveryengine.googleapis.com/v1alpha/projects/${PROJECT_NUMBER}/locations/${REGION}/notebooks"
```

## Running the Server

### Development Mode

```bash
npm run dev
```

### Production Mode

```bash
npm start
```

### Using Docker

```bash
# Build the image
docker build -t notebooklm-mcp-server .

# Run with docker-compose
cp .env.docker .env
docker-compose up -d
```

### Using Portainer

Deploy with Portainer for easy management:

```bash
# 1. Copy the stack file
cp portainer-stack-simple.yml my-stack.yml

# 2. In Portainer UI:
#    - Go to Stacks > Add Stack
#    - Name: notebooklm-mcp
#    - Paste stack content
#    - Add environment variables
#    - Deploy

# See PORTAINER_GUIDE.md for detailed instructions
```

**Quick Portainer Setup:**
1. Place service account key at `/opt/notebooklm/service-account-key.json` on Docker host
2. In Portainer, create stack with `portainer-stack-simple.yml`
3. Add required environment variables (see PORTAINER_GUIDE.md)
4. Deploy and monitor via Portainer UI

For complete Portainer deployment guide, see [PORTAINER_GUIDE.md](PORTAINER_GUIDE.md)

## MCP Client Configuration

### Claude Desktop

Add to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "notebooklm": {
      "command": "node",
      "args": ["/absolute/path/to/notebook-lm-mcp/dist/index.js"],
      "env": {
        "GOOGLE_PROJECT_ID": "your-project-id",
        "GOOGLE_PROJECT_NUMBER": "123456789",
        "GOOGLE_REGION": "us-central1",
        "NOTEBOOK_ID": "your-notebook-id",
        "GOOGLE_APPLICATION_CREDENTIALS": "/absolute/path/to/service-account-key.json",
        "MODEL": "gemini-1.5-pro-002",
        "PORT": "3000",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

## Usage

Use the `ask_notebook` tool in your MCP client:

```json
{
  "name": "ask_notebook",
  "arguments": {
    "question": "What are the key findings in the Q4 report?"
  }
}
```

## API Endpoints

```bash
# Health Check
curl http://localhost:3000/health

# Readiness Check
curl http://localhost:3000/ready

# Cache Statistics
curl http://localhost:3000/stats/cache

# Clear Cache
curl -X POST http://localhost:3000/cache/clear
```

## Testing

```bash
npm test              # Run all tests
npm run test:unit     # Unit tests only
npm run test:coverage # Coverage report
```

## Troubleshooting

See the full documentation for common issues and solutions.

## License

MIT