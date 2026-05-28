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

// ==================== Tool Input/Output Schemas ====================

/**
 * ask_notebook tool - Ask questions to get grounded answers from the notebook
 */
export const AskNotebookInputSchema = z.object({
  question: z
    .string()
    .min(1, 'Question cannot be empty')
    .max(4000, 'Question exceeds maximum length of 4000 characters')
    .describe(
      'The question to ask the notebook. Be specific and clear. The system will provide answers based exclusively on the notebook contents with citations.'
    )
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
  source: z.string().describe('Source identifier or URI where the information was found'),
  text: z.string().describe('The exact text that was cited from the source'),
  title: z.string().optional().describe('Title of the source document if available'),
  pageNumber: z.number().optional().describe('Page number in the source document if applicable'),
});

export const AskNotebookOutputSchema = z.object({
  answer: z.string().describe('The grounded answer based on notebook contents'),
  sources: z.array(z.string()).describe('List of source identifiers used to generate the answer'),
  citations: z
    .array(CitationSchema)
    .describe('Detailed citations with exact text references from sources'),
  latency_ms: z.number().describe('Time taken to process the request in milliseconds'),
  notebook_id: z.string().describe('ID of the notebook that was queried'),
  model: z.string().describe('AI model used to generate the response'),
  cached: z.boolean().describe('Whether this response was served from cache'),
});

/**
 * get_notebook_metadata tool - Get detailed information about a notebook
 */
export const GetNotebookMetadataInputSchema = z.object({
  notebook_id: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Notebook ID to query. If not provided, uses the default notebook from server configuration.'
    ),
});

export const NotebookMetadataSchema = z.object({
  id: z.string().describe('Unique identifier of the notebook'),
  title: z.string().describe('Title/name of the notebook'),
  description: z.string().optional().describe('Description of the notebook contents'),
  createTime: z.string().describe('ISO 8601 timestamp when the notebook was created'),
  updateTime: z.string().describe('ISO 8601 timestamp when the notebook was last updated'),
  sourceCount: z.number().optional().describe('Number of sources/documents in the notebook'),
  owner: z.string().optional().describe('Owner of the notebook'),
});

export const GetNotebookMetadataOutputSchema = NotebookMetadataSchema;

/**
 * list_sources tool - List all sources in a notebook
 */
export const ListSourcesInputSchema = z.object({
  notebook_id: z
    .string()
    .min(1)
    .optional()
    .describe('Notebook ID to list sources from. Uses default notebook if not specified.'),
  page_size: z
    .number()
    .int()
    .positive()
    .max(100)
    .default(50)
    .optional()
    .describe('Maximum number of sources to return (1-100, default: 50)'),
  page_token: z
    .string()
    .optional()
    .describe('Token for pagination. Use the next_page_token from previous response.'),
});

export const SourceSchema = z.object({
  id: z.string().describe('Unique identifier of the source'),
  name: z.string().describe('Name/filename of the source document'),
  type: z
    .enum(['PDF', 'TEXT', 'URL', 'MARKDOWN', 'GOOGLE_DOC', 'YOUTUBE', 'AUDIO', 'OTHER'])
    .describe('Type of the source document'),
  uri: z.string().optional().describe('URI/URL of the source if applicable'),
  size: z.number().optional().describe('Size in bytes if applicable'),
  createTime: z.string().describe('ISO 8601 timestamp when source was added'),
  updateTime: z.string().describe('ISO 8601 timestamp when source was last updated'),
  status: z
    .enum(['PROCESSING', 'COMPLETED', 'FAILED'])
    .optional()
    .describe('Processing status of the source'),
});

export const ListSourcesOutputSchema = z.object({
  sources: z.array(SourceSchema).describe('Array of sources in the notebook'),
  next_page_token: z
    .string()
    .optional()
    .describe('Token to retrieve the next page of results. Undefined if no more pages.'),
  total_count: z.number().optional().describe('Total number of sources in the notebook'),
});

/**
 * add_source tool - Add a document/source to a notebook
 */
export const AddSourceInputSchema = z.object({
  notebook_id: z
    .string()
    .min(1)
    .optional()
    .describe('Notebook ID to add source to. Uses default notebook if not specified.'),
  type: z
    .enum(['PDF', 'TEXT', 'URL', 'MARKDOWN', 'GOOGLE_DOC', 'YOUTUBE', 'AUDIO'])
    .describe('Type of source to add'),
  content: z
    .string()
    .optional()
    .describe(
      'Content of the source. For TEXT/MARKDOWN: the actual text. For URL/YOUTUBE: the URL. For file uploads: not used (use uri instead).'
    ),
  uri: z.string().optional().describe('URI/URL of the source for external resources or file paths'),
  name: z.string().min(1).describe('Name/title for the source document'),
  metadata: z
    .record(z.string())
    .optional()
    .describe('Additional metadata key-value pairs for the source'),
});

export const AddSourceOutputSchema = z.object({
  source_id: z.string().describe('Unique identifier of the newly added source'),
  status: z.enum(['PROCESSING', 'COMPLETED', 'FAILED']).describe('Initial processing status'),
  message: z.string().describe('Success or status message'),
});

/**
 * remove_source tool - Remove a source from a notebook
 */
export const RemoveSourceInputSchema = z.object({
  notebook_id: z
    .string()
    .min(1)
    .optional()
    .describe('Notebook ID containing the source. Uses default notebook if not specified.'),
  source_id: z.string().min(1).describe('ID of the source to remove'),
});

export const RemoveSourceOutputSchema = z.object({
  success: z.boolean().describe('Whether the source was successfully removed'),
  message: z.string().describe('Success or error message'),
});

/**
 * update_notebook tool - Update notebook metadata
 */
export const UpdateNotebookInputSchema = z.object({
  notebook_id: z
    .string()
    .min(1)
    .optional()
    .describe('Notebook ID to update. Uses default notebook if not specified.'),
  title: z
    .string()
    .min(1)
    .max(500)
    .optional()
    .describe('New title for the notebook (1-500 characters)'),
  description: z
    .string()
    .max(5000)
    .optional()
    .describe('New description for the notebook (max 5000 characters)'),
});

export const UpdateNotebookOutputSchema = z.object({
  success: z.boolean().describe('Whether the update was successful'),
  updated_fields: z.array(z.string()).describe('List of fields that were updated'),
  message: z.string().describe('Success or error message'),
});

/**
 * search_in_sources tool - Search for specific content within notebook sources
 */
export const SearchInSourcesInputSchema = z.object({
  notebook_id: z
    .string()
    .min(1)
    .optional()
    .describe('Notebook ID to search in. Uses default notebook if not specified.'),
  query: z
    .string()
    .min(1)
    .max(500)
    .describe('Search query to find in sources (1-500 characters)'),
  source_ids: z
    .array(z.string())
    .optional()
    .describe('Optional array of specific source IDs to search in. Searches all sources if not provided.'),
  max_results: z
    .number()
    .int()
    .positive()
    .max(50)
    .default(10)
    .optional()
    .describe('Maximum number of results to return (1-50, default: 10)'),
});

export const SearchResultSchema = z.object({
  source_id: z.string().describe('ID of the source containing the match'),
  source_name: z.string().describe('Name of the source document'),
  excerpt: z.string().describe('Text excerpt containing the match with context'),
  relevance_score: z.number().optional().describe('Relevance score (0-1) if available'),
  page_number: z.number().optional().describe('Page number if applicable'),
});

export const SearchInSourcesOutputSchema = z.object({
  results: z.array(SearchResultSchema).describe('Array of search results'),
  total_matches: z.number().describe('Total number of matches found'),
  query: z.string().describe('The search query that was executed'),
});

// ==================== Health & System Schemas ====================

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
