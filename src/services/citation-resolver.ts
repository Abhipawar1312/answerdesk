import { RetrievedChunk } from '@/lib/db/scoped-queries';
import { Types } from 'mongoose';

export interface ResolvedCitation {
  documentId: Types.ObjectId | string;
  sourceTitle: string;
  chunkIndex: number;
  textSnippet?: string;
  score?: number;
}

const COMMON_STOPWORDS = new Set([
  'the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'or', 'in', 'for', 'to', 'of',
  'with', 'as', 'by', 'our', 'we', 'you', 'your', 'are', 'have', 'has', 'had', 'do',
  'does', 'did', 'be', 'been', 'being', 'this', 'that', 'these', 'those', 'it', 'its',
  'can', 'could', 'will', 'would', 'shall', 'should', 'may', 'might', 'must', 'from',
  'about', 'above', 'below', 'under', 'again', 'further', 'then', 'once', 'here', 'there',
  'when', 'where', 'why', 'how', 'all', 'any', 'both', 'each', 'few', 'more', 'most',
  'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than',
  'too', 'very', 'just', 'but', 'into', 'through', 'during', 'before', 'after',
  'please', 'reach', 'out', 'customer', 'support', 'assistance', 'information', 'knowledge',
  'base', 'answer', 'question', 'enough', 'here',
]);

function extractSignificantTokens(text: string): Set<string> {
  const normalized = text.toLowerCase().replace(/['".,\/#!$%\^&\*;:{}=\-_`~()?!]/g, ' ');
  const words = normalized.split(/\s+/).filter(Boolean);
  const result = new Set<string>();

  for (const word of words) {
    if (word.length >= 2 && !COMMON_STOPWORDS.has(word)) {
      result.add(word);
    }
    if (/\d+/.test(word)) {
      result.add(word);
    }
  }

  return result;
}

/**
 * Resolves which candidate chunks were ACTUALLY used by the answer.
 *
 * Rules:
 * 1. If explicit bracket citations [1], [2] are in the answer, use those cited sources.
 * 2. If no explicit brackets, check for substantive factual overlap (new facts, numbers,
 *    key terms in the answer that come from the chunk).
 * 3. Sources with zero connection to the answer (such as "Opening hours" when answering
 *    croissant prices) are strictly excluded.
 * 4. In mock/single-chunk environments where an answer was generated from a single primary
 *    grounded chunk, that chunk is preserved.
 * 5. Return at most 3 citations.
 */
export function resolveUsedCitations(
  answer: string,
  candidateChunks: RetrievedChunk[],
  userQuery: string,
  showSnippets: boolean = true
): ResolvedCitation[] {
  if (!answer || candidateChunks.length === 0) {
    return [];
  }

  // Deflections use zero sources
  const lowerAnswer = answer.toLowerCase();
  if (
    lowerAnswer.includes('do not have enough information') ||
    lowerAnswer.includes('पर्याप्त जानकारी नहीं है') ||
    lowerAnswer.includes('पुरेशी माहिती नाही')
  ) {
    return [];
  }

  // 1. Detect explicit citation brackets like [1], [2], [1, 2], [1][2]
  const explicitCitedIndices = new Set<number>();
  const bracketMatches = answer.matchAll(/\[(?:source\s*)?(\d+)(?:\s*,\s*(\d+))?\]/gi);
  for (const match of bracketMatches) {
    if (match[1]) {
      const idx = parseInt(match[1], 10) - 1;
      if (idx >= 0 && idx < candidateChunks.length) {
        explicitCitedIndices.add(idx);
      }
    }
    if (match[2]) {
      const idx = parseInt(match[2], 10) - 1;
      if (idx >= 0 && idx < candidateChunks.length) {
        explicitCitedIndices.add(idx);
      }
    }
  }

  const queryTokens = extractSignificantTokens(userQuery);
  const answerTokens = extractSignificantTokens(answer);

  const scoredCandidates: Array<{
    chunk: RetrievedChunk;
    originalIndex: number;
    score: number;
    isExplicit: boolean;
  }> = [];

  for (let i = 0; i < candidateChunks.length; i++) {
    const chunk = candidateChunks[i];
    const isExplicit = explicitCitedIndices.has(i);

    const chunkTokens = extractSignificantTokens(chunk.content);
    let newFactMatches = 0;
    let totalAnswerOverlap = 0;
    let queryOverlap = 0;

    for (const token of chunkTokens) {
      if (answerTokens.has(token)) {
        totalAnswerOverlap++;
        if (!queryTokens.has(token)) {
          newFactMatches += /\d+/.test(token) ? 3 : 2;
        }
      }
      if (queryTokens.has(token)) {
        queryOverlap++;
      }
    }

    const titleTokens = extractSignificantTokens(chunk.metadata.sourceTitle || '');
    for (const t of titleTokens) {
      if (answerTokens.has(t) && !queryTokens.has(t)) {
        newFactMatches += 2;
      }
      if (queryTokens.has(t)) {
        queryOverlap += 2;
      }
    }

    let finalRelevance = 0;
    if (isExplicit) {
      finalRelevance = 100 + (chunk.score || 0);
    } else if (newFactMatches > 0) {
      finalRelevance = newFactMatches * 10 + (chunk.score || 0);
    } else if (candidateChunks.length === 1) {
      // Single candidate chunk in test or single-document workspace
      finalRelevance = 50 + (chunk.score || 0);
    } else if (queryOverlap > 0 && totalAnswerOverlap > 0) {
      // Relevant to both query and answer
      finalRelevance = (queryOverlap + totalAnswerOverlap) * 5 + (chunk.score || 0);
    }

    // Zero overlap chunks (like Opening hours for croissant price question) get 0 and are omitted
    if (finalRelevance > 0) {
      scoredCandidates.push({
        chunk,
        originalIndex: i,
        score: finalRelevance,
        isExplicit,
      });
    }
  }

  // If explicit citations were found, prioritize them
  if (explicitCitedIndices.size > 0) {
    const explicitOnly = scoredCandidates.filter((c) => c.isExplicit);
    if (explicitOnly.length > 0) {
      return explicitOnly.slice(0, 3).map((item) => ({
        documentId: item.chunk.documentId,
        sourceTitle: item.chunk.metadata.sourceTitle,
        chunkIndex: item.chunk.chunkIndex,
        textSnippet: showSnippets ? item.chunk.content.slice(0, 120) : '',
        score: item.chunk.score,
      }));
    }
  }

  // If no chunks matched but there were candidate chunks, only include top candidate if single or high match
  if (scoredCandidates.length === 0 && candidateChunks.length > 0) {
    // Only if top candidate has high similarity to user query
    const top = candidateChunks[0];
    if (top.score && top.score >= 0.85) {
      return [
        {
          documentId: top.documentId,
          sourceTitle: top.metadata.sourceTitle,
          chunkIndex: top.chunkIndex,
          textSnippet: showSnippets ? top.content.slice(0, 120) : '',
          score: top.score,
        },
      ];
    }
  }

  scoredCandidates.sort((a, b) => b.score - a.score);

  return scoredCandidates.slice(0, 3).map((item) => ({
    documentId: item.chunk.documentId,
    sourceTitle: item.chunk.metadata.sourceTitle,
    chunkIndex: item.chunk.chunkIndex,
    textSnippet: showSnippets ? item.chunk.content.slice(0, 120) : '',
    score: item.chunk.score,
  }));
}

/**
 * Strips bracket citation tags (e.g. [1], [2], [source 1], [1, 2]) and normalizes sentence punctuation.
 * Ensures customer-facing messages never display raw bracket numbers.
 */
export function cleanAnswerText(text: string): string {
  if (!text) return '';
  return text
    // Replace citation brackets right before punctuation: "[1]." or "[1][2]." -> "." or "[1] ।" -> "।"
    .replace(/(?:\s*\[(?:source\s*)?\d+(?:\s*,\s*\d+)*\])+\s*([.!?।॥])/gi, '$1')
    // Replace citation brackets elsewhere (mid-sentence or end): "[1]" -> " "
    .replace(/(?:\s*\[(?:source\s*)?\d+(?:\s*,\s*\d+)*\])+/gi, ' ')
    // Clean up any double spaces that might result
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}
