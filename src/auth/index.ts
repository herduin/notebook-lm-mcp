import { GoogleAuth, GoogleAuthOptions } from 'google-auth-library';
import { Config } from '../types/index.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('auth');

/**
 * Authentication manager for Google Cloud services
 */
export class AuthManager {
  private auth: GoogleAuth;
  private config: Config;

  constructor(config: Config) {
    this.config = config;

    const authOptions: GoogleAuthOptions = {
      keyFilename: config.googleApplicationCredentials,
      // cloud-platform cubre Vertex AI / Discovery Engine.
      // documents.readonly + drive.readonly habilitan el RAG sobre las
      // fuentes Google Docs del notebook (ask_notebook). Si el SA no tiene
      // permiso sobre un Doc concreto, igual va a fallar a nivel ACL del
      // documento; los scopes solo declaran la intencion del cliente.
      scopes: [
        'https://www.googleapis.com/auth/cloud-platform',
        'https://www.googleapis.com/auth/documents.readonly',
        'https://www.googleapis.com/auth/drive.readonly',
      ],
      projectId: config.googleProjectId,
    };

    this.auth = new GoogleAuth(authOptions);
    logger.info('AuthManager initialized', {
      projectId: config.googleProjectId,
      region: config.googleRegion,
    });
  }

  /**
   * Get authenticated client
   */
  async getClient(): Promise<unknown> {
    try {
      const client = await this.auth.getClient();
      return client;
    } catch (error) {
      logger.error('Failed to get authenticated client', { error });
      throw new Error(
        `Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get access token for API calls
   */
  async getAccessToken(): Promise<string> {
    try {
      const client = await this.auth.getClient();
      const accessToken = await client.getAccessToken();

      if (!accessToken.token) {
        throw new Error('Failed to retrieve access token');
      }

      logger.debug('Access token retrieved successfully');
      return accessToken.token;
    } catch (error) {
      logger.error('Failed to get access token', { error });
      throw new Error(
        `Failed to retrieve access token: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get project ID
   */
  getProjectId(): string {
    return this.config.googleProjectId;
  }

  /**
   * Get project number
   */
  getProjectNumber(): string {
    return this.config.googleProjectNumber;
  }

  /**
   * Get region
   */
  getRegion(): string {
    return this.config.googleRegion;
  }

  /**
   * Verify authentication is working
   */
  async verify(): Promise<boolean> {
    try {
      await this.getAccessToken();
      logger.info('Authentication verification successful');
      return true;
    } catch (error) {
      logger.error('Authentication verification failed', { error });
      return false;
    }
  }
}
