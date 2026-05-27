import { retryWithBackoff, sleep } from '../../utils/retry.js';

describe('Retry Utils', () => {
  describe('sleep', () => {
    it('should wait for specified duration', async () => {
      const start = Date.now();
      await sleep(100);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(95); // Allow small margin
      expect(elapsed).toBeLessThan(150);
    });
  });

  describe('retryWithBackoff', () => {
    it('should succeed on first attempt', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      const result = await retryWithBackoff(fn, {
        maxRetries: 3,
        delayMs: 10,
      });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockResolvedValue('success');

      const result = await retryWithBackoff(fn, {
        maxRetries: 3,
        delayMs: 10,
      });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should throw after max retries', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Always fails'));

      await expect(
        retryWithBackoff(fn, {
          maxRetries: 2,
          delayMs: 10,
        })
      ).rejects.toThrow('operation failed after 3 attempts');

      expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should use exponential backoff', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockResolvedValue('success');

      const start = Date.now();
      await retryWithBackoff(fn, {
        maxRetries: 2,
        delayMs: 50,
        backoffMultiplier: 2,
      });
      const elapsed = Date.now() - start;

      // First retry: 50ms, Second retry: 100ms = 150ms total minimum
      expect(elapsed).toBeGreaterThanOrEqual(140); // Allow margin
    });

    it('should use custom context in error message', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Fail'));

      await expect(
        retryWithBackoff(
          fn,
          {
            maxRetries: 1,
            delayMs: 10,
          },
          'custom-operation'
        )
      ).rejects.toThrow('custom-operation failed after 2 attempts');
    });

    it('should handle non-Error rejections', async () => {
      const fn = jest.fn().mockRejectedValue('string error');

      await expect(
        retryWithBackoff(fn, {
          maxRetries: 1,
          delayMs: 10,
        })
      ).rejects.toThrow('operation failed after 2 attempts: string error');
    });
  });
});
