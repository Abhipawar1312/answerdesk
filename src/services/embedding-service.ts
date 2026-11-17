import 'server-only';
import { embed, embedMany, APICallError, NoSuchModelError } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { connectDB } from '@/lib/db/mongoose';
import { env } from '@/lib/env';
import { EMBEDDING_CONFIG, INGESTION_LIMITS } from '@/lib/constants';
import { GlobalTokenUsage } from '@/models/GlobalTokenUsage';
import { estimateTokensConservative } from '@/services/text-chunker';

export class EmbeddingServiceError extends Error {
  readonly isRateLimit: boolean;
  readonly isDailyQuota: boolean;
  readonly isModelNotFound: boolean;

  constructor(
    message: string,
    isRateLimit = false,
    isDailyQuota = false,
    isModelNotFound = false
  ) {
    super(message);
    this.name = 'EmbeddingServiceError';
    this.isRateLimit = isRateLimit;
    this.isDailyQuota = isDailyQuota;
    this.isModelNotFound = isModelNotFound;
  }
}

/**
 * Configure the Google AI provider using the standardized GEMINI_API_KEY.
 */
export const googleAI = createGoogleGenerativeAI({
  apiKey: env.GEMINI_API_KEY,
});

const BATCH_SIZE = EMBEDDING_CONFIG.batchSize; // 8 chunks per API call to protect 30K TPM
const BACKOFF_DELAYS = [3000, 6000, 12000]; // 3s, 6s, 12s backoff for per-minute rate limits

export interface ClassifiedAIError {
  friendlyMessage: string;
  isDailyQuota: boolean;
  isModelNotFound: boolean;
  isRateLimit: boolean;
}

function extractErrorIdentifier(err: unknown): { name: string; code: string } {
  if (!err || typeof err !== 'object') {
    return { name: 'UnknownError', code: 'UNKNOWN' };
  }
  const e = err as { name?: string; code?: string; cause?: unknown };
  const name = String(e.name || 'Error');
  let code = String(e.code || '');
  if (!code && e.cause && typeof e.cause === 'object') {
    code = String((e.cause as { code?: string }).code || '');
  }
  return { name, code: code || 'UNKNOWN' };
}

function isNetworkOrTimeout(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; code?: string; message?: string; cause?: unknown };
  const name = String(e.name || '');
  const code = String(e.code || '');
  const msg = String(e.message || '').toLowerCase();

  if (
    name === 'AbortError' ||
    name === 'TimeoutError' ||
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'UND_ERR_CONNECT_TIMEOUT' ||
    code === 'ENOTFOUND' ||
    code === 'EAI_AGAIN' ||
    msg.includes('fetch failed') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('aborterror')
  ) {
    return true;
  }

  if (e.cause && typeof e.cause === 'object') {
    return isNetworkOrTimeout(e.cause);
  }

  return false;
}

/**
 * Classifies AI SDK and network errors strictly using typed error fields (statusCode, responseBody/data, isRetryable)
 * and network codes (fetch failed, ECONNRESET, ETIMEDOUT, AbortError).
 * Never leaks upstream error text, prompt text, or secrets; logs only step, error name, and error code.
 */
export function classifyAIError(err: unknown, step = 'ai-operation'): ClassifiedAIError {
  const { name, code } = extractErrorIdentifier(err);

  // Network and timeout errors (fetch failed, ECONNRESET, ETIMEDOUT, AbortError) -> retryable
  if (isNetworkOrTimeout(err)) {
    console.error(`[AI Error]: step=${step}, name=${name}, code=${code}`);
    return {
      friendlyMessage: 'Something went wrong. Please try again.',
      isDailyQuota: false,
      isModelNotFound: false,
      isRateLimit: true,
    };
  }

  if (APICallError.isInstance(err)) {
    const statusCode = err.statusCode;

    // 1. Model Not Found: HTTP 404
    if (statusCode === 404) {
      console.error(`[AI Error]: step=${step}, name=APICallError, code=404`);
      return {
        friendlyMessage: 'The configured AI model is currently unavailable.',
        isDailyQuota: false,
        isModelNotFound: true,
        isRateLimit: false,
      };
    }

    // 2. HTTP 429: Distinguish daily quota vs per-minute rate limit by quota metric in responseBody / data
    if (statusCode === 429) {
      const body =
        typeof err.responseBody === 'string'
          ? err.responseBody
          : JSON.stringify(err.data || '');

      const isDaily =
        body.includes('generate_requests_per_day') ||
        body.includes('GenerateRequestsPerDay') ||
        body.toLowerCase().includes('perday') ||
        body.toLowerCase().includes('per_day');

      if (isDaily) {
        console.error(`[AI Error]: step=${step}, name=APICallError, code=429_DAILY_QUOTA`);
        return {
          friendlyMessage: 'The daily AI quota has been reached. Please try again tomorrow.',
          isDailyQuota: true,
          isModelNotFound: false,
          isRateLimit: false,
        };
      }

      console.error(`[AI Error]: step=${step}, name=APICallError, code=429_RATE_LIMIT`);
      return {
        friendlyMessage: 'The assistant is temporarily busy. Please try again in a few moments.',
        isDailyQuota: false,
        isModelNotFound: false,
        isRateLimit: true,
      };
    }

    // 3. HTTP 503 / Service Unavailable / isRetryable
    if (statusCode === 503 || err.isRetryable) {
      console.error(`[AI Error]: step=${step}, name=APICallError, code=${statusCode || 503}`);
      return {
        friendlyMessage: 'The assistant is temporarily unavailable. Please try again shortly.',
        isDailyQuota: false,
        isModelNotFound: false,
        isRateLimit: true,
      };
    }

    console.error(`[AI Error]: step=${step}, name=APICallError, code=${statusCode || 'UNKNOWN'}`);
    return {
      friendlyMessage: 'Something went wrong while processing your request. Please try again.',
      isDailyQuota: false,
      isModelNotFound: false,
      isRateLimit: false,
    };
  }

  if (NoSuchModelError.isInstance(err)) {
    console.error(`[AI Error]: step=${step}, name=NoSuchModelError, code=404`);
    return {
      friendlyMessage: 'The configured AI model is currently unavailable.',
      isDailyQuota: false,
      isModelNotFound: true,
      isRateLimit: false,
    };
  }

  console.error(`[AI Error]: step=${step}, name=${name}, code=${code}`);
  return {
    friendlyMessage: 'Something went wrong. Please try again.',
    isDailyQuota: false,
    isModelNotFound: false,
    isRateLimit: false,
  };
}

/**
 * Checks and records global token consumption against the shared 30K TPM budget.
 * Connects to database if needed and never throws simply because readyState is not yet 1.
 * Refuses if recent token consumption exceeds 60% of 30,000 (18,000 tokens).
 * Writes the usage entry BEFORE the batch API call so parallel requests see it immediately.
 */
export async function checkAndRecordGlobalTokenBudget(estimatedTokens: number): Promise<void> {
  // Await cached connectDB() to ensure database connection is established
  await connectDB();

  const windowStart = new Date(Date.now() - 60 * 1000);
  const result = await GlobalTokenUsage.aggregate([
    { $match: { createdAt: { $gte: windowStart } } },
    { $group: { _id: null, total: { $sum: '$tokens' } } },
  ]);

  const currentUsage = result[0]?.total ?? 0;
  const threshold =
    INGESTION_LIMITS.globalTpmBudget * INGESTION_LIMITS.globalTpmThresholdPercent; // 18,000

  if (currentUsage + estimatedTokens > threshold) {
    throw new EmbeddingServiceError(
      'The assistant is temporarily busy due to high demand. Please try again in a minute.',
      true
    );
  }

  // Book usage immediately before executing the batch API call
  await GlobalTokenUsage.create({
    tokens: estimatedTokens,
    createdAt: new Date(),
  });
}

/**
 * Executes an embedding operation with exponential backoff (3s, 6s, 12s) for per-minute rate limits.
 * Books tokens in GlobalTokenUsage before every attempt, including retries.
 * Fails fast immediately if daily quota is reached or model is not found.
 */
async function executeWithRetry<T>(batchTokens: number, fn: () => Promise<T>): Promise<T> {
  let attempt = 0;

  while (attempt <= BACKOFF_DELAYS.length) {
    try {
      // Book tokens before each attempt (initial call and any retry calls)
      if (batchTokens > 0) {
        await checkAndRecordGlobalTokenBudget(batchTokens);
      }
      return await fn();
    } catch (err: unknown) {
      if (err instanceof EmbeddingServiceError) {
        throw err;
      }

      const classified = classifyAIError(err, 'document-embedding');

      // Daily quota & model not found must FAIL FAST - never retried
      if (classified.isDailyQuota || classified.isModelNotFound) {
        throw new EmbeddingServiceError(
          classified.friendlyMessage,
          false,
          classified.isDailyQuota,
          classified.isModelNotFound
        );
      }

      // If not retryable or retries exhausted, throw
      if (attempt >= BACKOFF_DELAYS.length || !classified.isRateLimit) {
        throw new EmbeddingServiceError(classified.friendlyMessage, classified.isRateLimit);
      }

      // Exponential backoff: 3s -> 6s -> 12s (plus random jitter)
      const baseDelay = BACKOFF_DELAYS[attempt];
      const jitter = Math.random() * 300;
      await new Promise((resolve) => setTimeout(resolve, baseDelay + jitter));
      attempt++;
    }
  }

  throw new EmbeddingServiceError(
    'The assistant is temporarily busy. Please try again in a few moments.',
    true
  );
}

/**
 * Generates 768-dimensional embeddings for an array of document chunks in batches of 8.
 * Uses taskType: 'RETRIEVAL_DOCUMENT' optimized for stored knowledge base text.
 * Paces batches with a 1,500ms delay to prevent bursting against Google's 30K TPM limiter.
 */
export async function embedDocumentChunks(texts: string[]): Promise<number[][]> {
  if (!texts || texts.length === 0) {
    return [];
  }

  const model = googleAI.textEmbeddingModel(EMBEDDING_CONFIG.model);
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    // Inter-batch spacing: 1,500ms delay between consecutive batches
    if (i > 0 && EMBEDDING_CONFIG.interBatchDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, EMBEDDING_CONFIG.interBatchDelayMs));
    }

    const batch = texts.slice(i, i + BATCH_SIZE);
    const batchTokens = batch.reduce((acc, t) => acc + estimateTokensConservative(t), 0);

    const result = await executeWithRetry(batchTokens, async () => {
      return await embedMany({
        model,
        values: batch,
        dimensions: EMBEDDING_CONFIG.dimensions, // 768
        maxRetries: 0, // Disable internal SDK retries so our custom backoff manages timing
        providerOptions: {
          google: {
            taskType: 'RETRIEVAL_DOCUMENT',
          },
        },
      });
    });

    for (const emb of result.embeddings) {
      if (emb.length !== EMBEDDING_CONFIG.dimensions) {
        throw new EmbeddingServiceError(
          `Invalid embedding dimension: expected ${EMBEDDING_CONFIG.dimensions}, received ${emb.length}`
        );
      }
      allEmbeddings.push(emb);
    }
  }

  return allEmbeddings;
}

/**
 * Generates a 768-dimensional embedding for a single search/chat question.
 * Uses taskType: 'RETRIEVAL_QUERY' optimized for search queries.
 * Retries ONCE with a short 500ms delay on network/timeout/rate-limit failures.
 */
export async function embedQuery(queryText: string): Promise<number[]> {
  const trimmed = queryText.trim();
  if (!trimmed) {
    throw new EmbeddingServiceError('Query text cannot be empty.');
  }

  const model = googleAI.textEmbeddingModel(EMBEDDING_CONFIG.model);
  const queryTokens = estimateTokensConservative(trimmed);

  let attempt = 0;
  while (true) {
    try {
      if (queryTokens > 0) {
        await checkAndRecordGlobalTokenBudget(queryTokens);
      }

      const result = await embed({
        model,
        value: trimmed,
        dimensions: EMBEDDING_CONFIG.dimensions, // 768
        maxRetries: 0, // Disable internal SDK retries
        providerOptions: {
          google: {
            taskType: 'RETRIEVAL_QUERY',
          },
        },
      });

      if (result.embedding.length !== EMBEDDING_CONFIG.dimensions) {
        throw new EmbeddingServiceError(
          `Invalid query embedding dimension: expected ${EMBEDDING_CONFIG.dimensions}, received ${result.embedding.length}`
        );
      }

      return result.embedding;
    } catch (err: unknown) {
      if (err instanceof EmbeddingServiceError && !err.isRateLimit) {
        throw err;
      }

      const classified = classifyAIError(err, 'query-embedding');

      // Retry ONCE with a short delay (500ms) for retryable errors (rate limits, timeouts, network)
      if (attempt === 0 && classified.isRateLimit) {
        attempt++;
        await new Promise((resolve) => setTimeout(resolve, 500));
        continue;
      }

      throw new EmbeddingServiceError(
        classified.friendlyMessage,
        classified.isRateLimit,
        classified.isDailyQuota,
        classified.isModelNotFound
      );
    }
  }
}
