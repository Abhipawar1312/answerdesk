import 'server-only';
import mongoose from 'mongoose';
import { embed, embedMany, APICallError, NoSuchModelError } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
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

/**
 * Classifies AI SDK errors strictly using typed error fields (statusCode, responseBody/data, isRetryable)
 * rather than arbitrary message text.
 * Never leaks upstream error text or stack traces to callers; maps every error to a fixed friendly message.
 */
export function classifyAIError(err: unknown): ClassifiedAIError {
  if (APICallError.isInstance(err)) {
    const statusCode = err.statusCode;

    // 1. Model Not Found: HTTP 404
    if (statusCode === 404) {
      console.error(`[AI Model Error] Status: 404, Model: ${EMBEDDING_CONFIG.model}`);
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
        console.error(`[AI Daily Quota] Status: ${statusCode}`);
        return {
          friendlyMessage: 'The daily AI quota has been reached. Please try again tomorrow.',
          isDailyQuota: true,
          isModelNotFound: false,
          isRateLimit: false,
        };
      }

      console.error(`[AI Rate Limit] Status: ${statusCode}`);
      return {
        friendlyMessage:
          'The AI embedding service is temporarily busy due to rate limits. Please try again in a few moments.',
        isDailyQuota: false,
        isModelNotFound: false,
        isRateLimit: true,
      };
    }

    // 3. HTTP 503 / Service Unavailable / isRetryable
    if (statusCode === 503 || err.isRetryable) {
      console.error(`[AI Service Unavailable] Status: ${statusCode || 503}`);
      return {
        friendlyMessage:
          'The AI embedding service is temporarily unavailable. Please try again shortly.',
        isDailyQuota: false,
        isModelNotFound: false,
        isRateLimit: true,
      };
    }

    console.error(`[AI API Error] Status: ${statusCode || 'unknown'}`);
    return {
      friendlyMessage: 'An unexpected error occurred while communicating with the AI service.',
      isDailyQuota: false,
      isModelNotFound: false,
      isRateLimit: false,
    };
  }

  if (NoSuchModelError.isInstance(err)) {
    console.error(`[AI Model Error] Status: 404, Model: ${err.modelId || EMBEDDING_CONFIG.model}`);
    return {
      friendlyMessage: 'The configured AI model is currently unavailable.',
      isDailyQuota: false,
      isModelNotFound: true,
      isRateLimit: false,
    };
  }

  console.error('[AI Unexpected Non-API Error]');
  return {
    friendlyMessage: 'An unexpected error occurred while generating embeddings.',
    isDailyQuota: false,
    isModelNotFound: false,
    isRateLimit: false,
  };
}

/**
 * Checks and records global token consumption against the shared 30K TPM budget.
 * Throws immediately if the database is not connected.
 * Refuses if recent token consumption exceeds 60% of 30,000 (18,000 tokens).
 * Writes the usage entry BEFORE the batch API call so parallel requests see it immediately.
 */
export async function checkAndRecordGlobalTokenBudget(estimatedTokens: number): Promise<void> {
  if (mongoose.connection.readyState !== 1) {
    throw new Error('Database connection is required to evaluate global token budget.');
  }

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
      'The AI indexing service is temporarily busy due to high demand. Please try again in a minute.',
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

      const classified = classifyAIError(err);

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
    'The AI embedding service is temporarily busy due to rate limits. Please try again in a few moments.',
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
 */
export async function embedQuery(queryText: string): Promise<number[]> {
  const trimmed = queryText.trim();
  if (!trimmed) {
    throw new EmbeddingServiceError('Query text cannot be empty for embedding.');
  }

  const model = googleAI.textEmbeddingModel(EMBEDDING_CONFIG.model);
  const queryTokens = estimateTokensConservative(trimmed);

  const result = await executeWithRetry(queryTokens, async () => {
    return await embed({
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
  });

  if (result.embedding.length !== EMBEDDING_CONFIG.dimensions) {
    throw new EmbeddingServiceError(
      `Invalid query embedding dimension: expected ${EMBEDDING_CONFIG.dimensions}, received ${result.embedding.length}`
    );
  }

  return result.embedding;
}
