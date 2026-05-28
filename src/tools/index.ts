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
        description: `**NOT IMPLEMENTED** — Ask a question to the NotebookLM notebook.

**Status**: Devuelve siempre un error explicativo. La API publica NotebookLM Enterprise (Discovery Engine v1alpha) no expone hoy un endpoint documentado para hacer preguntas al chat del notebook; los unicos metodos disponibles son administrativos (notebooks.create/get/share/batchDelete y sources:batchCreate/batchDelete/get/uploadFile).

**Por que no implementamos un workaround con Gemini**: llamar a Gemini pasandole solo el NOTEBOOK_ID como string no consulta el notebook (Gemini no tiene acceso a el), genera respuestas inventadas que parecen citadas. Para no engañar al cliente preferimos fallar con un mensaje claro.

**Alternativas**:
- Usar la UI oficial en notebooklm.cloud.google.com.
- Implementar un RAG propio: indexar las sources con embeddings y consultar Gemini con fragmentos reales (requiere infra adicional).

**Tools disponibles que SI funcionan**: get_notebook_metadata, list_sources, add_source, remove_source.`,
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
        description: `List the sources contained in a notebook with client-side pagination.

**API origen**: Las sources NO tienen un endpoint dedicado en NotebookLM Enterprise; vienen embebidas en el response de notebooks.get. Esta tool hace GET del notebook y expone el array de sources con un slice por page_token (indice numerico).

**Returns para cada source**:
- id, name, type (inferido del shape del metadata)
- uri (documentId de Drive o url web)
- size (wordCount aproximado)
- createTime / updateTime
- status normalizado a {PROCESSING, COMPLETED, FAILED}

**Paginacion**:
- page_size (1-100). El total real viene en total_count.
- page_token = indice numerico (string) para el siguiente slice. Undefined si no hay mas.

**Use Cases**:
- Auditar el inventario de sources
- Recuperar ids para remove_source
- Validar que add_source completo`,
        inputSchema: ListSourcesInputSchema,
      },
      {
        name: 'add_source',
        description: `Add a new source to a notebook via sources:batchCreate.

**Tipos soportados** (mapeo a UserContent del API):
- **TEXT** / **MARKDOWN** -> textContent (sourceName + content)
- **URL** -> webContent (url + sourceName). La pagina la fetchea Google en backend.
- **YOUTUBE** -> videoContent (youtubeUrl)
- **GOOGLE_DOC** -> googleDriveContent (documentId + mimeType=application/vnd.google-apps.document)

**No soportados todavia**: PDF y AUDIO requieren sources:uploadFile (multipart) que no esta implementado en este server. Subi esos archivos desde la UI.

**Parametros**:
- type: uno de TEXT/MARKDOWN/URL/YOUTUBE/GOOGLE_DOC (requerido)
- name: display name de la source (requerido)
- content: texto plano para TEXT/MARKDOWN, URL para URL/YOUTUBE
- uri: documentId de Google Drive para GOOGLE_DOC
- notebook_id: opcional, default = NOTEBOOK_ID env

**Asincrono**: el API responde inmediatamente con la source en estado PROCESSING. Usa list_sources para ver cuando llega a COMPLETED.`,
        inputSchema: AddSourceInputSchema,
      },
      {
        name: 'remove_source',
        description: `Remove a source from a notebook via sources:batchDelete.

**Parametros**:
- source_id: id corto (uuid) o resource name completo (projects/.../sources/{id}). Si llega corto, se compone el name con la config del server.
- notebook_id: opcional, default = NOTEBOOK_ID env

**Importante**: operacion permanente, no se puede deshacer.

**Returns**: success boolean y mensaje. Usar list_sources para confirmar.`,
        inputSchema: RemoveSourceInputSchema,
      },
      {
        name: 'search_in_sources',
        description: `Search across the metadata of the notebook sources (NOT full-text).

**Alcance honesto**: la API publica de NotebookLM Enterprise no expone busqueda full-text sobre el contenido de las sources. Esta tool solo hace match case-insensitive sobre los campos disponibles en notebooks.get:
- title
- sourceId.id
- name (resource name completo)
- metadata.googleDocsMetadata.documentId
- settings.status

**Parametros**:
- query: substring a buscar (case-insensitive)
- source_ids: opcional, restringe a esas sources
- max_results: limite de resultados (1-50, default 10)
- mode: 'metadata' (default) o 'fulltext'. Con 'fulltext' devuelve error honesto.

**Use cases**: encontrar una source por nombre parcial, listar las que estan en estado FAILED, ubicar el id de una source para remove_source.`,
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
      case 'search_in_sources':
        return this.handleSearchInSources(input);
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }
}
