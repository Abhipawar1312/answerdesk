import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryRateLimiter, UpstashRedisRateLimiter, getRateLimiter } from './index';

describe('Rate Limiter Module', () => {
  describe('MemoryRateLimiter', () => {
    let limiter: MemoryRateLimiter;

    beforeEach(() => {
      limiter = new MemoryRateLimiter(3, 60); // 3 requests per 60s
    });

    it('allows requests within the limit', async () => {
      const res1 = await limiter.limit('ip-1');
      expect(res1.success).toBe(true);
      expect(res1.remaining).toBe(2);

      const res2 = await limiter.limit('ip-1');
      expect(res2.success).toBe(true);
      expect(res2.remaining).toBe(1);

      const res3 = await limiter.limit('ip-1');
      expect(res3.success).toBe(true);
      expect(res3.remaining).toBe(0);
    });

    it('rejects requests exceeding the limit', async () => {
      await limiter.limit('ip-2');
      await limiter.limit('ip-2');
      await limiter.limit('ip-2');

      const res4 = await limiter.limit('ip-2');
      expect(res4.success).toBe(false);
      expect(res4.remaining).toBe(0);
    });

    it('tracks different identifiers independently', async () => {
      await limiter.limit('ip-A');
      await limiter.limit('ip-A');
      await limiter.limit('ip-A');

      const resA = await limiter.limit('ip-A');
      expect(resA.success).toBe(false);

      const resB = await limiter.limit('ip-B');
      expect(resB.success).toBe(true);
      expect(resB.remaining).toBe(2);
    });
  });

  describe('UpstashRedisRateLimiter', () => {
    const mockUrl = 'https://mock-redis.upstash.io';
    const mockToken = 'mock-secret-token';

    it('parses pipeline response and permits request when below limit', async () => {
      const limiter = new UpstashRedisRateLimiter(mockUrl, mockToken, 5, 60);

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => [{ result: 2 }, { result: 1 }],
      } as Response);

      const res = await limiter.limit('visitor-1');
      expect(res.success).toBe(true);
      expect(res.remaining).toBe(3);
    });

    it('blocks request when count exceeds limit', async () => {
      const limiter = new UpstashRedisRateLimiter(mockUrl, mockToken, 5, 60);

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => [{ result: 6 }, { result: 1 }],
      } as Response);

      const res = await limiter.limit('visitor-2');
      expect(res.success).toBe(false);
      expect(res.remaining).toBe(0);
    });

    it('falls back gracefully on network or API failure', async () => {
      const limiter = new UpstashRedisRateLimiter(mockUrl, mockToken, 5, 60);

      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Connection refused'));

      const res = await limiter.limit('visitor-3');
      expect(res.success).toBe(true);
    });
  });

  describe('getRateLimiter factory', () => {
    const origEnv = process.env;

    beforeEach(() => {
      process.env = { ...origEnv };
    });

    it('returns MemoryRateLimiter when Upstash env vars are absent', () => {
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;

      const limiter = getRateLimiter();
      expect(limiter).toBeInstanceOf(MemoryRateLimiter);
    });

    it('throws fatal error in production when Upstash env vars are absent', () => {
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';

      expect(() => getRateLimiter()).toThrow(/FATAL: Distributed rate limiter is unconfigured in production/);
    });

    it('throws fatal error in production when Upstash env vars are placeholders', () => {
      process.env.UPSTASH_REDIS_REST_URL = 'https://your-upstash-instance.upstash.io';
      process.env.UPSTASH_REDIS_REST_TOKEN = 'your-upstash-token-placeholder';
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';

      expect(() => getRateLimiter()).toThrow(/FATAL: Distributed rate limiter is unconfigured in production/);
    });

    it('returns UpstashRedisRateLimiter when Upstash env vars are present', () => {
      process.env.UPSTASH_REDIS_REST_URL = 'https://upstash.io';
      process.env.UPSTASH_REDIS_REST_TOKEN = 'secret-tok';

      const limiter = getRateLimiter();
      expect(limiter).toBeInstanceOf(UpstashRedisRateLimiter);
    });
  });
});

