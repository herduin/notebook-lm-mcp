#!/usr/bin/env node

import { loadConfig, validateEnvironment } from './config/index.js';
import { NotebookLMMCPServer } from './server/index.js';
import { HealthServer } from './health/index.js';
import { AuthManager } from './auth/index.js';
import { NotebookLMClient } from './notebook/index.js';
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
    });

    // Initialize components for health server
    const auth = new AuthManager(config);
    const client = new NotebookLMClient(auth, config);

    // Start health server in background
    const healthServer = new HealthServer(config, auth, client);
    await healthServer.start();

    // Create and start MCP server
    const mcpServer = new NotebookLMMCPServer(config);
    await mcpServer.start();

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
