import { loadConfig, validateEnvironment } from '../../config/index.js';

describe('Config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('validateEnvironment', () => {
    it('should pass with all required variables', () => {
      process.env.GOOGLE_PROJECT_ID = 'test-project';
      process.env.GOOGLE_PROJECT_NUMBER = '123456';
      process.env.GOOGLE_REGION = 'us-central1';
      process.env.NOTEBOOK_ID = 'notebook-123';
      process.env.GOOGLE_APPLICATION_CREDENTIALS = '/path/to/creds.json';

      expect(() => validateEnvironment()).not.toThrow();
    });

    it('should throw when missing required variables', () => {
      process.env.GOOGLE_PROJECT_ID = 'test-project';
      // Missing other required variables

      expect(() => validateEnvironment()).toThrow(/Missing required environment variables/);
    });
  });

  describe('loadConfig', () => {
    beforeEach(() => {
      // Set required env vars
      process.env.GOOGLE_PROJECT_ID = 'test-project';
      process.env.GOOGLE_PROJECT_NUMBER = '123456';
      process.env.GOOGLE_REGION = 'us-central1';
      process.env.NOTEBOOK_ID = 'notebook-123';
      process.env.GOOGLE_APPLICATION_CREDENTIALS = '/path/to/creds.json';
    });

    it('should load configuration with defaults', () => {
      const config = loadConfig();

      expect(config.googleProjectId).toBe('test-project');
      expect(config.googleProjectNumber).toBe('123456');
      expect(config.googleRegion).toBe('us-central1');
      expect(config.notebookId).toBe('notebook-123');
      expect(config.model).toBe('gemini-1.5-pro-002');
      expect(config.port).toBe(3000);
      expect(config.cacheTtl).toBe(300);
    });

    it('should use custom values when provided', () => {
      process.env.MODEL = 'custom-model';
      process.env.PORT = '8080';
      process.env.CACHE_TTL = '600';
      process.env.MAX_RETRIES = '5';

      const config = loadConfig();

      expect(config.model).toBe('custom-model');
      expect(config.port).toBe(8080);
      expect(config.cacheTtl).toBe(600);
      expect(config.maxRetries).toBe(5);
    });

    it('should throw on invalid configuration', () => {
      process.env.PORT = 'invalid';

      expect(() => loadConfig()).toThrow(/Configuration validation failed/);
    });

    it('should validate integer constraints', () => {
      process.env.PORT = '-1';

      expect(() => loadConfig()).toThrow();
    });
  });
});
