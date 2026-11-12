/* eslint-disable @typescript-eslint/no-explicit-any */
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText } from 'ai';
import { buildChatPrompt } from '../src/services/prompt-builder';
import fs from 'node:fs';
import path from 'node:path';

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
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

const mockKnowledgeChunks = [
  {
    documentId: 'doc_faq_1',
    chunkIndex: 0,
    content: 'We provide a 100% full refund within 30 days of purchase for unused plans. To request a refund, please email support@example.com with your receipt.',
    metadata: { sourceTitle: 'Refund Policy' },
  },
  {
    documentId: 'doc_faq_2',
    chunkIndex: 0,
    content: 'हमारे पास 30 दिनों की 100% रिफंड गारंटी है। अप्रयुक्त योजनाओं के लिए support@example.com पर संपर्क करें।',
    metadata: { sourceTitle: 'हिंदी वापसी नीति' },
  },
  {
    documentId: 'doc_faq_3',
    chunkIndex: 0,
    content: 'आम्ही खरेदीच्या ३० दिवसांच्या आत १००% पूर्ण परतावा देतो. मदतीसाठी support@example.com वर ईमेल करा.',
    metadata: { sourceTitle: 'मराठी परतावा धोरण' },
  },
];

const nearMissQuestions = [
  { id: 1, lang: 'EN', q: 'Can I pay with cryptocurrency or Bitcoin?' },
  { id: 2, lang: 'EN', q: 'Do you offer annual discounts or enterprise pricing?' },
  { id: 3, lang: 'EN', q: 'How do I upgrade to the enterprise plan?' },
  { id: 4, lang: 'HI', q: 'क्या आप यूपीआई या फोनपे स्वीकार करते हैं?' },
  { id: 5, lang: 'HI', q: 'क्या आपकी कोई वार्षिक छूट योजना उपलब्ध है?' },
  { id: 6, lang: 'HI', q: 'खाते का पासवर्ड कैसे बदलें?' },
  { id: 7, lang: 'MR', q: 'वार्षिक वर्गणीसाठी काही सवलत आहे का?' },
  { id: 8, lang: 'MR', q: 'माझे क्रेडिट कार्ड कसे अपडेट करावे?' },
];

async function run() {
  console.log('--- Testing 8 Near-Miss Questions with Real Model (gemini-3.1-flash-lite) ---\n');
  const google = createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY });
  const model = google('gemini-3.1-flash-lite');

  const results: any[] = [];

  for (const item of nearMissQuestions) {
    const { systemPrompt, userPrompt } = buildChatPrompt('Acme Corp', item.q, mockKnowledgeChunks as any);

    const res = await generateText({
      model,
      system: systemPrompt,
      prompt: userPrompt,
      maxOutputTokens: 500,
    });

    const reply = res.text.trim();
    const isDeflected =
      reply.toLowerCase().includes('not have enough information') ||
      reply.toLowerCase().includes('reach out to customer support') ||
      reply.includes('पर्याप्त जानकारी नहीं') ||
      reply.includes('ग्राहक सहायता') ||
      reply.includes('माहिती उपलब्ध नाही') ||
      reply.includes('ग्राहक समर्थनाशी संपर्क');

    const guessed =
      reply.toLowerCase().includes('bitcoin') ||
      reply.toLowerCase().includes('crypto') ||
      reply.toLowerCase().includes('annual') ||
      reply.toLowerCase().includes('discount') ||
      reply.toLowerCase().includes('password') ||
      reply.includes('यूपीआई') ||
      reply.includes('सवलत');

    const verdict = isDeflected && !guessed ? 'SAFE_DEFLECTED' : (guessed ? 'GUESSED_HALLUCINATED' : 'UNCLEAR');

    results.push({
      id: item.id,
      lang: item.lang,
      question: item.q,
      verdict,
      replySnippet: reply.replace(/\n+/g, ' ').slice(0, 100),
    });

    console.log(`[#${item.id}] [${item.lang}] "${item.q}" -> Verdict: ${verdict}`);
    console.log(`  Reply: "${reply.replace(/\n+/g, ' ').slice(0, 120)}..."\n`);
  }

  console.log('\n--- Summary Table ---');
  console.table(results.map(r => ({ ID: r.id, Lang: r.lang, Verdict: r.verdict, Reply: r.replySnippet })));
}

run().catch(console.error);
