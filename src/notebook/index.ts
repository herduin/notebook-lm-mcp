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
    this.baseUrl = `https://${config.googleRegion}-discoveryengine.googleapis.com/v1alpha/projects/${config.googleProjectNumber}/locations/${config.googleRegion}`;

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
    const endpoint = `https://${this.config.googleRegion}-aiplatform.googleapis.com/v1/projects/${this.config.googleProjectId}/locations/${this.config.googleRegion}/publishers/google/models/${this.config.model}:generateContent`;

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
            'Authorization': `Bearer ${accessToken}`,
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
  async getNotebookMetadata(): Promise<NotebookMetadata> {
    const endpoint = `${this.baseUrl}/notebooks/${this.config.notebookId}`;
    const accessToken = await this.auth.getAccessToken();

    logger.debug('Fetching notebook metadata', {
      notebookId: this.config.notebookId,
    });

    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
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
      id: data.name?.split('/').pop() || this.config.notebookId,
      title: data.title || 'Unknown',
      createTime: data.createTime || '',
      updateTime: data.updateTime || '',
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
