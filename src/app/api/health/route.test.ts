import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

vi.mock('@/lib/db/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/db/scoped-queries', () => ({
  checkVectorSearchHealth: vi.fn().mockResolvedValue(true),
}));

vi.mock('mongoose', () => {
  return {
    default: {
      Types: {
        ObjectId: vi.fn().mockImplementation(() => '000000000000000000000001'),
      },
      connection: {
        readyState: 1,
        db: {
          admin: () => ({
            ping: async () => ({ ok: 1 }),
          }),
        },
      },
    },
  };
});

describe('/api/health route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.HEALTH_CHECK_TOKEN = 'test-health-token-secret-12345';
    process.env.GEMINI_API_KEY = 'real-gemini-api-key-test';
  });

  it('rejects unauthenticated requests with 401 Unauthorized', async () => {
    const req = new NextRequest('http://localhost:3000/api/health');
    const res = await GET(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: 'Unauthorized' });
  });

  it('rejects invalid token with 401 Unauthorized', async () => {
    const req = new NextRequest('http://localhost:3000/api/health', {
      headers: {
        Authorization: 'Bearer wrong-token',
      },
    });
    const res = await GET(req);

    expect(res.status).toBe(401);
  });

  it('returns ok flags without leaking any secrets when valid bearer token is provided', async () => {
    const req = new NextRequest('http://localhost:3000/api/health', {
      headers: {
        Authorization: 'Bearer test-health-token-secret-12345',
      },
    });
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      status: 'ok',
      database: true,
      vectorIndex: true,
      geminiConfig: true,
    });

    // Verify response contains NO keys, secrets or strings
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('test-health-token-secret-12345');
    expect(serialized).not.toContain('real-gemini-api-key-test');
  });

  it('accepts valid query parameter token as alternative', async () => {
    const req = new NextRequest('http://localhost:3000/api/health?token=test-health-token-secret-12345');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });
});
