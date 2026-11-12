import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Workspace } from '@/models/Workspace';
import { POST } from './route';
import * as embeddingModule from '@/services/embedding-service';
import * as aiModule from 'ai';
import {
  createWorkspaceDocument,
  updateWorkspaceDocumentStatus,
  insertWorkspaceDocumentChunks,
  getWorkspaceMessages,
  createWorkspaceConversation,
} from '@/lib/db/scoped-queries';
import { getRateLimiter } from '@/lib/rate-limiter';

vi.mock('@/lib/db/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return {
    ...actual,
    streamText: vi.fn(),
  };
});

vi.mock('@/services/embedding-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/embedding-service')>();
  return {
    ...actual,
    embedQuery: vi.fn(),
  };
});

describe('Public Chat API Route (/api/chat/public)', () => {
  let mongoServer: MongoMemoryServer;
  const ownerId = new mongoose.Types.ObjectId();
  let workspaceId: mongoose.Types.ObjectId;
  const dummyVector = new Array(768).fill(0.05);

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);

    const ws = await Workspace.create({
      name: 'Public Test WS',
      slug: 'public-test',
      ownerId,
      plan: 'free',
      monthlyMessageCount: 0,
      messageLimit: 10,
      allowedOrigins: ['https://allowed-domain.com'],
    });
    workspaceId = ws._id;
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset all memory rate limiters
    if (globalThis.memoryRateLimiters) {
      for (const lim of globalThis.memoryRateLimiters.values()) {
        lim.resetAll();
      }
    }

    // Default: embedQuery returns 768-dim vector
    vi.mocked(embeddingModule.embedQuery).mockResolvedValue(dummyVector);

    // Default: streamText returns mock stream
    vi.mocked(aiModule.streamText).mockReturnValue({
      textStream: (async function* () {
        yield 'Here is ';
        yield 'the answer.';
      })(),
    } as unknown as ReturnType<typeof aiModule.streamText>);

    // Clear test collections
    await mongoose.connection.collection('sourcedocuments').deleteMany({});
    await mongoose.connection.collection('sourcedocumentchunks').deleteMany({});
    await mongoose.connection.collection('conversations').deleteMany({});
    await mongoose.connection.collection('messages').deleteMany({});
    await Workspace.updateOne(
      { _id: workspaceId },
      {
        $set: {
          monthlyMessageCount: 0,
          messageLimit: 10,
          dailyMessageCount: 0,
          dailyMessageCap: 50,
          dailyMessageDate: new Date().toISOString().slice(0, 10),
        },
      }
    );
  });

  it('rejects unknown workspace with 404', async () => {
    const req = new Request('http://localhost/api/chat/public', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceSlug: 'does-not-exist',
        message: 'Hello',
        visitorId: 'visitor-123',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe('Workspace not found.');
  });

  it('rejects requests from disallowed origins with 403', async () => {
    const req = new Request('http://localhost/api/chat/public', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://evil-attacker.com',
      },
      body: JSON.stringify({
        workspaceSlug: 'public-test',
        message: 'Hello',
        visitorId: 'visitor-123',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain('Requests from this domain are not permitted');
  });

  it('allows requests from permitted origins', async () => {
    const req = new Request('http://localhost/api/chat/public', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://allowed-domain.com',
      },
      body: JSON.stringify({
        workspaceSlug: 'public-test',
        message: 'What are your hours?',
        visitorId: 'visitor-allowed',
      }),
    });

    const res = await POST(req);
    // Returns 200 SSE stream
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/event-stream');
  });

  it('enforces monthly plan message limit', async () => {
    // Set message limit to 2 and current count to 2
    await Workspace.updateOne(
      { _id: workspaceId },
      { $set: { monthlyMessageCount: 2, messageLimit: 2 } }
    );

    const req = new Request('http://localhost/api/chat/public', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://allowed-domain.com',
      },
      body: JSON.stringify({
        workspaceSlug: 'public-test',
        message: 'Can I ask something?',
        visitorId: 'visitor-quota-test',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(429);
    const data = await res.json();
    expect(data.error).toContain('reached its monthly message limit');
  });

  it('handles unanswered queries without calling Gemini generative model', async () => {
    // No documents in DB -> retrieval returns score 0 -> isUnanswered = true
    const req = new Request('http://localhost/api/chat/public', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://allowed-domain.com',
      },
      body: JSON.stringify({
        workspaceSlug: 'public-test',
        message: 'Completely off topic question',
        visitorId: 'visitor-offtopic',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const text = await res.text();
    expect(text).toContain('"isUnanswered":true');
    expect(text).toContain('I do not have enough information in the knowledge base');

    // Generative model should NOT have been invoked
    expect(aiModule.streamText).not.toHaveBeenCalled();

    // Deflected ("I do not know") answers do NOT increment monthlyMessageCount
    const ws = await Workspace.findById(workspaceId);
    expect(ws?.monthlyMessageCount).toBe(0);
  });

  it('streams answered responses and saves message with citations', async () => {
    // 1. Seed ready document with matching chunk
    const doc = await createWorkspaceDocument(workspaceId, {
      title: 'Pricing Policy',
      fileType: 'faq',
      uploadedBy: ownerId,
    });
    await updateWorkspaceDocumentStatus(workspaceId, doc._id, { status: 'ready' });
    await insertWorkspaceDocumentChunks(workspaceId, doc._id, [
      {
        chunkIndex: 0,
        content: 'Pricing is $20 per seat per month.',
        embedding: dummyVector,
        tokenCount: 10,
        metadata: { sourceTitle: 'Pricing Policy' },
      },
    ]);

    const req = new Request('http://localhost/api/chat/public', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://allowed-domain.com',
      },
      body: JSON.stringify({
        workspaceSlug: 'public-test',
        message: 'How much does it cost?',
        visitorId: 'visitor-happy',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const bodyText = await res.text();
    expect(bodyText).toContain('citations');
    expect(bodyText).toContain('Pricing Policy');
    expect(bodyText).toContain('Here is ');
    expect(bodyText).toContain('the answer.');

    // Verify messages saved in DB
    const convs = await mongoose.connection.collection('conversations').find({ workspaceId }).toArray();
    expect(convs.length).toBe(1);

    const msgs = await getWorkspaceMessages(workspaceId, convs[0]._id.toString());
    expect(msgs.length).toBe(2);
    expect(msgs[0].role).toBe('user');
    expect(msgs[1].role).toBe('assistant');
    expect(msgs[1].citations?.length).toBe(1);
    expect(msgs[1].citations?.[0].sourceTitle).toBe('Pricing Policy');
  });

  it('blocks conversation ID spoofing with 403 when visitorId does not match', async () => {
    // Create conversation owned by legitimate visitor 'visitor-real'
    const legitimateConv = await createWorkspaceConversation(workspaceId, {
      visitorId: 'visitor-real',
      isTest: false,
    });

    // Attacker tries to inject message with different visitorId 'visitor-attacker'
    const attackReq = new Request('http://localhost/api/chat/public', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://allowed-domain.com',
      },
      body: JSON.stringify({
        workspaceSlug: 'public-test',
        message: 'Malicious spoof attempt',
        visitorId: 'visitor-attacker',
        conversationId: legitimateConv._id.toString(),
      }),
    });

    const res = await POST(attackReq);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain('Invalid conversation credentials');
  });

  it('hides citation snippets when workspace has hideCitationsInWidget enabled', async () => {
    await Workspace.updateOne({ _id: workspaceId }, { $set: { hideCitationsInWidget: true } });

    const doc = await createWorkspaceDocument(workspaceId, {
      title: 'Secret Internal Handbook',
      fileType: 'faq',
      uploadedBy: ownerId,
    });
    await updateWorkspaceDocumentStatus(workspaceId, doc._id, { status: 'ready' });
    await insertWorkspaceDocumentChunks(workspaceId, doc._id, [
      {
        chunkIndex: 0,
        content: 'Confidential secret password is supersecret123.',
        embedding: dummyVector,
        tokenCount: 10,
        metadata: { sourceTitle: 'Secret Internal Handbook' },
      },
    ]);

    const req = new Request('http://localhost/api/chat/public', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://allowed-domain.com',
      },
      body: JSON.stringify({
        workspaceSlug: 'public-test',
        message: 'Tell me the secret password',
        visitorId: 'visitor-safe',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const bodyText = await res.text();
    expect(bodyText).toContain('Secret Internal Handbook');
    // Ensure raw textSnippet is empty and sensitive snippet was NOT leaked
    expect(bodyText).not.toContain('supersecret123');
  });

  it('rejects requests when workspace daily cap is reached with a 429 daily message limit notice', async () => {
    // Set daily cap to 1 and fill it
    await Workspace.updateOne(
      { _id: workspaceId },
      {
        $set: {
          dailyMessageCap: 1,
          dailyMessageCount: 1,
          dailyMessageDate: new Date().toISOString().slice(0, 10),
        },
      }
    );

    const req = new Request('http://localhost/api/chat/public', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://allowed-domain.com',
      },
      body: JSON.stringify({
        workspaceSlug: 'public-test',
        message: 'Are you open today?',
        visitorId: 'visitor-daily',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toContain('daily message limit');
  });

  it('refused-origin requests do NOT increment monthlyMessageCount', async () => {
    await Workspace.updateOne({ _id: workspaceId }, { $set: { monthlyMessageCount: 3 } });

    const req = new Request('http://localhost/api/chat/public', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://disallowed-domain.com',
      },
      body: JSON.stringify({
        workspaceSlug: 'public-test',
        message: 'Hello from unauthorized origin',
        visitorId: 'visitor-origin-fail',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);

    const ws = await Workspace.findById(workspaceId).lean();
    expect(ws?.monthlyMessageCount).toBe(3);
  });

  it('rate-limited requests do NOT increment monthlyMessageCount', async () => {
    await Workspace.updateOne({ _id: workspaceId }, { $set: { monthlyMessageCount: 3, messageLimit: 10 } });

    // Trigger visitor rate limit (10 rapid requests per min)
    for (let i = 0; i < 10; i++) {
      const limiter = getRateLimiter(10, 60);
      await limiter.limit('vis:public-test:rapid-visitor');
    }

    const req = new Request('http://localhost/api/chat/public', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://allowed-domain.com',
      },
      body: JSON.stringify({
        workspaceSlug: 'public-test',
        message: 'Eleventh rapid request',
        visitorId: 'rapid-visitor',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(429);

    const ws = await Workspace.findById(workspaceId).lean();
    expect(ws?.monthlyMessageCount).toBe(3);
  });

  it('requests that failed before an answer do NOT increment monthlyMessageCount', async () => {
    await Workspace.updateOne({ _id: workspaceId }, { $set: { monthlyMessageCount: 3 } });

    // Simulate embedding failure (throws before vector search or answer)
    vi.mocked(embeddingModule.embedQuery).mockRejectedValueOnce(
      new Error('Embedding API temporary network fault')
    );

    const req = new Request('http://localhost/api/chat/public', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://allowed-domain.com',
      },
      body: JSON.stringify({
        workspaceSlug: 'public-test',
        message: 'This request will fail before answering',
        visitorId: 'visitor-fail-test',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(500);

    const ws = await Workspace.findById(workspaceId).lean();
    // monthlyMessageCount MUST remain unchanged at 3
    expect(ws?.monthlyMessageCount).toBe(3);
  });

  it('greetings and thanks return friendly message in same language, bypass AI model and do NOT increment monthlyMessageCount', async () => {
    await Workspace.updateOne({ _id: workspaceId }, { $set: { monthlyMessageCount: 5 } });

    const greetingsToTest = [
      { msg: 'hi', expected: 'Hello! How can I help you today?' },
      { msg: 'thanks', expected: "You're welcome!" },
      { msg: 'नमस्ते', expected: 'नमस्ते!' },
      { msg: 'नमस्कार', expected: 'नमस्कार!' },
      { msg: 'धन्यवाद', expected: 'स्वागत' },
    ];

    for (const { msg, expected } of greetingsToTest) {
      vi.mocked(embeddingModule.embedQuery).mockClear();
      vi.mocked(aiModule.streamText).mockClear();

      const req = new Request('http://localhost/api/chat/public', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://allowed-domain.com',
        },
        body: JSON.stringify({
          workspaceSlug: 'public-test',
          message: msg,
          visitorId: `visitor-greet-${msg}`,
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain(expected);

      // Embedding and generative model MUST be bypassed
      expect(embeddingModule.embedQuery).not.toHaveBeenCalled();
      expect(aiModule.streamText).not.toHaveBeenCalled();
    }

    // Monthly message count MUST remain unchanged
    const ws = await Workspace.findById(workspaceId).lean();
    expect(ws?.monthlyMessageCount).toBe(5);
  });

  it('deflected ("I do not know") answers do NOT increment monthlyMessageCount', async () => {
    await Workspace.updateOne({ _id: workspaceId }, { $set: { monthlyMessageCount: 5 } });

    // No document chunks exist in knowledge base, so similarity search will deflect
    const req = new Request('http://localhost/api/chat/public', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://allowed-domain.com',
      },
      body: JSON.stringify({
        workspaceSlug: 'public-test',
        message: 'What is your quantum propulsion warranty?',
        visitorId: 'visitor-deflect',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('"isUnanswered":true');

    // Model was bypassed for deflection
    expect(aiModule.streamText).not.toHaveBeenCalled();

    // monthlyMessageCount MUST NOT increment for deflected queries
    const ws = await Workspace.findById(workspaceId).lean();
    expect(ws?.monthlyMessageCount).toBe(5);
  });
});
