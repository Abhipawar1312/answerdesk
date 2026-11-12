import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  createWorkspaceDocument,
  getWorkspaceDocuments,
  getWorkspaceDocumentById,
  deleteWorkspaceDocument,
  countWorkspaceDocuments,
  insertWorkspaceDocumentChunks,
  getWorkspaceDocumentChunks,
} from './scoped-queries';
import { SourceDocument } from '@/models/SourceDocument';
import { SourceDocumentChunk } from '@/models/SourceDocumentChunk';
import { TenantIsolationError } from './plugins/enforceWorkspaceScoping';
import { EMBEDDING_CONFIG } from '@/lib/constants';

describe('Multi-Tenant Cross-Isolation Integration Tests (Real MongoDB)', () => {
  let mongoServer: MongoMemoryServer;

  const tenantA = new mongoose.Types.ObjectId();
  const tenantB = new mongoose.Types.ObjectId();
  const userA = new mongoose.Types.ObjectId();
  const userB = new mongoose.Types.ObjectId();

  let docAId: string;
  let docBId: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);

    // Seed Tenant A document
    const docA = await createWorkspaceDocument(tenantA, {
      title: 'Tenant A Secret Manual',
      fileName: 'secret-a.pdf',
      fileSize: 1024 * 100,
      fileType: 'pdf',
      fileUrl: 'https://mock.storage/a.pdf',
      uploadedBy: userA,
    });
    docAId = docA._id.toString();

    // Seed Tenant B document
    const docB = await createWorkspaceDocument(tenantB, {
      title: 'Tenant B Internal Policy',
      fileName: 'internal-b.md',
      fileSize: 1024 * 50,
      fileType: 'md',
      fileUrl: 'https://mock.storage/b.md',
      uploadedBy: userB,
    });
    docBId = docB._id.toString();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  it('Tenant A cannot see Tenant B documents via list queries', async () => {
    const docs = await getWorkspaceDocuments(tenantA);
    expect(docs.length).toBe(1);
    expect(docs[0].title).toBe('Tenant A Secret Manual');
    expect(docs[0].workspaceId.toString()).toBe(tenantA.toString());

    // Prove Tenant B document is completely excluded from Tenant A's view
    const containsDocB = docs.some((d) => d._id.toString() === docBId);
    expect(containsDocB).toBe(false);
  });

  it('Tenant B cannot see Tenant A documents via list queries', async () => {
    const docs = await getWorkspaceDocuments(tenantB);
    expect(docs.length).toBe(1);
    expect(docs[0].title).toBe('Tenant B Internal Policy');
    expect(docs[0].workspaceId.toString()).toBe(tenantB.toString());

    const containsDocA = docs.some((d) => d._id.toString() === docAId);
    expect(containsDocA).toBe(false);
  });

  it('Tenant A cannot retrieve Tenant B document even if Document ID is known (IDOR protection)', async () => {
    // Tenant A attempts to fetch Tenant B's known ID with Tenant A's workspace context
    const leakedDoc = await getWorkspaceDocumentById(tenantA, docBId);
    expect(leakedDoc).toBeNull();
  });

  it('Tenant A cannot delete Tenant B document (IDOR delete protection)', async () => {
    // Tenant A attempts to delete Tenant B's document ID
    const deleted = await deleteWorkspaceDocument(tenantA, docBId);
    expect(deleted.success).toBe(false);

    // Verify Tenant B's document is still intact in the database
    const docBStillExists = await getWorkspaceDocumentById(tenantB, docBId);
    expect(docBStillExists).not.toBeNull();
    expect(docBStillExists?._id.toString()).toBe(docBId);
  });

  it('Tenant A cannot alter Tenant B documents through raw Mongoose queries', async () => {
    // Tenant A tries to update Tenant B's document by specifying their own workspaceId
    const updateResult = await SourceDocument.updateOne(
      { workspaceId: tenantA, _id: docBId },
      { title: 'Hacked by Tenant A' }
    );
    expect(updateResult.matchedCount).toBe(0);
    expect(updateResult.modifiedCount).toBe(0);

    // Verify Document B title is untouched
    const docB = await getWorkspaceDocumentById(tenantB, docBId);
    expect(docB?.title).toBe('Tenant B Internal Policy');
  });

  it('Direct query without workspaceId is rejected unconditionally by the plugin', async () => {
    // An attacker or faulty query omitting workspaceId must throw TenantIsolationError
    await expect(
      SourceDocument.find({ _id: docBId }).exec()
    ).rejects.toThrow(TenantIsolationError);
  });

  it('Accurate isolated document counts per workspace (excluding failed docs)', async () => {
    const countA = await countWorkspaceDocuments(tenantA);
    const countB = await countWorkspaceDocuments(tenantB);

    expect(countA).toBe(1);
    expect(countB).toBe(1);
  });

  describe('Real-Database Tests for insertMany & Vector Length Validation (A6)', () => {
    const valid768Vector = new Array(768).fill(0.05);

    it('insertMany without workspaceId is rejected unconditionally with TenantIsolationError', async () => {
      // Intentionally omitting workspaceId in raw doc array
      const invalidDocs = [
        {
          documentId: new mongoose.Types.ObjectId(docAId),
          chunkIndex: 0,
          content: 'Unscoped chunk attempt',
          tokenCount: 5,
          embedding: valid768Vector,
          embeddingModel: EMBEDDING_CONFIG.model,
          metadata: { sourceTitle: 'Test' },
        },
      ];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await expect(SourceDocumentChunk.insertMany(invalidDocs as any)).rejects.toThrow(
        TenantIsolationError
      );
    });

    it('insertMany with valid workspaceId succeeds and saves chunks', async () => {
      const chunksToInsert = [
        {
          chunkIndex: 0,
          content: 'Valid chunk content for Tenant A',
          tokenCount: 8,
          embedding: valid768Vector,
          metadata: { sourceTitle: 'Tenant A Secret Manual' },
        },
      ];

      await insertWorkspaceDocumentChunks(tenantA, docAId, chunksToInsert);

      const savedChunks = await getWorkspaceDocumentChunks(tenantA, docAId);
      expect(savedChunks.length).toBe(1);
      expect(savedChunks[0].workspaceId.toString()).toBe(tenantA.toString());
      expect(savedChunks[0].embedding.length).toBe(768);
      expect(savedChunks[0].embeddingModel).toBe(EMBEDDING_CONFIG.model);
    });

    it('a chunk with a bad embedding length (e.g. 100 instead of 768) is rejected by schema validator', async () => {
      const badLengthVector = new Array(100).fill(0.01);
      const invalidChunk = {
        workspaceId: tenantA,
        documentId: new mongoose.Types.ObjectId(docAId),
        chunkIndex: 99,
        content: 'Chunk with bad embedding length',
        tokenCount: 6,
        embedding: badLengthVector,
        embeddingModel: EMBEDDING_CONFIG.model,
        metadata: { sourceTitle: 'Test' },
      };

      await expect(SourceDocumentChunk.insertMany([invalidChunk])).rejects.toThrow(
        /Embedding must have exactly 768 dimensions/
      );
    });
  });
});
