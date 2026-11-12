import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { APICallError, NoSuchModelError } from 'ai';
import * as aiModule from 'ai';
import {
  embedDocumentChunks,
  embedQuery,
  EmbeddingServiceError,
  checkAndRecordGlobalTokenBudget,
} from './embedding-service';
import { GlobalTokenUsage } from '@/models/GlobalTokenUsage';

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return {
    ...actual,
    embed: vi.fn(),
    embedMany: vi.fn(),
  };
});

vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: vi.fn(() => ({
    textEmbeddingModel: vi.fn((modelId: string) => ({ modelId })),
  })),
}));

describe('Embedding Service', () => {
  let mongoServer: MongoMemoryServer;
  const dummy768Vector = new Array(768).fill(0.123);

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    await GlobalTokenUsage.deleteMany({});
  });

  describe('Global Token Budget & DB Connection Guard (Item 3)', () => {
    it('throws immediately when database is not connected', async () => {
      await mongoose.disconnect();

      await expect(checkAndRecordGlobalTokenBudget(500)).rejects.toThrow(
        'Database connection is required to evaluate global token budget.'
      );

      await mongoose.connect(mongoServer.getUri());
    });

    it('refuses embedding requests when rolling 60-second usage exceeds 60% of 30,000 (18,000 tokens)', async () => {
      await GlobalTokenUsage.create({
        tokens: 17900,
        createdAt: new Date(),
      });

      await expect(checkAndRecordGlobalTokenBudget(200)).rejects.toThrow(
        'The AI indexing service is temporarily busy due to high demand. Please try again in a minute.'
      );
    });

    it('books tokens in GlobalTokenUsage before API calls and records retried batches again', async () => {
      // Mock setTimeout to execute immediately without stalling Mongo heartbeats
      const setTimeoutSpy = vi
        .spyOn(global, 'setTimeout')
        .mockImplementation((fn: unknown) => {
          if (typeof fn === 'function') fn();
          return 0 as unknown as NodeJS.Timeout;
        });

      const rateLimitError = new APICallError({
        message: '429 Rate limit',
        url: 'https://generativelanguage.googleapis.com',
        requestBodyValues: {},
        statusCode: 429,
        responseBody: JSON.stringify({ error: { message: 'Quota exceeded for requests per minute' } }),
        isRetryable: true,
      });

      // Attempt 1 fails with 429, Attempt 2 succeeds
      vi.mocked(aiModule.embedMany)
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce({
          embeddings: [dummy768Vector],
          usage: undefined,
          warnings: [],
        } as unknown as Awaited<ReturnType<typeof aiModule.embedMany>>);

      const result = await embedDocumentChunks(['Short test FAQ sentence for retry booking.']);
      expect(result.length).toBe(1);

      // Both initial attempt AND retry attempt must be booked in GlobalTokenUsage
      const usageEntries = await GlobalTokenUsage.find({});
      expect(usageEntries.length).toBe(2);

      setTimeoutSpy.mockRestore();
    });
  });

  describe('embedDocumentChunks', () => {
    it('generates 768-dimensional embeddings using RETRIEVAL_DOCUMENT with maxRetries: 0', async () => {
      vi.mocked(aiModule.embedMany).mockResolvedValueOnce({
        embeddings: [dummy768Vector],
        usage: undefined,
        warnings: [],
      } as unknown as Awaited<ReturnType<typeof aiModule.embedMany>>);

      const result = await embedDocumentChunks(['Sample FAQ text to embed.']);

      expect(result.length).toBe(1);
      expect(result[0].length).toBe(768);
      expect(aiModule.embedMany).toHaveBeenCalledWith(
        expect.objectContaining({
          dimensions: 768,
          maxRetries: 0,
          providerOptions: {
            google: {
              taskType: 'RETRIEVAL_DOCUMENT',
            },
          },
        })
      );
    });

    it('batches chunks into slices of 8 to protect 30K TPM free tier', async () => {
      const setTimeoutSpy = vi
        .spyOn(global, 'setTimeout')
        .mockImplementation((fn: unknown) => {
          if (typeof fn === 'function') fn();
          return 0 as unknown as NodeJS.Timeout;
        });

      const chunks = Array.from({ length: 18 }, (_, i) => `Chunk paragraph ${i}`);

      vi.mocked(aiModule.embedMany)
        .mockResolvedValueOnce({
          embeddings: new Array(8).fill(dummy768Vector),
          usage: undefined,
          warnings: [],
        } as unknown as Awaited<ReturnType<typeof aiModule.embedMany>>)
        .mockResolvedValueOnce({
          embeddings: new Array(8).fill(dummy768Vector),
          usage: undefined,
          warnings: [],
        } as unknown as Awaited<ReturnType<typeof aiModule.embedMany>>)
        .mockResolvedValueOnce({
          embeddings: new Array(2).fill(dummy768Vector),
          usage: undefined,
          warnings: [],
        } as unknown as Awaited<ReturnType<typeof aiModule.embedMany>>);

      const result = await embedDocumentChunks(chunks);

      expect(result.length).toBe(18);
      expect(aiModule.embedMany).toHaveBeenCalledTimes(3);

      setTimeoutSpy.mockRestore();
    });

    describe('error classification with typed AI SDK error fields (Item 2)', () => {
      it('fails fast immediately on daily-quota error (PerDay metric in responseBody) without retrying', async () => {
        const dailyQuotaError = new APICallError({
          message: 'Upstream raw error text with internal parameters',
          url: 'https://generativelanguage.googleapis.com',
          requestBodyValues: {},
          statusCode: 429,
          responseBody: JSON.stringify({
            error: {
              code: 429,
              message: 'Quota exceeded for metric generate_requests_per_day on model gemini-embedding-001',
              status: 'RESOURCE_EXHAUSTED',
            },
          }),
        });

        vi.mocked(aiModule.embedMany).mockRejectedValue(dailyQuotaError);

        const promise = embedDocumentChunks(['Daily quota test text']);

        await expect(promise).rejects.toThrow(
          'The daily AI quota has been reached. Please try again tomorrow.'
        );

        // Fail-fast verification: called only ONCE (zero retries)
        expect(aiModule.embedMany).toHaveBeenCalledTimes(1);
      });

      it('fails fast immediately on model not found (404 statusCode) without retrying', async () => {
        const notFoundError = new APICallError({
          message: 'Model not found upstream',
          url: 'https://generativelanguage.googleapis.com',
          requestBodyValues: {},
          statusCode: 404,
          responseBody: JSON.stringify({ error: { code: 404, message: 'models/gemini-embedding-001 not found' } }),
        });

        vi.mocked(aiModule.embedMany).mockRejectedValue(notFoundError);

        const promise = embedDocumentChunks(['Model not found test']);

        await expect(promise).rejects.toThrow(
          'The configured AI model is currently unavailable.'
        );

        expect(aiModule.embedMany).toHaveBeenCalledTimes(1);
      });

      it('fails fast immediately when NoSuchModelError is thrown', async () => {
        const noSuchModel = new NoSuchModelError({
          modelId: 'gemini-embedding-001',
          modelType: 'embeddingModel',
        });

        vi.mocked(aiModule.embedMany).mockRejectedValue(noSuchModel);

        const promise = embedDocumentChunks(['No such model test']);

        await expect(promise).rejects.toThrow(
          'The configured AI model is currently unavailable.'
        );

        expect(aiModule.embedMany).toHaveBeenCalledTimes(1);
      });

      it('sanitizes error messages and throws clean user-facing error without leaking keys or raw text', async () => {
        const setTimeoutSpy = vi
          .spyOn(global, 'setTimeout')
          .mockImplementation((fn: unknown) => {
            if (typeof fn === 'function') fn();
            return 0 as unknown as NodeJS.Timeout;
          });

        const leakyError = new APICallError({
          message: 'Call failed with key=AIzaSyB123SecretKey456 on model gemini-embedding-001: 429 quota exceeded',
          url: 'https://generativelanguage.googleapis.com/v1beta/models?key=AIzaSyB123SecretKey456',
          requestBodyValues: {},
          statusCode: 429,
          responseBody: 'Rate limit hit for key AIzaSyB123SecretKey456',
          isRetryable: true,
        });

        vi.mocked(aiModule.embedMany).mockRejectedValue(leakyError);

        let caughtError: unknown = null;
        try {
          await embedDocumentChunks(['Test chunk']);
        } catch (err) {
          caughtError = err;
        }

        expect(caughtError).toBeInstanceOf(EmbeddingServiceError);
        const error = caughtError as EmbeddingServiceError;
        expect(error.message).not.toContain('AIzaSyB123SecretKey456');
        expect(error.message).toContain('temporarily busy due to rate limits');

        setTimeoutSpy.mockRestore();
      });
    });

    it('returns empty array when input texts are empty', async () => {
      const result = await embedDocumentChunks([]);
      expect(result).toEqual([]);
      expect(aiModule.embedMany).not.toHaveBeenCalled();
    });
  });

  describe('embedQuery', () => {
    it('generates 768-dimensional embedding for single query using RETRIEVAL_QUERY', async () => {
      vi.mocked(aiModule.embed).mockResolvedValueOnce({
        embedding: dummy768Vector,
        usage: undefined,
        warnings: [],
      } as unknown as Awaited<ReturnType<typeof aiModule.embed>>);

      const result = await embedQuery('How do I reset my password?');

      expect(result.length).toBe(768);
      expect(aiModule.embed).toHaveBeenCalledWith(
        expect.objectContaining({
          dimensions: 768,
          maxRetries: 0,
          providerOptions: {
            google: {
              taskType: 'RETRIEVAL_QUERY',
            },
          },
        })
      );
    });

    it('throws error when query text is empty or whitespace', async () => {
      await expect(embedQuery('   ')).rejects.toThrow(
        'Query text cannot be empty for embedding.'
      );
    });
  });
});
