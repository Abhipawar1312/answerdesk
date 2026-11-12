import 'server-only';

export interface StorageFileMetadata {
  size: number;
  contentType: string; // e.g. 'application/pdf', 'text/plain', 'text/markdown'
}

/**
 * Sanitizes a raw file name to prevent path traversal and shell injection.
 * Removes slashes, backslashes, null bytes, and path navigation dots.
 */
export function sanitizeFileName(rawName: string): string {
  const base = rawName
    .replace(/[\0\r\n]/g, '')
    .replace(/^(\.\.[/\\])+/, '') // strip leading path traversal segments
    .replace(/[/\\]+/g, '_')
    .replace(/\.{2,}/g, '.') // Collapse consecutive dots so names like "a..b.pdf" do not trigger path traversal checks
    .replace(/^_+/, '')
    .replace(/^\.+/, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 100);

  return base || 'document';
}

/**
 * Storage Service Interface
 *
 * NOTE: CURRENTLY A MOCK IMPLEMENTATION FOR DEVELOPMENT AND UNIT/INTEGRATION TESTING.
 * Real blob storage (Vercel Blob / AWS S3) will be connected when deployment keys are configured.
 * See KEYS_NEEDED.md for production credentials.
 */
export class MockStorageService {
  private registeredFiles = new Map<string, StorageFileMetadata>();

  private ensureNonProduction() {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'MockStorageService cannot be used in production. Real cloud storage credentials required.'
      );
    }
  }

  /**
   * Register file metadata for local testing.
   */
  registerMockFile(key: string, metadata: StorageFileMetadata) {
    this.ensureNonProduction();
    this.registeredFiles.set(key, metadata);
  }

  /**
   * Read actual file metadata from the storage layer.
   * Never trusts client-reported size or MIME type.
   * Does NOT invent size or content type from file extensions.
   */
  async getFileMetadata(key: string): Promise<StorageFileMetadata | null> {
    this.ensureNonProduction();
    return this.registeredFiles.get(key) || null;
  }

  getPublicUrl(key: string): string {
    this.ensureNonProduction();
    return `https://mock-storage.answerdesk.local/${key}`;
  }

  async deleteFile(key: string): Promise<boolean> {
    this.ensureNonProduction();
    this.registeredFiles.delete(key);
    return true;
  }
}

export const storage = new MockStorageService();

