/**
 * Base types and interfaces for the NotebookLM MCP Server
 */

export interface Config {
  googleProjectId: string;
  googleProjectNumber: string;
  googleRegion: string;
  notebookId: string;
  googleApplicationCredentials: string;
  model: string;
  port: number;
  nodeEnv: string;
  cacheTtl: number;
  maxRetries: number;
  retryDelayMs: number;
  requestTimeoutMs: number;
  maxQuestionLength: number;
  logLevel: string;
}

export interface AskNotebookInput {
  question: string;
}

export interface Citation {
  source: string;
  text: string;
  title?: string;
  pageNumber?: number;
}

export interface AskNotebookOutput {
  answer: string;
  sources: string[];
  citations: Citation[];
  latency_ms: number;
  notebook_id: string;
  model: string;
  cached: boolean;
}

export interface NotebookMetadata {
  id: string;
  title: string;
  createTime: string;
  updateTime: string;
}

export interface RetryOptions {
  maxRetries: number;
  delayMs: number;
  backoffMultiplier?: number;
}

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

export interface HealthStatus {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
}

export interface ReadinessStatus {
  ready: boolean;
  checks: {
    auth: boolean;
    notebook: boolean;
  };
  timestamp: string;
}

export interface LogContext {
  requestId?: string;
  notebookId?: string;
  userId?: string;
  operation?: string;
  [key: string]: unknown;
}

export interface GoogleCloudError {
  code: number;
  message: string;
  status: string;
  details?: unknown[];
}

export interface NotebookSource {
  name: string;
  userContent?: {
    content: string;
    mimeType: string;
  };
  documentSource?: {
    documentId: string;
    documentType: 'GOOGLE_DOCS' | 'GOOGLE_SLIDES' | 'PDF' | 'TXT';
  };
  webSource?: {
    url: string;
  };
}

export interface GenerateContentRequest {
  contents: Array<{
    role: string;
    parts: Array<{
      text: string;
    }>;
  }>;
  generationConfig?: {
    temperature?: number;
    topP?: number;
    topK?: number;
    maxOutputTokens?: number;
  };
  safetySettings?: Array<{
    category: string;
    threshold: string;
  }>;
}

export interface GenerateContentResponse {
  candidates: Array<{
    content: {
      role: string;
      parts: Array<{
        text: string;
      }>;
    };
    finishReason: string;
    safetyRatings: Array<{
      category: string;
      probability: string;
    }>;
    citationMetadata?: {
      citations: Array<{
        startIndex: number;
        endIndex: number;
        uri?: string;
        title?: string;
        license?: string;
      }>;
    };
  }>;
  usageMetadata: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}
