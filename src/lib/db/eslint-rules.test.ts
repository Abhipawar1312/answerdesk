import { describe, it, expect } from 'vitest';
import { ESLint } from 'eslint';

describe('ESLint Tenancy Rules Enforcement', () => {
  const eslint = new ESLint();

  it('flags .bulkWrite() calls as forbidden via no-restricted-syntax', async () => {
    const code = `
      export async function bypass(model: any, docs: any[]) {
        return model.bulkWrite(docs);
      }
    `;
    const results = await eslint.lintText(code, { filePath: 'src/services/bypass.ts' });
    const messages = results[0]?.messages.map((m) => m.message) || [];
    expect(
      messages.some((m) =>
        m.includes('Direct .bulkWrite() calls bypass Mongoose tenancy isolation hooks')
      )
    ).toBe(true);
  }, 120000);

  it('flags .collection access as forbidden via no-restricted-syntax', async () => {
    const code = `
      export async function bypass(model: any) {
        return model.collection.find({});
      }
    `;
    const results = await eslint.lintText(code, { filePath: 'src/services/bypass.ts' });
    const messages = results[0]?.messages.map((m) => m.message) || [];
    expect(
      messages.some((m) =>
        m.includes('Direct .collection access bypasses Mongoose tenancy isolation hooks')
      )
    ).toBe(true);
  }, 120000);

  it('flags direct imports of @/models/Workspace outside DAL via no-restricted-imports', async () => {
    const code = `
      import { Workspace } from '@/models/Workspace';
      export const test = Workspace;
    `;
    const results = await eslint.lintText(code, { filePath: 'src/services/leak.ts' });
    const messages = results[0]?.messages.map((m) => m.message) || [];
    expect(
      messages.some((m) =>
        m.includes('Direct Workspace model import is restricted. Use tenant DAL')
      )
    ).toBe(true);
  }, 120000);

  it('flags direct imports of tenant models like @/models/SourceDocument outside src/lib/db', async () => {
    const code = `
      import { SourceDocument } from '@/models/SourceDocument';
      export const test = SourceDocument;
    `;
    const results = await eslint.lintText(code, { filePath: 'src/components/leak.tsx' });
    const messages = results[0]?.messages.map((m) => m.message) || [];
    expect(
      messages.some((m) =>
        m.includes('Direct imports of tenant-scoped models are forbidden outside src/lib/db')
      )
    ).toBe(true);
  }, 120000);
});
