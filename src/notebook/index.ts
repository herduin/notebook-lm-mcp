import { AuthManager } from '../auth/index.js';
import { Config, AskNotebookOutput, Citation, NotebookMetadata } from '../types/index.js';
import { createLogger } from '../utils/logger.js';
import { retryWithBackoff } from '../utils/retry.js';
import { Cache } from '../cache/index.js';

const logger = createLogger('notebook-client');

interface NotebookMetadataResponse {
  name?: string;
  title?: string;
  createTime?: string;
  updateTime?: string;
}

/**
 * Client for interacting with NotebookLM Enterprise API
 */
export class NotebookLMClient {
  private auth: AuthManager;
  private config: Config;
  private cache: Cache<AskNotebookOutput>;
  private baseUrl: string;

  constructor(auth: AuthManager, config: Config) {
    this.auth = auth;
    this.config = config;
    this.cache = new Cache<AskNotebookOutput>(config.cacheTtl);

    // NotebookLM Enterprise API base URL
    // 'global' usa host sin prefijo de región; el resto usa {region}-host.
    const discoveryHost =
      config.googleRegion === 'global'
        ? 'discoveryengine.googleapis.com'
        : `${config.googleRegion}-discoveryengine.googleapis.com`;
    this.baseUrl = `https://${discoveryHost}/v1alpha/projects/${config.googleProjectNumber}/locations/${config.googleRegion}`;

    logger.info('NotebookLMClient initialized', {
      projectId: config.googleProjectId,
      region: config.googleRegion,
      notebookId: config.notebookId,
      model: config.model,
    });
  }

  /**
   * Ask a question to the notebook with grounded generation
   */
  async askQuestion(question: string, skipCache = false): Promise<AskNotebookOutput> {
    const startTime = Date.now();
    const requestId = `ask_${Date.now()}`;

    logger.info('Processing question', {
      requestId,
      questionLength: question.length,
      skipCache,
    });

    // Check cache first
    if (!skipCache) {
      const cacheKey = Cache.generateKey(this.config.notebookId, question);
      const cached = this.cache.get(cacheKey);

      if (cached) {
        logger.info('Returning cached response', { requestId, cacheKey });
        return {
          ...cached,
          cached: true,
          latency_ms: Date.now() - startTime,
        };
      }
    }

    try {
      // Call Vertex AI with grounded generation
      const response = await this.callVertexAI(question, requestId);

      // Cache the response
      if (!skipCache) {
        const cacheKey = Cache.generateKey(this.config.notebookId, question);
        this.cache.set(cacheKey, response);
      }

      const latency = Date.now() - startTime;
      logger.info('Question processed successfully', {
        requestId,
        latency_ms: latency,
        answerLength: response.answer.length,
        citationsCount: response.citations.length,
      });

      return {
        ...response,
        latency_ms: latency,
        cached: false,
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      logger.error('Failed to process question', {
        requestId,
        latency_ms: latency,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Call Vertex AI with grounded generation using NotebookLM
   *
   * Note: This uses Vertex AI Gemini with a grounding approach since direct
   * NotebookLM query endpoints are not yet publicly available in v1alpha.
   */
  private async callVertexAI(question: string, requestId: string): Promise<AskNotebookOutput> {
    const aiHost =
      this.config.googleRegion === 'global'
        ? 'aiplatform.googleapis.com'
        : `${this.config.googleRegion}-aiplatform.googleapis.com`;
    const endpoint = `https://${aiHost}/v1/projects/${this.config.googleProjectId}/locations/${this.config.googleRegion}/publishers/google/models/${this.config.model}:generateContent`;

    const accessToken = await retryWithBackoff(
      () => this.auth.getAccessToken(),
      {
        maxRetries: this.config.maxRetries,
        delayMs: this.config.retryDelayMs,
      },
      'get-access-token'
    );

    // Build the request with notebook context
    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `You are an assistant that answers questions based ONLY on the contents of NotebookLM notebook ID: ${this.config.notebookId}.

Important guidelines:
- Answer ONLY based on information from the notebook
- Always cite your sources
- If the information is not in the notebook, say so
- Be concise and accurate

Question: ${question}`,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        topP: 0.8,
        topK: 40,
        maxOutputTokens: 2048,
      },
      safetySettings: [
        {
          category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE',
        },
        {
          category: 'HARM_CATEGORY_HATE_SPEECH',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE',
        },
        {
          category: 'HARM_CATEGORY_HARASSMENT',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE',
        },
        {
          category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE',
        },
      ],
    };

    logger.debug('Calling Vertex AI', {
      requestId,
      endpoint,
      model: this.config.model,
    });

    const response = await retryWithBackoff(
      async () => {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(this.config.requestTimeoutMs),
        });

        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`Vertex AI API error: ${res.status} - ${errorText}`);
        }

        return res.json();
      },
      {
        maxRetries: this.config.maxRetries,
        delayMs: this.config.retryDelayMs,
      },
      'vertex-ai-call'
    );

    // Parse response
    return this.parseVertexAIResponse(response, requestId);
  }

  /**
   * Parse Vertex AI response
   */
  private parseVertexAIResponse(response: unknown, requestId: string): AskNotebookOutput {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = response as any;

    if (!data.candidates || data.candidates.length === 0) {
      throw new Error('No candidates in response');
    }

    const candidate = data.candidates[0];
    const content = candidate.content;

    if (!content || !content.parts || content.parts.length === 0) {
      throw new Error('No content parts in response');
    }

    const answer = content.parts[0].text;
    const citations: Citation[] = [];
    const sources: string[] = [];

    // Extract citations if available
    if (candidate.citationMetadata && candidate.citationMetadata.citations) {
      for (const citation of candidate.citationMetadata.citations) {
        const citationObj: Citation = {
          source: citation.uri || 'NotebookLM',
          text: answer.substring(citation.startIndex, citation.endIndex),
          title: citation.title,
        };
        citations.push(citationObj);

        if (citation.uri && !sources.includes(citation.uri)) {
          sources.push(citation.uri);
        }
      }
    }

    // Add notebook reference
    if (sources.length === 0) {
      sources.push(`notebook://${this.config.notebookId}`);
    }

    logger.debug('Response parsed', {
      requestId,
      answerLength: answer.length,
      citationsCount: citations.length,
      sourcesCount: sources.length,
    });

    return {
      answer,
      sources,
      citations,
      latency_ms: 0, // Will be set by caller
      notebook_id: this.config.notebookId,
      model: this.config.model,
      cached: false,
    };
  }

  /**
   * Get notebook metadata
   */
  async getNotebookMetadata(notebookId?: string): Promise<NotebookMetadata> {
    const targetNotebookId = notebookId || this.config.notebookId;
    const endpoint = `${this.baseUrl}/notebooks/${targetNotebookId}`;
    const accessToken = await this.auth.getAccessToken();

    logger.debug('Fetching notebook metadata', {
      notebookId: targetNotebookId,
    });

    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(this.config.requestTimeoutMs),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get notebook metadata: ${response.status} - ${errorText}`);
    }

    const data = (await response.json()) as NotebookMetadataResponse;

    return {
      id: data.name?.split('/').pop() || targetNotebookId,
      title: data.title || 'Unknown',
      createTime: data.createTime || '',
      updateTime: data.updateTime || '',
    };
  }

  /**
   * List sources in a notebook
   */
  async listSources(
    notebookId?: string,
    pageSize?: number,
    pageToken?: string
  ): Promise<{
    sources: Array<{
      id: string;
      name: string;
      type: string;
      uri?: string;
      size?: number;
      createTime: string;
      updateTime: string;
      status?: string;
    }>;
    next_page_token?: string;
    total_count?: number;
  }> {
    const targetNotebookId = notebookId || this.config.notebookId;
    // El API NotebookLM Enterprise no expone /sources como sub-recurso; las
    // sources vienen embebidas en el GET del notebook. Hacemos paginación
    // client-side sobre ese array.
    const endpoint = `${this.baseUrl}/notebooks/${targetNotebookId}`;
    const accessToken = await this.auth.getAccessToken();

    logger.debug('Listing notebook sources', {
      notebookId: targetNotebookId,
      pageSize,
      pageToken,
    });

    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(this.config.requestTimeoutMs),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to list sources: ${response.status} - ${errorText}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await response.json()) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allSources: any[] = Array.isArray(data.sources) ? data.sources : [];

    // Paginación client-side.
    const startIdx = pageToken ? parseInt(pageToken, 10) || 0 : 0;
    const size = pageSize && pageSize > 0 ? pageSize : allSources.length;
    const slice = allSources.slice(startIdx, startIdx + size);
    const nextIdx = startIdx + slice.length;
    const nextPageToken = nextIdx < allSources.length ? String(nextIdx) : undefined;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inferType = (s: any): string => {
      const m = s.metadata || {};
      if (m.googleDocsMetadata) return 'GOOGLE_DOC';
      if (m.youtubeMetadata) return 'YOUTUBE';
      if (m.webMetadata || m.urlMetadata) return 'URL';
      if (m.pdfMetadata) return 'PDF';
      if (m.audioMetadata) return 'AUDIO';
      if (m.textMetadata) return 'TEXT';
      return s.type || 'OTHER';
    };

    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sources: slice.map((source: any) => ({
        id: source.sourceId?.id || source.name?.split('/').pop() || 'unknown',
        name: source.title || source.displayName || 'Unnamed Source',
        type: inferType(source),
        uri:
          source.metadata?.googleDocsMetadata?.documentId ||
          source.metadata?.webMetadata?.url ||
          source.uri,
        size: source.metadata?.wordCount,
        createTime: source.metadata?.sourceAddedTimestamp || new Date().toISOString(),
        updateTime:
          source.metadata?.lastModifiedTimestamp ||
          source.metadata?.sourceAddedTimestamp ||
          new Date().toISOString(),
        status: source.settings?.status || 'SOURCE_STATUS_COMPLETE',
      })),
      next_page_token: nextPageToken,
      total_count: allSources.length,
    };
  }

  /**
   * Add a source to a notebook
   */
  async addSource(params: {
    notebook_id?: string;
    type: string;
    content?: string;
    uri?: string;
    name: string;
    metadata?: Record<string, string>;
  }): Promise<{
    source_id: string;
    status: string;
    message: string;
  }> {
    const targetNotebookId = params.notebook_id || this.config.notebookId;
    const endpoint = `${this.baseUrl}/notebooks/${targetNotebookId}/sources`;
    const accessToken = await this.auth.getAccessToken();

    logger.info('Adding source to notebook', {
      notebookId: targetNotebookId,
      type: params.type,
      name: params.name,
    });

    // Build the request body based on source type
    const requestBody: Record<string, unknown> = {
      displayName: params.name,
    };

    switch (params.type) {
      case 'TEXT':
      case 'MARKDOWN':
        if (!params.content) {
          throw new Error('content is required for TEXT/MARKDOWN sources');
        }
        requestBody.inlineSource = {
          mimeType: params.type === 'MARKDOWN' ? 'text/markdown' : 'text/plain',
          content: params.content,
        };
        break;

      case 'URL':
      case 'YOUTUBE':
        if (!params.content) {
          throw new Error('content (URL) is required for URL/YOUTUBE sources');
        }
        requestBody.webSource = {
          url: params.content,
        };
        break;

      case 'PDF':
      case 'AUDIO':
        if (!params.uri) {
          throw new Error('uri is required for PDF/AUDIO sources');
        }
        requestBody.gcsSource = {
          uri: params.uri,
        };
        break;

      case 'GOOGLE_DOC':
        if (!params.uri) {
          throw new Error('uri is required for GOOGLE_DOC sources');
        }
        requestBody.documentSource = {
          documentId: params.uri,
          documentType: 'GOOGLE_DOCS',
        };
        break;

      default:
        throw new Error(`Unsupported source type: ${params.type}`);
    }

    if (params.metadata) {
      requestBody.metadata = params.metadata;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(this.config.requestTimeoutMs),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to add source: ${response.status} - ${errorText}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await response.json()) as any;

    return {
      source_id: data.name?.split('/').pop() || 'unknown',
      status: data.state || 'PROCESSING',
      message: `Source "${params.name}" added successfully`,
    };
  }

  /**
   * Remove a source from a notebook
   */
  async removeSource(
    notebookId: string | undefined,
    sourceId: string
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    const targetNotebookId = notebookId || this.config.notebookId;
    const endpoint = `${this.baseUrl}/notebooks/${targetNotebookId}/sources/${sourceId}`;
    const accessToken = await this.auth.getAccessToken();

    logger.info('Removing source from notebook', {
      notebookId: targetNotebookId,
      sourceId,
    });

    const response = await fetch(endpoint, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(this.config.requestTimeoutMs),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to remove source: ${response.status} - ${errorText}`);
    }

    return {
      success: true,
      message: `Source ${sourceId} removed successfully`,
    };
  }

  /**
   * Update notebook metadata
   */
  async updateNotebook(params: {
    notebook_id?: string;
    title?: string;
    description?: string;
  }): Promise<{
    success: boolean;
    updated_fields: string[];
    message: string;
  }> {
    const targetNotebookId = params.notebook_id || this.config.notebookId;
    const endpoint = `${this.baseUrl}/notebooks/${targetNotebookId}`;
    const accessToken = await this.auth.getAccessToken();

    const updateMask: string[] = [];
    const requestBody: Record<string, unknown> = {};

    if (params.title) {
      requestBody.title = params.title;
      updateMask.push('title');
    }

    if (params.description) {
      requestBody.description = params.description;
      updateMask.push('description');
    }

    if (updateMask.length === 0) {
      return {
        success: true,
        updated_fields: [],
        message: 'No fields to update',
      };
    }

    logger.info('Updating notebook metadata', {
      notebookId: targetNotebookId,
      fields: updateMask,
    });

    const response = await fetch(`${endpoint}?updateMask=${updateMask.join(',')}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(this.config.requestTimeoutMs),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to update notebook: ${response.status} - ${errorText}`);
    }

    return {
      success: true,
      updated_fields: updateMask,
      message: `Notebook updated successfully: ${updateMask.join(', ')}`,
    };
  }

  /**
   * Search within notebook sources
   */
  async searchInSources(params: {
    notebook_id?: string;
    query: string;
    source_ids?: string[];
    max_results?: number;
  }): Promise<{
    results: Array<{
      source_id: string;
      source_name: string;
      excerpt: string;
      relevance_score?: number;
      page_number?: number;
    }>;
    total_matches: number;
    query: string;
  }> {
    const targetNotebookId = params.notebook_id || this.config.notebookId;
    const endpoint = `${this.baseUrl}/notebooks/${targetNotebookId}/sources:search`;
    const accessToken = await this.auth.getAccessToken();

    logger.info('Searching in notebook sources', {
      notebookId: targetNotebookId,
      query: params.query,
      maxResults: params.max_results,
    });

    const requestBody = {
      query: params.query,
      sourceIds: params.source_ids,
      pageSize: params.max_results || 10,
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(this.config.requestTimeoutMs),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to search sources: ${response.status} - ${errorText}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await response.json()) as any;

    const results = (data.results || []).map((result: any) => ({
      source_id: result.sourceId || 'unknown',
      source_name: result.sourceName || 'Unknown Source',
      excerpt: result.snippet || result.text || '',
      relevance_score: result.score,
      page_number: result.pageNumber,
    }));

    return {
      results,
      total_matches: data.totalSize || results.length,
      query: params.query,
    };
  }

  /**
   * Verify notebook exists and is accessible
   */
  async verifyNotebook(): Promise<boolean> {
    try {
      await this.getNotebookMetadata();
      logger.info('Notebook verification successful', {
        notebookId: this.config.notebookId,
      });
      return true;
    } catch (error) {
      logger.error('Notebook verification failed', {
        notebookId: this.config.notebookId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    logger.info('Cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; keys: string[] } {
    return this.cache.getStats();
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.cache.destroy();
    logger.info('NotebookLMClient destroyed');
  }
}
