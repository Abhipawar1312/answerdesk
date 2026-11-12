import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Workspace } from '@/models/Workspace';
import { POST as publicChatPost } from '@/app/api/chat/public/route';
import { proxy } from '@/proxy';
import { NextRequest } from 'next/server';
import * as embeddingModule from '@/services/embedding-service';
import * as aiModule from 'ai';
import {
  createWorkspaceDocument,
  updateWorkspaceDocumentStatus,
  insertWorkspaceDocumentChunks,
  createWorkspaceConversation,
  getWorkspaceMessages,
} from '@/lib/db/scoped-queries';
import { getRateLimiter, MemoryRateLimiter } from '@/lib/rate-limiter';

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

describe('Integration Flow Tests (Vitest In-Memory & Mocked Services)', () => {
  let mongoServer: MongoMemoryServer;
  const ownerA = new mongoose.Types.ObjectId();
  const ownerB = new mongoose.Types.ObjectId();
  let workspaceAId: mongoose.Types.ObjectId;
  let workspaceBId: mongoose.Types.ObjectId;
  const dummyVector = new Array(768).fill(0.05);

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);

    // Seed Workspace A
    const wsA = await Workspace.create({
      name: 'Tenant A Workspace',
      slug: 'tenant-a',
      ownerId: ownerA,
      plan: 'pro',
      monthlyMessageCount: 0,
      messageLimit: 2500,
      allowedOrigins: ['https://tenant-a.com'],
    });
    workspaceAId = wsA._id;

    // Seed Workspace B
    const wsB = await Workspace.create({
      name: 'Tenant B Workspace',
      slug: 'tenant-b',
      ownerId: ownerB,
      plan: 'free',
      monthlyMessageCount: 0,
      messageLimit: 100,
      allowedOrigins: ['https://tenant-b.com'],
    });
    workspaceBId = wsB._id;
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    vi.clearAllMocks();

    const limiter = getRateLimiter();
    if (limiter instanceof MemoryRateLimiter) {
      limiter.resetAll();
    }

    vi.mocked(embeddingModule.embedQuery).mockResolvedValue(dummyVector);

    vi.mocked(aiModule.streamText).mockReturnValue({
      textStream: (async function* () {
        yield 'Tenant ';
        yield 'response.';
      })(),
    } as unknown as ReturnType<typeof aiModule.streamText>);

    await mongoose.connection.collection('sourcedocuments').deleteMany({});
    await mongoose.connection.collection('sourcedocumentchunks').deleteMany({});
    await mongoose.connection.collection('conversations').deleteMany({});
    await mongoose.connection.collection('messages').deleteMany({});
  });

  // 1. Unauthenticated Login Redirects
  describe('[Flow 1] Authentication Boundary & Redirects', () => {
    it('redirects unauthenticated user accessing protected dashboard to /login with callbackUrl', async () => {
      const protectedReq = new NextRequest('http://localhost:3000/dashboard/tenant-a/documents');
      const res = await proxy(protectedReq);

      expect(res.status).toBe(307);
      const redirectLocation = res.headers.get('location');
      expect(redirectLocation).toContain('/login?callbackUrl=%2Fdashboard%2Ftenant-a%2Fdocuments');
      expect(res.headers.get('Cache-Control')).toContain('no-store');
    });

    it('enforces frame-ancestors none on all internal dashboard routes to prevent clickjacking', async () => {
      const req = new NextRequest('http://localhost:3000/dashboard/tenant-a');
      const res = await proxy(req);

      const csp = res.headers.get('Content-Security-Policy');
      expect(csp).toContain("frame-ancestors 'none'");
    });

    it('sets Cache-Control no-store headers on authenticated dashboard requests to prevent back-button cache leaks', async () => {
      const authReq = new NextRequest('http://localhost:3000/dashboard/tenant-a', {
        headers: {
          cookie: 'authjs.session-token=valid-mock-token',
        },
      });
      const res = await proxy(authReq);

      expect(res.headers.get('Cache-Control')).toContain('no-store');
      expect(res.headers.get('Pragma')).toBe('no-cache');
    });

    it('proves that NO login bypass exists in production builds', async () => {
      const origEnv = process.env.NODE_ENV;
      try {
        (process.env as Record<string, string | undefined>).NODE_ENV = 'production';

        // An unauthenticated request with test headers must NEVER bypass auth in production
        const sneakReq = new NextRequest('http://localhost:3000/dashboard/tenant-a', {
          headers: { 'x-test-bypass': 'true' },
        });

        // Proxy must redirect to login
        const res = await proxy(sneakReq);
        expect(res.status).toBe(307);
      } finally {
        (process.env as Record<string, string | undefined>).NODE_ENV = origEnv;
      }
    });
  });

  // 2. Public Widget Grounded Flow with Mocked Stream
  describe('[Flow 2] Public Widget Grounded Chat Flow', () => {
    it('executes end-to-end chat flow: retrieves chunks, streams text, saves message and citations', async () => {
      // Seed knowledge entry in Tenant A
      const doc = await createWorkspaceDocument(workspaceAId, {
        title: 'Tenant A SLA Guide',
        fileType: 'faq',
        uploadedBy: ownerA,
      });
      await updateWorkspaceDocumentStatus(workspaceAId, doc._id, { status: 'ready' });
      await insertWorkspaceDocumentChunks(workspaceAId, doc._id, [
        {
          chunkIndex: 0,
          content: 'Tenant A provides a 99.9% uptime SLA.',
          tokenCount: 12,
          embedding: dummyVector,
          metadata: { sourceTitle: 'Tenant A SLA Guide' },
        },
      ]);

      const chatReq = new Request('http://localhost:3000/api/chat/public', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://tenant-a.com',
        },
        body: JSON.stringify({
          workspaceSlug: 'tenant-a',
          message: 'What is your uptime guarantee?',
          visitorId: 'visitor-e2e-1',
        }),
      });

      const res = await publicChatPost(chatReq);
      expect(res.status).toBe(200);

      const bodyText = await res.text();
      expect(bodyText).toContain('citations');
      expect(bodyText).toContain('Tenant A SLA Guide');
      expect(bodyText).toContain('Tenant ');
      expect(bodyText).toContain('response.');

      // Verify conversation and message persisted in database
      const convs = await mongoose.connection.collection('conversations').find({ workspaceId: workspaceAId }).toArray();
      expect(convs.length).toBe(1);

      const msgs = await getWorkspaceMessages(workspaceAId, convs[0]._id.toString());
      expect(msgs.length).toBe(2);
      expect(msgs[0].role).toBe('user');
      expect(msgs[1].role).toBe('assistant');
      expect(msgs[1].citations?.[0].sourceTitle).toBe('Tenant A SLA Guide');
    });
  });

  // 3. Cross-Tenant Isolation
  describe('[Flow 3] Strict Cross-Tenant Isolation', () => {
    it('prevents visitor in Tenant B from accessing or hijacking Tenant A conversations', async () => {
      // Create conversation belonging to Tenant A
      const convA = await createWorkspaceConversation(workspaceAId, {
        visitorId: 'visitor-tenant-a',
        isTest: false,
      });

      // Attacker tries to post to Tenant B using Tenant A conversation ID
      const spoofReq = new Request('http://localhost:3000/api/chat/public', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://tenant-b.com',
        },
        body: JSON.stringify({
          workspaceSlug: 'tenant-b',
          message: 'Can I see Tenant A data?',
          visitorId: 'visitor-tenant-b',
          conversationId: convA._id.toString(),
        }),
      });

      const res = await publicChatPost(spoofReq);
      // Because convA belongs to workspaceAId, getWorkspaceConversationById for workspaceBId returns null
      // The system creates a fresh conversation for tenant B rather than leaking tenant A's conversation
      expect(res.status).toBe(200);

      // Verify Tenant A conversation was NOT modified
      const msgsA = await getWorkspaceMessages(workspaceAId, convA._id.toString());
      expect(msgsA.length).toBe(0);

      // Verify Tenant B has its own distinct conversation
      const convsB = await mongoose.connection.collection('conversations').find({ workspaceId: workspaceBId }).toArray();
      expect(convsB.length).toBe(1);
      expect(convsB[0]._id.toString()).not.toBe(convA._id.toString());
    });

    it('prevents vector retrieval from leaking Tenant B chunks into Tenant A answers', async () => {
      // Seed secret chunk in Tenant B
      const docB = await createWorkspaceDocument(workspaceBId, {
        title: 'Tenant B Top Secret Product',
        fileType: 'faq',
        uploadedBy: ownerB,
      });
      await updateWorkspaceDocumentStatus(workspaceBId, docB._id, { status: 'ready' });
      await insertWorkspaceDocumentChunks(workspaceBId, docB._id, [
        {
          chunkIndex: 0,
          content: 'Confidential project code is ProjectX99.',
          tokenCount: 10,
          embedding: dummyVector,
          metadata: { sourceTitle: 'Tenant B Top Secret Product' },
        },
      ]);

      // Query Tenant A with the same query vector
      const chatReq = new Request('http://localhost:3000/api/chat/public', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://tenant-a.com',
        },
        body: JSON.stringify({
          workspaceSlug: 'tenant-a',
          message: 'What is the confidential project code?',
          visitorId: 'visitor-spy',
        }),
      });

      const res = await publicChatPost(chatReq);
      expect(res.status).toBe(200);

      const bodyText = await res.text();
      // Must NOT contain Tenant B's secret title or content
      expect(bodyText).not.toContain('Tenant B Top Secret Product');
      expect(bodyText).not.toContain('ProjectX99');
      // Must trigger unanswered fallback since Tenant A has zero knowledge entries
      expect(bodyText).toContain('I do not have enough information');
    });
  });

  // 4. Allowed Origins Enforcement
  describe('[Flow 4] Origin Whitelist & Embedding Security', () => {
    it('blocks chat requests originating from unauthorized domains with HTTP 403', async () => {
      const evilReq = new Request('http://localhost:3000/api/chat/public', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://unauthorized-evil-domain.com',
        },
        body: JSON.stringify({
          workspaceSlug: 'tenant-a',
          message: 'Hello from unauthorized site',
          visitorId: 'visitor-attacker',
        }),
      });

      const res = await publicChatPost(evilReq);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain('Requests from this domain are not permitted');
    });

    it('permits requests when Origin matches configured allowedOrigins', async () => {
      const allowedReq = new Request('http://localhost:3000/api/chat/public', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://tenant-a.com',
        },
        body: JSON.stringify({
          workspaceSlug: 'tenant-a',
          message: 'Hello from legitimate domain',
          visitorId: 'visitor-friend',
        }),
      });

      const res = await publicChatPost(allowedReq);
      expect(res.status).toBe(200);
    });
  });
});
