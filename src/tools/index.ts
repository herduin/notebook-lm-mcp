import { NotebookLMClient } from '../notebook/index.js';
import { AskNotebookInputSchema, AskNotebookOutputSchema } from '../types/schemas.js';
import { createLogger } from '../utils/logger.js';
import { sanitizeInput, validateQuestion } from '../utils/security.js';
import { z } from 'zod';

const logger = createLogger('tools');

/**
 * MCP Tools for NotebookLM
 */
export class NotebookLMTools {
  private client: NotebookLMClient;

  constructor(client: NotebookLMClient) {
    this.client = client;
    logger.info('NotebookLMTools initialized');
  }

  /**
   * Get tool definitions for MCP
   */
  getToolDefinitions(): Array<{
    name: string;
    description: string;
    inputSchema: z.ZodType;
  }> {
    return [
      {
        name: 'ask_notebook',
        description:
          'Ask a question to the NotebookLM notebook and get a grounded answer based exclusively on the notebook contents. Returns an answer with citations and sources.',
        inputSchema: AskNotebookInputSchema,
      },
    ];
  }

  /**
   * Handle ask_notebook tool call
   */
  async handleAskNotebook(input: unknown): Promise<unknown> {
    const requestId = `tool_${Date.now()}`;
    logger.info('Handling ask_notebook tool call', { requestId });

    try {
      // Validate input
      const validated = AskNotebookInputSchema.parse(input);
      const { question } = validated;

      // Sanitize input
      const sanitizedQuestion = sanitizeInput(question);

      // Additional security validation
      const validation = validateQuestion(sanitizedQuestion);
      if (!validation.valid) {
        logger.warn('Question validation failed', {
          requestId,
          reason: validation.reason,
        });
        throw new Error(`Invalid question: ${validation.reason}`);
      }

      // Ask the question
      const result = await this.client.askQuestion(sanitizedQuestion);

      // Validate output
      const output = AskNotebookOutputSchema.parse(result);

      logger.info('ask_notebook tool completed', {
        requestId,
        latency_ms: output.latency_ms,
        cached: output.cached,
      });

      return output;
    } catch (error) {
      logger.error('ask_notebook tool failed', {
        requestId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map((e) => e.message).join(', ')}`);
      }

      throw error;
    }
  }

  /**
   * Route tool calls
   */
  async handleToolCall(toolName: string, input: unknown): Promise<unknown> {
    switch (toolName) {
      case 'ask_notebook':
        return this.handleAskNotebook(input);
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }
}
