import Fastify, { FastifyInstance } from 'fastify';
import { AuthManager } from '../auth/index.js';
import { NotebookLMClient } from '../notebook/index.js';
import { Config, HealthStatus, ReadinessStatus } from '../types/index.js';
import { createLogger } from '../utils/logger.js';
import packageJson from '../../package.json' with { type: 'json' };

const logger = createLogger('health-server');

/**
 * HTTP server for health and readiness checks
 */
export class HealthServer {
  private app: FastifyInstance;
  private config: Config;
  private auth: AuthManager;
  private client: NotebookLMClient;
  private startTime: number;

  constructor(config: Config, auth: AuthManager, client: NotebookLMClient) {
    this.config = config;
    this.auth = auth;
    this.client = client;
    this.startTime = Date.now();

    this.app = Fastify({
      logger: {
        level: config.logLevel,
      },
      requestIdLogLabel: 'requestId',
      disableRequestLogging: true,
    });

    this.setupRoutes();
    logger.info('HealthServer initialized');
  }

  /**
   * Setup health check routes
   */
  private setupRoutes(): void {
    // Health endpoint
    this.app.get('/health', async (_request, reply) => {
      const health: HealthStatus = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: Math.floor((Date.now() - this.startTime) / 1000),
        version: packageJson.version || '1.0.0',
      };

      return reply.code(200).send(health);
    });

    // Readiness endpoint
    this.app.get('/ready', async (_request, reply) => {
      let authCheck = false;
      let notebookCheck = false;

      try {
        authCheck = await this.auth.verify();
      } catch (error) {
        logger.warn('Auth check failed during readiness', {
          error: error instanceof Error ? error.message : 'Unknown',
        });
      }

      try {
        notebookCheck = await this.client.verifyNotebook();
      } catch (error) {
        logger.warn('Notebook check failed during readiness', {
          error: error instanceof Error ? error.message : 'Unknown',
        });
      }

      const ready = authCheck && notebookCheck;
      const status: ReadinessStatus = {
        ready,
        checks: {
          auth: authCheck,
          notebook: notebookCheck,
        },
        timestamp: new Date().toISOString(),
      };

      const statusCode = ready ? 200 : 503;
      return reply.code(statusCode).send(status);
    });

    // Liveness endpoint (always returns 200 if server is running)
    this.app.get('/live', async (_request, reply) => {
      return reply.code(200).send({ status: 'alive' });
    });

    // Cache stats endpoint
    this.app.get('/stats/cache', async (_request, reply) => {
      const stats = this.client.getCacheStats();
      return reply.code(200).send(stats);
    });

    // Cache clear endpoint (POST)
    this.app.post('/cache/clear', async (_request, reply) => {
      this.client.clearCache();
      return reply.code(200).send({ message: 'Cache cleared successfully' });
    });
  }

  /**
   * Start the health server
   */
  async start(): Promise<void> {
    try {
      await this.app.listen({
        port: this.config.port,
        host: '0.0.0.0',
      });

      logger.info('Health server started', {
        port: this.config.port,
        endpoints: ['/health', '/ready', '/live', '/stats/cache', '/cache/clear'],
      });
    } catch (error) {
      logger.error('Failed to start health server', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
      throw error;
    }
  }

  /**
   * Stop the health server
   */
  async stop(): Promise<void> {
    try {
      await this.app.close();
      logger.info('Health server stopped');
    } catch (error) {
      logger.error('Error stopping health server', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
      throw error;
    }
  }
}
