/**
 * Rate Limiter Interface and Implementations.
 * Provides a unified IRateLimiter interface with two engines:
 * 1. Upstash Redis REST API (when UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set).
 * 2. In-Memory / MongoDB fallback engine with sliding-window accounting.
 */

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number; // Unix timestamp in seconds
}

export interface IRateLimiter {
  limit(identifier: string): Promise<RateLimitResult>;
}

/**
 * In-memory sliding window rate limiter.
 * Ideal for development, testing, and single-instance deployments when Upstash credentials are not provided.
 */
export class MemoryRateLimiter implements IRateLimiter {
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly hits = new Map<string, number[]>();

  constructor(maxRequests: number = 10, windowSeconds: number = 60) {
    this.maxRequests = maxRequests;
    this.windowMs = windowSeconds * 1000;
  }

  async limit(identifier: string): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    const timestamps = this.hits.get(identifier) ?? [];
    const validTimestamps = timestamps.filter((t) => t > windowStart);

    const reset = Math.ceil((now + this.windowMs) / 1000);

    if (validTimestamps.length >= this.maxRequests) {
      this.hits.set(identifier, validTimestamps);
      return {
        success: false,
        limit: this.maxRequests,
        remaining: 0,
        reset,
      };
    }

    validTimestamps.push(now);
    this.hits.set(identifier, validTimestamps);

    return {
      success: true,
      limit: this.maxRequests,
      remaining: this.maxRequests - validTimestamps.length,
      reset,
    };
  }

  /**
   * Resets hit counters (primarily for unit tests).
   */
  resetAll(): void {
    this.hits.clear();
  }
}

/**
 * Upstash Redis Rate Limiter via HTTP REST API.
 * Uses atomic MULTI/EXEC or INCR + EXPIRE via Upstash REST pipeline.
 */
export class UpstashRedisRateLimiter implements IRateLimiter {
  private readonly url: string;
  private readonly token: string;
  private readonly maxRequests: number;
  private readonly windowSeconds: number;

  constructor(url: string, token: string, maxRequests: number = 10, windowSeconds: number = 60) {
    this.url = url.replace(/\/$/, '');
    this.token = token;
    this.maxRequests = maxRequests;
    this.windowSeconds = windowSeconds;
  }

  async limit(identifier: string): Promise<RateLimitResult> {
    const key = `ratelimit:visitor:${identifier}`;
    const now = Math.floor(Date.now() / 1000);
    const reset = now + this.windowSeconds;

    try {
      // Pipeline: INCR key, EXPIRE key windowSeconds NX
      const res = await fetch(`${this.url}/pipeline`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([
          ['INCR', key],
          ['EXPIRE', key, this.windowSeconds, 'NX'],
        ]),
      });

      if (!res.ok) {
        throw new Error(`Upstash returned status ${res.status}`);
      }

      const results = (await res.json()) as Array<{ result: number }>;
      const currentCount = Number(results[0]?.result ?? 1);

      const success = currentCount <= this.maxRequests;
      const remaining = Math.max(0, this.maxRequests - currentCount);

      return {
        success,
        limit: this.maxRequests,
        remaining,
        reset,
      };
    } catch {
      // In development or when Upstash network fails, fallback to local MemoryRateLimiter
      if (process.env.NODE_ENV !== 'production') {
        const mem = getMemoryRateLimiter(this.maxRequests, this.windowSeconds);
        return mem.limit(identifier);
      }
      return {
        success: true,
        limit: this.maxRequests,
        remaining: 1,
        reset,
      };
    }
  }
}

declare global {
  var memoryRateLimiters: Map<string, MemoryRateLimiter> | undefined;
}

if (!globalThis.memoryRateLimiters) {
  globalThis.memoryRateLimiters = new Map<string, MemoryRateLimiter>();
}

function isValidUpstashConfig(url?: string, token?: string): boolean {
  if (!url || !token) return false;
  if (url.includes('your-upstash') || token.includes('your-upstash')) return false;
  if (url.includes('placeholder') || token.includes('placeholder')) return false;
  return url.startsWith('http://') || url.startsWith('https://');
}

export function getMemoryRateLimiter(maxRequests = 10, windowSeconds = 60): MemoryRateLimiter {
  const cacheKey = `${maxRequests}:${windowSeconds}`;
  let limiter = globalThis.memoryRateLimiters?.get(cacheKey);
  if (!limiter) {
    limiter = new MemoryRateLimiter(maxRequests, windowSeconds);
    globalThis.memoryRateLimiters?.set(cacheKey, limiter);
  }
  return limiter;
}

/**
 * Factory returning the active IRateLimiter instance.
 * Automatically chooses Upstash if configured in environment, otherwise falls back to MemoryRateLimiter.
 */
export function getRateLimiter(maxRequests = 10, windowSeconds = 60): IRateLimiter {
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (isValidUpstashConfig(upstashUrl, upstashToken)) {
    return new UpstashRedisRateLimiter(upstashUrl!, upstashToken!, maxRequests, windowSeconds);
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'FATAL: Distributed rate limiter is unconfigured in production. ' +
      'UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set to prevent abuse across serverless instances.'
    );
  }

  return getMemoryRateLimiter(maxRequests, windowSeconds);
}

