#!/usr/bin/env node

import { loadConfig, validateEnvironment } from './config/index.js';
import { McpHttpServer } from './server/mcp-http.js';
import { HealthServer } from './health/index.js';
import { AuthManager } from './auth/index.js';
import { NotebookLMClient } from './notebook/index.js';
import { NotebookLMTools } from './tools/index.js';
import { createLogger } from './utils/logger.js';

const logger = createLogger('main');

/**
 * Main entry point for NotebookLM MCP Server
 *
 * This server implements the MCP (Model Context Protocol) over HTTP
 * with streaming support for modern AI agent platforms like n8n, Claude Code, and others.
 */
async function main(): Promise<void> {
  try {
    logger.info('Starting NotebookLM MCP Server (HTTP Transport)...');

    // Validate environment
    validateEnvironment();

    // Load configuration
    const config = loadConfig();

    logger.info('Configuration loaded', {
      projectId: config.googleProjectId,
      region: config.googleRegion,
      notebookId: config.notebookId,
      model: config.model,
      port: config.port,
      apiKeyEnabled: !!process.env.API_KEY,
    });

    // Initialize components
    const auth = new AuthManager(config);
    const client = new NotebookLMClient(auth, config);
    const tools = new NotebookLMTools(client);

    // Start health server (port 3000 by default)
    const healthServer = new HealthServer(config, auth, client);
    await healthServer.start();

    // Start MCP HTTP server with SSE support (port 3000 by default, or specified port)
    const mcpPort = process.env.MCP_PORT ? parseInt(process.env.MCP_PORT) : config.port;
    const mcpServer = new McpHttpServer(tools, config);
    await mcpServer.start(mcpPort);

    logger.info('NotebookLM MCP Server started successfully', {
      transport: 'HTTP with SSE',
      mcpPort,
      healthPort: config.port,
      endpoints: {
        mcp: `http://0.0.0.0:${mcpPort}/mcp`,
        sse: `http://0.0.0.0:${mcpPort}/sse`,
        tools: `http://0.0.0.0:${mcpPort}/mcp/tools`,
        health: `http://0.0.0.0:${config.port}/health`,
      },
      authentication: !!process.env.API_KEY,
      tools: tools.getToolDefinitions().map((t) => t.name),
    });

    // Setup graceful shutdown
    const shutdown = async (signal: string): Promise<void> => {
      logger.info(`Received ${signal}, shutting down gracefully...`);

      try {
        await Promise.all([mcpServer.stop(), healthServer.stop()]);
        logger.info('Shutdown complete');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', {
          error: error instanceof Error ? error.message : 'Unknown',
        });
        process.exit(1);
      }
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    // Handle uncaught errors
    process.on('uncaughtException', (error: Error) => {
      logger.error('Uncaught exception', {
        error: error.message,
        stack: error.stack,
      });
      process.exit(1);
    });

    process.on('unhandledRejection', (reason: unknown) => {
      logger.error('Unhandled rejection', {
        reason: reason instanceof Error ? reason.message : String(reason),
      });
      process.exit(1);
    });
  } catch (error) {
    logger.error('Failed to start server', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }
}

// Run main function
main().catch((error: unknown) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
