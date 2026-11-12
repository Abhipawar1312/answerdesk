/**
 * Standalone verification script for Gemini API Key.
 * Embeds a single test sentence with gemini-embedding-001 at 768 dimensions.
 * Prints ONLY the vector length; never prints or leaks the API key.
 */
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

async function runCheck() {
  const key = loadEnvKey() || process.env.GEMINI_API_KEY;
  if (!key) {
    console.error('Error: GEMINI_API_KEY not found in .env.local or process environment.');
    process.exit(1);
  }

  const testText = 'AnswerDesk AI customer support knowledge base.';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${key}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'models/gemini-embedding-001',
      content: { parts: [{ text: testText }] },
      outputDimensionality: 768,
    }),
  });

  if (!res.ok) {
    console.error(`Gemini API responded with status ${res.status}`);
    process.exit(1);
  }

  const data = await res.json();
  const vector = data.embedding?.values;

  if (Array.isArray(vector)) {
    console.log(`Real Gemini Check: Vector length = ${vector.length}`);
  } else {
    console.error('Real Gemini Check: No embedding values returned.');
    process.exit(1);
  }
}

runCheck().catch((err) => {
  console.error('Check failed:', err.message);
  process.exit(1);
});

