#!/usr/bin/env node

import { loadConfig, validateEnvironment } from './config/index.js';
import { McpHttpServer } from './server/mcp-http.js';
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
 * All endpoints (health, MCP, REST API) are consolidated on a single port.
 */
async function main(): Promise<void> {
  try {
    logger.info('Starting NotebookLM MCP Server (HTTP Transport)...');

    // Validate environment
    validateEnvironment();

    // Load configuration
    const config = loadConfig();

    // Deprecation warnings for old environment variables
    if (process.env.HTTP_API_PORT) {
      logger.warn('HTTP_API_PORT is deprecated and will be ignored. All endpoints now use MCP_PORT (default 3000)');
    }
    if (process.env.ENABLE_HTTP_API) {
      logger.warn('ENABLE_HTTP_API is deprecated and will be ignored. REST API endpoints are always available at /api/*');
    }

    logger.info('Configuration loaded', {
      projectId: config.googleProjectId,
      region: config.googleRegion,
      notebookId: config.notebookId,
      model: config.model,
      port: process.env.MCP_PORT ? parseInt(process.env.MCP_PORT) : config.port,
      apiKeyEnabled: !!process.env.API_KEY,
    });

    // Initialize components
    const auth = new AuthManager(config);
    const client = new NotebookLMClient(auth, config);
    const tools = new NotebookLMTools(client);

    // Start consolidated MCP HTTP server with all endpoints on single port
    const serverPort = process.env.MCP_PORT ? parseInt(process.env.MCP_PORT) : config.port;
    const mcpServer = new McpHttpServer(tools, config, auth, client);

    logger.info('Starting MCP HTTP server on 0.0.0.0:' + serverPort);
    await mcpServer.start(serverPort);

    logger.info('NotebookLM MCP Server started successfully', {
      transport: 'HTTP with SSE',
      port: serverPort,
      endpoints: {
        root: `http://0.0.0.0:${serverPort}/`,
        health: `http://0.0.0.0:${serverPort}/health`,
        ready: `http://0.0.0.0:${serverPort}/ready`,
        live: `http://0.0.0.0:${serverPort}/live`,
        mcp: `http://0.0.0.0:${serverPort}/mcp`,
        sse: `http://0.0.0.0:${serverPort}/sse`,
        tools: `http://0.0.0.0:${serverPort}/mcp/tools`,
        call: `http://0.0.0.0:${serverPort}/mcp/call`,
        apiTools: `http://0.0.0.0:${serverPort}/api/tools`,
        apiAsk: `http://0.0.0.0:${serverPort}/api/ask`,
      },
      authentication: !!process.env.API_KEY,
      tools: tools.getToolDefinitions().map((t) => t.name),
    });

    // Setup graceful shutdown
    const shutdown = async (signal: string): Promise<void> => {
      logger.info(`Received ${signal}, shutting down gracefully...`);

      try {
        await mcpServer.stop();
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
