import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Workspace } from '@/models/Workspace';
import {
  createWorkspaceDocument,
  updateWorkspaceDocumentStatus,
  insertWorkspaceDocumentChunks,
  searchWorkspaceChunks,
  VectorIndexMissingError,
  createWorkspaceConversation,
  getWorkspaceConversationById,
  createWorkspaceMessage,
  getWorkspaceMessages,
  countRecentWorkspaceTestMessages,
  checkAndRecordGlobalTestChatBudget,
  getPublicWorkspaceBySlug,
  incrementWorkspaceMessageCount,
  resetMonthlyMessageCountIfCycleDue,
  updateWorkspaceAllowedOrigins,
  listWorkspaceConversations,
  listWorkspaceUnansweredQuestions,
  countWorkspaceConversations,
  countWorkspaceUnansweredMessages,
  dismissWorkspaceUnansweredMessage,
  dismissAllWorkspaceUnansweredMessages,
} from './scoped-queries';
import { GlobalChatUsage } from '@/models/GlobalChatUsage';

describe('Scoped Queries - Retrieval & Conversation Repository', () => {
  let mongoServer: MongoMemoryServer;
  const ownerId = new mongoose.Types.ObjectId();
  let workspaceId: mongoose.Types.ObjectId;
  const dummyVector = new Array(768).fill(0.05);

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);

    const ws = await Workspace.create({
      name: 'Scoped WS',
      slug: 'scoped-ws',
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
    await mongoose.connection.collection('sourcedocuments').deleteMany({});
    await mongoose.connection.collection('sourcedocumentchunks').deleteMany({});
    await mongoose.connection.collection('conversations').deleteMany({});
    await mongoose.connection.collection('messages').deleteMany({});
    await mongoose.connection.collection('globalchatusages').deleteMany({});
  });

  describe('searchWorkspaceChunks', () => {
    it('retrieves chunks for ready documents with similarity score above threshold', async () => {
      const doc = await createWorkspaceDocument(workspaceId, {
        title: 'Active Document',
        fileType: 'faq',
        uploadedBy: ownerId,
      });
      await updateWorkspaceDocumentStatus(workspaceId, doc._id, { status: 'ready' });

      await insertWorkspaceDocumentChunks(workspaceId, doc._id, [
        {
          chunkIndex: 0,
          content: 'Important refund terms and conditions.',
          tokenCount: 10,
          embedding: dummyVector,
          metadata: { sourceTitle: 'Active Document' },
        },
      ]);

      const result = await searchWorkspaceChunks(workspaceId, dummyVector);
      expect(result.isUnanswered).toBe(false);
      expect(result.chunks.length).toBe(1);
      expect(result.topScore).toBeGreaterThanOrEqual(0.80);
      expect(result.chunks[0].content).toContain('Important refund terms');
    });

    it('returns isUnanswered: true when top score is below threshold (0.80)', async () => {
      const doc = await createWorkspaceDocument(workspaceId, {
        title: 'Active Document',
        fileType: 'faq',
        uploadedBy: ownerId,
      });
      await updateWorkspaceDocumentStatus(workspaceId, doc._id, { status: 'ready' });

      // Orthogonal vector (cosine similarity ~ 0, atlas score ~ 0.50)
      const orthogonalVector = new Array(768).fill(0);
      orthogonalVector[0] = 1;
      const queryVec = new Array(768).fill(0);
      queryVec[1] = 1;

      await insertWorkspaceDocumentChunks(workspaceId, doc._id, [
        {
          chunkIndex: 0,
          content: 'Unrelated content.',
          tokenCount: 5,
          embedding: orthogonalVector,
          metadata: { sourceTitle: 'Active Document' },
        },
      ]);

      const result = await searchWorkspaceChunks(workspaceId, queryVec);
      expect(result.isUnanswered).toBe(true);
      expect(result.chunks.length).toBe(0);
      expect(result.topScore).toBeLessThan(0.80);
    });

    it('discards chunks whose parent document is pending or failed', async () => {
      const pendingDoc = await createWorkspaceDocument(workspaceId, {
        title: 'Pending Document',
        fileType: 'faq',
        uploadedBy: ownerId,
      });
      // status remains 'pending'

      await insertWorkspaceDocumentChunks(workspaceId, pendingDoc._id, [
        {
          chunkIndex: 0,
          content: 'Pending unindexed text.',
          tokenCount: 5,
          embedding: dummyVector,
          metadata: { sourceTitle: 'Pending Document' },
        },
      ]);

      const result = await searchWorkspaceChunks(workspaceId, dummyVector);
      expect(result.isUnanswered).toBe(true);
      expect(result.chunks.length).toBe(0);
    });

    it('throws VectorIndexMissingError when vector index is not created', async () => {
      await expect(
        searchWorkspaceChunks(workspaceId, dummyVector, { simulateIndexMissing: true })
      ).rejects.toThrow(VectorIndexMissingError);
    });
  });

  describe('Conversation and Message Scoped Repository', () => {
    it('creates and retrieves conversation with isTest flag', async () => {
      const conv = await createWorkspaceConversation(workspaceId, {
        visitorId: 'test-user-123',
        isTest: true,
      });

      expect(conv._id).toBeDefined();
      expect(conv.isTest).toBe(true);

      const fetched = await getWorkspaceConversationById(workspaceId, conv._id);
      expect(fetched).toBeDefined();
      expect(fetched?.isTest).toBe(true);
      expect(fetched?.visitorId).toBe('test-user-123');
    });

    it('creates and retrieves messages chronologically with citations', async () => {
      const conv = await createWorkspaceConversation(workspaceId, {
        visitorId: 'test-user-123',
        isTest: true,
      });

      const userMsg = await createWorkspaceMessage(workspaceId, {
        conversationId: conv._id,
        role: 'user',
        content: 'Hello, what are your hours?',
      });

      const asstMsg = await createWorkspaceMessage(workspaceId, {
        conversationId: conv._id,
        role: 'assistant',
        content: 'We are open 9am to 5pm.',
        citations: [
          {
            documentId: new mongoose.Types.ObjectId(),
            sourceTitle: 'Hours Policy',
            chunkIndex: 0,
            textSnippet: 'Open Mon-Fri 9-5',
          },
        ],
      });

      const msgs = await getWorkspaceMessages(workspaceId, conv._id);
      expect(msgs.length).toBe(2);
      expect(msgs[0]._id.toString()).toBe(userMsg._id.toString());
      expect(msgs[1]._id.toString()).toBe(asstMsg._id.toString());
      expect(msgs[1].citations?.length).toBe(1);
      expect(msgs[1].citations?.[0].sourceTitle).toBe('Hours Policy');
    });

    it('counts recent test messages accurately', async () => {
      const conv = await createWorkspaceConversation(workspaceId, {
        visitorId: 'test-user',
        isTest: true,
      });

      await createWorkspaceMessage(workspaceId, {
        conversationId: conv._id,
        role: 'user',
        content: 'Test 1',
      });
      await createWorkspaceMessage(workspaceId, {
        conversationId: conv._id,
        role: 'user',
        content: 'Test 2',
      });

      const count = await countRecentWorkspaceTestMessages(workspaceId);
      expect(count).toBe(2);
    });

    it('enforces global daily test chat budget', async () => {
      // Seed budget limit (5 for testing)
      for (let i = 0; i < 5; i++) {
        await GlobalChatUsage.create({ isTest: true });
      }

      const allowed = await checkAndRecordGlobalTestChatBudget(5);
      expect(allowed).toBe(false);

      const allowedUnder = await checkAndRecordGlobalTestChatBudget(10);
      expect(allowedUnder).toBe(true);
    });

    it('retrieves public workspace metadata without sensitive fields', async () => {
      const publicWs = await getPublicWorkspaceBySlug('scoped-ws');
      expect(publicWs).not.toBeNull();
      expect(publicWs?.slug).toBe('scoped-ws');
      expect((publicWs as unknown as Record<string, unknown>).ownerId).toBeUndefined();
    });

    it('atomically increments monthlyMessageCount and blocks when limit is reached', async () => {
      // Set messageLimit to 2 for testing
      await Workspace.updateOne({ _id: workspaceId }, { $set: { monthlyMessageCount: 1, messageLimit: 2 } });

      const res1 = await incrementWorkspaceMessageCount(workspaceId);
      expect(res1.success).toBe(true);
      expect(res1.monthlyMessageCount).toBe(2);

      // Now at limit (2/2), next increment should fail
      const res2 = await incrementWorkspaceMessageCount(workspaceId);
      expect(res2.success).toBe(false);
      expect(res2.monthlyMessageCount).toBe(2);
    });

    it('updates allowed origins cleanly and normalizes trailing slashes', async () => {
      const updated = await updateWorkspaceAllowedOrigins(workspaceId, ['https://example.com/ ', ' http://localhost:5000/']);
      expect(updated).toBe(true);

      const ws = await Workspace.findById(workspaceId).lean();
      expect(ws?.allowedOrigins).toEqual(['https://example.com', 'http://localhost:5000']);
    });

    it('lists conversations and detects unanswered flags', async () => {
      const conv1 = await createWorkspaceConversation(workspaceId, { visitorId: 'vis-1' });
      await createWorkspaceMessage(workspaceId, {
        conversationId: conv1._id,
        role: 'user',
        content: 'Unanswered q',
        isUnanswered: true,
      });

      const conv2 = await createWorkspaceConversation(workspaceId, { visitorId: 'vis-2' });
      await createWorkspaceMessage(workspaceId, {
        conversationId: conv2._id,
        role: 'user',
        content: 'Answered q',
        isUnanswered: false,
      });

      const allSummaries = await listWorkspaceConversations(workspaceId);
      expect(allSummaries.length).toBe(2);

      const unansweredSummaries = await listWorkspaceConversations(workspaceId, { filter: 'unanswered' });
      expect(unansweredSummaries.length).toBe(1);
      expect(unansweredSummaries[0]._id).toBe(conv1._id.toString());
    });

    it('lists unanswered questions for dashboard review', async () => {
      const conv = await createWorkspaceConversation(workspaceId, { visitorId: 'vis-unanswered' });
      await createWorkspaceMessage(workspaceId, {
        conversationId: conv._id,
        role: 'user',
        content: 'How do I export to CSV?',
        isUnanswered: true,
      });

      const questions = await listWorkspaceUnansweredQuestions(workspaceId);
      expect(questions.length).toBe(1);
      expect(questions[0].question).toBe('How do I export to CSV?');
      expect(questions[0].visitorId).toBe('vis-unanswered');
    });
  });

  describe('Monthly Billing Cycle Reset & Concurrency Guards', () => {
    it('resets monthlyMessageCount when billing cycle (30 days) has elapsed', async () => {
      const testWs = await Workspace.create({
        name: 'Cycle WS',
        slug: 'cycle-ws-' + Date.now(),
        ownerId: new mongoose.Types.ObjectId(),
        plan: 'free',
        monthlyMessageCount: 88,
        messageLimit: 100,
        billingCycleAnchor: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000), // 35 days ago
      });

      const wasReset = await resetMonthlyMessageCountIfCycleDue(testWs._id);
      expect(wasReset).toBe(true);

      const refreshed = await Workspace.findById(testWs._id);
      expect(refreshed?.monthlyMessageCount).toBe(0);
      expect(refreshed?.billingCycleAnchor?.getTime()).toBeGreaterThan(Date.now() - 5000);
    });

    it('does NOT reset monthlyMessageCount when within current billing cycle', async () => {
      const testWs = await Workspace.create({
        name: 'Active Cycle WS',
        slug: 'active-cycle-ws-' + Date.now(),
        ownerId: new mongoose.Types.ObjectId(),
        plan: 'free',
        monthlyMessageCount: 42,
        messageLimit: 100,
        billingCycleAnchor: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
      });

      const wasReset = await resetMonthlyMessageCountIfCycleDue(testWs._id);
      expect(wasReset).toBe(false);

      const refreshed = await Workspace.findById(testWs._id);
      expect(refreshed?.monthlyMessageCount).toBe(42);
    });

    it('enforces atomic limit and prevents over-allocation under concurrent requests', async () => {
      const concurrencyLimit = 5;
      const testWs = await Workspace.create({
        name: 'Concurrent WS',
        slug: 'concurrent-ws-' + Date.now(),
        ownerId: new mongoose.Types.ObjectId(),
        plan: 'free',
        monthlyMessageCount: 0,
        messageLimit: concurrencyLimit,
        dailyMessageCap: 100,
      });

      // Fire 20 concurrent increment calls
      const results = await Promise.all(
        Array.from({ length: 20 }, () => incrementWorkspaceMessageCount(testWs._id))
      );

      const successCount = results.filter((r) => r.success).length;
      const failureCount = results.filter((r) => !r.success).length;

      expect(successCount).toBe(concurrencyLimit);
      expect(failureCount).toBe(15);

      const refreshed = await Workspace.findById(testWs._id);
      expect(refreshed?.monthlyMessageCount).toBe(concurrencyLimit);
    });

    it('enforces daily message cap when daily limit is reached', async () => {
      const dailyCap = 3;
      const testWs = await Workspace.create({
        name: 'Daily Cap WS',
        slug: 'daily-cap-ws-' + Date.now(),
        ownerId: new mongoose.Types.ObjectId(),
        plan: 'free',
        monthlyMessageCount: 0,
        messageLimit: 100,
        dailyMessageCap: dailyCap,
      });

      // Fire 6 sequential/concurrent increments
      const results = await Promise.all(
        Array.from({ length: 6 }, () => incrementWorkspaceMessageCount(testWs._id))
      );

      const successCount = results.filter((r) => r.success).length;
      const dailyLimitFailures = results.filter((r) => !r.success && r.reason === 'daily_limit').length;

      expect(successCount).toBe(dailyCap);
      expect(dailyLimitFailures).toBe(3);

      const refreshed = await Workspace.findById(testWs._id);
      expect(refreshed?.dailyMessageCount).toBe(dailyCap);
    });
  });

  describe('Customer Conversations & Unanswered Counts with Dismiss Action', () => {
    it('countWorkspaceConversations counts only real customer conversations (excludes test chats & greeting-only chats)', async () => {
      const countWsId = new mongoose.Types.ObjectId();
      // 1. Create a customer conversation with a real question
      const realConv = await createWorkspaceConversation(countWsId, {
        visitorId: 'customer-real-1',
        isTest: false,
      });
      await createWorkspaceMessage(countWsId, {
        conversationId: realConv._id,
        role: 'user',
        content: 'How do I cancel my subscription?',
        isGreeting: false,
      });

      // 2. Create an owner test chat (isTest: true)
      const testConv = await createWorkspaceConversation(countWsId, {
        visitorId: 'owner-test-1',
        isTest: true,
      });
      await createWorkspaceMessage(countWsId, {
        conversationId: testConv._id,
        role: 'user',
        content: 'Testing cancellation flow',
        isGreeting: false,
      });

      // 3. Create a greeting-only customer conversation
      const greetingConv = await createWorkspaceConversation(countWsId, {
        visitorId: 'customer-greet-1',
        isTest: false,
      });
      await createWorkspaceMessage(countWsId, {
        conversationId: greetingConv._id,
        role: 'user',
        content: 'hi',
        isGreeting: true,
      });
      await createWorkspaceMessage(countWsId, {
        conversationId: greetingConv._id,
        role: 'assistant',
        content: 'Hello! How can I help you today?',
        isGreeting: true,
      });

      const count = await countWorkspaceConversations(countWsId);
      // ONLY conversation 1 should be counted! Conversation 2 is test, Conversation 3 is greeting-only
      expect(count).toBe(1);
    });

    it('countWorkspaceUnansweredMessages & dismissWorkspaceUnansweredMessage exclude test chats and dismissed items', async () => {
      const unansWsId = new mongoose.Types.ObjectId();
      // 1. Customer conversation with unanswered question
      const custConv = await createWorkspaceConversation(unansWsId, {
        visitorId: 'customer-unanswered-1',
        isTest: false,
      });
      const unansMsg1 = await createWorkspaceMessage(unansWsId, {
        conversationId: custConv._id,
        role: 'user',
        content: 'Do you deliver to Iceland?',
        isUnanswered: true,
        isGreeting: false,
      });
      await createWorkspaceMessage(unansWsId, {
        conversationId: custConv._id,
        role: 'user',
        content: 'Can I pay via cash on delivery?',
        isUnanswered: true,
        isGreeting: false,
      });

      // 2. Test chat with unanswered question
      const testConv = await createWorkspaceConversation(unansWsId, {
        visitorId: 'owner-test-unans',
        isTest: true,
      });
      await createWorkspaceMessage(unansWsId, {
        conversationId: testConv._id,
        role: 'user',
        content: 'Test unanswered question',
        isUnanswered: true,
        isGreeting: false,
      });

      // Initially, 2 customer unanswered questions
      let count = await countWorkspaceUnansweredMessages(unansWsId);
      expect(count).toBe(2);

      let list = await listWorkspaceUnansweredQuestions(unansWsId);
      expect(list).toHaveLength(2);
      expect(list.some((q) => q.question === 'Do you deliver to Iceland?')).toBe(true);

      // Dismiss single question
      const dismissed = await dismissWorkspaceUnansweredMessage(unansWsId, unansMsg1._id);
      expect(dismissed).toBe(true);

      count = await countWorkspaceUnansweredMessages(unansWsId);
      expect(count).toBe(1);

      list = await listWorkspaceUnansweredQuestions(unansWsId);
      expect(list).toHaveLength(1);
      expect(list[0].question).toBe('Can I pay via cash on delivery?');

      // Dismiss all remaining
      const dismissedCount = await dismissAllWorkspaceUnansweredMessages(unansWsId);
      expect(dismissedCount).toBe(1);

      count = await countWorkspaceUnansweredMessages(unansWsId);
      expect(count).toBe(0);

      list = await listWorkspaceUnansweredQuestions(unansWsId);
      expect(list).toHaveLength(0);
    });
  });
});

