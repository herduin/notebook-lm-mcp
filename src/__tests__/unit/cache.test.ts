import { Cache } from '../../cache/index.js';

describe('Cache', () => {
  let cache: Cache<string>;

  beforeEach(() => {
    cache = new Cache<string>(1); // 1 second TTL
  });

  afterEach(() => {
    cache.destroy();
  });

  describe('set and get', () => {
    it('should store and retrieve values', () => {
      cache.set('key1', 'value1');
      const result = cache.get('key1');
      expect(result).toBe('value1');
    });

    it('should return null for non-existent keys', () => {
      const result = cache.get('nonexistent');
      expect(result).toBeNull();
    });

    it('should handle multiple keys', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      expect(cache.get('key1')).toBe('value1');
      expect(cache.get('key2')).toBe('value2');
      expect(cache.get('key3')).toBe('value3');
    });
  });

  describe('TTL expiration', () => {
    it('should expire entries after TTL', async () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 1100));

      expect(cache.get('key1')).toBeNull();
    });

    it('should support custom TTL per entry', async () => {
      cache.set('short', 'value1', 0.5); // 0.5 seconds
      cache.set('long', 'value2', 2); // 2 seconds

      await new Promise((resolve) => setTimeout(resolve, 600));

      expect(cache.get('short')).toBeNull();
      expect(cache.get('long')).toBe('value2');
    });
  });

  describe('delete and clear', () => {
    it('should delete individual entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      const deleted = cache.delete('key1');
      expect(deleted).toBe(true);
      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).toBe('value2');
    });

    it('should return false when deleting non-existent key', () => {
      const deleted = cache.delete('nonexistent');
      expect(deleted).toBe(false);
    });

    it('should clear all entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      cache.clear();

      expect(cache.size()).toBe(0);
      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).toBeNull();
      expect(cache.get('key3')).toBeNull();
    });
  });

  describe('size and stats', () => {
    it('should track cache size', () => {
      expect(cache.size()).toBe(0);

      cache.set('key1', 'value1');
      expect(cache.size()).toBe(1);

      cache.set('key2', 'value2');
      expect(cache.size()).toBe(2);

      cache.delete('key1');
      expect(cache.size()).toBe(1);
    });

    it('should return stats', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      const stats = cache.getStats();
      expect(stats.size).toBe(2);
      expect(stats.keys).toContain('key1');
      expect(stats.keys).toContain('key2');
    });
  });

  describe('generateKey', () => {
    it('should generate cache keys from parts', () => {
      const key = Cache.generateKey('notebook', '123', 'question');
      expect(key).toBe('notebook:123:question');
    });

    it('should normalize keys to lowercase', () => {
      const key = Cache.generateKey('NOTEBOOK', 'ABC', 'Question');
      expect(key).toBe('notebook:abc:question');
    });

    it('should trim whitespace', () => {
      const key = Cache.generateKey(' notebook ', ' 123 ', ' question ');
      expect(key).toBe('notebook:123:question');
    });
  });
});
