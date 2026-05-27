import pino from 'pino';
import { LogContext } from '../types/index.js';

const isDevelopment = process.env.NODE_ENV === 'development';

/**
 * Create a Pino logger instance with structured logging
 */
export function createLogger(component: string): pino.Logger {
  const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    transport: isDevelopment
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
    base: {
      component,
      env: process.env.NODE_ENV || 'production',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => {
        return { level: label };
      },
    },
    redact: {
      paths: [
        'credentials',
        'password',
        'token',
        'accessToken',
        'access_token',
        'authorization',
        'secret',
        'apiKey',
        'api_key',
      ],
      remove: true,
    },
  });

  return logger;
}

/**
 * Create a child logger with additional context
 */
export function createChildLogger(
  parentLogger: pino.Logger,
  context: LogContext
): pino.Logger {
  return parentLogger.child(context);
}

/**
 * Generate a unique request ID
 */
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}
