import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { Session } from 'next-auth';
import { Workspace } from '@/models/Workspace';
import { PLAN_LIMITS } from '@/lib/constants';
import {
  registerDocumentUploadAction,
  createFaqDocumentAction,
  uploadDocumentAction,
  retryDocumentAction,
  deleteDocumentAction,
} from './document';
import * as authModule from '@/lib/auth';
import {
  getWorkspaceDocumentById,
  getWorkspaceDocuments,
  getWorkspaceDocumentChunks,
  createWorkspaceDocument,
  deleteWorkspaceDocument,
  countWorkspaceDocuments,
  updateWorkspaceDocumentStatus,
  recordIngestAttempt,
  acquireWorkspaceIngestLock,
  releaseWorkspaceIngestLock,
} from '@/lib/db/scoped-queries';
import * as embeddingModule from '@/services/embedding-service';

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('@/services/embedding-service', () => ({
  embedDocumentChunks: vi.fn(),
  EmbeddingServiceError: class EmbeddingServiceError extends Error {
    readonly isRateLimit: boolean;
    constructor(message: string, isRateLimit = false) {
      super(message);
      this.name = 'EmbeddingServiceError';
      this.isRateLimit = isRateLimit;
    }
  },
}));

vi.mock('@/lib/db/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}));

describe('Document Upload Action & Storage Key Security', () => {
  let mongoServer: MongoMemoryServer;
  const ownerId = new mongoose.Types.ObjectId();
  const otherTenantId = new mongoose.Types.ObjectId();
  let workspaceId: mongoose.Types.ObjectId;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);

    const ws = await Workspace.create({
      name: 'Storage Test WS',
      slug: 'storage-ws',
      ownerId,
      plan: 'free',
      messageLimit: PLAN_LIMITS.free.monthlyMessages,
    });
    workspaceId = ws._id;
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(() => {
    vi.mocked(authModule.auth as () => Promise<Session | null>).mockResolvedValue({
      user: { id: ownerId.toString(), email: 'owner@example.com' },
      expires: new Date(Date.now() + 86400000).toISOString(),
    });
  });

  describe('Storage key regex enforcement (^<workspaceId>/[A-Za-z0-9._-]{1,100}$)', () => {
    it('validates key format and refuses to execute until Phase 2 with honest error', async () => {
      const validKey = `${workspaceId.toString()}/1730000000000-clean-manual_v1.0.pdf`;

      const result = await registerDocumentUploadAction({
        workspaceSlug: 'storage-ws',
        fileKey: validKey,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Uploads are not available yet');
    });

    it('rejects path traversal attempts containing ".."', async () => {
      const traversalKeys = [
        `${workspaceId.toString()}/../etc/passwd`,
        `${workspaceId.toString()}/..`,
        `${workspaceId.toString()}/sub/../../file.pdf`,
        `${workspaceId.toString()}/file..name.pdf`,
      ];

      for (const fileKey of traversalKeys) {
        const result = await registerDocumentUploadAction({
          workspaceSlug: 'storage-ws',
          fileKey,
        });

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/Security violation/);
      }
    });

    it('rejects keys from a different workspace ID', async () => {
      const foreignKey = `${otherTenantId.toString()}/1730000000000-stolen.pdf`;

      const result = await registerDocumentUploadAction({
        workspaceSlug: 'storage-ws',
        fileKey: foreignKey,
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Security violation/);
    });

    it('rejects special characters, spaces, and dangerous filename patterns', async () => {
      const invalidKeys = [
        `${workspaceId.toString()}/file name with spaces.pdf`,
        `${workspaceId.toString()}/shell;reboot.pdf`,
        `${workspaceId.toString()}/<script>.pdf`,
        `${workspaceId.toString()}/file$name.pdf`,
        `${workspaceId.toString()}/file|pipe.pdf`,
        `${workspaceId.toString()}/`,
        `${workspaceId.toString()}/${'a'.repeat(101)}.pdf`,
      ];

      for (const fileKey of invalidKeys) {
        const result = await registerDocumentUploadAction({
          workspaceSlug: 'storage-ws',
          fileKey,
        });

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/Security violation/);
      }
    });
  });

  describe('createFaqDocumentAction & Rate Limiting Guards', () => {
    const dummyVector = new Array(768).fill(0.05);

    beforeEach(async () => {
      vi.mocked(embeddingModule.embedDocumentChunks).mockReset();
      vi.mocked(embeddingModule.embedDocumentChunks).mockImplementation(async (chunks) =>
        chunks.map(() => dummyVector)
      );

      // Release any locks, clear documents and ingest attempt log
      await Workspace.updateOne({ _id: workspaceId }, { $set: { ingestLockUntil: null } });
      await mongoose.connection.collection('ingestattempts').deleteMany({});
      const existing = await getWorkspaceDocuments(workspaceId);
      for (const d of existing) {
        await deleteWorkspaceDocument(workspaceId, d._id);
      }
    });

    it('creates an FAQ document, chunks, embeds with model tag, and marks status as ready', async () => {
      const result = await createFaqDocumentAction({
        workspaceSlug: 'storage-ws',
        title: 'Return Policy',
        content: 'Customers can return items within 30 days of purchase with original receipt.',
      });

      expect(result.success).toBe(true);
      expect(result.documentId).toBeDefined();

      const doc = await getWorkspaceDocumentById(workspaceId, result.documentId!);
      expect(doc).toBeDefined();
      expect(doc?.status).toBe('ready');
      expect(doc?.fileType).toBe('faq');
      expect(doc?.chunkCount).toBe(1);

      const chunks = await getWorkspaceDocumentChunks(workspaceId, result.documentId!);
      expect(chunks.length).toBe(1);
      expect(chunks[0].embedding.length).toBe(768);
      expect(chunks[0].embeddingModel).toBe('gemini-embedding-001');
      expect(chunks[0].metadata.sourceTitle).toBe('Return Policy');
    });

    it('validates title and content lengths with Zod', async () => {
      const tooShort = await createFaqDocumentAction({
        workspaceSlug: 'storage-ws',
        title: 'A',
        content: 'Valid content that is long enough.',
      });
      expect(tooShort.success).toBe(false);
      expect(tooShort.error).toMatch(/Title must be at least 2 characters/);

      const tooShortContent = await createFaqDocumentAction({
        workspaceSlug: 'storage-ws',
        title: 'Valid Title',
        content: 'Short',
      });
      expect(tooShortContent.success).toBe(false);
      expect(tooShortContent.error).toMatch(/Content must be at least 10 characters/);
    });

    it('enforces plan maxDocuments quota (failed documents do NOT count against quota)', async () => {
      for (let i = 0; i < 4; i++) {
        await createWorkspaceDocument(workspaceId, {
          title: `FAQ ${i}`,
          fileType: 'faq',
          uploadedBy: ownerId,
        });
      }

      // Add a failed document - must not count toward the 5 document quota
      const failedDoc = await createWorkspaceDocument(workspaceId, {
        title: 'Failed Ingestion FAQ',
        fileType: 'faq',
        uploadedBy: ownerId,
      });
      await updateWorkspaceDocumentStatus(workspaceId, failedDoc._id, {
        status: 'failed',
      });

      const activeCount = await countWorkspaceDocuments(workspaceId);
      expect(activeCount).toBe(4);

      // 5th valid document succeeds
      const result5 = await createFaqDocumentAction({
        workspaceSlug: 'storage-ws',
        title: '5th FAQ',
        content: 'This fills the 5th document slot.',
      });
      expect(result5.success).toBe(true);

      // 6th document fails because 5 active documents exist
      const result6 = await createFaqDocumentAction({
        workspaceSlug: 'storage-ws',
        title: '6th FAQ',
        content: 'This exceeds the limit of 5 documents.',
      });
      expect(result6.success).toBe(false);
      expect(result6.error).toMatch(/maximum document limit \(5\)/);
    });

    it('hourly rate limit: max 10 attempts per hour persists across document deletion (Item 1)', async () => {
      // Seed 10 attempts in IngestAttempt log
      for (let i = 0; i < 10; i++) {
        await recordIngestAttempt(workspaceId, {
          attemptType: 'create',
          chunkCount: 1,
          status: 'success',
        });
      }

      // 11th attempt must be rejected
      const result11 = await createFaqDocumentAction({
        workspaceSlug: 'storage-ws',
        title: 'Attempt 11 FAQ',
        content: 'This exceeds the 10 hourly indexing attempts limit.',
      });

      expect(result11.success).toBe(false);
      expect(result11.error).toContain('maximum of 10 indexing attempts per hour');

      // Crucial test: delete all documents in workspace
      const allDocs = await getWorkspaceDocuments(workspaceId);
      for (const d of allDocs) {
        await deleteWorkspaceDocument(workspaceId, d._id);
      }

      // Attempt 12 must STILL be rejected because IngestAttempt log persists across deletion
      const result12 = await createFaqDocumentAction({
        workspaceSlug: 'storage-ws',
        title: 'Attempt 12 FAQ',
        content: 'Deleting documents must not bypass the hourly attempt limit.',
      });

      expect(result12.success).toBe(false);
      expect(result12.error).toContain('maximum of 10 indexing attempts per hour');
    });

    it('per-minute rate limit: rejects when chunks attempted in past 60s exceeds 15 (Item 1 & 3)', async () => {
      // Seed 15 chunks attempted in IngestAttempt log in past 60 seconds
      await recordIngestAttempt(workspaceId, {
        attemptType: 'create',
        chunkCount: 15,
        status: 'success',
      });

      // Attempting to index any document will push total attempted chunks to 16 (> 15)
      const result = await createFaqDocumentAction({
        workspaceSlug: 'storage-ws',
        title: 'Burst Rate Test FAQ',
        content: 'Valid content that generates at least 1 chunk.',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('reached the limit of 15 chunks per minute');
    });

    it('e2e: accepts a maximal 10,000-character Hindi FAQ entry within 15 chunks per minute limit (Item 3)', async () => {
      const hindiUnit =
        'कंपनीचे धोरण आणि नियम: सर्व ग्राहकांसाठी आमच्या सेवा सातत्याने उपलब्ध आहेत। ' +
        'वार्षिक वर्गणी घेणाऱ्या ग्राहकांना ३० दिवसांत परतावा दिला जाईल। ' +
        'तांत्रिक अडचणींसाठी support@example.com वर संपर्क साधावा॥ ';
      const longHindiText = hindiUnit.repeat(45).slice(0, 9950);

      const result = await createFaqDocumentAction({
        workspaceSlug: 'storage-ws',
        title: 'Hindi 10k Policy FAQ',
        content: longHindiText,
      });

      expect(result.success).toBe(true);
      expect(result.documentId).toBeDefined();

      const doc = await getWorkspaceDocumentById(workspaceId, result.documentId!);
      expect(doc?.status).toBe('ready');
      expect(doc?.chunkCount).toBeLessThanOrEqual(15);
      expect(doc?.chunkCount).toBeGreaterThan(5);
    });

    it('e2e: accepts a maximal 10,000-character Marathi FAQ entry within 15 chunks per minute limit (Item 3)', async () => {
      const marathiUnit =
        'प्रश्न: परतावा कसा मिळवायचा? उत्तर: खाते सेटिंग्जमध्ये जाऊन परतावा विनंती फॉर्म भरावा। ' +
        'प्रशासकीय पडताळणीनंतर ५ कार्यदिवसांत रक्कम खात्यात जमा होईल॥ ';
      const longMarathiText = marathiUnit.repeat(55).slice(0, 9950);

      const result = await createFaqDocumentAction({
        workspaceSlug: 'storage-ws',
        title: 'Marathi 10k Policy FAQ',
        content: longMarathiText,
      });

      expect(result.success).toBe(true);
      expect(result.documentId).toBeDefined();

      const doc = await getWorkspaceDocumentById(workspaceId, result.documentId!);
      expect(doc?.status).toBe('ready');
      expect(doc?.chunkCount).toBeLessThanOrEqual(15);
      expect(doc?.chunkCount).toBeGreaterThan(5);
    });

    it('service busy error: does not increment hourly attempt log on rate limit failure (Item 8)', async () => {
      vi.mocked(embeddingModule.embedDocumentChunks).mockRejectedValueOnce(
        new embeddingModule.EmbeddingServiceError('AI embedding service busy', true)
      );

      const result = await createFaqDocumentAction({
        workspaceSlug: 'storage-ws',
        title: 'Service Busy FAQ',
        content: 'This will fail because AI service is busy.',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('AI embedding service busy');

      // Crucial: IngestAttempt log must NOT count this service-busy attempt
      const attempts = await mongoose.connection.collection('ingestattempts').find({ workspaceId }).toArray();
      expect(attempts.length).toBe(0);
    });

    it('handles embedding failure: deletes chunks, sets status to failed, and sanitizes error message', async () => {
      vi.mocked(embeddingModule.embedDocumentChunks).mockRejectedValueOnce(
        new embeddingModule.EmbeddingServiceError(
          'The AI embedding service is temporarily busy due to rate limits. Please try again in a few moments.'
        )
      );

      const result = await createFaqDocumentAction({
        workspaceSlug: 'storage-ws',
        title: 'Rate Limited FAQ',
        content: 'This will fail with a rate limit error.',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('temporarily busy due to rate limits');

      const docs = await getWorkspaceDocuments(workspaceId);
      const doc = docs.find((d) => d.title === 'Rate Limited FAQ');
      expect(doc).toBeDefined();
      expect(doc?.status).toBe('failed');
      expect(doc?.chunkCount).toBe(0);

      const chunks = await getWorkspaceDocumentChunks(workspaceId, doc!._id);
      expect(chunks.length).toBe(0);
    });

    it('sanitizes unexpected errors and never leaks raw error objects or stack traces', async () => {
      vi.mocked(embeddingModule.embedDocumentChunks).mockRejectedValueOnce(
        new Error('MongoNetworkTimeoutException at 192.168.1.1:27017')
      );

      const result = await createFaqDocumentAction({
        workspaceSlug: 'storage-ws',
        title: 'Unexpected Failure FAQ',
        content: 'This will fail with an internal error.',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to process and index knowledge entry. Please try again.');
      expect(result.error).not.toContain('192.168.1.1');
    });

    it('concurrency lock: in-flight ingestion blocks subsequent action until lock released (Item 4)', async () => {
      let embedResolve: (val: number[][]) => void = () => {};
      const embedPromise = new Promise<number[][]>((res) => {
        embedResolve = res;
      });

      // Keep first embedding call in flight
      vi.mocked(embeddingModule.embedDocumentChunks).mockImplementationOnce(() => embedPromise);

      const action1 = createFaqDocumentAction({
        workspaceSlug: 'storage-ws',
        title: 'Concurrent FAQ 1',
        content: 'This is the first concurrent document attempting ingestion.',
      });

      // Yield briefly to let action1 acquire the lock
      await new Promise((r) => setTimeout(r, 10));

      const action2 = createFaqDocumentAction({
        workspaceSlug: 'storage-ws',
        title: 'Concurrent FAQ 2',
        content: 'This is the second concurrent document attempting ingestion.',
      });

      const res2 = await action2;
      expect(res2.success).toBe(false);
      expect(res2.error).toContain('Another document is currently being indexed for your workspace');

      // Complete action 1
      embedResolve([dummyVector]);
      const res1 = await action1;
      expect(res1.success).toBe(true);
    });

    it('lock safety: 10 parallel acquireWorkspaceIngestLock calls allow only 1 success with UUID token (Item 5)', async () => {
      const calls = Array.from({ length: 10 }, () => acquireWorkspaceIngestLock(workspaceId));
      const tokens = await Promise.all(calls);

      const acquired = tokens.filter((t): t is string => typeof t === 'string' && t.length > 0);
      expect(acquired.length).toBe(1);

      const validToken = acquired[0];
      // Releasing with invalid token must fail and leave lock intact
      const wrongRelease = await releaseWorkspaceIngestLock(workspaceId, 'wrong-token-uuid');
      expect(wrongRelease).toBe(false);

      // Releasing with genuine token succeeds
      const genuineRelease = await releaseWorkspaceIngestLock(workspaceId, validToken);
      expect(genuineRelease).toBe(true);

      // Subsequent acquisition is now permitted
      const subsequentLock = await acquireWorkspaceIngestLock(workspaceId);
      expect(subsequentLock).toBeDefined();
      expect(typeof subsequentLock).toBe('string');
      await releaseWorkspaceIngestLock(workspaceId, subsequentLock!);
    });

    it('concurrency: aborts and cleans up chunks if document was deleted in MongoDB during processing (Item 4)', async () => {
      // Mock embedDocumentChunks to delete the document while embedding is in progress
      vi.mocked(embeddingModule.embedDocumentChunks).mockImplementationOnce(async () => {
        const docs = await getWorkspaceDocuments(workspaceId);
        if (docs.length > 0) {
          await mongoose.connection.collection('sourcedocuments').deleteOne({ _id: docs[0]._id });
        }
        return [dummyVector];
      });

      const result = await createFaqDocumentAction({
        workspaceSlug: 'storage-ws',
        title: 'Deleted Mid-Flight FAQ',
        content: 'This document will be deleted from Mongo while embedding is in flight.',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Document was deleted during processing.');
    });

    describe('deleteDocumentAction guards (Item 4)', () => {
      it('refuses to delete a document that is actively processing (unless older than 5 min timeout)', async () => {
        const processingDoc = await createWorkspaceDocument(workspaceId, {
          title: 'Active Processing FAQ',
          content: 'Content currently being indexed.',
          fileType: 'faq',
          uploadedBy: ownerId,
        });

        await updateWorkspaceDocumentStatus(workspaceId, processingDoc._id, {
          status: 'processing',
        });

        // Deleting actively processing document must be refused
        const deleteRes = await deleteDocumentAction('storage-ws', processingDoc._id.toString());
        expect(deleteRes.success).toBe(false);
        expect(deleteRes.error).toContain('currently being indexed. Please wait until indexing completes');

        // Document must still exist in MongoDB
        const docStillThere = await getWorkspaceDocumentById(workspaceId, processingDoc._id);
        expect(docStillThere).toBeDefined();

        // If processingStartedAt is older than 5 minutes (e.g. 6 minutes), deletion is allowed
        await mongoose.connection.collection('sourcedocuments').updateOne(
          { _id: processingDoc._id },
          { $set: { processingStartedAt: new Date(Date.now() - 6 * 60 * 1000) } }
        );

        const deleteTimeoutRes = await deleteDocumentAction('storage-ws', processingDoc._id.toString());
        expect(deleteTimeoutRes.success).toBe(true);

        const docAfterDelete = await getWorkspaceDocumentById(workspaceId, processingDoc._id);
        expect(docAfterDelete).toBeNull();
      });
    });

    describe('retryDocumentAction guards (Item 1 & 4)', () => {
      it('allows re-indexing a failed document', async () => {
        const failedDoc = await createWorkspaceDocument(workspaceId, {
          title: 'Retryable Policy',
          content: 'Detailed retryable policy content that needs re-indexing.',
          fileType: 'faq',
          uploadedBy: ownerId,
        });
        await updateWorkspaceDocumentStatus(workspaceId, failedDoc._id, {
          status: 'failed',
          errorMessage: 'Previous failure',
        });

        const retryRes = await retryDocumentAction('storage-ws', failedDoc._id.toString());
        expect(retryRes.success).toBe(true);

        const reindexedDoc = await getWorkspaceDocumentById(workspaceId, failedDoc._id);
        expect(reindexedDoc?.status).toBe('ready');
        expect(reindexedDoc?.chunkCount).toBe(1);
      });

      it('enforces hourly attempt limits on retry identical to create', async () => {
        const failedDoc = await createWorkspaceDocument(workspaceId, {
          title: 'Retry Limit FAQ',
          content: 'Content waiting to retry.',
          fileType: 'faq',
          uploadedBy: ownerId,
        });
        await updateWorkspaceDocumentStatus(workspaceId, failedDoc._id, {
          status: 'failed',
        });

        // Seed 10 attempts
        for (let i = 0; i < 10; i++) {
          await recordIngestAttempt(workspaceId, {
            attemptType: 'create',
            chunkCount: 1,
            status: 'success',
          });
        }

        const retryRes = await retryDocumentAction('storage-ws', failedDoc._id.toString());
        expect(retryRes.success).toBe(false);
        expect(retryRes.error).toContain('maximum of 10 indexing attempts per hour');
      });

      it('enforces plan maxDocuments quota on retry', async () => {
        // Seed 5 other ready documents
        for (let i = 0; i < 5; i++) {
          await createWorkspaceDocument(workspaceId, {
            title: `Ready FAQ ${i}`,
            fileType: 'faq',
            uploadedBy: ownerId,
          });
        }

        const failedDoc = await createWorkspaceDocument(workspaceId, {
          title: 'Retry Quota FAQ',
          content: 'Retrying this would exceed 5 active documents.',
          fileType: 'faq',
          uploadedBy: ownerId,
        });
        await updateWorkspaceDocumentStatus(workspaceId, failedDoc._id, {
          status: 'failed',
        });

        const retryRes = await retryDocumentAction('storage-ws', failedDoc._id.toString());
        expect(retryRes.success).toBe(false);
        expect(retryRes.error).toContain('maximum document limit (5)');
      });

      it('retry self-count: timed-out processing doc at 5-doc limit can be retried without hitting quota (Item 4)', async () => {
        // Seed 4 ready documents
        for (let i = 0; i < 4; i++) {
          await createWorkspaceDocument(workspaceId, {
            title: `Ready FAQ ${i}`,
            fileType: 'faq',
            uploadedBy: ownerId,
          });
        }

        // 5th document is timed-out processing (started 10 minutes ago)
        const timedOutDoc = await createWorkspaceDocument(workspaceId, {
          title: 'Timed Out Processing FAQ',
          content: 'This document timed out earlier while processing.',
          fileType: 'faq',
          uploadedBy: ownerId,
        });
        await updateWorkspaceDocumentStatus(workspaceId, timedOutDoc._id, {
          status: 'processing',
        });
        await mongoose.connection.collection('sourcedocuments').updateOne(
          { _id: timedOutDoc._id },
          { $set: { processingStartedAt: new Date(Date.now() - 10 * 60 * 1000) } }
        );

        // Total documents in workspace is 5 (the free tier limit)
        const totalDocs = await countWorkspaceDocuments(workspaceId);
        expect(totalDocs).toBe(5);

        // Retrying the timed-out 5th document must SUCCEED because it excludes itself from quota check
        const retryRes = await retryDocumentAction('storage-ws', timedOutDoc._id.toString());
        expect(retryRes.success).toBe(true);

        const docAfterRetry = await getWorkspaceDocumentById(workspaceId, timedOutDoc._id);
        expect(docAfterRetry?.status).toBe('ready');
        expect(docAfterRetry?.chunkCount).toBe(1);
      });
    });

    describe('uploadDocumentAction (In-Memory File Uploads)', () => {
      it('successfully processes, chunks, embeds, and indexes a valid .txt file', async () => {
        const textContent = 'Company Policy Document.\nWe guarantee quick resolution for all questions.\nRefunds are processed within 14 business days.';
        const file = new File([textContent], 'handbook.txt', { type: 'text/plain' });

        const formData = new FormData();
        formData.append('workspaceSlug', 'storage-ws');
        formData.append('file', file);
        formData.append('title', 'Employee Handbook');

        const res = await uploadDocumentAction(formData);
        expect(res.success).toBe(true);
        expect(res.documentId).toBeDefined();

        const doc = await getWorkspaceDocumentById(workspaceId, res.documentId!);
        expect(doc?.status).toBe('ready');
        expect(doc?.title).toBe('Employee Handbook');
        expect(doc?.fileType).toBe('txt');
        expect(doc?.chunkCount).toBeGreaterThan(0);

        const chunks = await getWorkspaceDocumentChunks(workspaceId, res.documentId!);
        expect(chunks.length).toBeGreaterThan(0);
        expect(chunks[0].content).toContain('Company Policy');
      });

      it('successfully indexes a valid .md file and defaults title to fileName', async () => {
        const mdContent = '# Technical Guide\n\nComprehensive API documentation and developer guides.';
        const file = new File([mdContent], 'api-guide.md', { type: 'text/markdown' });

        const formData = new FormData();
        formData.append('workspaceSlug', 'storage-ws');
        formData.append('file', file);

        const res = await uploadDocumentAction(formData);
        expect(res.success).toBe(true);

        const doc = await getWorkspaceDocumentById(workspaceId, res.documentId!);
        expect(doc?.title).toBe('api-guide');
        expect(doc?.fileType).toBe('md');
        expect(doc?.status).toBe('ready');
      });

      it('rejects unsupported file formats cleanly with friendly error', async () => {
        const file = new File(['binary content'], 'script.exe', { type: 'application/x-msdownload' });

        const formData = new FormData();
        formData.append('workspaceSlug', 'storage-ws');
        formData.append('file', file);

        const res = await uploadDocumentAction(formData);
        expect(res.success).toBe(false);
        expect(res.error).toContain('Unsupported file format');
      });

      it('rejects an image-only PDF with "no readable text" and creates zero documents in database', async () => {
        const fs = await import('fs');
        const path = await import('path');
        const fixturePath = path.join(process.cwd(), 'src/tests/fixtures/image-only.pdf');
        const buffer = fs.readFileSync(fixturePath);
        const file = new File([buffer], 'scanned-screenshot.pdf', { type: 'application/pdf' });

        const countBefore = await countWorkspaceDocuments(workspaceId);

        const formData = new FormData();
        formData.append('workspaceSlug', 'storage-ws');
        formData.append('file', file);
        formData.append('title', 'Scanned Screenshot');

        const res = await uploadDocumentAction(formData);
        expect(res.success).toBe(false);
        expect(res.error).toMatch(/no readable text/i);

        // Verification: ensure nothing was created in MongoDB
        const countAfter = await countWorkspaceDocuments(workspaceId);
        expect(countAfter).toBe(countBefore);
      });

      it('successfully processes, chunks, embeds, and indexes a real text PDF fixture', async () => {
        const fs = await import('fs');
        const path = await import('path');
        const fixturePath = path.join(process.cwd(), 'src/tests/fixtures/real-text.pdf');
        const buffer = fs.readFileSync(fixturePath);
        const file = new File([buffer], 'croissant-menu.pdf', { type: 'application/pdf' });

        const formData = new FormData();
        formData.append('workspaceSlug', 'storage-ws');
        formData.append('file', file);
        formData.append('title', 'Croissant Pricing Menu');

        const res = await uploadDocumentAction(formData);
        expect(res.success).toBe(true);
        expect(res.documentId).toBeDefined();

        const doc = await getWorkspaceDocumentById(workspaceId, res.documentId!);
        expect(doc?.status).toBe('ready');
        expect(doc?.title).toBe('Croissant Pricing Menu');
        expect(doc?.fileType).toBe('pdf');
        expect(doc?.chunkCount).toBeGreaterThan(0);
      });
    });
  });
});
