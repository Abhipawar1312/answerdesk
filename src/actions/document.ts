'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { verifyWorkspaceOwner } from '@/lib/auth/dal';
import { connectDB } from '@/lib/db/mongoose';
import {
  createWorkspaceDocument,
  deleteWorkspaceDocument,
  deleteWorkspaceDocumentChunks,
  getWorkspaceDocumentById,
  countWorkspaceDocuments,
  countWorkspaceChunks,
  countRecentWorkspaceIngestAttempts,
  countRecentWorkspaceChunks,
  insertWorkspaceDocumentChunks,
  updateWorkspaceDocumentStatus,
  acquireWorkspaceIngestLock,
  releaseWorkspaceIngestLock,
  recordIngestAttempt,
  updateIngestAttemptStatus,
  deleteIngestAttempt,
  isProcessingTimedOut,
} from '@/lib/db/scoped-queries';
import { isValidObjectId } from '@/lib/db/plugins/enforceWorkspaceScoping';
import { PLAN_LIMITS, FAQ_LIMITS, INGESTION_LIMITS } from '@/lib/constants';
import { chunkText } from '@/services/text-chunker';
import { embedDocumentChunks, EmbeddingServiceError } from '@/services/embedding-service';
import { extractTextFromBuffer, FileExtractionError } from '@/services/file-extractor';

const createFaqSchema = z.object({
  workspaceSlug: z.string().min(1),
  title: z
    .string()
    .trim()
    .min(2, 'Title must be at least 2 characters')
    .max(FAQ_LIMITS.maxTitleLength, `Title cannot exceed ${FAQ_LIMITS.maxTitleLength} characters`),
  content: z
    .string()
    .trim()
    .min(FAQ_LIMITS.minTextLength, `Content must be at least ${FAQ_LIMITS.minTextLength} characters`)
    .max(FAQ_LIMITS.maxTextLength, `Content cannot exceed ${FAQ_LIMITS.maxTextLength} characters`),
});

export async function createFaqDocumentAction(data: z.infer<typeof createFaqSchema>) {
  const parsed = createFaqSchema.safeParse(data);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || 'Invalid FAQ input data',
    };
  }

  const { workspaceSlug, title, content } = parsed.data;

  // 1. Verify owner authorization
  const { workspace, session } = await verifyWorkspaceOwner(workspaceSlug);

  await connectDB();

  // 2. Concurrency Lock: Prevent parallel ingestion requests from overloading rate limits
  const lockToken = await acquireWorkspaceIngestLock(workspace._id);
  if (!lockToken) {
    return {
      success: false,
      error: 'Another document is currently being indexed for your workspace. Please wait until it completes.',
    };
  }

  try {
    // 3. Per-Workspace Ingestion Rate Limits (From Database)
    // 3a. Max 10 attempts per hour (including failed and retried attempts, persistent across deletion)
    const hourlyAttempts = await countRecentWorkspaceIngestAttempts(workspace._id, 3600 * 1000);
    if (hourlyAttempts >= INGESTION_LIMITS.maxAttemptsPerHourPerWorkspace) {
      return {
        success: false,
        error: `You have reached the maximum of ${INGESTION_LIMITS.maxAttemptsPerHourPerWorkspace} indexing attempts per hour for this workspace. Please try again later.`,
      };
    }

    // 4. Plan Quota Checks (failed documents are excluded from countWorkspaceDocuments)
    const planLimits = PLAN_LIMITS[workspace.plan];
    const docCount = await countWorkspaceDocuments(workspace._id);
    if (docCount >= planLimits.maxDocuments) {
      return {
        success: false,
        error: `You have reached the maximum document limit (${planLimits.maxDocuments}) for your plan. Please upgrade to add more knowledge base articles.`,
      };
    }

    // 5. Chunk the FAQ content losslessly
    const chunks = chunkText(content);
    if (chunks.length === 0) {
      return { success: false, error: 'FAQ content did not produce any valid text segments.' };
    }

    // 3b. Max chunks per minute per workspace (from IngestAttempt log, raised to 15 so 10k-char entries fit)
    const recentChunks = await countRecentWorkspaceChunks(workspace._id, 60 * 1000);
    if (recentChunks + chunks.length > INGESTION_LIMITS.maxChunksPerMinutePerWorkspace) {
      return {
        success: false,
        error: `Your workspace has reached the limit of ${INGESTION_LIMITS.maxChunksPerMinutePerWorkspace} chunks per minute. Please wait 60 seconds before indexing more.`,
      };
    }

    // Total chunks quota check
    const currentChunks = await countWorkspaceChunks(workspace._id);
    if (currentChunks + chunks.length > planLimits.maxChunks) {
      return {
        success: false,
        error: `Adding this FAQ would exceed your workspace chunk limit (${planLimits.maxChunks} chunks). Please remove old documents or upgrade your plan.`,
      };
    }

    // 6. Record Ingestion Attempt in persistent audit log (persists even if document is deleted)
    const attemptId = await recordIngestAttempt(workspace._id, {
      attemptType: 'create',
      chunkCount: chunks.length,
      status: 'started',
    });

    // 7. Create document in "pending" status, storing content for retry capability
    const doc = await createWorkspaceDocument(workspace._id, {
      title,
      content,
      fileType: 'faq',
      uploadedBy: session.user.id,
    });

    // 8. Transition to "processing" and record processingStartedAt
    await updateWorkspaceDocumentStatus(workspace._id, doc._id, {
      status: 'processing',
    });

    // 9. Embed and index with comprehensive error sanitization & cleanup
    let succeeded = false;
    let processingError: string | null = null;

    try {
      const chunkTexts = chunks.map((c) => c.content);
      const embeddings = await embedDocumentChunks(chunkTexts);

      // Verify the document still exists in MongoDB immediately before chunk insertion
      // If deleted concurrently, abort and clean up
      const docStillExists = await getWorkspaceDocumentById(workspace._id, doc._id);
      if (!docStillExists) {
        await deleteWorkspaceDocumentChunks(workspace._id, doc._id);
        await updateIngestAttemptStatus(workspace._id, attemptId, 'failed');
        return { success: false, error: 'Document was deleted during processing.' };
      }

      const chunkDocsToInsert = chunks.map((c, idx) => ({
        chunkIndex: c.chunkIndex,
        content: c.content,
        tokenCount: c.tokenCount,
        embedding: embeddings[idx],
        metadata: {
          sourceTitle: title,
        },
      }));

      await insertWorkspaceDocumentChunks(workspace._id, doc._id, chunkDocsToInsert);

      succeeded = true;
      await updateIngestAttemptStatus(workspace._id, attemptId, 'success');
      return { success: true, documentId: doc._id.toString() };
    } catch (err: unknown) {
      // Ingestion failure cleanup: delete any partially inserted chunks for this document
      await deleteWorkspaceDocumentChunks(workspace._id, doc._id);

      if (err instanceof EmbeddingServiceError && err.isRateLimit) {
        // Refused "service busy" attempts must not count toward the 10 per hour (Item 8)
        await deleteIngestAttempt(workspace._id, attemptId);
        processingError = err.message;
      } else {
        await updateIngestAttemptStatus(workspace._id, attemptId, 'failed');
        if (err instanceof EmbeddingServiceError) {
          processingError = err.message;
        } else {
          // Log unexpected error on server without leaking any secrets
          console.error(
            '[Ingestion Unexpected Error]:',
            err instanceof Error ? err.message : 'Unknown error'
          );
          processingError = 'Failed to process and index knowledge entry. Please try again.';
        }
      }

      return { success: false, error: processingError };
    } finally {
      // Set status ready or failed with zero raw errors leaked
      await updateWorkspaceDocumentStatus(workspace._id, doc._id, {
        status: succeeded ? 'ready' : 'failed',
        chunkCount: succeeded ? chunks.length : 0,
        errorMessage: processingError ?? undefined,
      });

      revalidatePath(`/dashboard/${workspaceSlug}/documents`);
      revalidatePath(`/dashboard/${workspaceSlug}`);
    }
  } finally {
    // Release only the lock held by this operation using lockToken (Item 5)
    await releaseWorkspaceIngestLock(workspace._id, lockToken);
  }
}

/**
 * Uploads and indexes a document (.txt, .md, .pdf) in memory without filesystem writes.
 */
export async function uploadDocumentAction(
  formData: FormData
): Promise<{ success: boolean; documentId?: string; error?: string }> {
  const workspaceSlug = formData.get('workspaceSlug');
  const file = formData.get('file');
  const customTitle = formData.get('title');

  if (typeof workspaceSlug !== 'string' || !workspaceSlug) {
    return { success: false, error: 'Missing workspace identifier.' };
  }

  if (!(file instanceof File) || file.size === 0) {
    return { success: false, error: 'Please select a valid file to upload.' };
  }

  // 1. Verify owner authorization
  const { workspace, session } = await verifyWorkspaceOwner(workspaceSlug);
  await connectDB();

  // 2. Extract plain text in memory
  let extracted;
  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    extracted = await extractTextFromBuffer(buffer, file.name, file.type, workspace.plan);
  } catch (err: unknown) {
    if (err instanceof FileExtractionError) {
      return { success: false, error: err.friendlyMessage };
    }
    return { success: false, error: 'Failed to extract text from file.' };
  }

  const documentTitle =
    typeof customTitle === 'string' && customTitle.trim()
      ? customTitle.trim()
      : file.name.replace(/\.[^/.]+$/, '');

  // 3. Concurrency Lock: Prevent parallel ingestion requests from overloading rate limits
  const lockToken = await acquireWorkspaceIngestLock(workspace._id);
  if (!lockToken) {
    return {
      success: false,
      error: 'Another document is currently being indexed for your workspace. Please wait until it completes.',
    };
  }

  try {
    // 4. Per-Workspace Ingestion Rate Limits (From Database)
    // 4a. Max 10 attempts per hour
    const hourlyAttempts = await countRecentWorkspaceIngestAttempts(workspace._id, 3600 * 1000);
    if (hourlyAttempts >= INGESTION_LIMITS.maxAttemptsPerHourPerWorkspace) {
      return {
        success: false,
        error: `You have reached the maximum of ${INGESTION_LIMITS.maxAttemptsPerHourPerWorkspace} indexing attempts per hour for this workspace. Please try again later.`,
      };
    }

    // 4b. Plan Document Quota
    const planLimits = PLAN_LIMITS[workspace.plan];
    const docCount = await countWorkspaceDocuments(workspace._id);
    if (docCount >= planLimits.maxDocuments) {
      return {
        success: false,
        error: `You have reached the maximum document limit (${planLimits.maxDocuments}) for your plan. Please upgrade to add more documents.`,
      };
    }

    // 5. Chunk extracted text losslessly
    const chunks = chunkText(extracted.text);
    if (chunks.length === 0) {
      return { success: false, error: 'The document did not produce any valid text segments.' };
    }

    // 4c. Plan Chunk Quota
    const currentChunkCount = await countWorkspaceChunks(workspace._id);
    if (currentChunkCount + chunks.length > planLimits.maxChunks) {
      return {
        success: false,
        error: `Adding this document (${chunks.length} chunks) would exceed your workspace chunk limit (${currentChunkCount}/${planLimits.maxChunks}).`,
      };
    }

    // 4d. Max chunks per minute check
    const recentChunks = await countRecentWorkspaceChunks(workspace._id, 60 * 1000);
    if (recentChunks + chunks.length > INGESTION_LIMITS.maxChunksPerMinutePerWorkspace) {
      return {
        success: false,
        error: `Ingestion rate limit exceeded. You can index up to ${INGESTION_LIMITS.maxChunksPerMinutePerWorkspace} chunks per minute. Please try again shortly.`,
      };
    }

    // 6. Create document in "pending" status, storing content for retry capability
    const doc = await createWorkspaceDocument(workspace._id, {
      title: documentTitle,
      content: extracted.text,
      fileName: file.name,
      fileSize: file.size,
      fileType: extracted.fileType,
      uploadedBy: session.user.id,
    });

    const attemptId = await recordIngestAttempt(workspace._id, {
      documentId: doc._id,
      attemptType: 'create',
      chunkCount: chunks.length,
      status: 'started',
    });

    // 7. Transition to "processing" and record processingStartedAt
    await updateWorkspaceDocumentStatus(workspace._id, doc._id, {
      status: 'processing',
    });

    let succeeded = false;
    let processingError: string | null = null;

    try {
      const embeddings = await embedDocumentChunks(chunks.map((c) => c.content));

      const docStillExists = await getWorkspaceDocumentById(workspace._id, doc._id);
      if (!docStillExists) {
        await updateIngestAttemptStatus(workspace._id, attemptId, 'failed');
        return { success: false, error: 'Document was deleted during processing.' };
      }

      const chunkDocsToInsert = chunks.map((c, idx) => ({
        chunkIndex: c.chunkIndex,
        content: c.content,
        tokenCount: c.tokenCount,
        embedding: embeddings[idx],
        metadata: {
          sourceTitle: documentTitle,
        },
      }));

      await insertWorkspaceDocumentChunks(workspace._id, doc._id, chunkDocsToInsert);

      succeeded = true;
      await updateIngestAttemptStatus(workspace._id, attemptId, 'success');
      return { success: true, documentId: doc._id.toString() };
    } catch (err: unknown) {
      await deleteWorkspaceDocumentChunks(workspace._id, doc._id);

      if (err instanceof EmbeddingServiceError && err.isRateLimit) {
        await deleteIngestAttempt(workspace._id, attemptId);
        processingError = err.message;
      } else {
        await updateIngestAttemptStatus(workspace._id, attemptId, 'failed');
        if (err instanceof EmbeddingServiceError) {
          processingError = err.message;
        } else {
          console.error('[Upload Ingestion Error]:', err instanceof Error ? err.message : 'Unknown error');
          processingError = 'Failed to process and index document. Please try again.';
        }
      }

      return { success: false, error: processingError };
    } finally {
      await updateWorkspaceDocumentStatus(workspace._id, doc._id, {
        status: succeeded ? 'ready' : 'failed',
        chunkCount: succeeded ? chunks.length : 0,
        errorMessage: processingError ?? undefined,
      });

      revalidatePath(`/dashboard/${workspaceSlug}/documents`);
      revalidatePath(`/dashboard/${workspaceSlug}`);
    }
  } finally {
    await releaseWorkspaceIngestLock(workspace._id, lockToken);
  }
}

export async function retryDocumentAction(workspaceSlug: string, documentId: string) {
  if (!isValidObjectId(documentId)) {
    return { success: false, error: 'Invalid document ID provided.' };
  }

  const { workspace } = await verifyWorkspaceOwner(workspaceSlug);
  await connectDB();

  // 1. Acquire concurrency lock with safe token (Item 5)
  const lockToken = await acquireWorkspaceIngestLock(workspace._id);
  if (!lockToken) {
    return {
      success: false,
      error: 'Another document is currently being indexed for your workspace. Please wait until it completes.',
    };
  }

  try {
    const doc = await getWorkspaceDocumentById(workspace._id, documentId);
    if (!doc) {
      return { success: false, error: 'Document not found.' };
    }

    const isTimedOut =
      doc.status === 'processing' && isProcessingTimedOut(doc.processingStartedAt);

    if (doc.status !== 'failed' && !isTimedOut) {
      return { success: false, error: 'Only failed or timed-out documents can be retried.' };
    }

    if (!doc.content) {
      return {
        success: false,
        error: 'Document content is not available for retry. Please add a new entry.',
      };
    }

    // 2. Per-Workspace Ingestion Rate Limits (From Database)
    // Same 10 attempts per hour limit as create
    const hourlyAttempts = await countRecentWorkspaceIngestAttempts(workspace._id, 3600 * 1000);
    if (hourlyAttempts >= INGESTION_LIMITS.maxAttemptsPerHourPerWorkspace) {
      return {
        success: false,
        error: `You have reached the maximum of ${INGESTION_LIMITS.maxAttemptsPerHourPerWorkspace} indexing attempts per hour for this workspace. Please try again later.`,
      };
    }

    // 3. Plan Quota Checks: retrying a failed/timed-out document must exclude the document itself (Item 4)
    const planLimits = PLAN_LIMITS[workspace.plan];
    const docCount = await countWorkspaceDocuments(workspace._id, { excludeDocumentId: doc._id });
    if (docCount >= planLimits.maxDocuments) {
      return {
        success: false,
        error: `You have reached the maximum document limit (${planLimits.maxDocuments}) for your plan. Please upgrade to add more knowledge base articles.`,
      };
    }

    // 4. Chunk the content losslessly
    const chunks = chunkText(doc.content);
    if (chunks.length === 0) {
      return { success: false, error: 'Content did not produce any valid text segments.' };
    }

    // 5. Per-minute chunk limit: same limit as create
    const recentChunks = await countRecentWorkspaceChunks(workspace._id, 60 * 1000);
    if (recentChunks + chunks.length > INGESTION_LIMITS.maxChunksPerMinutePerWorkspace) {
      return {
        success: false,
        error: `Your workspace has reached the limit of ${INGESTION_LIMITS.maxChunksPerMinutePerWorkspace} chunks per minute. Please wait 60 seconds before indexing more.`,
      };
    }

    // Total chunks quota check (excluding old chunks of this document to prevent self-counting)
    const currentChunks = await countWorkspaceChunks(workspace._id, { excludeDocumentId: doc._id });
    if (currentChunks + chunks.length > planLimits.maxChunks) {
      return {
        success: false,
        error: `Adding this FAQ would exceed your workspace chunk limit (${planLimits.maxChunks} chunks). Please remove old documents or upgrade your plan.`,
      };
    }

    // 6. Record Ingestion Attempt in persistent audit log
    const attemptId = await recordIngestAttempt(workspace._id, {
      documentId: doc._id,
      attemptType: 'retry',
      chunkCount: chunks.length,
      status: 'started',
    });

    // 7. Transition to "processing" status and update timestamp
    await updateWorkspaceDocumentStatus(workspace._id, doc._id, {
      status: 'processing',
    });

    let succeeded = false;
    let processingError: string | null = null;

    try {
      // Clean up previous chunks if any
      await deleteWorkspaceDocumentChunks(workspace._id, doc._id);

      const chunkTexts = chunks.map((c) => c.content);
      const embeddings = await embedDocumentChunks(chunkTexts);

      // Verify document still exists in MongoDB immediately before chunk insertion
      const docStillExists = await getWorkspaceDocumentById(workspace._id, doc._id);
      if (!docStillExists) {
        await deleteWorkspaceDocumentChunks(workspace._id, doc._id);
        await updateIngestAttemptStatus(workspace._id, attemptId, 'failed');
        return { success: false, error: 'Document was deleted during processing.' };
      }

      const chunkDocsToInsert = chunks.map((c, idx) => ({
        chunkIndex: c.chunkIndex,
        content: c.content,
        tokenCount: c.tokenCount,
        embedding: embeddings[idx],
        metadata: {
          sourceTitle: doc.title,
        },
      }));

      await insertWorkspaceDocumentChunks(workspace._id, doc._id, chunkDocsToInsert);

      succeeded = true;
      await updateIngestAttemptStatus(workspace._id, attemptId, 'success');
      return { success: true };
    } catch (err: unknown) {
      await deleteWorkspaceDocumentChunks(workspace._id, doc._id);

      if (err instanceof EmbeddingServiceError && err.isRateLimit) {
        // Refused "service busy" attempts must not count toward the 10 per hour (Item 8)
        await deleteIngestAttempt(workspace._id, attemptId);
        processingError = err.message;
      } else {
        await updateIngestAttemptStatus(workspace._id, attemptId, 'failed');
        if (err instanceof EmbeddingServiceError) {
          processingError = err.message;
        } else {
          console.error(
            '[Ingestion Retry Error]:',
            err instanceof Error ? err.message : 'Unknown error'
          );
          processingError = 'Failed to process and index knowledge entry. Please try again.';
        }
      }
      return { success: false, error: processingError };
    } finally {
      await updateWorkspaceDocumentStatus(workspace._id, doc._id, {
        status: succeeded ? 'ready' : 'failed',
        chunkCount: succeeded ? chunks.length : 0,
        errorMessage: processingError ?? undefined,
      });

      revalidatePath(`/dashboard/${workspaceSlug}/documents`);
      revalidatePath(`/dashboard/${workspaceSlug}`);
    }
  } finally {
    // Release only the lock held by this operation using lockToken (Item 5)
    await releaseWorkspaceIngestLock(workspace._id, lockToken);
  }
}

const registerDocumentSchema = z.object({
  workspaceSlug: z.string().min(1),
  fileKey: z.string().min(1).max(500),
  title: z.string().trim().max(255).optional(),
});

export async function registerDocumentUploadAction(data: z.infer<typeof registerDocumentSchema>) {
  const parsed = registerDocumentSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: 'Invalid document upload payload' };
  }

  const { workspaceSlug, fileKey } = parsed.data;

  // 1. Verify owner authorization
  const { workspace } = await verifyWorkspaceOwner(workspaceSlug);

  // 2. SECURITY CHECK: Accept only keys matching ^<workspaceId>/[A-Za-z0-9._-]{1,100}$ and reject ".."
  const workspaceIdStr = workspace._id.toString();
  const keyPattern = new RegExp(`^${workspaceIdStr}/[A-Za-z0-9._-]{1,100}$`);
  if (!keyPattern.test(fileKey) || fileKey.includes('..')) {
    return {
      success: false,
      error: 'Security violation: storage key does not match the required format for the active workspace.',
    };
  }

  // 3. Document ingestion pipeline paused until Phase 2 (RAG Ingestion)
  return {
    success: false,
    error: 'Uploads are not available yet',
  };
}

export async function deleteDocumentAction(workspaceSlug: string, documentId: string) {
  // 1. Validate documentId as a valid ObjectId string
  if (!isValidObjectId(documentId)) {
    return { success: false, error: 'Invalid document ID provided.' };
  }

  const { workspace } = await verifyWorkspaceOwner(workspaceSlug);

  await connectDB();

  // Cascade delete via scoped query repository (refuses deletion if document is actively processing)
  const res = await deleteWorkspaceDocument(workspace._id, documentId);

  revalidatePath(`/dashboard/${workspaceSlug}/documents`);
  revalidatePath(`/dashboard/${workspaceSlug}`);
  return res;
}
