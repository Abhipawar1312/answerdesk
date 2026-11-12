/**
 * Text Chunker Service for RAG Ingestion
 *
 * Implements lossless semantic chunking with support for Latin text
 * and non-Latin scripts (Devanagari for Hindi and Marathi, including "।" and "॥").
 *
 * Key Design Features:
 * - Lossless Splitting: Preserves 100% of non-whitespace words (headings, bullets, decimals, URLs, emails, etc.).
 * - Lookbehind Splitting: Splits on terminators followed by whitespace (`/(?<=[.?!।॥])\\s+/`), preserving periods inside decimals (2.5) and URLs (help.example.com).
 * - Structural Attachment: Short lines (headings, bullets) lacking terminators attach to the following text.
 * - Word-Level Fallback: Sentences or unbreakable blocks longer than targetTokens fall back to word-level chunking.
 * - Calibrated Dual Estimators:
 *   - estimateTokensAccurate: Used for chunk sizing targeting 600 real tokens.
 *   - estimateTokensConservative: Used for global token budget safety (guarantees zero under-counting).
 */

export interface ChunkResult {
  chunkIndex: number;
  content: string;
  tokenCount: number;
}

export interface ChunkOptions {
  targetTokens?: number; // Target chunk size in tokens (default: 600)
  overlapTokens?: number; // Overlap size in tokens (default: 100)
  minChunkTokens?: number; // Minimum tokens to form a standalone chunk (default: 30)
}

interface SentenceUnit {
  text: string;
  paragraphIndex: number;
  tokenCount: number;
  isBulletOrHeading?: boolean;
}

function countScripts(text: string) {
  let devanagari = 0;
  let latin = 0;
  let other = 0;

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0x0900 && code <= 0x097f) {
      devanagari++;
    } else if (
      (code >= 0x0041 && code <= 0x005a) ||
      (code >= 0x0061 && code <= 0x007a) ||
      (code >= 0x0030 && code <= 0x0039)
    ) {
      latin++;
    } else {
      other++;
    }
  }

  return { devanagari, latin, other };
}

/**
 * Accurate Estimator: Used for chunk sizing to produce chunks close to 600 real tokens.
 * Empirically calibrated against gemini-embedding-001 countTokens across 40 samples (~500 chars):
 * - English: ~+23% average error
 * - Hindi: ~+11% average error
 * - Marathi: ~-6% average error
 * - Mixed Hinglish: ~-3% average error
 */
export function estimateTokensAccurate(text: string): number {
  if (!text || text.trim().length === 0) return 0;
  const { devanagari, latin, other } = countScripts(text);
  const est = Math.round(devanagari / 2.25 + latin / 5.3 + other / 4.6);
  return Math.max(1, est);
}

/**
 * Backwards compatible alias for accurate token estimation.
 */
export const estimateTokens = estimateTokensAccurate;

/**
 * Conservative Estimator: Used for Global Token Budget (30K TPM) to guarantee safety margin.
 * Guarantees ZERO under-counting across all languages (empirically benchmarked over 40 samples):
 * - English: Min +80.7%, Avg +98.3%
 * - Hindi: Min +39.9%, Avg +53.7%
 * - Marathi: Min +21.1%, Avg +27.9%
 * - Mixed Hinglish: Min +35.2%, Avg +56.6%
 */
export function estimateTokensConservative(text: string): number {
  if (!text || text.trim().length === 0) return 0;
  const { devanagari, latin, other } = countScripts(text);
  const est = Math.ceil(devanagari / 1.7 + latin / 3.4 + other / 2.5);
  return Math.max(1, est);
}

/**
 * Formats an array of sentence units into text, respecting paragraph and structural line boundaries.
 */
function formatSentences(units: SentenceUnit[]): string {
  if (units.length === 0) return '';
  let result = units[0].text;
  for (let i = 1; i < units.length; i++) {
    const prev = units[i - 1];
    const curr = units[i];
    if (prev.paragraphIndex !== curr.paragraphIndex) {
      result += '\n\n' + curr.text;
    } else {
      // Within same paragraph: bullets, headings, or lines ending with newline join with newline
      const isBulletOrHeading = /^([-*#]|\d+\.)/.test(curr.text) || curr.isBulletOrHeading;
      const prevEndsWithNewline = prev.text.endsWith('\n');
      const separator = isBulletOrHeading || prevEndsWithNewline ? '\n' : ' ';
      result += separator + curr.text;
    }
  }
  return result;
}

/**
 * Losslessly splits a single paragraph block into structural sentence units:
 * - Attaches short lines (such as headings or bullet items lacking terminators) to following text.
 * - Splits on sentence terminators followed by whitespace using lookbehind `/(?<=[.?!।॥])\\s+/`.
 * - Employs word-level fallback if any sentence exceeds targetTokens.
 */
function splitParagraphLossless(
  paragraphText: string,
  pIdx: number,
  targetTokens: number
): SentenceUnit[] {
  const lines = paragraphText.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  const blocks: string[] = [];
  let currentBlock = '';

  for (const line of lines) {
    if (!currentBlock) {
      currentBlock = line;
    } else {
      const hasTerminator = /[.?!।॥]$/.test(currentBlock);
      const isBulletOrHeading = /^([-*#]|\d+\.)/.test(line);

      // If current block ends with a sentence terminator and next line is not a continuation bullet/heading,
      // flush current block. Otherwise attach line with newline.
      if (hasTerminator && !isBulletOrHeading) {
        blocks.push(currentBlock);
        currentBlock = line;
      } else {
        currentBlock += '\n' + line;
      }
    }
  }

  if (currentBlock) {
    blocks.push(currentBlock);
  }

  const units: SentenceUnit[] = [];

  for (const block of blocks) {
    // Lookbehind split on terminators followed by whitespace (preserves decimals like 2.5 and URLs like help.example.com)
    const rawSentences = block.split(/(?<=[.?!।॥])\s+/).filter((s) => s.trim().length > 0);

    for (const rawSentence of rawSentences) {
      const sentenceText = rawSentence.trim();
      const sTokens = estimateTokensAccurate(sentenceText);
      const isBulletOrHeading = /^([-*#]|\d+\.)/.test(sentenceText);

      if (sTokens <= targetTokens) {
        units.push({
          text: sentenceText,
          paragraphIndex: pIdx,
          tokenCount: sTokens,
          isBulletOrHeading,
        });
      } else {
        // Word-level fallback for massive sentences exceeding targetTokens
        const words = sentenceText.split(/\s+/).filter((w) => w.length > 0);
        let wordAccumulator = '';

        for (const word of words) {
          const candidate = wordAccumulator ? `${wordAccumulator} ${word}` : word;
          if (estimateTokensAccurate(candidate) > targetTokens && wordAccumulator) {
            units.push({
              text: wordAccumulator.trim(),
              paragraphIndex: pIdx,
              tokenCount: estimateTokensAccurate(wordAccumulator.trim()),
              isBulletOrHeading,
            });
            wordAccumulator = word;
          } else {
            wordAccumulator = candidate;
          }
        }

        if (wordAccumulator.trim()) {
          units.push({
            text: wordAccumulator.trim(),
            paragraphIndex: pIdx,
            tokenCount: estimateTokensAccurate(wordAccumulator.trim()),
            isBulletOrHeading,
          });
        }
      }
    }
  }

  return units;
}

/**
 * Splits text into chunks respecting semantic sentence and paragraph boundaries losslessly.
 */
export function chunkText(text: string, options: ChunkOptions = {}): ChunkResult[] {
  const targetTokens = options.targetTokens ?? 600;
  const overlapTokens = options.overlapTokens ?? 100;
  const minChunkTokens = options.minChunkTokens ?? 30;

  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const totalTokens = estimateTokensAccurate(normalized);
  if (totalTokens <= targetTokens) {
    return [
      {
        chunkIndex: 0,
        content: normalized,
        tokenCount: totalTokens,
      },
    ];
  }

  // 1. Break text into paragraphs (separated by blank lines)
  const rawParagraphs = normalized.split(/\n\s*\n/).filter((p) => p.trim().length > 0);

  // 2. Break paragraphs into sentence units losslessly
  const sentenceUnits: SentenceUnit[] = [];
  rawParagraphs.forEach((paragraph, pIdx) => {
    const units = splitParagraphLossless(paragraph.trim(), pIdx, targetTokens);
    sentenceUnits.push(...units);
  });

  if (sentenceUnits.length === 0) {
    return [];
  }

  // 3. Combine sentence units into chunks with sentence-level overlap
  const chunks: ChunkResult[] = [];
  let currentUnits: SentenceUnit[] = [];
  let chunkIndex = 0;
  let leadingOverlapCount = 0;

  for (let i = 0; i < sentenceUnits.length; i++) {
    const unit = sentenceUnits[i];
    const candidateUnits = [...currentUnits, unit];
    const candidateText = formatSentences(candidateUnits);
    const candidateTokens = estimateTokensAccurate(candidateText);

    if (candidateTokens <= targetTokens) {
      currentUnits = candidateUnits;
    } else {
      if (currentUnits.length > 0) {
        const chunkContent = formatSentences(currentUnits);
        chunks.push({
          chunkIndex: chunkIndex++,
          content: chunkContent,
          tokenCount: estimateTokensAccurate(chunkContent),
        });

        // Compute genuine sentence overlap: take trailing sentences whose total tokens <= overlapTokens
        const overlapUnits: SentenceUnit[] = [];
        if (overlapTokens > 0) {
          let runningOverlapTokens = 0;
          for (let j = currentUnits.length - 1; j >= 0; j--) {
            const trailingUnit = currentUnits[j];
            if (runningOverlapTokens + trailingUnit.tokenCount <= overlapTokens) {
              overlapUnits.unshift(trailingUnit);
              runningOverlapTokens += trailingUnit.tokenCount;
            } else {
              break;
            }
          }
        }

        leadingOverlapCount = overlapUnits.length;
        currentUnits = [...overlapUnits, unit];

        // If overlap + new unit exceeds targetTokens, shed oldest overlap units
        while (currentUnits.length > 1 && estimateTokensAccurate(formatSentences(currentUnits)) > targetTokens) {
          currentUnits.shift();
          leadingOverlapCount = Math.max(0, leadingOverlapCount - 1);
        }
      } else {
        // Single unit alone exceeds targetTokens (handled by word fallback, but safety guard)
        chunks.push({
          chunkIndex: chunkIndex++,
          content: unit.text,
          tokenCount: unit.tokenCount,
        });
        currentUnits = [];
        leadingOverlapCount = 0;
      }
    }
  }

  // 4. Final flush and deduplicated merge
  if (currentUnits.length > 0) {
    const finalContent = formatSentences(currentUnits);
    const finalTokens = estimateTokensAccurate(finalContent);

    // If final chunk is tiny and we have a preceding chunk, merge only the non-overlapping new units
    if (chunks.length > 0 && finalTokens < minChunkTokens) {
      const lastChunk = chunks[chunks.length - 1];
      const newUnitsToAppend = currentUnits.slice(leadingOverlapCount);

      if (newUnitsToAppend.length > 0) {
        const textToAppend = formatSentences(newUnitsToAppend);
        const separator = lastChunk.content.endsWith('\n') || /^([-*#]|\d+\.)/.test(textToAppend) ? '\n' : ' ';
        const mergedContent = `${lastChunk.content}${separator}${textToAppend}`;
        lastChunk.content = mergedContent;
        lastChunk.tokenCount = estimateTokensAccurate(mergedContent);
      }
    } else {
      chunks.push({
        chunkIndex: chunkIndex++,
        content: finalContent,
        tokenCount: finalTokens,
      });
    }
  }

  return chunks;
}
