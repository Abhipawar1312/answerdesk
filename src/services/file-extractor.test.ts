import { describe, it, expect } from 'vitest';
import {
  extractTextFromBuffer,
  detectSupportedFileType,
  FileExtractionError,
} from './file-extractor';

describe('File Extractor Service (In-Memory)', () => {
  describe('detectSupportedFileType', () => {
    it('detects .txt files from extension and mime type', () => {
      expect(detectSupportedFileType('notes.txt')).toBe('txt');
      expect(detectSupportedFileType('notes', 'text/plain')).toBe('txt');
    });

    it('detects .md files from extension and mime type', () => {
      expect(detectSupportedFileType('README.MD')).toBe('md');
      expect(detectSupportedFileType('doc', 'text/markdown')).toBe('md');
    });

    it('detects .pdf files from extension and mime type', () => {
      expect(detectSupportedFileType('manual.pdf')).toBe('pdf');
      expect(detectSupportedFileType('guide', 'application/pdf')).toBe('pdf');
    });

    it('throws UNSUPPORTED_TYPE for unsupported formats', () => {
      expect(() => detectSupportedFileType('photo.png', 'image/png')).toThrowError(
        FileExtractionError
      );
      expect(() => detectSupportedFileType('archive.zip')).toThrow(
        /Unsupported file format/
      );
    });
  });

  describe('extractTextFromBuffer - Plain Text & Markdown', () => {
    it('extracts and normalizes clean UTF-8 text from .txt buffer', async () => {
      const content = 'First line.\r\nSecond line with info.\r\nThird line.';
      const buffer = Buffer.from(content, 'utf8');

      const result = await extractTextFromBuffer(buffer, 'policy.txt', 'text/plain');
      expect(result.fileType).toBe('txt');
      expect(result.text).toBe('First line.\nSecond line with info.\nThird line.');
      expect(result.charCount).toBeGreaterThan(20);
    });

    it('extracts multilingual text in Hindi and Marathi without corruption', async () => {
      const content = 'आमच्या सेवेमध्ये ३० दिवसांच्या आत पूर्ण परतावा मिळतो। संपर्क करा support@example.com.';
      const buffer = Buffer.from(content, 'utf8');

      const result = await extractTextFromBuffer(buffer, 'marathi.txt');
      expect(result.fileType).toBe('txt');
      expect(result.text).toContain('३० दिवसांच्या आत');
    });

    it('extracts Markdown and strips zero-width spaces', async () => {
      const content = '# Guide\n\n\u200BImportant details about the platform.';
      const buffer = Buffer.from(content, 'utf8');

      const result = await extractTextFromBuffer(buffer, 'guide.md', 'text/markdown');
      expect(result.fileType).toBe('md');
      expect(result.text).toBe('# Guide\n\nImportant details about the platform.');
    });

    it('rejects empty files with EMPTY_FILE error', async () => {
      const buffer = Buffer.from('   \n  ', 'utf8');
      await expect(extractTextFromBuffer(buffer, 'empty.txt')).rejects.toThrow(
        /does not contain readable text content/
      );
    });

    it('rejects binary files disguised as .txt containing null bytes', async () => {
      const binaryData = Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x00, 0x6f, 0x20, 0x77, 0x6f, 0x72, 0x6c, 0x64]);
      await expect(extractTextFromBuffer(binaryData, 'disguised.txt')).rejects.toThrow(
        /binary or invalid characters/
      );
    });

    it('rejects files exceeding workspace plan size limit', async () => {
      // 6MB buffer on Free plan (max 5MB)
      const bigBuffer = Buffer.alloc(6 * 1024 * 1024, 'a');
      await expect(
        extractTextFromBuffer(bigBuffer, 'large.txt', 'text/plain', 'free')
      ).rejects.toThrow(/exceeds maximum size of 5MB/);
    });

    it('allows files within Pro plan limit (e.g. 15MB on Pro)', async () => {
      // 1MB buffer on Pro plan
      const validProBuffer = Buffer.from('Valid content for pro plan with enough characters.', 'utf8');
      const res = await extractTextFromBuffer(validProBuffer, 'pro.txt', 'text/plain', 'pro');
      expect(res.text).toContain('Valid content');
    });
  });

  describe('extractTextFromBuffer - PDF Validation', () => {
    it('rejects non-PDF files disguised as .pdf', async () => {
      const fakePdf = Buffer.from('Not a real PDF file header', 'utf8');
      await expect(extractTextFromBuffer(fakePdf, 'fake.pdf')).rejects.toThrow(
        /not a valid PDF document/
      );
    });

    it('extracts text from PDF buffer with valid text', async () => {
      // Minimal valid PDF structure with sample English text
      const sampleText = 'Sunrise Bakery sells fresh bread and croissants daily for all customers.';
      const pdfContent = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 120 >>
stream
BT /F1 12 Tf 72 712 Td (${sampleText}) Tj ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000266 00000 n 
0000000373 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
450
%%EOF`;

      const buffer = Buffer.from(pdfContent, 'utf-8');
      const result = await extractTextFromBuffer(buffer, 'test-doc.pdf');
      expect(result.fileType).toBe('pdf');
      expect(result.pageCount).toBe(1);
      expect(result.charCount).toBeGreaterThan(20);
      expect(result.text).toContain('Sunrise Bakery sells');
    });

    it('extracts real text from a real text PDF fixture', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const fixturePath = path.join(process.cwd(), 'src/tests/fixtures/real-text.pdf');
      const buffer = fs.readFileSync(fixturePath);

      const result = await extractTextFromBuffer(buffer, 'real-text.pdf');
      expect(result.fileType).toBe('pdf');
      expect(result.text).toContain('Sunrise Bakery sells croissants');
      expect(result.charCount).toBeGreaterThan(50);
    });

    it('rejects an image-only PDF containing only page markers with clear "no readable text" message', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const fixturePath = path.join(process.cwd(), 'src/tests/fixtures/image-only.pdf');
      const buffer = fs.readFileSync(fixturePath);

      await expect(extractTextFromBuffer(buffer, 'scan.pdf')).rejects.toThrow(
        /The PDF contains no readable text/i
      );
    });
  });
});

