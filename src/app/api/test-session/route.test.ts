import { describe, it, expect, beforeEach, vi } from 'vitest';
import { POST, GET } from './route';

vi.mock('@/lib/db/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/models/User', () => ({
  User: {
    findOne: vi.fn().mockResolvedValue({
      _id: '6aed816c07d389fb501e411b',
      email: 'test@example.com',
      name: 'Test Owner',
    }),
    create: vi.fn(),
  },
}));

vi.mock('@/models/Workspace', () => ({
  Workspace: {
    findOne: vi.fn().mockResolvedValue({
      _id: '6aed816c07d389fb501e411c',
      slug: 'abc',
      ownerId: '6aed816c07d389fb501e411b',
    }),
    updateOne: vi.fn(),
  },
}));

const { mockCookiesSet } = vi.hoisted(() => ({
  mockCookiesSet: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    set: mockCookiesSet,
  }),
}));

vi.mock('next-auth/jwt', () => ({
  encode: vi.fn().mockResolvedValue('mock_encrypted_jwt_token'),
}));

describe('Test Session Route (/api/test-session)', () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...origEnv };
    vi.clearAllMocks();
  });

  it('permanently returns 404 in production mode (NODE_ENV=production)', async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    process.env.ENABLE_TEST_LOGIN = 'true';
    process.env.AUTH_SECRET = 'secret_123';

    const req = new Request('http://localhost:3000/api/test-session', {
      method: 'POST',
      body: JSON.stringify({ email: 'attacker@example.com' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe('Not found');

    const getRes = await GET();
    expect(getRes.status).toBe(404);
  });

  it('returns 404 when ENABLE_TEST_LOGIN flag is missing or false', async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'development';
    delete process.env.ENABLE_TEST_LOGIN;

    const req = new Request('http://localhost:3000/api/test-session', {
      method: 'POST',
      body: JSON.stringify({ email: 'test@example.com' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it('creates test session and sets cookie when enabled in test/dev environment', async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'test';
    process.env.ENABLE_TEST_LOGIN = 'true';
    process.env.AUTH_SECRET = 'secret_test_123';

    const req = new Request('http://localhost:3000/api/test-session', {
      method: 'POST',
      body: JSON.stringify({ email: 'test@example.com', workspaceSlug: 'abc' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.token).toBe('mock_encrypted_jwt_token');
    expect(mockCookiesSet).toHaveBeenCalledWith(
      'authjs.session-token',
      'mock_encrypted_jwt_token',
      expect.objectContaining({ httpOnly: true, path: '/' })
    );
  });
});
