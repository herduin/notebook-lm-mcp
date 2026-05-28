import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { NotebookLMTools } from '../tools/index.js';
import { Config } from '../types/index.js';
import { createLogger } from '../utils/logger.js';
import { AskNotebookInputSchema } from '../types/schemas.js';

const logger = createLogger('http-api');

/**
 * HTTP API Server for external access
 * Exposes NotebookLM MCP functionality via REST API
 */
export class HttpApiServer {
  private app: FastifyInstance;
  private tools: NotebookLMTools;
  private config: Config;

  constructor(tools: NotebookLMTools, config: Config) {
    this.tools = tools;
    this.config = config;

    this.app = Fastify({
      logger: {
        level: config.logLevel,
      },
      requestIdLogLabel: 'requestId',
      disableRequestLogging: false,
      trustProxy: true, // Important for reverse proxy setups
    });

    this.setupMiddleware();
    this.setupRoutes();

    logger.info('HttpApiServer initialized');
  }

  /**
   * Setup middleware
   */
  private async setupMiddleware(): Promise<void> {
    // CORS support
    await this.app.register(cors, {
      origin: process.env.CORS_ORIGIN || true,
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
      credentials: true,
    });

    // Optional API Key authentication
    if (process.env.API_KEY) {
      this.app.addHook('onRequest', async (request, reply) => {
        // Skip auth for health endpoints
        if (request.url.startsWith('/health') || request.url.startsWith('/live')) {
          return;
        }

        const apiKey = request.headers['x-api-key'] as string;
        if (!apiKey || apiKey !== process.env.API_KEY) {
          logger.warn('Unauthorized request', {
            ip: request.ip,
            path: request.url,
          });
          reply.code(401).send({ error: 'Unauthorized - Invalid or missing API key' });
        }
      });
    }
  }

  /**
   * Setup HTTP routes
   */
  private setupRoutes(): void {
    // Root endpoint
    this.app.get('/', async (_request, reply) => {
      return reply.send({
        name: 'NotebookLM MCP Server',
        version: '1.0.0',
        endpoints: {
          health: '/health',
          ready: '/ready',
          api: {
            ask: 'POST /api/ask',
            tools: 'GET /api/tools',
          },
          mcp: {
            call: 'POST /mcp/call',
            tools: 'GET|POST /mcp/tools',
          },
        },
      });
    });

    // Ask question endpoint
    this.app.post('/api/ask', async (request, reply) => {
      const requestId = request.id;

      try {
        logger.info('HTTP API ask request', {
          requestId,
          ip: request.ip,
        });

        // Validate request body
        const body = request.body as Record<string, unknown>;
        const validated = AskNotebookInputSchema.parse({
          question: body.question,
        });

        // Call the tool
        const result = await this.tools.handleAskNotebook(validated);

        logger.info('HTTP API ask completed', {
          requestId,
          latency: (result as { latency_ms: number }).latency_ms,
        });

        return reply.send(result);
      } catch (error) {
        logger.error('HTTP API ask failed', {
          requestId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        const statusCode = error instanceof Error && error.message.includes('Invalid question') ? 400 : 500;

        return reply.code(statusCode).send({
          error: error instanceof Error ? error.message : 'Internal server error',
          requestId,
        });
      }
    });

    // List available tools
    this.app.get('/api/tools', async (_request, reply) => {
      const tools = this.tools.getToolDefinitions();
      return reply.send({
        tools: tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
        })),
      });
    });

    // MCP-compatible endpoints for proxy clients
    this.app.post('/mcp/call', async (request, reply) => {
      const body = request.body as { tool: string; arguments: unknown };

      try {
        const result = await this.tools.handleToolCall(body.tool, body.arguments);
        return reply.send({
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        });
      } catch (error) {
        return reply.code(500).send({
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // Support both GET and POST for /mcp/tools to allow browser access
    this.app.get('/mcp/tools', async (_request, reply) => {
      const tools = this.tools.getToolDefinitions();
      return reply.send({ tools });
    });

    this.app.post('/mcp/tools', async (_request, reply) => {
      const tools = this.tools.getToolDefinitions();
      return reply.send({ tools });
    });
  }

  /**
   * Start the HTTP API server
   */
  async start(port?: number): Promise<void> {
    const listenPort = port || this.config.port + 1; // Use port + 1 to avoid conflict

    try {
      await this.app.listen({
        port: listenPort,
        host: '0.0.0.0',
      });

      logger.info('HTTP API server started', {
        port: listenPort,
        endpoints: ['/api/ask', '/api/tools', '/mcp/call', '/mcp/tools'],
      });
    } catch (error) {
      logger.error('Failed to start HTTP API server', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
      throw error;
    }
  }

  /**
   * Stop the HTTP API server
   */
  async stop(): Promise<void> {
    try {
      await this.app.close();
      logger.info('HTTP API server stopped');
    } catch (error) {
      logger.error('Error stopping HTTP API server', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
      throw error;
    }
  }

  /**
   * Get the Fastify instance
   */
  getApp(): FastifyInstance {
    return this.app;
  }
}
