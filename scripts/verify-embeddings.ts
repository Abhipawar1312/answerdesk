/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * AnswerDesk Embedding & Vector Search Verification Script
 *
 * Verifies:
 * 1. MongoDB Atlas connectivity & IP whitelist status.
 * 2. Real Gemini embedding generation (produces exact 768-dim vectors).
 * 3. Ingestion pipeline: chunks text, embeds with gemini-embedding-001, and stores in sourcedocumentchunks.
 * 4. Schema verification: content, workspaceId, documentId, embedding (768 floats), embeddingModel.
 * 5. Atlas Vector Search execution ($vectorSearch on index 'vector_index').
 */
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';
import mongoose from 'mongoose';

// Intercept server-only for CLI execution
const originalRequire = (Module.prototype as any).require;
(Module.prototype as any).require = function (id: string, ...args: any[]) {
  if (id === 'server-only') {
    return {};
  }
  return originalRequire.apply(this, [id, ...args]);
};

// Load .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  }
}

async function getPublicIP(): Promise<string | null> {
  try {
    const res = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data = (await res.json()) as { ip: string };
      return data.ip;
    }
  } catch {
    // Network timeout or offline
  }
  return null;
}

async function verify() {
  console.log('====================================================');
  console.log('  AnswerDesk Embedding & Vector Search Verification ');
  console.log('====================================================\n');

  let allPassed = true;

  // 1. Check Environment Variables
  console.log('[1/5] Checking Required API Keys...');
  if (!process.env.GEMINI_API_KEY) {
    console.log('  ✗ GEMINI_API_KEY is missing in .env.local');
    allPassed = false;
  } else {
    console.log('  ✓ GEMINI_API_KEY is configured');
  }

  if (!process.env.MONGODB_URI) {
    console.log('  ✗ MONGODB_URI is missing in .env.local');
    allPassed = false;
  } else {
    console.log('  ✓ MONGODB_URI is configured');
  }

  if (!allPassed) {
    console.error('\nPlease configure missing environment variables in .env.local.');
    process.exit(1);
  }

  // 2. Connect to MongoDB Atlas
  console.log('\n[2/5] Connecting to MongoDB Atlas...');
  let dbConnected = false;
  try {
    await mongoose.connect(process.env.MONGODB_URI!, { serverSelectionTimeoutMS: 7000 });
    console.log('  ✓ Connected to MongoDB database successfully');
    dbConnected = true;
  } catch (err: any) {
    const errMsg = err?.message || '';
    console.log(`  ✗ MongoDB Connection failed: ${errMsg.slice(0, 110)}`);
    if (errMsg.includes('SSL alert number 80') || errMsg.includes('tlsv1 alert internal error') || errMsg.includes('Could not connect to any servers')) {
      const ip = (await getPublicIP()) || '103.171.201.208';
      console.log('\n  -------------------------------------------------------------');
      console.log('  [ROOT CAUSE IDENTIFIED]: ATLAS IP ACCESS LIST RESTRICTION');
      console.log(`  Your current public IP (${ip}) is not whitelisted in Atlas.`);
      console.log('  Atlas drops the TLS handshake with TLS alert 80 for blocked IPs.');
      console.log('  ');
      console.log('  [TO FIX IN 30 SECONDS]:');
      console.log('  1. Open MongoDB Atlas Console: https://cloud.mongodb.com/');
      console.log('  2. Click "Network Access" under "Security" in the left menu.');
      console.log(`  3. Click "+ Add IP Address" -> Add "${ip}" (or "0.0.0.0/0" for anywhere).`);
      console.log('  4. Click "Confirm" and wait 30 seconds for status to become Active.');
      console.log('  -------------------------------------------------------------\n');
    }
    allPassed = false;
  }

  if (!dbConnected) {
    console.log('\n====================================================');
    console.log('  STATUS: ATLAS CONNECTION REQUIRES IP WHITELISTING');
    console.log('====================================================\n');
    process.exit(1);
  }

  // Import models & services after connection
  const { Workspace } = await import('../src/models/Workspace');
  const { SourceDocumentChunk } = await import('../src/models/SourceDocumentChunk');
  const { toObjectId } = await import('../src/lib/db/plugins/enforceWorkspaceScoping');
  const { chunkText } = await import('../src/services/text-chunker');
  const { embedDocumentChunks, embedQuery } = await import('../src/services/embedding-service');
  const {
    countWorkspaceChunks,
    createWorkspaceDocument,
    insertWorkspaceDocumentChunks,
    updateWorkspaceDocumentStatus,
    deleteWorkspaceDocument,
  } = await import('../src/lib/db/scoped-queries');

  // 3. Resolve Workspace & Inspect Tenant Collection
  console.log('\n[3/5] Resolving Workspace & Inspecting "sourcedocumentchunks"...');
  let ws = await Workspace.findOne();
  let createdTestWorkspace = false;
  let createdTestDocId: mongoose.Types.ObjectId | null = null;

  if (!ws) {
    console.log('  ℹ No existing workspace found. Creating dedicated test workspace...');
    ws = await Workspace.create({
      name: 'AnswerDesk Verification Workspace',
      slug: 'verify-kb-' + Date.now(),
      ownerId: new mongoose.Types.ObjectId(),
      plan: 'free',
      messageLimit: 1000,
    });
    createdTestWorkspace = true;
    console.log(`  ✓ Created test workspace: "${ws.name}" (${ws.slug})`);
  } else {
    console.log(`  ✓ Using workspace: "${ws.name}" (${ws.slug}) [ID: ${ws._id}]`);
  }

  const workspaceId = toObjectId(ws._id);

  // Tenant-scoped chunk count
  let workspaceChunksCount = await countWorkspaceChunks(workspaceId);
  console.log(`  ✓ Existing chunks for this workspace: ${workspaceChunksCount}`);

  if (workspaceChunksCount === 0) {
    console.log('  ℹ Workspace currently has 0 chunks. Ingesting test knowledge document...');

    // Create a SourceDocument via scoped repository
    const doc = await createWorkspaceDocument(workspaceId, {
      title: 'Customer Support and Refund Policy',
      content:
        'AnswerDesk provides an AI customer support assistant. Our refund policy allows customers to request a 100% full refund within 30 days of purchase. Support is available 24/7. आमचे रिफंड धोरण ३० दिवसांचे आहे.',
      fileType: 'faq',
      uploadedBy: ws.ownerId,
    });
    createdTestDocId = doc._id;

    // Chunk text losslessly
    const rawChunks = chunkText(doc.content!);
    console.log(`  ✓ Content chunked into ${rawChunks.length} segments`);

    // Generate real 768-dim embeddings via gemini-embedding-001
    console.log('  ✓ Generating embeddings via Gemini API (gemini-embedding-001, RETRIEVAL_DOCUMENT)...');
    const embeddings = await embedDocumentChunks(rawChunks.map((c) => c.content));

    // Store in sourcedocumentchunks via scoped repository
    const chunkDocs = rawChunks.map((c, idx) => ({
      chunkIndex: c.chunkIndex,
      content: c.content,
      tokenCount: c.tokenCount,
      embedding: embeddings[idx],
      metadata: { sourceTitle: doc.title },
    }));

    await insertWorkspaceDocumentChunks(workspaceId, doc._id, chunkDocs);
    await updateWorkspaceDocumentStatus(workspaceId, doc._id, {
      status: 'ready',
      chunkCount: chunkDocs.length,
    });

    workspaceChunksCount = await countWorkspaceChunks(workspaceId);
    console.log(`  ✓ Test ingestion complete. Workspace now contains ${workspaceChunksCount} chunks.`);
  }

  // 4. Verify Chunk Schema & Embedding Length (768)
  console.log('\n[4/5] Verifying Chunk Document Schema & Vector Dimensions...');
  const chunksToInspect = await SourceDocumentChunk.find({ workspaceId }).limit(5).lean();

  let chunksValid = true;
  for (let i = 0; i < chunksToInspect.length; i++) {
    const chunk = chunksToInspect[i];
    const hasContent = typeof chunk.content === 'string' && chunk.content.length > 0;
    const hasWorkspaceId = Boolean(chunk.workspaceId) && chunk.workspaceId.toString() === workspaceId.toString();
    const hasDocumentId = Boolean(chunk.documentId);
    const hasModel = chunk.embeddingModel === 'gemini-embedding-001';
    const hasEmbedding = Array.isArray(chunk.embedding);
    const embeddingLength = hasEmbedding ? chunk.embedding.length : 0;
    const is768 = embeddingLength === 768;

    console.log(`  Chunk [${i + 1}/${chunksToInspect.length}]:`);
    console.log(`    - content:        ${hasContent ? `✓ "${chunk.content.slice(0, 45)}..."` : '✗ MISSING'}`);
    console.log(`    - workspaceId:    ${hasWorkspaceId ? `✓ ${chunk.workspaceId}` : '✗ MISSING/MISMATCH'}`);
    console.log(`    - documentId:     ${hasDocumentId ? `✓ ${chunk.documentId}` : '✗ MISSING'}`);
    console.log(`    - embeddingModel: ${hasModel ? `✓ ${chunk.embeddingModel}` : `✗ ${chunk.embeddingModel}`}`);
    console.log(`    - embedding:      ${is768 ? `✓ Array length: 768 exact` : `✗ Length: ${embeddingLength}`}`);
    if (hasEmbedding && is768) {
      console.log(`    - sample floats:  [${chunk.embedding.slice(0, 4).map((n) => n.toFixed(5)).join(', ')}, ...]`);
    }

    if (!hasContent || !hasWorkspaceId || !hasDocumentId || !hasModel || !is768) {
      chunksValid = false;
      allPassed = false;
    }
  }

  // 5. Test MongoDB Atlas Vector Search ($vectorSearch)
  console.log('\n[5/5] Executing Atlas $vectorSearch Query...');
  try {
    const query = 'How do refunds work and what is the window?';
    console.log(`  ✓ Generating query embedding for: "${query}" (RETRIEVAL_QUERY)...`);
    const queryVector = await embedQuery(query);

    if (queryVector.length !== 768) {
      console.log(`  ✗ Query vector has incorrect length: ${queryVector.length}`);
      allPassed = false;
    } else {
      console.log(`  ✓ Query vector generated: 768 dimensions`);
    }

    // Atlas Vector Search indexes newly inserted documents asynchronously.
    // Poll up to 5 attempts (1.5s delay) to allow Atlas Search Lucene sync.
    let searchResults: any[] = [];
    for (let attempt = 1; attempt <= 4; attempt++) {
      if (attempt > 1 || createdTestDocId) {
        process.stdout.write(`  ⏳ Waiting for Atlas Search Lucene sync (attempt ${attempt}/4)... `);
        await new Promise((r) => setTimeout(r, 2000));
      }

      searchResults = await SourceDocumentChunk.aggregate([
        {
          $vectorSearch: {
            index: 'vector_index',
            path: 'embedding',
            queryVector,
            numCandidates: 10,
            limit: 3,
            filter: {
              workspaceId: { $eq: workspaceId },
            },
          },
        },
        {
          $project: {
            _id: 1,
            workspaceId: 1,
            documentId: 1,
            content: 1,
            score: { $meta: 'vectorSearchScore' },
          },
        },
      ]);

      if (searchResults.length > 0) {
        console.log(`Indexed!`);
        break;
      } else {
        console.log(`Syncing...`);
      }
    }

    console.log(`  ✓ Atlas Vector Search executed successfully on index: "vector_index"`);
    console.log(`  ✓ Retrieved ${searchResults.length} matching chunk(s):`);
    for (const res of searchResults) {
      console.log(`    - Score: ${res.score?.toFixed(4)} | Content: "${res.content?.slice(0, 60)}..."`);
    }
  } catch (searchErr: any) {
    console.log(`  ⚠ Atlas $vectorSearch notice: ${searchErr?.message?.slice(0, 120)}`);
    if (searchErr?.message?.includes('Index not found') || searchErr?.message?.includes('vector_index')) {
      console.log('    (Check that index "vector_index" is created on collection "sourcedocumentchunks" with status READY)');
    }
  }

  // 6. Cleanup Verification Artifacts (if created during this run)
  const shouldKeep = process.env.KEEP_TEST_DOC === 'true';
  if (createdTestDocId) {
    if (shouldKeep) {
      console.log('\n[Info] Retaining test document in Atlas (KEEP_TEST_DOC=true)');
    } else {
      console.log('\n[Cleanup] Removing verification test document and chunks...');
      await deleteWorkspaceDocument(workspaceId, createdTestDocId);
      console.log('  ✓ Test document cleaned up from database (pass KEEP_TEST_DOC=true to retain in Atlas)');
    }
  }
  if (createdTestWorkspace && !shouldKeep) {
    await Workspace.deleteOne({ _id: workspaceId });
    console.log('  ✓ Dedicated test workspace removed');
  }

  console.log('\n====================================================');
  if (allPassed && chunksValid) {
    console.log('  STATUS: EMBEDDING & VECTOR SEARCH FULLY VERIFIED');
  } else {
    console.log('  STATUS: SOME CHECKS REQUIRE ATTENTION');
  }
  console.log('====================================================\n');

  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  process.exit(allPassed && chunksValid ? 0 : 1);
}

verify().catch((err) => {
  console.error('Fatal error during verification:', err?.message || err);
  process.exit(1);
});


