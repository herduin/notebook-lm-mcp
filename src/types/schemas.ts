import { z } from 'zod';

/**
 * Zod schemas for runtime validation
 */

export const ConfigSchema = z.object({
  googleProjectId: z.string().min(1, 'GOOGLE_PROJECT_ID is required'),
  googleProjectNumber: z.string().min(1, 'GOOGLE_PROJECT_NUMBER is required'),
  googleRegion: z.string().min(1, 'GOOGLE_REGION is required'),
  notebookId: z.string().min(1, 'NOTEBOOK_ID is required'),
  googleApplicationCredentials: z.string().min(1, 'GOOGLE_APPLICATION_CREDENTIALS is required'),
  model: z.string().default('gemini-1.5-pro-002'),
  port: z.number().int().positive().default(3000),
  nodeEnv: z.enum(['development', 'production', 'test']).default('production'),
  cacheTtl: z.number().int().positive().default(300),
  maxRetries: z.number().int().min(0).max(10).default(3),
  retryDelayMs: z.number().int().positive().default(1000),
  requestTimeoutMs: z.number().int().positive().default(30000),
  maxQuestionLength: z.number().int().positive().default(4000),
  logLevel: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
});

export const AskNotebookInputSchema = z.object({
  question: z
    .string()
    .min(1, 'Question cannot be empty')
    .max(4000, 'Question exceeds maximum length')
    .refine(
      (q) => {
        // Basic prompt injection detection
        const suspiciousPatterns = [
          /ignore\s+previous\s+instructions/i,
          /system\s+prompt/i,
          /you\s+are\s+now/i,
          /disregard\s+(all|any)\s+previous/i,
        ];
        return !suspiciousPatterns.some((pattern) => pattern.test(q));
      },
      {
        message: 'Question contains suspicious patterns',
      }
    ),
});

export const CitationSchema = z.object({
  source: z.string(),
  text: z.string(),
  title: z.string().optional(),
  pageNumber: z.number().optional(),
});

export const AskNotebookOutputSchema = z.object({
  answer: z.string(),
  sources: z.array(z.string()),
  citations: z.array(CitationSchema),
  latency_ms: z.number(),
  notebook_id: z.string(),
  model: z.string(),
  cached: z.boolean(),
});

export const HealthStatusSchema = z.object({
  status: z.enum(['healthy', 'unhealthy']),
  timestamp: z.string(),
  uptime: z.number(),
  version: z.string(),
});

export const ReadinessStatusSchema = z.object({
  ready: z.boolean(),
  checks: z.object({
    auth: z.boolean(),
    notebook: z.boolean(),
  }),
  timestamp: z.string(),
});
