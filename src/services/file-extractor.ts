import { PDFParse } from 'pdf-parse';
import { PLAN_LIMITS } from '@/lib/constants';

export type SupportedFileType = 'txt' | 'md' | 'pdf';

export interface ExtractedDocument {
  text: string;
  fileType: SupportedFileType;
  pageCount?: number;
  charCount: number;
}

export type FileExtractionErrorCode =
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_TYPE'
  | 'EMPTY_FILE'
  | 'INVALID_ENCODING'
  | 'SCANNED_OR_EMPTY_PDF'
  | 'CORRUPT_FILE';

export class FileExtractionError extends Error {
  readonly code: FileExtractionErrorCode;
  readonly friendlyMessage: string;

  constructor(code: FileExtractionErrorCode, customMessage?: string) {
    const defaultMessages: Record<FileExtractionErrorCode, string> = {
      FILE_TOO_LARGE: 'File size exceeds the allowed limit for your workspace plan.',
      UNSUPPORTED_TYPE: 'Unsupported file format. Please upload a .txt, .md, or .pdf document.',
      EMPTY_FILE: 'The uploaded file does not contain readable text content.',
      INVALID_ENCODING: 'The file contains binary or invalid characters and could not be decoded as text.',
      SCANNED_OR_EMPTY_PDF: 'The PDF contains no readable text. Please upload a text-based document rather than an image-only or scanned file.',
      CORRUPT_FILE: 'Unable to parse document. The file may be corrupted or password-protected.',
    };

    const msg = customMessage || defaultMessages[code];
    super(msg);
    this.name = 'FileExtractionError';
    this.code = code;
    this.friendlyMessage = msg;
  }
}

/**
 * Strips PDF page markers like "-- 1 of 1 --", form feeds, and zero-width spaces.
 */
export function stripPdfPageMarkers(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/--\s*\d+\s+of\s+\d+\s*--/gi, '')
    .replace(/--\s*page\s+\d+(\s+of\s+\d+)?\s*--/gi, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim();
}

/**
 * Validates that extracted text contains actual readable words:
 * At least 20 letters or digits across at least 3 distinct words (supports Devanagari & all Unicode).
 */
export function hasMinimumReadableText(text: string): boolean {
  const stripped = stripPdfPageMarkers(text);
  const words = stripped.match(/[\p{L}\p{N}]+/gu) || [];
  const alphanumericCount = (stripped.match(/[\p{L}\p{N}]/gu) || []).length;
  return alphanumericCount >= 20 && words.length >= 3;
}

/**
 * Detects the file type from file name and MIME type.
 */
export function detectSupportedFileType(fileName: string, mimeType?: string): SupportedFileType {
  const lowerName = fileName.toLowerCase().trim();
  const lowerMime = (mimeType || '').toLowerCase().trim();

  if (lowerName.endsWith('.pdf') || lowerMime === 'application/pdf') {
    return 'pdf';
  }
  if (lowerName.endsWith('.md') || lowerMime === 'text/markdown') {
    return 'md';
  }
  if (lowerName.endsWith('.txt') || lowerMime === 'text/plain') {
    return 'txt';
  }

  throw new FileExtractionError('UNSUPPORTED_TYPE');
}

/**
 * Checks if a string has excessive non-text or binary bytes.
 */
function isBinaryContent(text: string): boolean {
  if (text.includes('\0')) {
    return true;
  }

  // Count non-printable control characters excluding \t (9), \n (10), \r (13)
  let controlChars = 0;
  const sampleLength = Math.min(text.length, 4000);
  for (let i = 0; i < sampleLength; i++) {
    const code = text.charCodeAt(i);
    if ((code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 65533) {
      controlChars++;
    }
  }

  // If more than 2% control/replacement characters, consider it binary/corrupt
  return controlChars / sampleLength > 0.02;
}

/**
 * Extracts plain text from an in-memory buffer without writing to disk.
 */
export async function extractTextFromBuffer(
  buffer: Buffer | Uint8Array,
  fileName: string,
  mimeType?: string,
  plan: 'free' | 'pro' = 'free'
): Promise<ExtractedDocument> {
  const byteLength = buffer.length;

  // 1. Quota / size limit check
  const maxBytes = (PLAN_LIMITS[plan]?.maxFileSizeMB ?? 5) * 1024 * 1024;
  if (byteLength > maxBytes) {
    throw new FileExtractionError(
      'FILE_TOO_LARGE',
      `File exceeds maximum size of ${PLAN_LIMITS[plan]?.maxFileSizeMB ?? 5}MB for the ${plan} plan.`
    );
  }

  if (byteLength === 0) {
    throw new FileExtractionError('EMPTY_FILE');
  }

  const fileType = detectSupportedFileType(fileName, mimeType);

  // 2. Text / Markdown extraction
  if (fileType === 'txt' || fileType === 'md') {
    const rawBuffer = Buffer.from(buffer);
    let rawText: string;

    // Detect UTF-16 LE (FF FE) or UTF-16 BE (FE FF) BOM, commonly written by Windows Notepad
    if (rawBuffer.length >= 2 && rawBuffer[0] === 0xff && rawBuffer[1] === 0xfe) {
      rawText = new TextDecoder('utf-16le').decode(rawBuffer.subarray(2));
    } else if (rawBuffer.length >= 2 && rawBuffer[0] === 0xfe && rawBuffer[1] === 0xff) {
      rawText = new TextDecoder('utf-16be').decode(rawBuffer.subarray(2));
    } else {
      rawText = rawBuffer.toString('utf8');
    }

    if (isBinaryContent(rawText)) {
      throw new FileExtractionError('INVALID_ENCODING');
    }

    const normalized = rawText
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[\u200B-\u200D\uFEFF]/g, '') // strip zero-width spaces
      .trim();

    if (normalized.length < 10) {
      throw new FileExtractionError('EMPTY_FILE');
    }

    return {
      text: normalized,
      fileType,
      charCount: normalized.length,
    };
  }

  // 3. PDF extraction
  if (fileType === 'pdf') {
    // Basic signature check: must start with %PDF-
    const header = Buffer.from(buffer.slice(0, 5)).toString('ascii');
    if (!header.startsWith('%PDF-')) {
      throw new FileExtractionError('CORRUPT_FILE', 'The uploaded file is not a valid PDF document.');
    }

    let parser: PDFParse | null = null;
    try {
      const uint8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
      parser = new PDFParse({ data: uint8 });
      const result = await parser.getText();
      const rawText = result.text || '';
      const extractedText = stripPdfPageMarkers(rawText);

      if (!hasMinimumReadableText(rawText)) {
        throw new FileExtractionError('SCANNED_OR_EMPTY_PDF');
      }

      return {
        text: extractedText,
        fileType: 'pdf',
        pageCount: result.total || result.pages?.length || 1,
        charCount: extractedText.length,
      };
    } catch (err: unknown) {
      if (err instanceof FileExtractionError) {
        throw err;
      }
      console.error('[PDF Extraction Error]:', err);
      throw new FileExtractionError(
        'CORRUPT_FILE',
        'Could not parse PDF content. The file may be damaged or password-protected.'
      );
    } finally {
      if (parser) {
        try {
          await parser.destroy();
        } catch {
          // Ignore destroy errors
        }
      }
    }
  }

  throw new FileExtractionError('UNSUPPORTED_TYPE');
}

