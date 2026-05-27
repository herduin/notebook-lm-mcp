# Build stage
FROM node:22-alpine AS builder

# Build arguments for metadata
ARG BUILD_DATE
ARG VCS_REF
ARG VERSION

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY src ./src

# Build TypeScript
RUN npm run build

# Production stage
FROM node:22-alpine

# Build arguments for metadata
ARG BUILD_DATE
ARG VCS_REF
ARG VERSION

# Labels for metadata (OCI standard)
LABEL org.opencontainers.image.created="${BUILD_DATE}"
LABEL org.opencontainers.image.authors="NotebookLM MCP Server"
LABEL org.opencontainers.image.url="https://github.com/herduin/notebook-lm-mcp"
LABEL org.opencontainers.image.documentation="https://github.com/herduin/notebook-lm-mcp/blob/main/README.md"
LABEL org.opencontainers.image.source="https://github.com/herduin/notebook-lm-mcp"
LABEL org.opencontainers.image.version="${VERSION}"
LABEL org.opencontainers.image.revision="${VCS_REF}"
LABEL org.opencontainers.image.vendor="NotebookLM MCP"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.title="NotebookLM MCP Server"
LABEL org.opencontainers.image.description="Production-ready MCP server for Google NotebookLM Enterprise API"

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm ci --omit=dev && \
    npm cache clean --force

# Copy built application from builder
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist

# Create directory for credentials
RUN mkdir -p /credentials && \
    chown nodejs:nodejs /credentials

# Switch to non-root user
USER nodejs

# Set environment
ENV NODE_ENV=production

# Expose ports
EXPOSE 3000 3100

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); }).on('error', () => process.exit(1));"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Run the application
CMD ["node", "dist/index.js"]
