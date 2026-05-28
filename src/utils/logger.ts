import pino from 'pino';
import { LogContext } from '../types/index.js';

const isDevelopment = process.env.NODE_ENV === 'development';

export interface AppLogger {
  info(msg: string, obj?: Record<string, unknown>): void;
  debug(msg: string, obj?: Record<string, unknown>): void;
  warn(msg: string, obj?: Record<string, unknown>): void;
  error(msg: string, obj?: Record<string, unknown>): void;
  fatal(msg: string, obj?: Record<string, unknown>): void;
  trace(msg: string, obj?: Record<string, unknown>): void;
  child(bindings: pino.Bindings): AppLogger;
}

function wrapLogger(logger: pino.Logger): AppLogger {
  return {
    info: (msg: string, obj?: Record<string, unknown>) => {
      if (obj) {
        logger.info(obj, msg);
      } else {
        logger.info(msg);
      }
    },
    debug: (msg: string, obj?: Record<string, unknown>) => {
      if (obj) {
        logger.debug(obj, msg);
      } else {
        logger.debug(msg);
      }
    },
    warn: (msg: string, obj?: Record<string, unknown>) => {
      if (obj) {
        logger.warn(obj, msg);
      } else {
        logger.warn(msg);
      }
    },
    error: (msg: string, obj?: Record<string, unknown>) => {
      if (obj) {
        logger.error(obj, msg);
      } else {
        logger.error(msg);
      }
    },
    fatal: (msg: string, obj?: Record<string, unknown>) => {
      if (obj) {
        logger.fatal(obj, msg);
      } else {
        logger.fatal(msg);
      }
    },
    trace: (msg: string, obj?: Record<string, unknown>) => {
      if (obj) {
        logger.trace(obj, msg);
      } else {
        logger.trace(msg);
      }
    },
    child: (bindings: pino.Bindings) => wrapLogger(logger.child(bindings)),
  };
}

/**
 * Create a Pino logger instance with structured logging
 */
export function createLogger(component: string): AppLogger {
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

  return wrapLogger(logger);
}

/**
 * Create a child logger with additional context
 */
export function createChildLogger(
  parentLogger: AppLogger,
  context: LogContext
): AppLogger {
  return parentLogger.child(context);
}

/**
 * Generate a unique request ID
 */
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}
