import { CacheEntry } from '../types/index.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('cache');

/**
 * Simple in-memory cache with TTL support
 */
export class Cache<T> {
  private cache: Map<string, CacheEntry<T>>;
  private ttl: number;
  private cleanupInterval: NodeJS.Timeout | null;

  constructor(ttlSeconds: number = 300) {
    this.cache = new Map();
    this.ttl = ttlSeconds * 1000; // Convert to milliseconds
    this.cleanupInterval = null;

    // Start cleanup interval
    this.startCleanup();

    logger.info('Cache initialized', { ttlSeconds });
  }

  /**
   * Get value from cache
   */
  get(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      logger.debug('Cache miss', { key });
      return null;
    }

    const now = Date.now();
    const age = now - entry.timestamp;

    if (age > entry.ttl) {
      logger.debug('Cache entry expired', { key, age });
      this.cache.delete(key);
      return null;
    }

    logger.debug('Cache hit', { key, age });
    return entry.data;
  }

  /**
   * Set value in cache
   */
  set(key: string, value: T, customTtl?: number): void {
    const entry: CacheEntry<T> = {
      data: value,
      timestamp: Date.now(),
      ttl: customTtl ? customTtl * 1000 : this.ttl,
    };

    this.cache.set(key, entry);
    logger.debug('Cache entry set', {
      key,
      ttl: entry.ttl / 1000,
      size: this.cache.size,
    });
  }

  /**
   * Delete value from cache
   */
  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      logger.debug('Cache entry deleted', { key });
    }
    return deleted;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    logger.info('Cache cleared', { entriesCleared: size });
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }

  /**
   * Start periodic cleanup of expired entries
   */
  private startCleanup(): void {
    // Run cleanup every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000);
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache.entries()) {
      const age = now - entry.timestamp;
      if (age > entry.ttl) {
        this.cache.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      logger.debug('Cache cleanup completed', {
        removed,
        remaining: this.cache.size,
      });
    }
  }

  /**
   * Stop cleanup interval and clear cache
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clear();
    logger.info('Cache destroyed');
  }

  /**
   * Generate cache key from parts
   */
  static generateKey(...parts: string[]): string {
    return parts.map((p) => p.toLowerCase().trim()).join(':');
  }
}
