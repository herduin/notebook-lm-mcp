#!/usr/bin/env node

import { loadConfig, validateEnvironment } from './config/index.js';
import { NotebookLMMCPServer } from './server/index.js';
import { HttpApiServer } from './server/http-api.js';
import { HealthServer } from './health/index.js';
import { AuthManager } from './auth/index.js';
import { NotebookLMClient } from './notebook/index.js';
import { NotebookLMTools } from './tools/index.js';
import { createLogger } from './utils/logger.js';

const logger = createLogger('main');

/**
 * Main entry point
 */
async function main(): Promise<void> {
  try {
    logger.info('Starting NotebookLM MCP Server...');

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
      httpApiEnabled: process.env.ENABLE_HTTP_API !== 'false',
    });

    // Initialize components
    const auth = new AuthManager(config);
    const client = new NotebookLMClient(auth, config);
    const tools = new NotebookLMTools(client);

    // Start health server
    const healthServer = new HealthServer(config, auth, client);
    await healthServer.start();

    // Start HTTP API server (for remote access)
    let httpApiServer: HttpApiServer | null = null;
    if (process.env.ENABLE_HTTP_API !== 'false') {
      httpApiServer = new HttpApiServer(tools, config);
      const httpPort = process.env.HTTP_API_PORT ? parseInt(process.env.HTTP_API_PORT) : config.port + 100;
      await httpApiServer.start(httpPort);
    }

    // Create and start MCP server (stdio)
    const mcpServer = new NotebookLMMCPServer(config);
    await mcpServer.start();

    // Setup graceful shutdown
    const shutdown = async (signal: string): Promise<void> => {
      logger.info(`Received ${signal}, shutting down gracefully...`);

      try {
        const shutdownPromises = [mcpServer.stop(), healthServer.stop()];
        if (httpApiServer) {
          shutdownPromises.push(httpApiServer.stop());
        }
        await Promise.all(shutdownPromises);
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
