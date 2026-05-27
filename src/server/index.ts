import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { NotebookLMTools } from '../tools/index.js';
import { NotebookLMClient } from '../notebook/index.js';
import { AuthManager } from '../auth/index.js';
import { Config } from '../types/index.js';
import { createLogger } from '../utils/logger.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

const logger = createLogger('mcp-server');

/**
 * MCP Server for NotebookLM
 */
export class NotebookLMMCPServer {
  private server: Server;
  private tools: NotebookLMTools;
  private client: NotebookLMClient;
  private config: Config;

  constructor(config: Config) {
    this.config = config;

    // Initialize components
    const auth = new AuthManager(config);
    this.client = new NotebookLMClient(auth, config);
    this.tools = new NotebookLMTools(this.client);

    // Initialize MCP Server
    this.server = new Server(
      {
        name: 'notebooklm-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
    logger.info('NotebookLMMCPServer initialized', {
      projectId: config.googleProjectId,
      notebookId: config.notebookId,
    });
  }

  /**
   * Setup MCP request handlers
   */
  private setupHandlers(): void {
    // List tools handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      logger.debug('Handling list_tools request');

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

      logger.info('Handling call_tool request', {
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
        logger.error('Tool call failed', {
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
   * Start the MCP server
   */
  async start(): Promise<void> {
    logger.info('Starting NotebookLM MCP Server...');

    // Verify authentication
    const auth = new AuthManager(this.config);
    const authOk = await auth.verify();
    if (!authOk) {
      throw new Error('Authentication verification failed');
    }

    // Verify notebook access
    const notebookOk = await this.client.verifyNotebook();
    if (!notebookOk) {
      logger.warn('Notebook verification failed - continuing anyway', {
        notebookId: this.config.notebookId,
      });
    }

    // Connect via stdio transport
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    logger.info('NotebookLM MCP Server started successfully', {
      transport: 'stdio',
      projectId: this.config.googleProjectId,
      notebookId: this.config.notebookId,
    });
  }

  /**
   * Stop the server and cleanup resources
   */
  async stop(): Promise<void> {
    logger.info('Stopping NotebookLM MCP Server...');
    await this.server.close();
    this.client.destroy();
    logger.info('NotebookLM MCP Server stopped');
  }
}
