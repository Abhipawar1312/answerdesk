import fs from 'node:fs';
import path from 'node:path';

function loadEnvKey() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return null;

  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('GEMINI_API_KEY=')) {
      return trimmed.slice('GEMINI_API_KEY='.length).trim();
    }
  }
  return null;
}

function cosineSimilarity(vecA, vecB) {
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

function toAtlasScore(rawCosine) {
  // MongoDB Atlas Vector Search normalizes cosine similarity to: (1 + cosine) / 2
  return (1 + rawCosine) / 2;
}

async function getEmbedding(text, apiKey, taskType = 'RETRIEVAL_DOCUMENT') {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'models/gemini-embedding-001',
      content: { parts: [{ text }] },
      taskType,
      outputDimensionality: 768,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Embedding API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return data.embedding.values;
}

function stats(numbers) {
  if (numbers.length === 0) return { min: 0, median: 0, max: 0 };
  const sorted = [...numbers].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  return { min, median, max };
}

async function runEvaluation() {
  const apiKey = loadEnvKey();
  if (!apiKey) {
    console.error('ERROR: GEMINI_API_KEY not found in .env.local');
    process.exit(1);
  }

  const evalPath = path.resolve(process.cwd(), 'eval', 'questions.json');
  const evalData = JSON.parse(fs.readFileSync(evalPath, 'utf8'));

  console.log('========================================================================');
  console.log('      RETRIEVAL EVALUATION & ATLAS VECTOR SEARCH CALIBRATION (42 Qs)     ');
  console.log('========================================================================');
  console.log(`Corpus Chunks: ${evalData.corpus.length}`);
  console.log(`Total Evaluation Questions: ${evalData.questions.length}`);
  console.log('Generating embeddings for corpus chunks...');

  const chunkEmbeddings = [];
  for (const chunk of evalData.corpus) {
    const embedding = await getEmbedding(chunk.content, apiKey, 'RETRIEVAL_DOCUMENT');
    chunkEmbeddings.push({ ...chunk, embedding });
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log('Generating embeddings for all test queries...');
  const evaluatedQuestions = [];

  for (const q of evalData.questions) {
    const qEmbedding = await getEmbedding(q.query, apiKey, 'RETRIEVAL_QUERY');

    const matches = chunkEmbeddings.map((chunk) => {
      const raw = cosineSimilarity(qEmbedding, chunk.embedding);
      return {
        chunkId: chunk.id,
        title: chunk.title,
        rawCosine: raw,
        atlasScore: toAtlasScore(raw),
      };
    });

    matches.sort((a, b) => b.rawCosine - a.rawCosine);
    const topMatch = matches[0];

    evaluatedQuestions.push({
      ...q,
      topChunkId: topMatch.chunkId,
      topRawCosine: topMatch.rawCosine,
      topAtlasScore: topMatch.atlasScore,
    });

    await new Promise((r) => setTimeout(r, 200));
  }

  // Group by category
  const onTopic = evaluatedQuestions.filter((q) => q.type === 'on_topic');
  const nearMiss = evaluatedQuestions.filter((q) => q.type === 'near_miss');
  const offTopic = evaluatedQuestions.filter((q) => q.type === 'off_topic');
  const injections = evaluatedQuestions.filter((q) => q.type === 'prompt_injection');
  const nonRelevant = evaluatedQuestions.filter((q) => q.type !== 'on_topic');

  const onTopicAtlas = onTopic.map((q) => q.topAtlasScore);
  const onTopicRaw = onTopic.map((q) => q.topRawCosine);

  const nonRelevantAtlas = nonRelevant.map((q) => q.topAtlasScore);
  const nonRelevantRaw = nonRelevant.map((q) => q.topRawCosine);

  console.log('\n================ SCORE DISTRIBUTION BY CATEGORY ================');
  console.log('| Category          | Count | Raw Cosine (Min / Med / Max)  | Atlas Score (Min / Med / Max) |');
  console.log('|-------------------|-------|-------------------------------|-------------------------------|');

  for (const [name, list] of [
    ['On-Topic (Valid)', onTopic],
    ['Near-Miss (Unkn)', nearMiss],
    ['Off-Topic (Gen)', offTopic],
    ['Prompt Injection', injections],
    ['ALL Non-Relevant', nonRelevant],
  ]) {
    const rStats = stats(list.map((q) => q.topRawCosine));
    const aStats = stats(list.map((q) => q.topAtlasScore));
    console.log(
      `| ${name.padEnd(17)} | ${String(list.length).padEnd(5)} | ${rStats.min.toFixed(4)} / ${rStats.median.toFixed(4)} / ${rStats.max.toFixed(4)}  | ${aStats.min.toFixed(4)} / ${aStats.median.toFixed(4)} / ${aStats.max.toFixed(4)}  |`
    );
  }

  const rawMargin = stats(onTopicRaw).min - stats(nonRelevantRaw).max;
  const atlasMargin = stats(onTopicAtlas).min - stats(nonRelevantAtlas).max;

  console.log('\n================ SCALE SEPARATION ANALYSIS ================');
  console.log(`On-Topic Raw Cosine MIN:        ${stats(onTopicRaw).min.toFixed(4)}`);
  console.log(`Non-Relevant Raw Cosine MAX:    ${stats(nonRelevantRaw).max.toFixed(4)}`);
  console.log(`Raw Cosine Separation Margin:   ${rawMargin >= 0 ? '+' : ''}${rawMargin.toFixed(4)}`);
  console.log('---');
  console.log(`On-Topic Atlas Score MIN:       ${stats(onTopicAtlas).min.toFixed(4)}`);
  console.log(`Non-Relevant Atlas Score MAX:   ${stats(nonRelevantAtlas).max.toFixed(4)}`);
  console.log(`Atlas Score Separation Margin:  ${atlasMargin >= 0 ? '+' : ''}${atlasMargin.toFixed(4)}`);

  // Performance Matrix on Atlas vectorSearchScore
  const atlasThresholds = [0.75, 0.78, 0.80, 0.82, 0.85, 0.88];
  console.log('\n================ ATLAS SCORE THRESHOLD PERFORMANCE MATRIX ================');
  console.log('| Atlas Thresh | True Pos (TP) | False Pos (FP) | False Neg (FN) | True Neg (TN) | Precision | Recall | F1 Score |');
  console.log('|--------------|---------------|----------------|----------------|---------------|-----------|--------|----------|');

  let bestAtlasThresh = 0.80;
  let maxAtlasF1 = 0;

  for (const th of atlasThresholds) {
    let tp = 0;
    let fp = 0;
    let fn = 0;
    let tn = 0;

    for (const eq of evaluatedQuestions) {
      const meets = eq.topAtlasScore >= th;
      if (eq.type === 'on_topic') {
        if (meets) {
          if (eq.topChunkId === eq.expectedChunkId) tp++;
          else fp++;
        } else {
          fn++;
        }
      } else {
        if (meets) fp++;
        else tn++;
      }
    }

    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

    if (f1 > maxAtlasF1) {
      maxAtlasF1 = f1;
      bestAtlasThresh = th;
    }

    console.log(
      `| ${th.toFixed(2)}         | ${String(tp).padEnd(13)} | ${String(fp).padEnd(14)} | ${String(fn).padEnd(14)} | ${String(tn).padEnd(13)} | ${(precision * 100).toFixed(1)}%     | ${(recall * 100).toFixed(1)}%  | ${f1.toFixed(4)}   |`
    );
  }

  // Also print Raw Cosine Matrix
  const rawThresholds = [0.55, 0.60, 0.65, 0.70, 0.75];
  console.log('\n================ RAW COSINE THRESHOLD PERFORMANCE MATRIX ================');
  console.log('| Raw Thresh   | True Pos (TP) | False Pos (FP) | False Neg (FN) | True Neg (TN) | Precision | Recall | F1 Score |');
  console.log('|--------------|---------------|----------------|----------------|---------------|-----------|--------|----------|');

  for (const th of rawThresholds) {
    let tp = 0;
    let fp = 0;
    let fn = 0;
    let tn = 0;

    for (const eq of evaluatedQuestions) {
      const meets = eq.topRawCosine >= th;
      if (eq.type === 'on_topic') {
        if (meets) {
          if (eq.topChunkId === eq.expectedChunkId) tp++;
          else fp++;
        } else {
          fn++;
        }
      } else {
        if (meets) fp++;
        else tn++;
      }
    }

    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

    console.log(
      `| ${th.toFixed(2)}         | ${String(tp).padEnd(13)} | ${String(fp).padEnd(14)} | ${String(fn).padEnd(14)} | ${String(tn).padEnd(13)} | ${(precision * 100).toFixed(1)}%     | ${(recall * 100).toFixed(1)}%  | ${f1.toFixed(4)}   |`
    );
  }

  console.log(`\nRECOMMENDED ATLAS SCORE THRESHOLD: ${bestAtlasThresh.toFixed(2)} (F1: ${maxAtlasF1.toFixed(4)})`);
  console.log('========================================================================');
}

runEvaluation().catch((err) => {
  console.error(err);
  process.exit(1);
});
