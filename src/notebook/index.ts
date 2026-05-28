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
   * Ask a question to the notebook using a real RAG pipeline.
   *
   * Como la API publica NotebookLM no expone chat/query, montamos nuestra
   * propia recuperacion: leemos sources del notebook via notebooks.get,
   * bajamos el texto crudo de cada Google Doc usando Google Docs API, y
   * armamos un prompt con esos fragmentos para Gemini. Citas son reales
   * porque vienen del array sources del notebook (sourceId + title +
   * documentId).
   *
   * Limitaciones:
   * - Solo lee fuentes tipo GOOGLE_DOC (googleDocsMetadata.documentId).
   *   Otros tipos (URL, YOUTUBE, PDF, AUDIO, TEXT inline) se omiten del
   *   contexto pero se mencionan en sources[] del response para que el
   *   cliente sepa que no fueron consultadas.
   * - El SA necesita acceso al Doc (compartido o por Domain-Wide
   *   Delegation). Si Docs API responde 403/404 para una source, se
   *   omite del contexto y se anota en logs.
   * - Cache por question hash, TTL = config.cacheTtl.
   */
  async askQuestion(question: string, skipCache = false): Promise<AskNotebookOutput> {
    const startTime = Date.now();
    const requestId = `ask_${Date.now()}`;

    logger.info('Processing question (RAG)', {
      requestId,
      questionLength: question.length,
      skipCache,
    });

    if (!skipCache) {
      const cacheKey = Cache.generateKey(this.config.notebookId, question);
      const cached = this.cache.get(cacheKey);
      if (cached) {
        logger.info('Returning cached RAG response', { requestId, cacheKey });
        return { ...cached, cached: true, latency_ms: Date.now() - startTime };
      }
    }

    try {
      // 1. Obtener notebook + sources.
      const accessToken = await this.auth.getAccessToken();
      const notebookEndpoint = `${this.baseUrl}/notebooks/${this.config.notebookId}`;
      const nbRes = await fetch(notebookEndpoint, {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(this.config.requestTimeoutMs),
      });
      if (!nbRes.ok) {
        const t = await nbRes.text();
        throw new Error(`notebooks.get failed: ${nbRes.status} - ${t}`);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nbData = (await nbRes.json()) as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allSources: any[] = Array.isArray(nbData.sources) ? nbData.sources : [];

      // 2. Bajar contenido real de cada Google Doc en paralelo.
      type Fragment = {
        sourceId: string;
        title: string;
        documentId: string;
        text: string;
      };
      const docSources = allSources.filter((s) => s.metadata?.googleDocsMetadata?.documentId);
      const skipped: string[] = [];
      const fragments = (
        await Promise.all(
          docSources.map(async (s) => {
            const documentId: string = s.metadata.googleDocsMetadata.documentId;
            const sourceId: string = s.sourceId?.id || s.name?.split('/').pop() || 'unknown';
            const title: string = s.title || 'Untitled';
            try {
              const text = await this.fetchGoogleDocText(documentId, accessToken);
              return { sourceId, title, documentId, text } as Fragment;
            } catch (err) {
              logger.warn('Could not fetch Google Doc content', {
                requestId,
                sourceId,
                documentId,
                error: err instanceof Error ? err.message : 'Unknown',
              });
              skipped.push(
                `${title} (${sourceId}): ${err instanceof Error ? err.message : 'unknown'}`
              );
              return null;
            }
          })
        )
      ).filter((f): f is Fragment => f !== null);

      // Otras sources (URL/YOUTUBE/etc) se mencionan pero no se cargan.
      const nonDocSources = allSources.filter((s) => !s.metadata?.googleDocsMetadata?.documentId);

      if (fragments.length === 0) {
        throw new Error(
          'No se pudo leer ninguna fuente Google Doc del notebook. ' +
            (skipped.length > 0
              ? `Errores: ${skipped.join('; ')}. `
              : 'El notebook no tiene Google Docs accesibles para el service account. ') +
            'Compartí cada Doc con el email del service account, o agregá Domain-Wide Delegation.'
        );
      }

      // 3. Armar prompt con contenido real (truncado por seguridad: max
      //    ~60k chars por doc para no reventar el context window).
      const MAX_DOC_CHARS = 60000;
      const docsBlock = fragments
        .map(
          (f, i) =>
            `[FUENTE ${i + 1} | id=${f.sourceId} | title="${f.title}"]\n${f.text.slice(0, MAX_DOC_CHARS)}${
              f.text.length > MAX_DOC_CHARS ? '\n...[truncado]' : ''
            }`
        )
        .join('\n\n---\n\n');

      const prompt = `Eres un asistente que responde preguntas EXCLUSIVAMENTE en base a las fuentes del notebook NotebookLM listadas abajo. Reglas estrictas:
- No uses conocimiento externo. Si la respuesta no esta en las fuentes, di "no encontré esa información en el notebook".
- Cita siempre la(s) fuente(s) usadas indicando el id entre corchetes, p.ej. [FUENTE 2].
- Se conciso y factual.

FUENTES DISPONIBLES:
${docsBlock}

PREGUNTA: ${question}`;

      // 4. Llamar Gemini generateContent.
      const aiHost =
        this.config.googleRegion === 'global'
          ? 'aiplatform.googleapis.com'
          : `${this.config.googleRegion}-aiplatform.googleapis.com`;
      const aiEndpoint = `https://${aiHost}/v1/projects/${this.config.googleProjectId}/locations/${this.config.googleRegion}/publishers/google/models/${this.config.model}:generateContent`;

      const geminiBody = {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, topP: 0.8, maxOutputTokens: 2048 },
      };

      const aiRes = await retryWithBackoff(
        async () => {
          const r = await fetch(aiEndpoint, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(geminiBody),
            signal: AbortSignal.timeout(this.config.requestTimeoutMs),
          });
          if (!r.ok) throw new Error(`Vertex AI error: ${r.status} - ${await r.text()}`);
          return r.json();
        },
        { maxRetries: this.config.maxRetries, delayMs: this.config.retryDelayMs },
        'vertex-ai-rag'
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const aiData = aiRes as any;
      const answer: string =
        aiData?.candidates?.[0]?.content?.parts?.[0]?.text || 'No se obtuvo respuesta del modelo.';

      // 5. Construir citations reales en base a las fuentes que usamos.
      const citations: Citation[] = fragments.map((f) => ({
        source: `notebook://${this.config.notebookId}/sources/${f.sourceId}`,
        text: f.title,
        title: f.title,
      }));
      const sourcesList: string[] = [
        ...fragments.map((f) => `notebook://${this.config.notebookId}/sources/${f.sourceId}`),
      ];
      if (skipped.length > 0) sourcesList.push(`__skipped__: ${skipped.join('; ')}`);
      if (nonDocSources.length > 0)
        sourcesList.push(
          `__not_indexed__: ${nonDocSources.length} fuentes no-Doc (URL/YouTube/PDF/Audio) no se incluyeron en el contexto.`
        );

      const result: AskNotebookOutput = {
        answer,
        sources: sourcesList,
        citations,
        latency_ms: 0,
        notebook_id: this.config.notebookId,
        model: this.config.model,
        cached: false,
      };

      if (!skipCache) {
        const cacheKey = Cache.generateKey(this.config.notebookId, question);
        this.cache.set(cacheKey, result);
      }

      const latency = Date.now() - startTime;
      logger.info('RAG question processed', {
        requestId,
        latency_ms: latency,
        fragments: fragments.length,
        skipped: skipped.length,
        answerLength: answer.length,
      });

      return { ...result, latency_ms: latency };
    } catch (error) {
      logger.error('RAG failed', {
        requestId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Fetch plain text from a Google Doc using the Docs API.
   * Itera el structuralElement del body extrayendo textRun.content.
   */
  private async fetchGoogleDocText(documentId: string, accessToken: string): Promise<string> {
    const url = `https://docs.googleapis.com/v1/documents/${documentId}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(this.config.requestTimeoutMs),
    });

    if (!res.ok) {
      const t = await res.text();
      // Mensaje accionable: el caso comun es 403 (SA no compartido en el Doc).
      throw new Error(`Docs API ${res.status} (${t.slice(0, 200)})`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const doc = (await res.json()) as any;
    const parts: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const walk = (els: any[]): void => {
      if (!Array.isArray(els)) return;
      for (const el of els) {
        if (el.paragraph?.elements) {
          for (const pe of el.paragraph.elements) {
            if (pe.textRun?.content) parts.push(pe.textRun.content as string);
          }
        }
        if (el.table?.tableRows) {
          for (const row of el.table.tableRows) {
            for (const cell of row.tableCells || []) walk(cell.content || []);
          }
        }
        if (el.tableOfContents?.content) walk(el.tableOfContents.content);
      }
    };
    walk(doc?.body?.content || []);
    return parts.join('').trim();
  }

  /**
   * Get notebook metadata via notebooks.get.
   * Devuelve titulo, emoji, timestamps y un resumen compacto de las sources
   * (id, title, tipo inferido, status). Las sources detalladas se obtienen
   * con list_sources.
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await response.json()) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sources: any[] = Array.isArray(data.sources) ? data.sources : [];

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
      id: (data as NotebookMetadataResponse).name?.split('/').pop() || targetNotebookId,
      title: (data as NotebookMetadataResponse).title || 'Unknown',
      emoji: data.emoji || data.notebookEmoji,
      createTime: (data as NotebookMetadataResponse).createTime || '',
      updateTime: (data as NotebookMetadataResponse).updateTime || '',
      sourceCount: sources.length,
      sourcesSummary: sources.map((s) => ({
        id: s.sourceId?.id || s.name?.split('/').pop() || 'unknown',
        title: s.title || 'Untitled',
        type: inferType(s),
        status: s.settings?.status,
      })),
    };
  }

  /**
   * Search within notebook sources (metadata-only).
   *
   * IMPORTANTE: la API publica de NotebookLM no expone busqueda full-text en
   * el contenido de las sources. Esta implementacion hace busqueda
   * case-insensitive sobre los campos disponibles en notebooks.get:
   *   title, sourceId.id, name, metadata.googleDocsMetadata.documentId,
   *   settings.status.
   * Si el cliente pide busqueda full-text (mode='fulltext'), lanza error
   * honesto.
   */
  async searchInSources(params: {
    notebook_id?: string;
    query: string;
    source_ids?: string[];
    max_results?: number;
    mode?: 'metadata' | 'fulltext';
  }): Promise<{
    results: Array<{
      source_id: string;
      source_name: string;
      excerpt: string;
      relevance_score?: number;
    }>;
    total_matches: number;
    query: string;
    mode: 'metadata';
  }> {
    if (params.mode === 'fulltext') {
      throw new Error(
        'NotebookLM Enterprise API no expone endpoint publico documentado ' +
          'para busqueda full-text en fuentes. Se requiere RAG propio o ' +
          'lectura directa de los documentos fuente.'
      );
    }

    const targetNotebookId = params.notebook_id || this.config.notebookId;
    const endpoint = `${this.baseUrl}/notebooks/${targetNotebookId}`;
    const accessToken = await this.auth.getAccessToken();

    logger.info('Searching in notebook sources (metadata-only)', {
      notebookId: targetNotebookId,
      query: params.query,
      max_results: params.max_results,
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
      throw new Error(`Failed to load notebook for search: ${response.status} - ${errorText}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await response.json()) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let sources: any[] = Array.isArray(data.sources) ? data.sources : [];

    if (params.source_ids && params.source_ids.length > 0) {
      const filter = new Set(params.source_ids);
      sources = sources.filter((s) => filter.has(s.sourceId?.id));
    }

    const q = params.query.toLowerCase();
    type Hit = {
      source_id: string;
      source_name: string;
      excerpt: string;
      relevance_score: number;
    };
    const hits: Hit[] = [];
    for (const s of sources) {
      const title: string = s.title || '';
      const id: string = s.sourceId?.id || '';
      const fullName: string = s.name || '';
      const docId: string = s.metadata?.googleDocsMetadata?.documentId || '';
      const status: string = s.settings?.status || '';

      const matches: string[] = [];
      if (title.toLowerCase().includes(q)) matches.push(`title:"${title}"`);
      if (id.toLowerCase().includes(q)) matches.push(`sourceId:${id}`);
      if (fullName.toLowerCase().includes(q)) matches.push(`name:${fullName}`);
      if (docId.toLowerCase().includes(q)) matches.push(`documentId:${docId}`);
      if (status.toLowerCase().includes(q)) matches.push(`status:${status}`);

      if (matches.length > 0) {
        hits.push({
          source_id: id || fullName.split('/').pop() || 'unknown',
          source_name: title || 'Untitled',
          excerpt: matches.join(' | '),
          relevance_score: matches.length / 5,
        });
      }
    }

    const limit = params.max_results && params.max_results > 0 ? params.max_results : 10;
    return {
      results: hits.slice(0, limit),
      total_matches: hits.length,
      query: params.query,
      mode: 'metadata',
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

    // El API devuelve enums tipo SOURCE_STATUS_COMPLETE; el schema publico
    // expone {PROCESSING, COMPLETED, FAILED}. Normalizamos aqui.
    const mapStatus = (raw: string | undefined): 'PROCESSING' | 'COMPLETED' | 'FAILED' => {
      if (!raw) return 'COMPLETED';
      const v = String(raw).toUpperCase();
      if (v.includes('FAIL') || v.includes('ERROR')) return 'FAILED';
      if (v.includes('PROCESS') || v.includes('PENDING') || v.includes('IN_PROGRESS'))
        return 'PROCESSING';
      return 'COMPLETED';
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
        status: mapStatus(source.settings?.status),
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
    // Endpoint oficial: sources:batchCreate
    // POST .../notebooks/{id}/sources:batchCreate
    // body: { userContents: [ { <oneOf textContent|webContent|videoContent|googleDriveContent> } ] }
    const endpoint = `${this.baseUrl}/notebooks/${targetNotebookId}/sources:batchCreate`;
    const accessToken = await this.auth.getAccessToken();

    logger.info('Adding source to notebook', {
      notebookId: targetNotebookId,
      type: params.type,
      name: params.name,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userContent: Record<string, any> = {};

    switch (params.type) {
      case 'TEXT':
      case 'MARKDOWN':
        if (!params.content) {
          throw new Error('content is required for TEXT/MARKDOWN sources');
        }
        userContent.textContent = {
          sourceName: params.name,
          content: params.content,
        };
        break;

      case 'URL':
        if (!params.content && !params.uri) {
          throw new Error('content (URL) is required for URL sources');
        }
        userContent.webContent = {
          url: params.content || params.uri,
          sourceName: params.name,
        };
        break;

      case 'YOUTUBE':
        if (!params.content && !params.uri) {
          throw new Error('content (YouTube URL) is required for YOUTUBE sources');
        }
        userContent.videoContent = {
          youtubeUrl: params.content || params.uri,
        };
        break;

      case 'GOOGLE_DOC': {
        const docId = params.uri || params.content;
        if (!docId) {
          throw new Error('uri (Google Drive documentId) is required for GOOGLE_DOC sources');
        }
        userContent.googleDriveContent = {
          documentId: docId,
          mimeType: 'application/vnd.google-apps.document',
          sourceName: params.name,
        };
        break;
      }

      case 'PDF':
      case 'AUDIO':
        // El batchCreate no soporta binarios; eso requiere sources:uploadFile
        // (multipart media upload) que aun no esta implementado en este server.
        throw new Error(
          `Tipo "${params.type}" requiere sources:uploadFile (binarios), todavia no implementado. Subelo desde la UI o usa GOOGLE_DOC/TEXT/URL.`
        );

      default:
        throw new Error(`Unsupported source type: ${params.type}`);
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userContents: [userContent] }),
      signal: AbortSignal.timeout(this.config.requestTimeoutMs),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to add source: ${response.status} - ${errorText}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await response.json()) as any;
    // batchCreate puede devolver un Operation (long-running) o el resultado
    // directamente con { sources: [...] }. Cubrimos ambos casos.
    const firstSource =
      data?.sources?.[0] || data?.response?.sources?.[0] || data?.metadata?.sources?.[0] || {};
    const sourceId = firstSource.sourceId?.id || firstSource.name?.split('/').pop() || 'pending';

    return {
      source_id: sourceId,
      status: firstSource.settings?.status?.includes('FAIL') ? 'FAILED' : 'PROCESSING',
      message: `Source "${params.name}" submitted to notebook ${targetNotebookId}`,
    };
  }

  /**
   * Remove a source from a notebook using the official sources:batchDelete
   * endpoint. Espera el `name` completo del recurso de cada source.
   */
  async removeSource(
    notebookId: string | undefined,
    sourceId: string
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    const targetNotebookId = notebookId || this.config.notebookId;
    const endpoint = `${this.baseUrl}/notebooks/${targetNotebookId}/sources:batchDelete`;
    const accessToken = await this.auth.getAccessToken();

    // sourceId puede llegar como UUID corto o como full resource name.
    const fullName = sourceId.startsWith('projects/')
      ? sourceId
      : `projects/${this.config.googleProjectNumber}/locations/${this.config.googleRegion}/notebooks/${targetNotebookId}/sources/${sourceId}`;

    logger.info('Removing source from notebook', {
      notebookId: targetNotebookId,
      sourceId,
    });

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ names: [fullName] }),
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
