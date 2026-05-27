import { Config } from '../types/index.js';
import { ConfigSchema } from '../types/schemas.js';
import { z } from 'zod';

/**
 * Load and validate configuration from environment variables
 */
export function loadConfig(): Config {
  const rawConfig = {
    googleProjectId: process.env.GOOGLE_PROJECT_ID,
    googleProjectNumber: process.env.GOOGLE_PROJECT_NUMBER,
    googleRegion: process.env.GOOGLE_REGION || 'us-central1',
    notebookId: process.env.NOTEBOOK_ID,
    googleApplicationCredentials:
      process.env.GOOGLE_APPLICATION_CREDENTIALS || '/credentials/key.json',
    model: process.env.MODEL || 'gemini-1.5-pro-002',
    port: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000,
    nodeEnv: process.env.NODE_ENV || 'production',
    cacheTtl: process.env.CACHE_TTL ? parseInt(process.env.CACHE_TTL, 10) : 300,
    maxRetries: process.env.MAX_RETRIES ? parseInt(process.env.MAX_RETRIES, 10) : 3,
    retryDelayMs: process.env.RETRY_DELAY_MS ? parseInt(process.env.RETRY_DELAY_MS, 10) : 1000,
    requestTimeoutMs: process.env.REQUEST_TIMEOUT_MS
      ? parseInt(process.env.REQUEST_TIMEOUT_MS, 10)
      : 30000,
    maxQuestionLength: process.env.MAX_QUESTION_LENGTH
      ? parseInt(process.env.MAX_QUESTION_LENGTH, 10)
      : 4000,
    logLevel: process.env.LOG_LEVEL || 'info',
  };

  try {
    return ConfigSchema.parse(rawConfig);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('\n');
      throw new Error(`Configuration validation failed:\n${messages}`);
    }
    throw error;
  }
}

/**
 * Validate required environment variables at startup
 */
export function validateEnvironment(): void {
  const required = [
    'GOOGLE_PROJECT_ID',
    'GOOGLE_PROJECT_NUMBER',
    'GOOGLE_REGION',
    'NOTEBOOK_ID',
    'GOOGLE_APPLICATION_CREDENTIALS',
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
        'Please check your .env file or environment configuration.'
    );
  }
}
