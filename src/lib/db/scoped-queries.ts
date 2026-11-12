import { Types } from 'mongoose';
import { SourceDocument, ISourceDocument } from '@/models/SourceDocument';
import { SourceDocumentChunk } from '@/models/SourceDocumentChunk';
import { Conversation, IConversation } from '@/models/Conversation';
import { Message, IMessage } from '@/models/Message';
import { Workspace, IWorkspace } from '@/models/Workspace';
import { IngestAttempt } from '@/models/IngestAttempt';
import { GlobalChatUsage } from '@/models/GlobalChatUsage';
import { toObjectId, isValidObjectId } from '@/lib/db/plugins/enforceWorkspaceScoping';
import {
  EMBEDDING_CONFIG,
  INGESTION_LIMITS,
  RETRIEVAL_CONFIG,
  TEST_CHAT_LIMITS,
} from '@/lib/constants';
import { normalizeOrigin } from '@/lib/origins';
import { detectGreetingOrThanks } from '@/lib/greetings';

export interface CreateDocumentInput {
  title: string;
  content?: string;
  fileName?: string;
  fileSize?: number;
  fileType: 'pdf' | 'txt' | 'md' | 'faq';
  fileUrl?: string;
  uploadedBy: string | Types.ObjectId;
}

export interface ChunkToInsert {
  chunkIndex: number;
  content: string;
  tokenCount: number;
  embedding: number[];
  metadata: {
    sourceTitle: string;
    pageNumber?: number;
  };
}

/**
 * Tenant-scoped query repository.
 * ALL database operations on tenant-scoped collections MUST flow through these functions.
 * Direct imports of tenant models are banned outside src/lib/db via ESLint.
 */

/**
 * Checks whether a document has been stuck in 'processing' status for more than 15 minutes.
 */
export function isProcessingTimedOut(
  processingStartedAt?: Date | null,
  timeoutMs = INGESTION_LIMITS.processingTimeoutMs
): boolean {
  if (!processingStartedAt) return false;
  return Date.now() - new Date(processingStartedAt).getTime() > timeoutMs;
}

export async function getWorkspaceDocuments(
  workspaceId: string | Types.ObjectId
): Promise<ISourceDocument[]> {
  const wId = toObjectId(workspaceId);
  return SourceDocument.find({ workspaceId: wId })
    .sort({ createdAt: -1 })
    .lean<ISourceDocument[]>();
}

export async function getWorkspaceDocumentById(
  workspaceId: string | Types.ObjectId,
  documentId: string | Types.ObjectId
): Promise<ISourceDocument | null> {
  const wId = toObjectId(workspaceId);
  if (!isValidObjectId(documentId)) return null;
  const dId = toObjectId(documentId);

  return SourceDocument.findOne({ workspaceId: wId, _id: dId }).lean<ISourceDocument>();
}

export async function createWorkspaceDocument(
  workspaceId: string | Types.ObjectId,
  data: CreateDocumentInput
): Promise<ISourceDocument> {
  const wId = toObjectId(workspaceId);
  const uId = toObjectId(data.uploadedBy);

  return SourceDocument.create({
    workspaceId: wId,
    title: data.title,
    content: data.content,
    fileName: data.fileName,
    fileSize: data.fileSize,
    fileType: data.fileType,
    fileUrl: data.fileUrl,
    status: 'pending',
    chunkCount: 0,
    uploadedBy: uId,
  });
}

/**
 * Deletes a workspace document and its chunks.
 * Prevents deletion while the document is actively indexing (Item 9).
 */
export async function deleteWorkspaceDocument(
  workspaceId: string | Types.ObjectId,
  documentId: string | Types.ObjectId
): Promise<{ success: boolean; error?: string }> {
  const wId = toObjectId(workspaceId);
  if (!isValidObjectId(documentId)) return { success: false, error: 'Invalid document ID.' };
  const dId = toObjectId(documentId);

  const doc = await SourceDocument.findOne({ workspaceId: wId, _id: dId });
  if (!doc) return { success: false, error: 'Document not found.' };

  if (doc.status === 'processing' && !isProcessingTimedOut(doc.processingStartedAt)) {
    return {
      success: false,
      error: 'This document is currently being indexed. Please wait until indexing completes before deleting.',
    };
  }

  // Cascade delete chunks and document, strictly scoped by workspaceId
  await SourceDocumentChunk.deleteMany({
    workspaceId: wId,
    documentId: dId,
  });

  const result = await SourceDocument.deleteOne({
    workspaceId: wId,
    _id: dId,
  });

  return { success: result.deletedCount > 0 };
}

export async function deleteWorkspaceDocumentChunks(
  workspaceId: string | Types.ObjectId,
  documentId: string | Types.ObjectId
): Promise<number> {
  const wId = toObjectId(workspaceId);
  if (!isValidObjectId(documentId)) return 0;
  const dId = toObjectId(documentId);

  const res = await SourceDocumentChunk.deleteMany({
    workspaceId: wId,
    documentId: dId,
  });
  return res.deletedCount;
}

/**
 * Counts workspace documents that are NOT in 'failed' status.
 * Failed ingestion documents do not count toward tenant plan limits.
 * Optional excludeDocumentId parameter allows retrying a timed-out document without counting against itself.
 */
export async function countWorkspaceDocuments(
  workspaceId: string | Types.ObjectId,
  options?: { excludeDocumentId?: string | Types.ObjectId }
): Promise<number> {
  const wId = toObjectId(workspaceId);
  const filter: Record<string, unknown> = {
    workspaceId: wId,
    status: { $ne: 'failed' },
  };
  if (options?.excludeDocumentId && isValidObjectId(options.excludeDocumentId)) {
    filter._id = { $ne: toObjectId(options.excludeDocumentId) };
  }
  return SourceDocument.countDocuments(filter);
}

export async function countWorkspaceConversations(
  workspaceId: string | Types.ObjectId
): Promise<number> {
  const wId = toObjectId(workspaceId);

  // 1. Find all customer conversations (exclude owner test chats)
  const customerConvs = await Conversation.find(
    { workspaceId: wId, isTest: { $ne: true } },
    { _id: 1 }
  ).lean<IConversation[]>();

  if (customerConvs.length === 0) return 0;
  const convIds = customerConvs.map((c) => c._id);

  // 2. Find conversations with at least one REAL customer query (exclude greeting-only chats)
  const userMessages = await Message.find(
    {
      workspaceId: wId,
      conversationId: { $in: convIds },
      role: 'user',
    },
    { conversationId: 1, content: 1, isGreeting: 1 }
  ).lean<IMessage[]>();

  const realConvIds = new Set<string>();
  for (const msg of userMessages) {
    if (msg.isGreeting === true) continue;
    if (msg.isGreeting === undefined) {
      const greetingCheck = detectGreetingOrThanks(msg.content);
      if (greetingCheck.isHandled) continue;
    }
    realConvIds.add(msg.conversationId.toString());
  }

  return realConvIds.size;
}

export async function countWorkspaceUnansweredMessages(
  workspaceId: string | Types.ObjectId
): Promise<number> {
  const wId = toObjectId(workspaceId);

  // Exclude owner test chats
  const customerConvs = await Conversation.find(
    { workspaceId: wId, isTest: { $ne: true } },
    { _id: 1 }
  ).lean<IConversation[]>();

  if (customerConvs.length === 0) return 0;
  const convIds = customerConvs.map((c) => c._id);

  // Count only un-dismissed unanswered messages in real customer conversations
  return Message.countDocuments({
    workspaceId: wId,
    conversationId: { $in: convIds },
    isUnanswered: true,
    isDismissed: { $ne: true },
  });
}

export async function countWorkspaceChunks(
  workspaceId: string | Types.ObjectId,
  options?: { excludeDocumentId?: string | Types.ObjectId }
): Promise<number> {
  const wId = toObjectId(workspaceId);
  const filter: Record<string, unknown> = { workspaceId: wId };
  if (options?.excludeDocumentId && isValidObjectId(options.excludeDocumentId)) {
    filter.documentId = { $ne: toObjectId(options.excludeDocumentId) };
  }
  return SourceDocumentChunk.countDocuments(filter);
}

/**
 * Ingest-Attempt Log Management (Item 1).
 * Records an attempt (create or retry) that persists even if the document is deleted.
 * Scoped by workspaceId and TTL indexed for 2 hours.
 */
export async function recordIngestAttempt(
  workspaceId: string | Types.ObjectId,
  data: {
    documentId?: string | Types.ObjectId;
    attemptType: 'create' | 'retry';
    chunkCount: number;
    status: 'started' | 'success' | 'failed';
  }
): Promise<Types.ObjectId> {
  const wId = toObjectId(workspaceId);
  const attempt = await IngestAttempt.create({
    workspaceId: wId,
    documentId: data.documentId && isValidObjectId(data.documentId) ? toObjectId(data.documentId) : undefined,
    attemptType: data.attemptType,
    chunkCount: data.chunkCount,
    status: data.status,
  });
  return attempt._id;
}

export async function updateIngestAttemptStatus(
  workspaceId: string | Types.ObjectId,
  attemptId: string | Types.ObjectId,
  status: 'success' | 'failed'
): Promise<void> {
  const wId = toObjectId(workspaceId);
  const aId = toObjectId(attemptId);
  await IngestAttempt.updateOne({ workspaceId: wId, _id: aId }, { $set: { status } });
}

/**
 * Removes an ingest attempt record when ingestion is aborted due to "service busy" / rate limit,
 * ensuring users are not penalized against their 10 attempts/hour limit.
 */
export async function deleteIngestAttempt(
  workspaceId: string | Types.ObjectId,
  attemptId: string | Types.ObjectId
): Promise<void> {
  const wId = toObjectId(workspaceId);
  if (!isValidObjectId(attemptId)) return;
  const aId = toObjectId(attemptId);
  await IngestAttempt.deleteOne({ workspaceId: wId, _id: aId });
}

/**
 * Counts total ingestion attempts from the IngestAttempt log in the given duration window.
 * Persists even if documents are deleted, preventing limit circumvention (Item 1).
 */
export async function countRecentWorkspaceIngestAttempts(
  workspaceId: string | Types.ObjectId,
  durationMs = 3600 * 1000
): Promise<number> {
  const wId = toObjectId(workspaceId);
  const since = new Date(Date.now() - durationMs);
  return IngestAttempt.countDocuments({
    workspaceId: wId,
    createdAt: { $gte: since },
  });
}

/**
 * Counts chunks attempted in the given duration window from the IngestAttempt log.
 */
export async function countRecentWorkspaceChunks(
  workspaceId: string | Types.ObjectId,
  durationMs = 60 * 1000
): Promise<number> {
  const wId = toObjectId(workspaceId);
  const since = new Date(Date.now() - durationMs);
  const result = await IngestAttempt.aggregate([
    { $match: { workspaceId: wId, createdAt: { $gte: since } } },
    { $group: { _id: null, total: { $sum: '$chunkCount' } } },
  ]);
  return result[0]?.total ?? 0;
}

export async function getWorkspaceDocumentChunks(
  workspaceId: string | Types.ObjectId,
  documentId: string | Types.ObjectId
) {
  const wId = toObjectId(workspaceId);
  const dId = toObjectId(documentId);
  return SourceDocumentChunk.find({ workspaceId: wId, documentId: dId }).lean();
}

/**
 * Retrieves ready document IDs for a workspace.
 * Retrieval queries MUST only match chunks belonging to documents with status 'ready'.
 */
export async function getReadyWorkspaceDocumentIds(
  workspaceId: string | Types.ObjectId
): Promise<Types.ObjectId[]> {
  const wId = toObjectId(workspaceId);
  const docs = await SourceDocument.find({ workspaceId: wId, status: 'ready' }, { _id: 1 }).lean();
  return docs.map((d) => d._id);
}

/**
 * Retrieves chunks belonging only to documents with status 'ready'.
 */
export async function getReadyWorkspaceDocumentChunks(
  workspaceId: string | Types.ObjectId,
  documentId?: string | Types.ObjectId
) {
  const wId = toObjectId(workspaceId);
  const readyDocIds = await getReadyWorkspaceDocumentIds(wId);

  if (documentId && isValidObjectId(documentId)) {
    const dId = toObjectId(documentId);
    const isReady = readyDocIds.some((id) => id.toString() === dId.toString());
    if (!isReady) return [];
    return SourceDocumentChunk.find({ workspaceId: wId, documentId: dId }).lean();
  }

  return SourceDocumentChunk.find({
    workspaceId: wId,
    documentId: { $in: readyDocIds },
  }).lean();
}

export async function insertWorkspaceDocumentChunks(
  workspaceId: string | Types.ObjectId,
  documentId: string | Types.ObjectId,
  chunks: ChunkToInsert[]
): Promise<void> {
  const wId = toObjectId(workspaceId);
  const dId = toObjectId(documentId);

  if (!chunks || chunks.length === 0) return;

  const docs = chunks.map((c) => ({
    workspaceId: wId,
    documentId: dId,
    chunkIndex: c.chunkIndex,
    content: c.content,
    tokenCount: c.tokenCount,
    embedding: c.embedding,
    embeddingModel: EMBEDDING_CONFIG.model,
    metadata: c.metadata,
  }));

  // Uses Mongoose insertMany, guarded by enforceWorkspaceScoping plugin
  await SourceDocumentChunk.insertMany(docs);
}

export async function updateWorkspaceDocumentStatus(
  workspaceId: string | Types.ObjectId,
  documentId: string | Types.ObjectId,
  update: {
    status: 'pending' | 'processing' | 'ready' | 'failed';
    chunkCount?: number;
    errorMessage?: string;
  }
): Promise<ISourceDocument | null> {
  const wId = toObjectId(workspaceId);
  if (!isValidObjectId(documentId)) return null;
  const dId = toObjectId(documentId);

  const setFields: Record<string, unknown> = {
    status: update.status,
    ...(update.chunkCount !== undefined ? { chunkCount: update.chunkCount } : {}),
    errorMessage: update.errorMessage ?? null,
  };

  if (update.status === 'processing') {
    setFields.processingStartedAt = new Date();
  }

  return SourceDocument.findOneAndUpdate(
    { workspaceId: wId, _id: dId },
    { $set: setFields },
    { returnDocument: 'after' }
  ).lean<ISourceDocument>();
}

/**
 * Concurrency Lock: Atomically acquires an ingestion lock for the workspace.
 * Stores a unique random lock token and returns it upon success, or null if lock is held.
 */
export async function acquireWorkspaceIngestLock(
  workspaceId: string | Types.ObjectId,
  durationMs = INGESTION_LIMITS.lockDurationMs
): Promise<string | null> {
  const wId = toObjectId(workspaceId);
  const now = new Date();
  const lockExpires = new Date(now.getTime() + durationMs);
  const lockToken = crypto.randomUUID();

  const updated = await Workspace.findOneAndUpdate(
    {
      _id: wId,
      $or: [
        { ingestLockUntil: null },
        { ingestLockUntil: { $exists: false } },
        { ingestLockUntil: { $lte: now } },
      ],
    },
    { $set: { ingestLockUntil: lockExpires, ingestLockToken: lockToken } },
    { returnDocument: 'after' }
  );

  return updated ? lockToken : null;
}

/**
 * Releases the workspace ingestion lock only if the caller holds the matching lockToken.
 */
export async function releaseWorkspaceIngestLock(
  workspaceId: string | Types.ObjectId,
  lockToken?: string | null
): Promise<boolean> {
  const wId = toObjectId(workspaceId);
  if (!lockToken) return false;

  const result = await Workspace.updateOne(
    { _id: wId, ingestLockToken: lockToken },
    { $set: { ingestLockUntil: null, ingestLockToken: null } }
  );

  return result.modifiedCount > 0;
}

/**
 * Thrown when MongoDB Atlas vector search index is missing or building.
 */
export class VectorIndexMissingError extends Error {
  constructor(
    message = 'Vector search index is not yet created in MongoDB Atlas. Please configure the "vector_index" search index on sourcedocumentchunks.'
  ) {
    super(message);
    this.name = 'VectorIndexMissingError';
  }
}

export interface RetrievedChunk {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  documentId: Types.ObjectId;
  chunkIndex: number;
  content: string;
  tokenCount: number;
  score: number;
  metadata: {
    sourceTitle: string;
    pageNumber?: number;
  };
}

export interface SearchChunksResult {
  chunks: RetrievedChunk[];
  topScore: number;
  isUnanswered: boolean;
}

function calculateCosine(vecA: number[], vecB: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Searches chunks within a workspace using $vectorSearch.
 *
 * Tenancy and Safety Guarantees:
 * - $vectorSearch is the FIRST pipeline stage with filter.workspaceId: { $eq: wId }.
 * - In-memory verification: only chunks from documents with status 'ready' are retained.
 * - NO $lookup on tenant collections.
 * - Returns isUnanswered = true if top score < threshold (default: 0.65).
 */
export async function searchWorkspaceChunks(
  workspaceId: string | Types.ObjectId,
  queryVector: number[],
  options?: {
    limit?: number;
    threshold?: number;
    simulateIndexMissing?: boolean;
  }
): Promise<SearchChunksResult> {
  const wId = toObjectId(workspaceId);
  const threshold = options?.threshold ?? RETRIEVAL_CONFIG.similarityThreshold;
  const limit = options?.limit ?? RETRIEVAL_CONFIG.limit;

  if (options?.simulateIndexMissing) {
    throw new VectorIndexMissingError();
  }

  // 1. Fetch ready document IDs (scoped)
  const readyDocIds = await getReadyWorkspaceDocumentIds(wId);
  if (readyDocIds.length === 0) {
    return { chunks: [], topScore: 0, isUnanswered: true };
  }
  const readyDocIdSet = new Set(readyDocIds.map((id) => id.toString()));

  const vectorPipeline = [
    {
      $vectorSearch: {
        index: RETRIEVAL_CONFIG.vectorIndexName,
        path: 'embedding',
        queryVector,
        numCandidates: RETRIEVAL_CONFIG.numCandidates,
        limit: limit * 2, // Fetch candidates to allow in-memory ready-status filtering
        filter: {
          workspaceId: { $eq: wId },
        },
      },
    },
    {
      $project: {
        _id: 1,
        workspaceId: 1,
        documentId: 1,
        chunkIndex: 1,
        content: 1,
        tokenCount: 1,
        metadata: 1,
        score: { $meta: 'vectorSearchScore' },
      },
    },
  ];

  let rawChunks: (RetrievedChunk & { score: number })[] = [];

  try {
    rawChunks = await SourceDocumentChunk.aggregate(vectorPipeline);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);

    // If Atlas vector search index is missing
    if (
      errMsg.includes('Index not found') ||
      errMsg.includes('vector_index') ||
      errMsg.includes('PlanExecutor error')
    ) {
      throw new VectorIndexMissingError();
    }

    // In unit testing environment (e.g. MongoMemoryServer which lacks Atlas $vectorSearch plugin)
    if (
      errMsg.includes("Unrecognized pipeline stage name: '$vectorSearch'") ||
      errMsg.includes('requires additional configuration') ||
      errMsg.includes('AtlasCLI local deployment to enable')
    ) {
      const allChunks = await SourceDocumentChunk.find({ workspaceId: wId }).lean();
      const scored = allChunks.map((c) => ({
        _id: c._id,
        workspaceId: c.workspaceId,
        documentId: c.documentId,
        chunkIndex: c.chunkIndex,
        content: c.content,
        tokenCount: c.tokenCount,
        metadata: c.metadata,
        score: (1 + calculateCosine(queryVector, c.embedding)) / 2,
      }));
      scored.sort((a, b) => b.score - a.score);
      rawChunks = scored.slice(0, limit * 2);
    } else {
      throw err;
    }
  }

  const topScore = rawChunks[0]?.score ?? 0;

  // Decide unanswered BEFORE model call if top score < threshold
  if (topScore < threshold || rawChunks.length === 0) {
    return { chunks: [], topScore, isUnanswered: true };
  }

  // Filter chunks: must belong to a ready document and satisfy score threshold
  const validChunks = rawChunks
    .filter((c) => readyDocIdSet.has(c.documentId.toString()) && c.score >= threshold)
    .slice(0, limit);

  if (validChunks.length === 0) {
    return { chunks: [], topScore, isUnanswered: true };
  }

  return {
    chunks: validChunks,
    topScore,
    isUnanswered: false,
  };
}

/**
 * Creates a new Conversation scoped to workspaceId.
 */
export async function createWorkspaceConversation(
  workspaceId: string | Types.ObjectId,
  data: { visitorId: string; isTest?: boolean }
): Promise<IConversation> {
  const wId = toObjectId(workspaceId);
  return Conversation.create({
    workspaceId: wId,
    visitorId: data.visitorId,
    isTest: data.isTest ?? false,
    startedAt: new Date(),
    lastMessageAt: new Date(),
    status: 'active',
  });
}

/**
 * Retrieves a conversation by ID scoped to workspaceId.
 */
export async function getWorkspaceConversationById(
  workspaceId: string | Types.ObjectId,
  conversationId: string | Types.ObjectId
): Promise<IConversation | null> {
  const wId = toObjectId(workspaceId);
  if (!isValidObjectId(conversationId)) return null;
  const cId = toObjectId(conversationId);
  return Conversation.findOne({ workspaceId: wId, _id: cId }).lean<IConversation>();
}

/**
 * Creates a Message in a conversation scoped to workspaceId.
 */
export async function createWorkspaceMessage(
  workspaceId: string | Types.ObjectId,
  data: {
    conversationId: string | Types.ObjectId;
    role: 'user' | 'assistant' | 'system';
    content: string;
    sourceChunkIds?: (string | Types.ObjectId)[];
    citations?: Array<{
      documentId: string | Types.ObjectId;
      sourceTitle: string;
      chunkIndex: number;
      textSnippet?: string;
    }>;
    isUnanswered?: boolean;
    isDismissed?: boolean;
    isGreeting?: boolean;
    tokenUsage?: { promptTokens: number; completionTokens: number };
  }
): Promise<IMessage> {
  const wId = toObjectId(workspaceId);
  const cId = toObjectId(data.conversationId);

  const msg = await Message.create({
    workspaceId: wId,
    conversationId: cId,
    role: data.role,
    content: data.content,
    sourceChunkIds: data.sourceChunkIds?.map((id) => toObjectId(id)),
    citations: data.citations?.map((c) => ({
      documentId: toObjectId(c.documentId),
      sourceTitle: c.sourceTitle,
      chunkIndex: c.chunkIndex,
      textSnippet: c.textSnippet,
    })),
    isUnanswered: data.isUnanswered ?? false,
    isDismissed: data.isDismissed ?? false,
    isGreeting: data.isGreeting ?? false,
    tokenUsage: data.tokenUsage,
  });

  await Conversation.updateOne(
    { workspaceId: wId, _id: cId },
    { $set: { lastMessageAt: new Date() } }
  );

  return msg;
}

/**
 * Retrieves all messages in a conversation scoped to workspaceId, chronologically.
 */
export async function getWorkspaceMessages(
  workspaceId: string | Types.ObjectId,
  conversationId: string | Types.ObjectId
): Promise<IMessage[]> {
  const wId = toObjectId(workspaceId);
  if (!isValidObjectId(conversationId)) return [];
  const cId = toObjectId(conversationId);
  return Message.find({ workspaceId: wId, conversationId: cId })
    .sort({ createdAt: 1 })
    .lean<IMessage[]>();
}

/**
 * Counts owner test messages in the given duration window.
 */
export async function countRecentWorkspaceTestMessages(
  workspaceId: string | Types.ObjectId,
  durationMs = 3600 * 1000
): Promise<number> {
  const wId = toObjectId(workspaceId);
  const since = new Date(Date.now() - durationMs);
  const testConvs = await Conversation.find({ workspaceId: wId, isTest: true }, { _id: 1 }).lean();
  if (testConvs.length === 0) return 0;
  const testConvIds = testConvs.map((c) => c._id);
  return Message.countDocuments({
    workspaceId: wId,
    conversationId: { $in: testConvIds },
    role: 'user',
    createdAt: { $gte: since },
  });
}

/**
 * Checks and records global daily test chat budget to protect the 500 RPD Flash Lite quota.
 */
export async function checkAndRecordGlobalTestChatBudget(
  limit: number = TEST_CHAT_LIMITS.globalDailyTestChatBudget
): Promise<boolean> {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const countToday = await GlobalChatUsage.countDocuments({
    isTest: true,
    createdAt: { $gte: startOfDay },
  });

  if (countToday >= limit) {
    return false;
  }

  await GlobalChatUsage.create({ isTest: true });
  return true;
}

/**
 * Checks and records global public chat budget to guard the 500 RPD Flash Lite quota.
 * Returns false if remaining quota is low (>= 450 requests today) to protect against exhaustion.
 */
export async function checkAndRecordGlobalPublicChatBudget(
  limit: number = 450
): Promise<boolean> {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const countToday = await GlobalChatUsage.countDocuments({
    createdAt: { $gte: startOfDay },
  });

  if (countToday >= limit) {
    return false;
  }

  await GlobalChatUsage.create({ isTest: false });
  return true;
}

/**
 * Public workspace view (safe to expose to widget and visitors, no ownerId or internal secrets).
 */
export interface PublicWorkspace {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  allowedOrigins: string[];
  messageLimit: number;
  monthlyMessageCount: number;
  hideCitationsInWidget?: boolean;
  plan: 'free' | 'pro';
}

/**
 * Retrieves public workspace metadata by slug. Returns null if not found.
 */
export async function getPublicWorkspaceBySlug(slug: string): Promise<PublicWorkspace | null> {
  const ws = await Workspace.findOne(
    { slug: slug.toLowerCase().trim() },
    {
      _id: 1,
      name: 1,
      slug: 1,
      allowedOrigins: 1,
      messageLimit: 1,
      monthlyMessageCount: 1,
      hideCitationsInWidget: 1,
      plan: 1,
    }
  ).lean<PublicWorkspace>();

  if (ws && Array.isArray(ws.allowedOrigins)) {
    // Automatically migrate / normalize any stored origin values (stripping paths, trailing slashes, etc.)
    ws.allowedOrigins = ws.allowedOrigins
      .map((o) => {
        try {
          return normalizeOrigin(o);
        } catch {
          return null;
        }
      })
      .filter((o): o is string => Boolean(o));
  }

  return ws;
}

/**
 * Resets workspace monthly message count if 30+ days have passed since billingCycleAnchor.
 */
export async function resetMonthlyMessageCountIfCycleDue(
  workspaceId: string | Types.ObjectId,
  referenceDate: Date = new Date()
): Promise<boolean> {
  const wId = toObjectId(workspaceId);
  const thirtyDaysAgo = new Date(referenceDate.getTime() - 30 * 24 * 60 * 60 * 1000);
  const res = await Workspace.updateOne(
    {
      _id: wId,
      $or: [
        { billingCycleAnchor: { $lte: thirtyDaysAgo } },
        { billingCycleAnchor: { $exists: false } },
        { billingCycleAnchor: null },
      ],
    },
    { $set: { monthlyMessageCount: 0, billingCycleAnchor: referenceDate } }
  );
  return res.modifiedCount > 0;
}

/**
 * Checks whether a workspace has available message quota (under monthly limit and daily cap)
 * WITHOUT incrementing the counter. Resets billing cycle and daily counter if due.
 */
export async function checkWorkspaceMessageQuota(
  workspaceId: string | Types.ObjectId
): Promise<{
  allowed: boolean;
  reason?: 'monthly_limit' | 'daily_limit';
  monthlyMessageCount: number;
  messageLimit: number;
}> {
  const wId = toObjectId(workspaceId);
  const today = new Date().toISOString().slice(0, 10);

  // 1. Reset monthly message count if billing cycle is due (30 days)
  await resetMonthlyMessageCountIfCycleDue(wId);

  // 2. Reset daily counter if a new UTC day has started
  await Workspace.updateOne(
    { _id: wId, dailyMessageDate: { $ne: today } },
    { $set: { dailyMessageCount: 0, dailyMessageDate: today } }
  );

  const ws = await Workspace.findById(wId, {
    monthlyMessageCount: 1,
    messageLimit: 1,
    dailyMessageCount: 1,
    dailyMessageCap: 1,
    plan: 1,
  }).lean<IWorkspace>();

  if (!ws) {
    return { allowed: false, monthlyMessageCount: 0, messageLimit: 0 };
  }

  const effectiveDailyCap = ws.dailyMessageCap ?? (ws.plan === 'pro' ? 500 : 50);
  const monthlyCount = ws.monthlyMessageCount ?? 0;
  const messageLimit = ws.messageLimit ?? 100;
  const dailyCount = ws.dailyMessageCount ?? 0;

  if (monthlyCount >= messageLimit) {
    return {
      allowed: false,
      reason: 'monthly_limit',
      monthlyMessageCount: monthlyCount,
      messageLimit,
    };
  }

  if (dailyCount >= effectiveDailyCap) {
    return {
      allowed: false,
      reason: 'daily_limit',
      monthlyMessageCount: monthlyCount,
      messageLimit,
    };
  }

  return {
    allowed: true,
    monthlyMessageCount: monthlyCount,
    messageLimit,
  };
}

/**
 * Atomically checks and increments the workspace monthly and daily message count.
 * Resets daily count on date rollover and resets monthly count on billing cycle rollover.
 * Returns success: false if monthly limit or daily cap is exceeded.
 */
export async function incrementWorkspaceMessageCount(
  workspaceId: string | Types.ObjectId
): Promise<{
  success: boolean;
  reason?: 'monthly_limit' | 'daily_limit';
  monthlyMessageCount: number;
  messageLimit: number;
}> {
  const wId = toObjectId(workspaceId);
  const today = new Date().toISOString().slice(0, 10);

  // 1. Reset monthly message count if billing cycle is due (30 days)
  await resetMonthlyMessageCountIfCycleDue(wId);

  // 2. Reset daily counter if a new UTC day has started
  await Workspace.updateOne(
    { _id: wId, dailyMessageDate: { $ne: today } },
    { $set: { dailyMessageCount: 0, dailyMessageDate: today } }
  );

  const ws = await Workspace.findById(wId, {
    monthlyMessageCount: 1,
    messageLimit: 1,
    dailyMessageCount: 1,
    dailyMessageCap: 1,
    plan: 1,
  }).lean<IWorkspace>();

  if (!ws) {
    return { success: false, monthlyMessageCount: 0, messageLimit: 0 };
  }

  const effectiveDailyCap = ws.dailyMessageCap ?? (ws.plan === 'pro' ? 500 : 50);

  // 3. Atomic increment enforcing both monthly limit and daily cap
  const updated = await Workspace.findOneAndUpdate(
    {
      _id: wId,
      $expr: {
        $and: [
          { $lt: ['$monthlyMessageCount', '$messageLimit'] },
          { $lt: ['$dailyMessageCount', effectiveDailyCap] },
        ],
      },
    },
    {
      $inc: { monthlyMessageCount: 1, dailyMessageCount: 1 },
      $set: { dailyMessageDate: today },
    },
    { returnDocument: 'after' }
  );

  if (!updated) {
    const latestWs = await Workspace.findById(wId, {
      monthlyMessageCount: 1,
      messageLimit: 1,
      dailyMessageCount: 1,
      dailyMessageCap: 1,
    }).lean<IWorkspace>();

    const isDaily = (latestWs?.dailyMessageCount ?? 0) >= effectiveDailyCap;
    return {
      success: false,
      reason: isDaily ? 'daily_limit' : 'monthly_limit',
      monthlyMessageCount: latestWs?.monthlyMessageCount ?? ws.monthlyMessageCount,
      messageLimit: latestWs?.messageLimit ?? ws.messageLimit,
    };
  }

  return {
    success: true,
    monthlyMessageCount: updated.monthlyMessageCount,
    messageLimit: updated.messageLimit,
  };
}

/**
 * Updates allowed origins for a workspace.
 */
export async function updateWorkspaceAllowedOrigins(
  workspaceId: string | Types.ObjectId,
  allowedOrigins: string[]
): Promise<boolean> {
  const wId = toObjectId(workspaceId);
  const sanitizedOrigins: string[] = [];

  for (const o of allowedOrigins) {
    try {
      const normalized = normalizeOrigin(o);
      if (!sanitizedOrigins.includes(normalized)) {
        sanitizedOrigins.push(normalized);
      }
    } catch {
      // ignore invalid
    }
  }

  const result = await Workspace.updateOne(
    { _id: wId },
    { $set: { allowedOrigins: sanitizedOrigins } }
  );

  return result.matchedCount > 0;
}

/**
 * Updates workspace widget display settings (e.g. hide citation excerpts in widget).
 */
export async function updateWorkspaceDisplaySettings(
  workspaceId: string | Types.ObjectId,
  settings: { hideCitationsInWidget?: boolean }
): Promise<boolean> {
  const wId = toObjectId(workspaceId);
  const updateData: Record<string, unknown> = {};
  if (typeof settings.hideCitationsInWidget === 'boolean') {
    updateData.hideCitationsInWidget = settings.hideCitationsInWidget;
  }

  const result = await Workspace.updateOne({ _id: wId }, { $set: updateData });
  return result.matchedCount > 0;
}

/**
 * Updates workspace subscription status, plan tier, and Stripe metadata.
 */
export async function updateWorkspaceSubscription(
  workspaceId: string | Types.ObjectId,
  data: {
    plan: 'free' | 'pro';
    stripeCustomerId?: string;
    stripeSubscriptionId?: string | null;
    messageLimit: number;
    dailyMessageCap: number;
  }
): Promise<boolean> {
  const wId = toObjectId(workspaceId);
  const updateData: Record<string, unknown> = {
    plan: data.plan,
    messageLimit: data.messageLimit,
    dailyMessageCap: data.dailyMessageCap,
  };

  if (data.stripeCustomerId) {
    updateData.stripeCustomerId = data.stripeCustomerId;
  }
  if (data.stripeSubscriptionId !== undefined) {
    updateData.stripeSubscriptionId = data.stripeSubscriptionId;
  }

  const result = await Workspace.updateOne({ _id: wId }, { $set: updateData });
  return result.matchedCount > 0;
}

/**
 * Finds a workspace by Stripe Customer ID.
 */
export async function getWorkspaceByStripeCustomerId(
  customerId: string
): Promise<IWorkspace | null> {
  return Workspace.findOne({ stripeCustomerId: customerId }).lean<IWorkspace>();
}

/**
 * Finds a workspace by Stripe Subscription ID.
 */
export async function getWorkspaceByStripeSubscriptionId(
  subscriptionId: string
): Promise<IWorkspace | null> {
  return Workspace.findOne({ stripeSubscriptionId: subscriptionId }).lean<IWorkspace>();
}

export interface ConversationSummary {
  _id: string;
  visitorId: string;
  startedAt: Date;
  lastMessageAt: Date;
  status: 'active' | 'resolved';
  isTest?: boolean;
  messageCount: number;
  hasUnanswered: boolean;
  lastMessageSnippet?: string;
}

/**
 * Lists conversations for a workspace with message count and status.
 */
export async function listWorkspaceConversations(
  workspaceId: string | Types.ObjectId,
  options: {
    limit?: number;
    skip?: number;
    includeTest?: boolean;
    filter?: 'all' | 'unanswered';
  } = {}
): Promise<ConversationSummary[]> {
  const wId = toObjectId(workspaceId);
  const { limit = 50, skip = 0, includeTest = false, filter = 'all' } = options;

  const convQuery: Record<string, unknown> = { workspaceId: wId };
  if (!includeTest) {
    convQuery.isTest = { $ne: true };
  }

  const conversations = await Conversation.find(convQuery)
    .sort({ lastMessageAt: -1 })
    .skip(skip)
    .limit(limit * 2)
    .lean<IConversation[]>();

  const summaries: ConversationSummary[] = [];

  for (const c of conversations) {
    const msgs = await Message.find({ workspaceId: wId, conversationId: c._id })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean<IMessage[]>();

    const totalCount = await Message.countDocuments({ workspaceId: wId, conversationId: c._id });
    const hasUnanswered = msgs.some((m) => m.isUnanswered);

    if (filter === 'unanswered' && !hasUnanswered) {
      continue;
    }

    summaries.push({
      _id: c._id.toString(),
      visitorId: c.visitorId,
      startedAt: c.startedAt,
      lastMessageAt: c.lastMessageAt,
      status: c.status,
      isTest: c.isTest,
      messageCount: totalCount,
      hasUnanswered,
      lastMessageSnippet: msgs[0]?.content.slice(0, 100),
    });

    if (summaries.length >= limit) {
      break;
    }
  }

  return summaries;
}

export interface UnansweredQuestionItem {
  messageId: string;
  conversationId: string;
  question: string;
  askedAt: Date;
  visitorId: string;
  isTest?: boolean;
}

/**
 * Lists unanswered questions for review in the dashboard.
 * Excludes owner test chats and dismissed items.
 */
export async function listWorkspaceUnansweredQuestions(
  workspaceId: string | Types.ObjectId,
  options: { limit?: number; skip?: number } = {}
): Promise<UnansweredQuestionItem[]> {
  const wId = toObjectId(workspaceId);
  const { limit = 50, skip = 0 } = options;

  // Find non-test conversations
  const customerConvs = await Conversation.find(
    { workspaceId: wId, isTest: { $ne: true } },
    { _id: 1, visitorId: 1, isTest: 1 }
  ).lean<IConversation[]>();

  if (customerConvs.length === 0) return [];
  const convMap = new Map(customerConvs.map((c) => [c._id.toString(), c]));
  const convIds = customerConvs.map((c) => c._id);

  const unansweredMsgs = await Message.find({
    workspaceId: wId,
    conversationId: { $in: convIds },
    role: 'user',
    isUnanswered: true,
    isDismissed: { $ne: true },
  })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean<IMessage[]>();

  return unansweredMsgs.map((m) => {
    const c = convMap.get(m.conversationId.toString());
    return {
      messageId: m._id.toString(),
      conversationId: m.conversationId.toString(),
      question: m.content,
      askedAt: m.createdAt,
      visitorId: c?.visitorId ?? 'unknown',
      isTest: c?.isTest ?? false,
    };
  });
}

/**
 * Dismisses a single unanswered question for a workspace.
 */
export async function dismissWorkspaceUnansweredMessage(
  workspaceId: string | Types.ObjectId,
  messageId: string | Types.ObjectId
): Promise<boolean> {
  const wId = toObjectId(workspaceId);
  const mId = toObjectId(messageId);
  const res = await Message.updateOne(
    { _id: mId, workspaceId: wId, isUnanswered: true },
    { $set: { isDismissed: true } }
  );
  return res.modifiedCount > 0;
}

/**
 * Dismisses all unanswered questions for a workspace (excludes test chats).
 */
export async function dismissAllWorkspaceUnansweredMessages(
  workspaceId: string | Types.ObjectId
): Promise<number> {
  const wId = toObjectId(workspaceId);
  const customerConvs = await Conversation.find(
    { workspaceId: wId, isTest: { $ne: true } },
    { _id: 1 }
  ).lean<IConversation[]>();

  if (customerConvs.length === 0) return 0;
  const convIds = customerConvs.map((c) => c._id);

  const res = await Message.updateMany(
    { workspaceId: wId, conversationId: { $in: convIds }, isUnanswered: true, isDismissed: { $ne: true } },
    { $set: { isDismissed: true } }
  );
  return res.modifiedCount;
}

