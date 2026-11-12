import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { Session } from 'next-auth';
import { Workspace } from '@/models/Workspace';
import { POST } from './route';
import * as authModule from '@/lib/auth';
import * as embeddingModule from '@/services/embedding-service';
import * as aiModule from 'ai';
import {
  createWorkspaceDocument,
  updateWorkspaceDocumentStatus,
  insertWorkspaceDocumentChunks,
  getWorkspaceMessages,
} from '@/lib/db/scoped-queries';
import { GlobalChatUsage } from '@/models/GlobalChatUsage';
import { Conversation } from '@/models/Conversation';
import { Message } from '@/models/Message';

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}));

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

describe('Owner Test Chat API Route (/api/chat/test)', () => {
  let mongoServer: MongoMemoryServer;
  const ownerId = new mongoose.Types.ObjectId();
  const otherUserId = new mongoose.Types.ObjectId();
  let workspaceId: mongoose.Types.ObjectId;
  const dummyVector = new Array(768).fill(0.05);

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);

    const ws = await Workspace.create({
      name: 'Acme Test WS',
      slug: 'acme-test',
      ownerId,
      plan: 'free',
      monthlyMessageCount: 0,
      messageLimit: 100,
    });
    workspaceId = ws._id;
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    vi.clearAllMocks();

    // Default: Authenticated as workspace owner
    vi.mocked(authModule.auth as () => Promise<Session | null>).mockResolvedValue({
      user: { id: ownerId.toString(), email: 'owner@example.com' },
      expires: new Date(Date.now() + 86400000).toISOString(),
    });

    // Default: embedQuery returns 768-dim vector
    vi.mocked(embeddingModule.embedQuery).mockResolvedValue(dummyVector);

    // Default: streamText returns async generator
    vi.mocked(aiModule.streamText).mockReturnValue({
      textStream: (async function* () {
        yield 'Refunds are ';
        yield 'eligible within ';
        yield '30 days.';
      })(),
    } as unknown as ReturnType<typeof aiModule.streamText>);

    // Clear test collections
    await mongoose.connection.collection('sourcedocuments').deleteMany({});
    await mongoose.connection.collection('sourcedocumentchunks').deleteMany({});
    await mongoose.connection.collection('conversations').deleteMany({});
    await mongoose.connection.collection('messages').deleteMany({});
    await mongoose.connection.collection('globalchatusages').deleteMany({});
  });

  it('rejects unauthenticated requests with 401 Unauthorized', async () => {
    vi.mocked(authModule.auth as () => Promise<Session | null>).mockResolvedValueOnce(null);

    const req = new Request('http://localhost/api/chat/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceSlug: 'acme-test',
        message: 'What is the refund policy?',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('Unauthorized');
  });

  it('rejects non-owner callers with 403 Forbidden (uniform slug enumeration protection)', async () => {
    vi.mocked(authModule.auth as () => Promise<Session | null>).mockResolvedValueOnce({
      user: { id: otherUserId.toString(), email: 'hacker@example.com' },
      expires: new Date(Date.now() + 86400000).toISOString(),
    });

    const req = new Request('http://localhost/api/chat/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceSlug: 'acme-test',
        message: 'What is the refund policy?',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe('Workspace not found or access denied');
  });

  it('enforces 20 test messages per hour per workspace limit', async () => {
    // Create a test conversation
    const conv = await Conversation.create({
      workspaceId,
      visitorId: ownerId.toString(),
      isTest: true,
      startedAt: new Date(),
      lastMessageAt: new Date(),
    });

    // Seed 20 user messages in past 10 minutes
    for (let i = 0; i < 20; i++) {
      await Message.create({
        workspaceId,
        conversationId: conv._id,
        role: 'user',
        content: `Test query ${i}`,
      });
    }

    // 21st test message must be rejected with 429
    const req = new Request('http://localhost/api/chat/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceSlug: 'acme-test',
        message: 'This 21st message should hit rate limit',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(429);
    const data = await res.json();
    expect(data.error).toContain('reached the test chat limit of 20 messages per hour');
  });

  it('enforces global daily test chat budget (100) to protect 500 RPD', async () => {
    // Seed 100 test chat records today
    const records = Array.from({ length: 100 }, () => ({
      isTest: true,
      createdAt: new Date(),
    }));
    await GlobalChatUsage.insertMany(records);

    const req = new Request('http://localhost/api/chat/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceSlug: 'acme-test',
        message: 'Exceeds global daily test chat budget',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(429);
    const data = await res.json();
    expect(data.error).toContain('daily test chat quota has been reached across the platform');
  });

  it('unanswered query: marks isUnanswered, does NOT call Gemini model, streams fallback', async () => {
    // Seed a ready document with non-matching vector (zeros vs dummyVector)
    const doc = await createWorkspaceDocument(workspaceId, {
      title: 'Billing Terms',
      fileType: 'faq',
      uploadedBy: ownerId,
    });
    await updateWorkspaceDocumentStatus(workspaceId, doc._id, { status: 'ready' });

    // Vector with low similarity (< 0.65 threshold)
    const lowMatchVector = new Array(768).fill(-0.05);
    await insertWorkspaceDocumentChunks(workspaceId, doc._id, [
      {
        chunkIndex: 0,
        content: 'Irrelevant billing terms content',
        tokenCount: 10,
        embedding: lowMatchVector,
        metadata: { sourceTitle: 'Billing Terms' },
      },
    ]);

    const req = new Request('http://localhost/api/chat/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceSlug: 'acme-test',
        message: 'How do I cook pasta carbonara?',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const text = await res.text();
    expect(text).toContain('"isUnanswered":true');
    expect(text).toContain('I do not have enough information in the knowledge base');

    // Model must NOT have been called
    expect(aiModule.streamText).not.toHaveBeenCalled();

    // Verify messages saved to MongoDB
    const convs = await Conversation.find({ workspaceId, isTest: true });
    expect(convs.length).toBe(1);

    const msgs = await getWorkspaceMessages(workspaceId, convs[0]._id);
    expect(msgs.length).toBe(2);
    expect(msgs[0].role).toBe('user');
    expect(msgs[0].isUnanswered).toBe(true);
    expect(msgs[1].role).toBe('assistant');
    expect(msgs[1].isUnanswered).toBe(true);
  });

  it('answered query: streams text from Gemini Flash Lite with citations and saves messages', async () => {
    // Seed a ready document with matching vector
    const doc = await createWorkspaceDocument(workspaceId, {
      title: 'Refund Policy',
      fileType: 'faq',
      uploadedBy: ownerId,
    });
    await updateWorkspaceDocumentStatus(workspaceId, doc._id, { status: 'ready' });

    // Matching vector identical to dummyVector (cosine similarity = 1.0)
    await insertWorkspaceDocumentChunks(workspaceId, doc._id, [
      {
        chunkIndex: 0,
        content: 'Customers can request a refund within 30 days of purchase.',
        tokenCount: 12,
        embedding: dummyVector,
        metadata: { sourceTitle: 'Refund Policy' },
      },
    ]);

    const req = new Request('http://localhost/api/chat/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceSlug: 'acme-test',
        message: 'Can I get a refund?',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const text = await res.text();
    expect(text).toContain('"isUnanswered":false');
    expect(text).toContain('Refund Policy');
    expect(text).toContain('Refunds are ');
    expect(text).toContain('eligible within ');
    expect(text).toContain('30 days.');

    // Gemini model MUST have been called
    expect(aiModule.streamText).toHaveBeenCalledTimes(1);

    // Verify messages saved to MongoDB
    const convs = await Conversation.find({ workspaceId, isTest: true });
    expect(convs.length).toBe(1);

    const msgs = await getWorkspaceMessages(workspaceId, convs[0]._id);
    expect(msgs.length).toBe(2);
    expect(msgs[0].role).toBe('user');
    expect(msgs[0].isUnanswered).toBe(false);
    expect(msgs[1].role).toBe('assistant');
    expect(msgs[1].content).toBe('Refunds are eligible within 30 days.');
    expect(msgs[1].citations?.length).toBe(1);
    expect(msgs[1].citations?.[0].sourceTitle).toBe('Refund Policy');
  });

  it('excludes chunks belonging to non-ready documents (pending or failed)', async () => {
    // Create a document with status 'failed'
    const failedDoc = await createWorkspaceDocument(workspaceId, {
      title: 'Secret Draft Policy',
      fileType: 'faq',
      uploadedBy: ownerId,
    });
    await updateWorkspaceDocumentStatus(workspaceId, failedDoc._id, { status: 'failed' });

    // Insert chunk for failed document with 100% matching vector
    await insertWorkspaceDocumentChunks(workspaceId, failedDoc._id, [
      {
        chunkIndex: 0,
        content: 'Super secret confidential draft content.',
        tokenCount: 8,
        embedding: dummyVector,
        metadata: { sourceTitle: 'Secret Draft Policy' },
      },
    ]);

    const req = new Request('http://localhost/api/chat/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceSlug: 'acme-test',
        message: 'What is the secret policy?',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const text = await res.text();
    // Failed document chunk MUST NOT be returned
    expect(text).toContain('"isUnanswered":true');
    expect(text).not.toContain('Secret Draft Policy');
    expect(aiModule.streamText).not.toHaveBeenCalled();
  });

  it('does NOT increment monthlyMessageCount for owner test chats', async () => {
    await Workspace.updateOne({ _id: workspaceId }, { $set: { monthlyMessageCount: 5 } });

    const req = new Request('http://localhost/api/chat/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceSlug: 'acme-test',
        message: 'Owner testing chat functionality',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const ws = await Workspace.findById(workspaceId).lean();
    // monthlyMessageCount MUST remain unchanged at 5
    expect(ws?.monthlyMessageCount).toBe(5);
  });
});

