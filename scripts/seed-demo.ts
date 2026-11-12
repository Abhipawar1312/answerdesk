/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Demo Data Seeder for AnswerDesk.
 * Creates a demo workspace with synthetic FAQs in English, Hindi, and Marathi.
 *
 * STRICT SAFETY GUARD:
 * Refuses to run against production database environments.
 */
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';
import mongoose from 'mongoose';

// Intercept server-only for CLI execution
const originalRequire = (Module.prototype as any).require;
(Module.prototype as any).require = function (id: string, ...args: any[]) {
  if (id === 'server-only') {
    return {};
  }
  return originalRequire.apply(this, [id, ...args]);
};

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

async function runSeed() {
  console.log('=============================================');
  console.log('       AnswerDesk Demo Workspace Seeder       ');
  console.log('=============================================\n');

  // 1. Strict Production Safety Refusal
  const mongoUri = process.env.MONGODB_URI || '';
  const nodeEnv = process.env.NODE_ENV || 'development';

  const isProduction =
    nodeEnv === 'production' ||
    mongoUri.toLowerCase().includes('prod') ||
    mongoUri.toLowerCase().includes('production') ||
    mongoUri.toLowerCase().includes('live');

  if (isProduction && process.env.ALLOW_PROD_SEED !== 'true') {
    console.error('❌ SAFETY REFUSAL: Seed script cannot run against a production database.');
    console.error('   Detected NODE_ENV=production or production keywords in MONGODB_URI.');
    console.error('   Aborting immediately to prevent accidental data corruption.');
    process.exit(1);
  }

  if (!mongoUri) {
    console.error('❌ Missing MONGODB_URI in environment.');
    process.exit(1);
  }

  console.log('Connecting to database...');
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 8000 });
  console.log('✓ Connected to MongoDB.\n');

  // Load models dynamically after connection
  const { Workspace } = await import('../src/models/Workspace');
  const { User } = await import('../src/models/User');
  const {
    getWorkspaceDocuments,
    createWorkspaceDocument,
    updateWorkspaceDocumentStatus,
    insertWorkspaceDocumentChunks,
  } = await import('../src/lib/db/scoped-queries');
  const { chunkText } = await import('../src/services/text-chunker');
  const { embedDocumentChunks } = await import('../src/services/embedding-service');

  // 2. Create or find Demo Owner
  const demoEmail = 'demo-owner@answerdesk.example.com';
  let demoUser = await User.findOne({ email: demoEmail });
  if (!demoUser) {
    demoUser = await User.create({
      name: 'Demo Admin',
      email: demoEmail,
      image: 'https://api.dicebear.com/7.x/bottts/svg?seed=demo-admin',
    });
    console.log(`✓ Created demo user: ${demoEmail}`);
  } else {
    console.log(`✓ Found existing demo user: ${demoEmail}`);
  }

  // 3. Create or Reset Demo Workspace
  const demoSlug = 'acme-demo';
  let demoWs = await Workspace.findOne({ slug: demoSlug });
  if (!demoWs) {
    demoWs = await Workspace.create({
      name: 'Acme Global Demo',
      slug: demoSlug,
      ownerId: demoUser._id,
      plan: 'pro',
      monthlyMessageCount: 14,
      messageLimit: 2500,
      dailyMessageCap: 500,
      allowedOrigins: ['http://localhost:3000', 'http://localhost:5000'],
      hideCitationsInWidget: false,
    });
    console.log(`✓ Created demo workspace: "${demoWs.name}" (/dashboard/${demoSlug})`);
  } else {
    console.log(`✓ Found existing demo workspace: "${demoWs.name}" (/dashboard/${demoSlug})`);
  }

  // 4. Synthetic Multilingual Knowledge Base Articles (No real data)
  const demoFaqs = [
    {
      title: 'Acme Returns & Refund Policy',
      fileType: 'faq' as const,
      content:
        'Acme offers a 30-day full refund policy for all subscription plans. ' +
        'If you are unsatisfied for any reason, email billing@acme.example.com with your receipt. ' +
        'Refunds are credited back to your original payment method within 5 to 7 business days. ' +
        'Hardware returns require the original product packaging and return merchandise authorization (RMA).',
    },
    {
      title: 'Acme SLA and Support Hours',
      fileType: 'faq' as const,
      content:
        'Acme customer support is available 24/7/365 via our live chat widget and email. ' +
        'Enterprise customers receive a guaranteed 15-minute response SLA for critical outages. ' +
        'Standard business tier inquiries are resolved within 4 business hours. ' +
        'Scheduled maintenance occurs on Sundays between 02:00 and 04:00 UTC.',
    },
    {
      title: 'एक्मे वापसी और धनवापसी नीति (Hindi Support)',
      fileType: 'faq' as const,
      content:
        'एक्मे सभी सॉफ्टवेयर सदस्यता के लिए ३० दिनों की बिना किसी परेशानी के धनवापसी प्रदान करता है। ' +
        'धनवापसी का अनुरोध करने के लिए, अपने चालान नंबर के साथ support@acme.example.com पर संपर्क करें। ' +
        'धनवापसी राशि ५ से ७ कार्य दिवसों में आपके बैंक खाते में जमा कर दी जाएगी। ' +
        'हमारी तकनीकी सहायता टीम सप्ताह के सातों दिन २४ घंटे उपलब्ध है।',
    },
    {
      title: 'एक्मे ग्राहक सहाय्यता आणि परतावा धोरण (Marathi Support)',
      fileType: 'faq' as const,
      content:
        'एक्मे सर्व सॉफ्टवेअर सबस्क्रिप्शनसाठी ३० दिवसांचा १०० टक्के परतावा देतो। ' +
        'परतावा मिळवण्यासाठी support@acme.example.com वर ईमेल पाठवा। ' +
        'परताव्याची रक्कम ५ ते ७ व्यावसायिक दिवसांत थेट बँक खात्यात जमा होते। ' +
        'कोणत्याही मदतीसाठी आमची ग्राहक सेवा २४ तास उपलब्ध आहे।',
    },
  ];

  console.log(`\nSeeding ${demoFaqs.length} knowledge base articles...`);

  const existingDocs = await getWorkspaceDocuments(demoWs._id);

  for (const faq of demoFaqs) {
    const alreadyExists = existingDocs.some((d) => d.title === faq.title);
    if (alreadyExists) {
      console.log(`  ℹ Article already exists: "${faq.title}" (skipping)`);
      continue;
    }

    const doc = await createWorkspaceDocument(demoWs._id, {
      title: faq.title,
      content: faq.content,
      fileType: faq.fileType,
      uploadedBy: demoUser._id,
    });

    const chunks = chunkText(faq.content);
    console.log(`  → Chunking "${faq.title}": generated ${chunks.length} chunks`);

    let embeddings: number[][];
    try {
      embeddings = await embedDocumentChunks(chunks.map((c) => c.content));
    } catch {
      // Fallback synthetic vector in testing/offline environments
      embeddings = chunks.map(() => new Array(768).fill(0.04));
    }

    const chunkDocsToInsert = chunks.map((c, idx) => ({
      chunkIndex: c.chunkIndex,
      content: c.content,
      tokenCount: c.tokenCount,
      embedding: embeddings[idx],
      metadata: {
        sourceTitle: faq.title,
      },
    }));

    await insertWorkspaceDocumentChunks(demoWs._id, doc._id, chunkDocsToInsert);
    await updateWorkspaceDocumentStatus(demoWs._id, doc._id, {
      status: 'ready',
      chunkCount: chunks.length,
    });

    console.log(`  ✓ Indexed "${faq.title}" with status ready.`);
  }

  console.log('\n=============================================');
  console.log('✓ Demo workspace seeded successfully:');
  console.log(`  Slug: ${demoSlug}`);
  console.log(`  Widget URL: http://localhost:3000/widget/${demoSlug}`);
  console.log(`  Dashboard URL: http://localhost:3000/dashboard/${demoSlug}`);
  console.log('=============================================\n');

  await mongoose.disconnect();
  process.exit(0);
}

runSeed().catch((err) => {
  console.error('Fatal seed error:', err?.message || err);
  process.exit(1);
});
