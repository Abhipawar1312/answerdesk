/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Standalone verification script executing against the application's actual embedding service.
 * Imports embedDocumentChunks and embedQuery directly from src/services/embedding-service.
 * Prints ONLY the vector lengths (768). Never prints or logs the API key.
 */
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';

// Intercept CommonJS require('server-only') for script execution outside Next.js
const originalRequire = (Module.prototype as any).require;
(Module.prototype as any).require = function (id: string, ...args: any[]) {
  if (id === 'server-only') {
    return {};
  }
  return originalRequire.apply(this, [id, ...args]);
};

// Load .env.local into process.env before app modules are imported
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('GEMINI_API_KEY=')) {
      process.env.GEMINI_API_KEY = trimmed.slice('GEMINI_API_KEY='.length).trim();
    }
  }
}

async function run() {
  // Dynamically import app service after server-only hook and env are ready
  const { embedDocumentChunks, embedQuery } = await import('../src/services/embedding-service');

  const chunkResult = await embedDocumentChunks(['AnswerDesk AI customer support knowledge base.']);
  const queryResult = await embedQuery('How do I reset my account password?');

  if (Array.isArray(chunkResult) && chunkResult[0]?.length === 768) {
    console.log(`App Service embedDocumentChunks: Vector length = ${chunkResult[0].length}`);
  } else {
    console.error('App Service embedDocumentChunks returned unexpected result:', chunkResult);
    process.exit(1);
  }

  if (Array.isArray(queryResult) && queryResult.length === 768) {
    console.log(`App Service embedQuery: Vector length = ${queryResult.length}`);
  } else {
    console.error('App Service embedQuery returned unexpected result:', queryResult);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Check failed:', err.message);
  process.exit(1);
});
