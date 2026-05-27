# Portainer Deployment Guide

This guide explains how to deploy the NotebookLM MCP Server using Portainer.

## Overview

Two Portainer stack files are provided:

1. **portainer-stack-simple.yml** - Recommended for most users
   - Uses host path or volume for credentials
   - Easier to configure
   - Works with standard Portainer setup

2. **portainer-stack.yml** - Advanced configuration
   - Uses Docker configs
   - More complex but follows best practices

## Prerequisites

- Portainer installed and running
- Docker host with internet access (for building) OR pre-built image
- Google Cloud service account key JSON file
- Required Google Cloud environment variables

## Quick Start Guide

### Step 1: Prepare Credentials

#### Option A: Host Path (Easiest)

1. On your Docker host, create a directory:
   ```bash
   sudo mkdir -p /opt/notebooklm
   sudo chmod 755 /opt/notebooklm
   ```

2. Copy your service account key:
   ```bash
   sudo cp service-account-key.json /opt/notebooklm/
   sudo chmod 600 /opt/notebooklm/service-account-key.json
   ```

3. Set the environment variable in Portainer:
   ```
   GOOGLE_CREDENTIALS_PATH=/opt/notebooklm/service-account-key.json
   ```

#### Option B: Docker Volume

1. In Portainer, create a volume:
   - Go to **Volumes** > **Add volume**
   - Name: `notebooklm-credentials`
   - Driver: `local`
   - Click **Create the volume**

2. Copy credentials to the volume:
   ```bash
   # Find the volume path
   docker volume inspect notebooklm-credentials

   # Copy the file
   sudo cp service-account-key.json /var/lib/docker/volumes/notebooklm-credentials/_data/key.json
   sudo chmod 600 /var/lib/docker/volumes/notebooklm-credentials/_data/key.json
   ```

3. Modify `portainer-stack-simple.yml` to use the volume:
   ```yaml
   volumes:
     - notebooklm-credentials:/credentials:ro
   ```

### Step 2: Deploy Stack in Portainer

1. **Navigate to Stacks**
   - In Portainer UI, go to **Stacks** > **Add stack**

2. **Configure Stack**
   - **Name**: `notebooklm-mcp`
   - **Build method**: Choose **Web editor**

3. **Paste Stack Content**
   - Copy contents of `portainer-stack-simple.yml`
   - Paste into the Web editor

4. **Add Environment Variables**

   Scroll down to **Environment variables** section and add:

   **Required Variables:**
   ```
   GOOGLE_PROJECT_ID=my-project-123
   GOOGLE_PROJECT_NUMBER=123456789012
   GOOGLE_REGION=us-central1
   NOTEBOOK_ID=abc123def456
   GOOGLE_CREDENTIALS_PATH=/opt/notebooklm/service-account-key.json
   ```

   **Optional Variables:**
   ```
   MODEL=gemini-1.5-pro-002
   PORT=3000
   CACHE_TTL=300
   MAX_RETRIES=3
   RETRY_DELAY_MS=1000
   REQUEST_TIMEOUT_MS=30000
   MAX_QUESTION_LENGTH=4000
   LOG_LEVEL=info
   ```

5. **Deploy**
   - Click **Deploy the stack**
   - Wait for the build and deployment to complete

### Step 3: Verify Deployment

1. **Check Container Status**
   - Go to **Containers**
   - Find `notebooklm-mcp-server`
   - Status should be **running** with green indicator

2. **Check Health**
   - Click on the container
   - Go to **Health** tab
   - Should show as **healthy** after ~40 seconds

3. **View Logs**
   - In the container details, click **Logs**
   - Look for: `NotebookLM MCP Server started successfully`

4. **Test Health Endpoint**
   ```bash
   curl http://your-docker-host:3000/health
   ```

   Expected response:
   ```json
   {
     "status": "healthy",
     "timestamp": "2025-05-27T10:00:00.000Z",
     "uptime": 123,
     "version": "1.0.0"
   }
   ```

## Using Pre-built Images (Recommended for Production)

Building from source can take several minutes. For faster deployment:

### Step 1: Build and Push Image

On a machine with Docker:

```bash
# Clone repository
git clone https://github.com/herduin/notebook-lm-mcp.git
cd notebook-lm-mcp

# Build image
docker build -t notebooklm-mcp-server:latest .

# Tag for your registry
docker tag notebooklm-mcp-server:latest your-dockerhub-username/notebooklm-mcp-server:latest

# Push to registry
docker push your-dockerhub-username/notebooklm-mcp-server:latest
```

### Step 2: Update Stack File

In `portainer-stack-simple.yml`, replace the `build:` section with:

```yaml
services:
  notebooklm-mcp:
    image: your-dockerhub-username/notebooklm-mcp-server:latest
    # Remove or comment out the build: section
```

## Troubleshooting

### Container Won't Start

**Check logs:**
```bash
docker logs notebooklm-mcp-server
```

**Common issues:**

1. **Missing credentials**
   ```
   Error: GOOGLE_APPLICATION_CREDENTIALS is required
   ```
   - Ensure credentials file is mounted correctly
   - Check file permissions (should be readable)

2. **Invalid credentials**
   ```
   Error: Authentication failed
   ```
   - Verify service account key is valid
   - Check IAM permissions in Google Cloud

3. **Build failure**
   ```
   Error: Cannot find module...
   ```
   - Try using a pre-built image instead
   - Check Docker host internet connectivity

### Health Check Failing

**Symptoms:**
- Container shows as "unhealthy"
- Container restarts repeatedly

**Solutions:**

1. Check if port 3000 is accessible inside container:
   ```bash
   docker exec notebooklm-mcp-server wget -O- http://localhost:3000/health
   ```

2. Increase health check start period:
   ```yaml
   healthcheck:
     start_period: 60s  # Increase from 40s
   ```

3. Check application logs for startup errors

### Resource Issues

**Container using too much memory:**

Adjust resource limits in stack file:
```yaml
deploy:
  resources:
    limits:
      memory: 512M  # Reduce from 1G
```

**Slow performance:**

Increase resource reservations:
```yaml
deploy:
  resources:
    reservations:
      cpus: '1'  # Increase from 0.5
      memory: 512M  # Increase from 256M
```

### Network Issues

**Cannot access from outside:**

1. Check port mapping:
   ```yaml
   ports:
     - "3000:3000"  # Ensure this matches your PORT env var
   ```

2. Check firewall rules on Docker host

3. Verify Portainer network configuration

**Container cannot reach Google APIs:**

1. Check Docker host internet connectivity
2. Verify DNS resolution inside container:
   ```bash
   docker exec notebooklm-mcp-server nslookup aiplatform.googleapis.com
   ```

## Updating the Stack

### Update Configuration

1. Go to **Stacks** in Portainer
2. Click on your stack name
3. Click **Editor**
4. Make your changes
5. Click **Update the stack**

### Update Image

If using pre-built image:

1. Pull new image version:
   ```bash
   docker pull your-dockerhub-username/notebooklm-mcp-server:latest
   ```

2. In Portainer, go to the stack and click **Update the stack**
3. Select **Re-pull image and redeploy**

If building from source:

1. In Portainer stack editor, change the build context:
   ```yaml
   build:
     context: https://github.com/herduin/notebook-lm-mcp.git#main
   ```

2. Click **Update the stack**
3. It will rebuild from latest source

## Production Recommendations

1. **Use Pre-built Images**
   - Faster deployment
   - Consistent builds
   - Version control

2. **Set Resource Limits**
   - Prevents resource exhaustion
   - Ensures predictable performance

3. **Configure Log Rotation**
   ```yaml
   logging:
     driver: "json-file"
     options:
       max-size: "10m"
       max-file: "3"
   ```

4. **Use Secrets for Credentials**
   - Store credentials in Portainer secrets
   - Reference in stack file

5. **Enable Monitoring**
   - Use Portainer's built-in monitoring
   - Or integrate with external tools (Prometheus, Grafana)

6. **Backup Configuration**
   - Export stack definition regularly
   - Store in version control

7. **Set Up Alerts**
   - Configure Portainer webhooks for health status changes
   - Monitor resource usage

## Advanced Configuration

### Multiple Notebooks

Deploy multiple stacks for different notebooks:

```yaml
services:
  notebooklm-mcp-research:
    # ... configuration ...
    environment:
      - NOTEBOOK_ID=${NOTEBOOK_ID_RESEARCH}
    ports:
      - "3001:3000"

  notebooklm-mcp-docs:
    # ... configuration ...
    environment:
      - NOTEBOOK_ID=${NOTEBOOK_ID_DOCS}
    ports:
      - "3002:3000"
```

### Custom Network

Connect to existing network:

```yaml
networks:
  notebooklm-network:
    external: true
    name: my-existing-network
```

### Reverse Proxy Integration

For use with Traefik or Nginx:

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.notebooklm.rule=Host(`notebooklm.example.com`)"
  - "traefik.http.services.notebooklm.loadbalancer.server.port=3000"
```

## Support

For issues and questions:
- GitHub: https://github.com/herduin/notebook-lm-mcp/issues
- Documentation: See README.md in repository
- Portainer Documentation: https://docs.portainer.io/
