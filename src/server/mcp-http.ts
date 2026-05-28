import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
  JSONRPCMessage,
  JSONRPCRequest,
  JSONRPCResponse,
} from '@modelcontextprotocol/sdk/types.js';
import { NotebookLMTools } from '../tools/index.js';
import { Config, HealthStatus, ReadinessStatus } from '../types/index.js';
import { createLogger } from '../utils/logger.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { AuthManager } from '../auth/index.js';
import { NotebookLMClient } from '../notebook/index.js';
import packageJson from '../../package.json' with { type: 'json' };

const logger = createLogger('mcp-http');

/**
 * HTTP-based MCP Server with SSE support for n8n and other MCP clients
 * Implements the MCP protocol over HTTP with streaming capabilities
 * Includes health and readiness endpoints on the same port
 */
export class McpHttpServer {
  private app: FastifyInstance;
  private server: Server;
  private tools: NotebookLMTools;
  private config: Config;
  private apiKey: string | undefined;
  private auth: AuthManager;
  private client: NotebookLMClient;
  private startTime: number;

  constructor(tools: NotebookLMTools, config: Config, auth: AuthManager, client: NotebookLMClient) {
    this.tools = tools;
    this.config = config;
    this.apiKey = process.env.API_KEY;
    this.auth = auth;
    this.client = client;
    this.startTime = Date.now();

    // Initialize Fastify
    this.app = Fastify({
      logger: {
        level: config.logLevel,
      },
      requestIdLogLabel: 'requestId',
      disableRequestLogging: false,
      trustProxy: true, // Important for Cloudflare Tunnels
    });

    // Initialize MCP Server
    this.server = new Server(
      {
        name: 'notebooklm-mcp-server',
        version: '2.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupMcpHandlers();

    logger.info('McpHttpServer initialized');
  }

  /**
   * Setup middleware
   */
  private async setupMiddleware(): Promise<void> {
    // CORS support
    await this.app.register(cors, {
      origin: process.env.CORS_ORIGIN || true,
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'x-api-key'],
      credentials: true,
    });

    // API Key authentication - case-insensitive header matching
    if (this.apiKey) {
      this.app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
        // Skip auth for health endpoints
        if (
          request.url.startsWith('/health') ||
          request.url.startsWith('/live') ||
          request.url.startsWith('/ready')
        ) {
          return;
        }

        // Normalize header to lowercase and check
        const apiKey =
          request.headers['x-api-key'] ||
          request.headers['X-API-Key'] ||
          request.headers['X-Api-Key'];

        if (!apiKey || apiKey !== this.apiKey) {
          logger.warn('Unauthorized request - invalid API key', {
            ip: request.ip,
            path: request.url,
          });
          reply.code(401).send({ error: 'Unauthorized - Invalid or missing X-API-Key header' });
        }
      });
      logger.info('API Key authentication enabled');
    } else {
      logger.warn('API Key authentication disabled - set API_KEY environment variable to enable');
    }
  }

  /**
   * Setup MCP protocol handlers
   */
  private setupMcpHandlers(): void {
    // List tools handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      logger.debug('Handling MCP list_tools request');

      const toolDefinitions = this.tools.getToolDefinitions();
      const tools: Tool[] = toolDefinitions.map((def) => ({
        name: def.name,
        description: def.description,
        inputSchema: zodToJsonSchema(def.inputSchema) as Tool['inputSchema'],
      }));

      return { tools };
    });

    // Call tool handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      logger.info('Handling MCP call_tool request', {
        toolName: name,
        hasArgs: !!args,
      });

      try {
        const result = await this.tools.handleToolCall(name, args);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('MCP tool call failed', {
          toolName: name,
          error: errorMessage,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  error: errorMessage,
                  toolName: name,
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }
    });
  }

  /**
   * Setup HTTP routes
   */
  private setupRoutes(): void {
    // Root endpoint - API information
    this.app.get('/', async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.send({
        name: 'NotebookLM MCP Server',
        version: '2.0.0',
        protocol: 'MCP over HTTP with SSE',
        transport: 'http',
        status: 'ok',
        capabilities: {
          tools: true,
          streaming: true,
        },
        endpoints: [
          'GET /',
          'GET /health',
          'GET /ready',
          'GET /live',
          'GET /mcp/tools',
          'POST /mcp/call',
          'POST /mcp',
          'GET /sse',
          'GET /api/tools (alias)',
          'POST /api/ask (alias)',
        ],
        authentication: {
          required: !!this.apiKey,
          method: 'X-API-Key header (case-insensitive)',
        },
        documentation: 'https://github.com/herduin/notebook-lm-mcp',
      });
    });

    // Health endpoint (no auth required)
    this.app.get('/health', async (_request: FastifyRequest, reply: FastifyReply) => {
      const health: HealthStatus = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: Math.floor((Date.now() - this.startTime) / 1000),
        version: packageJson.version || '1.0.0',
      };

      return reply.code(200).send(health);
    });

    // Readiness endpoint (no auth required, but validates auth and notebook)
    this.app.get('/ready', async (_request: FastifyRequest, reply: FastifyReply) => {
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

    // Liveness endpoint (no auth required)
    this.app.get('/live', async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.code(200).send({ status: 'alive' });
    });

    // MCP JSON-RPC endpoint
    this.app.post('/mcp', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const rpcRequest = request.body as JSONRPCRequest;

        logger.debug('Handling MCP JSON-RPC request', {
          method: rpcRequest.method,
          id: rpcRequest.id,
        });

        // Handle the request through the MCP server
        const response = await this.handleMcpRequest(rpcRequest);

        return reply.send(response);
      } catch (error) {
        logger.error('MCP JSON-RPC request failed', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        return reply.code(500).send({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: error instanceof Error ? error.message : 'Internal error',
          },
          id: null,
        });
      }
    });

    // SSE endpoint for streaming MCP protocol
    this.app.get('/sse', async (request: FastifyRequest, reply: FastifyReply) => {
      logger.info('SSE connection established', {
        ip: request.ip,
      });

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no', // Disable Nginx buffering
      });

      // Send initial connection event
      reply.raw.write('data: {"type":"connection","status":"connected"}\n\n');

      // Keep connection alive
      const keepAliveInterval = setInterval(() => {
        reply.raw.write(': keepalive\n\n');
      }, 30000);

      // Handle client disconnect
      request.raw.on('close', () => {
        clearInterval(keepAliveInterval);
        logger.info('SSE connection closed', {
          ip: request.ip,
        });
      });
    });

    // List tools endpoint (GET)
    this.app.get('/mcp/tools', async (_request: FastifyRequest, reply: FastifyReply) => {
      const toolDefinitions = this.tools.getToolDefinitions();
      const tools = toolDefinitions.map((def) => ({
        name: def.name,
        description: def.description,
        inputSchema: zodToJsonSchema(def.inputSchema),
      }));

      return reply.send({ tools });
    });

    // Call tool endpoint (POST)
    this.app.post('/mcp/call', async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as { tool: string; arguments: unknown };

      try {
        logger.info('Direct MCP tool call', {
          tool: body.tool,
        });

        const result = await this.tools.handleToolCall(body.tool, body.arguments);

        return reply.send({
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        });
      } catch (error) {
        logger.error('Direct MCP tool call failed', {
          tool: body.tool,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        return reply.code(500).send({
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // REST API compatibility aliases
    // GET /api/tools - alias for /mcp/tools
    this.app.get('/api/tools', async (_request: FastifyRequest, reply: FastifyReply) => {
      const toolDefinitions = this.tools.getToolDefinitions();
      const tools = toolDefinitions.map((def) => ({
        name: def.name,
        description: def.description,
        inputSchema: zodToJsonSchema(def.inputSchema),
      }));

      return reply.send({ tools });
    });

    // POST /api/ask - simplified alias that calls ask_notebook tool
    this.app.post('/api/ask', async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as { question: string };

      try {
        if (!body.question) {
          return reply.code(400).send({
            error: 'Missing required field: question',
          });
        }

        logger.info('REST API ask endpoint called', {
          questionLength: body.question.length,
        });

        const result = await this.tools.handleToolCall('ask_notebook', { question: body.question });

        return reply.send(result);
      } catch (error) {
        logger.error('REST API ask failed', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        return reply.code(500).send({
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });
  }

  /**
   * Handle MCP JSON-RPC request
   */
  private async handleMcpRequest(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    try {
      // Route based on method
      if (request.method === 'tools/list') {
        const result = await this.server.request(
          { method: 'tools/list', params: {} },
          ListToolsRequestSchema
        );
        return {
          jsonrpc: '2.0',
          result,
          id: request.id,
        };
      } else if (request.method === 'tools/call') {
        const result = await this.server.request(request, CallToolRequestSchema);
        return {
          jsonrpc: '2.0',
          result,
          id: request.id,
        };
      } else {
        return {
          jsonrpc: '2.0',
          error: {
            code: -32601,
            message: `Method not found: ${request.method}`,
          },
          id: request.id,
        };
      }
    } catch (error) {
      return {
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : 'Internal error',
        },
        id: request.id,
      };
    }
  }

  /**
   * Start the server
   */
  async start(port?: number): Promise<void> {
    const listenPort = port || this.config.port;

    try {
      await this.setupMiddleware();
      this.setupRoutes();

      await this.app.listen({
        port: listenPort,
        host: '0.0.0.0',
      });

      logger.info('MCP HTTP Server started', {
        port: listenPort,
        protocol: 'MCP over HTTP',
        streaming: true,
        authentication: !!this.apiKey,
      });
    } catch (error) {
      logger.error('Failed to start MCP HTTP server', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
      throw error;
    }
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    try {
      await this.app.close();
      await this.server.close();
      logger.info('MCP HTTP Server stopped');
    } catch (error) {
      logger.error('Error stopping MCP HTTP server', {
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
