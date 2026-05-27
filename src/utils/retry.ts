import { createLogger } from './logger.js';
import { RetryOptions } from '../types/index.js';

const logger = createLogger('retry');

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
  context: string = 'operation'
): Promise<T> {
  const { maxRetries, delayMs, backoffMultiplier = 2 } = options;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      if (attempt > 0) {
        logger.info(`${context} succeeded on attempt ${attempt + 1}`);
      }
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries) {
        const waitTime = delayMs * Math.pow(backoffMultiplier, attempt);
        logger.warn(`${context} failed, retrying in ${waitTime}ms`, {
          attempt: attempt + 1,
          maxRetries,
          error: lastError.message,
        });
        await sleep(waitTime);
      }
    }
  }

  logger.error(`${context} failed after ${maxRetries + 1} attempts`, {
    error: lastError?.message,
  });
  throw new Error(
    `${context} failed after ${maxRetries + 1} attempts: ${lastError?.message}`
  );
}

/**
 * Sleep for a specified number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create an AbortSignal with timeout
 */
export function createTimeoutSignal(timeoutMs: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
}
