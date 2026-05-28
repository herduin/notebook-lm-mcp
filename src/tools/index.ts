import { NotebookLMClient } from '../notebook/index.js';
import {
  AskNotebookInputSchema,
  AskNotebookOutputSchema,
  GetNotebookMetadataInputSchema,
  GetNotebookMetadataOutputSchema,
  ListSourcesInputSchema,
  ListSourcesOutputSchema,
  AddSourceInputSchema,
  AddSourceOutputSchema,
  RemoveSourceInputSchema,
  RemoveSourceOutputSchema,
  UpdateNotebookInputSchema,
  UpdateNotebookOutputSchema,
  SearchInSourcesInputSchema,
  SearchInSourcesOutputSchema,
} from '../types/schemas.js';
import { createLogger } from '../utils/logger.js';
import { sanitizeInput, validateQuestion } from '../utils/security.js';
import { z } from 'zod';

const logger = createLogger('tools');

/**
 * Comprehensive MCP Tools for NotebookLM Management
 * Provides full notebook CRUD operations and content management
 */
export class NotebookLMTools {
  private client: NotebookLMClient;

  constructor(client: NotebookLMClient) {
    this.client = client;
    logger.info('NotebookLMTools initialized with extended capabilities');
  }

  /**
   * Get comprehensive tool definitions for MCP with detailed schemas
   */
  getToolDefinitions(): Array<{
    name: string;
    description: string;
    inputSchema: z.ZodType;
  }> {
    return [
      {
        name: 'ask_notebook',
        description: `Ask a question to the NotebookLM notebook and receive a grounded answer based exclusively on the notebook contents.

**Purpose**: Query the notebook's knowledge base to get accurate, cited answers.

**Key Features**:
- Answers are grounded in notebook sources only
- Includes citations with exact text references
- Cached for improved performance on repeated questions
- Security: Automatic prompt injection protection

**Use Cases**:
- Research queries about notebook content
- Fact-checking against notebook sources
- Extracting specific information with citations
- Content summarization

**Response includes**: answer text, source list, detailed citations, processing time, and cache status.`,
        inputSchema: AskNotebookInputSchema,
      },
      {
        name: 'get_notebook_metadata',
        description: `Get detailed metadata and information about a notebook.

**Purpose**: Retrieve comprehensive information about a notebook's structure and properties.

**Returns**:
- Notebook ID and title
- Creation and last update timestamps
- Description (if available)
- Source count
- Owner information

**Use Cases**:
- Verify notebook existence and accessibility
- Check notebook update status
- Audit notebook properties
- Display notebook information in UI

**Note**: If no notebook_id is provided, uses the default notebook configured in the server.`,
        inputSchema: GetNotebookMetadataInputSchema,
      },
      {
        name: 'list_sources',
        description: `List all sources (documents, URLs, files) contained in a notebook with pagination support.

**Purpose**: Enumerate and inspect all sources that form the notebook's knowledge base.

**Returns for each source**:
- Source ID and name
- Type (PDF, TEXT, URL, MARKDOWN, GOOGLE_DOC, YOUTUBE, AUDIO, etc.)
- URI/URL if applicable
- File size
- Creation and update timestamps
- Processing status

**Pagination**:
- Configurable page size (1-100 items, default: 50)
- Use next_page_token to retrieve subsequent pages
- Total count provided when available

**Use Cases**:
- Audit notebook contents
- Find specific sources
- Monitor source processing status
- Export source inventory
- Content management workflows`,
        inputSchema: ListSourcesInputSchema,
      },
      {
        name: 'add_source',
        description: `Add a new source (document, URL, text content) to a notebook.

**Purpose**: Expand the notebook's knowledge base by adding new sources.

**Supported Source Types**:
- **PDF**: PDF documents (provide uri to file)
- **TEXT**: Plain text content (provide content)
- **URL**: Web pages (provide content with URL)
- **MARKDOWN**: Markdown formatted text (provide content)
- **GOOGLE_DOC**: Google Docs (provide uri)
- **YOUTUBE**: YouTube videos (provide content with URL)
- **AUDIO**: Audio files (provide uri)

**Parameters**:
- type: Type of source (required)
- name: Display name for the source (required)
- content: Text content or URL (required for TEXT/MARKDOWN/URL/YOUTUBE)
- uri: File path or URL (required for PDF/GOOGLE_DOC/AUDIO)
- metadata: Optional key-value pairs for additional info

**Processing**:
- Sources are processed asynchronously
- Initial status returned immediately
- Use list_sources to check processing completion

**Use Cases**:
- Add research papers or documentation
- Import web content
- Add transcripts or notes
- Integrate external knowledge sources`,
        inputSchema: AddSourceInputSchema,
      },
      {
        name: 'remove_source',
        description: `Remove a source from a notebook.

**Purpose**: Delete sources that are no longer needed or were added incorrectly.

**Parameters**:
- notebook_id: Target notebook (optional, uses default if not provided)
- source_id: ID of the source to remove (required)

**Important**: This operation is permanent and cannot be undone.

**Use Cases**:
- Remove outdated content
- Delete duplicate sources
- Clean up test data
- Manage notebook size

**Returns**: Success status and confirmation message.`,
        inputSchema: RemoveSourceInputSchema,
      },
      {
        name: 'update_notebook',
        description: `Update notebook metadata such as title and description.

**Purpose**: Modify notebook properties for better organization and documentation.

**Updatable Fields**:
- title: Notebook display name (1-500 characters)
- description: Detailed description of contents (max 5000 characters)

**Parameters**: All fields are optional. Provide only the fields you want to update.

**Use Cases**:
- Rename notebooks for clarity
- Add or update descriptions
- Organize notebook collections
- Document notebook purpose

**Returns**: Success status, list of updated fields, and confirmation message.`,
        inputSchema: UpdateNotebookInputSchema,
      },
      {
        name: 'search_in_sources',
        description: `Search for specific text or keywords within notebook sources.

**Purpose**: Find specific content, quotes, or information across all or specific sources.

**Search Capabilities**:
- Full-text search across all sources
- Optional filtering by specific source IDs
- Configurable result limit (1-50, default: 10)
- Results include context excerpts

**Returns for each match**:
- Source ID and name
- Text excerpt with surrounding context
- Relevance score (if available)
- Page number (if applicable)

**Use Cases**:
- Find specific quotes or references
- Locate information across multiple documents
- Verify facts or data points
- Content discovery
- Research and citation finding

**Note**: Results are ranked by relevance. Use max_results to control response size.`,
        inputSchema: SearchInSourcesInputSchema,
      },
    ];
  }

  /**
   * Handle ask_notebook tool call
   */
  async handleAskNotebook(input: unknown): Promise<unknown> {
    const requestId = `tool_ask_${Date.now()}`;
    logger.info('Handling ask_notebook tool call', { requestId });

    try {
      const validated = AskNotebookInputSchema.parse(input);
      const { question } = validated;

      const sanitizedQuestion = sanitizeInput(question);
      const validation = validateQuestion(sanitizedQuestion);
      if (!validation.valid) {
        logger.warn('Question validation failed', {
          requestId,
          reason: validation.reason,
        });
        throw new Error(`Invalid question: ${validation.reason}`);
      }

      const result = await this.client.askQuestion(sanitizedQuestion);
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
   * Handle get_notebook_metadata tool call
   */
  async handleGetNotebookMetadata(input: unknown): Promise<unknown> {
    const requestId = `tool_metadata_${Date.now()}`;
    logger.info('Handling get_notebook_metadata tool call', { requestId });

    try {
      const validated = GetNotebookMetadataInputSchema.parse(input);
      const result = await this.client.getNotebookMetadata(validated.notebook_id);
      return GetNotebookMetadataOutputSchema.parse(result);
    } catch (error) {
      logger.error('get_notebook_metadata tool failed', {
        requestId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Handle list_sources tool call
   */
  async handleListSources(input: unknown): Promise<unknown> {
    const requestId = `tool_list_sources_${Date.now()}`;
    logger.info('Handling list_sources tool call', { requestId });

    try {
      const validated = ListSourcesInputSchema.parse(input);
      const result = await this.client.listSources(
        validated.notebook_id,
        validated.page_size,
        validated.page_token
      );
      return ListSourcesOutputSchema.parse(result);
    } catch (error) {
      logger.error('list_sources tool failed', {
        requestId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Handle add_source tool call
   */
  async handleAddSource(input: unknown): Promise<unknown> {
    const requestId = `tool_add_source_${Date.now()}`;
    logger.info('Handling add_source tool call', { requestId });

    try {
      const validated = AddSourceInputSchema.parse(input);
      const result = await this.client.addSource(validated);
      return AddSourceOutputSchema.parse(result);
    } catch (error) {
      logger.error('add_source tool failed', {
        requestId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Handle remove_source tool call
   */
  async handleRemoveSource(input: unknown): Promise<unknown> {
    const requestId = `tool_remove_source_${Date.now()}`;
    logger.info('Handling remove_source tool call', { requestId });

    try {
      const validated = RemoveSourceInputSchema.parse(input);
      const result = await this.client.removeSource(validated.notebook_id, validated.source_id);
      return RemoveSourceOutputSchema.parse(result);
    } catch (error) {
      logger.error('remove_source tool failed', {
        requestId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Handle update_notebook tool call
   */
  async handleUpdateNotebook(input: unknown): Promise<unknown> {
    const requestId = `tool_update_notebook_${Date.now()}`;
    logger.info('Handling update_notebook tool call', { requestId });

    try {
      const validated = UpdateNotebookInputSchema.parse(input);
      const result = await this.client.updateNotebook(validated);
      return UpdateNotebookOutputSchema.parse(result);
    } catch (error) {
      logger.error('update_notebook tool failed', {
        requestId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Handle search_in_sources tool call
   */
  async handleSearchInSources(input: unknown): Promise<unknown> {
    const requestId = `tool_search_${Date.now()}`;
    logger.info('Handling search_in_sources tool call', { requestId });

    try {
      const validated = SearchInSourcesInputSchema.parse(input);
      const result = await this.client.searchInSources(validated);
      return SearchInSourcesOutputSchema.parse(result);
    } catch (error) {
      logger.error('search_in_sources tool failed', {
        requestId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Route tool calls to appropriate handlers
   */
  async handleToolCall(toolName: string, input: unknown): Promise<unknown> {
    switch (toolName) {
      case 'ask_notebook':
        return this.handleAskNotebook(input);
      case 'get_notebook_metadata':
        return this.handleGetNotebookMetadata(input);
      case 'list_sources':
        return this.handleListSources(input);
      case 'add_source':
        return this.handleAddSource(input);
      case 'remove_source':
        return this.handleRemoveSource(input);
      case 'update_notebook':
        return this.handleUpdateNotebook(input);
      case 'search_in_sources':
        return this.handleSearchInSources(input);
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }
}
