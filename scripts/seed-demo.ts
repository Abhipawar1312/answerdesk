import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { embedMany } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { Workspace } from '../src/models/Workspace';
import { SourceDocument } from '../src/models/SourceDocument';
import { SourceDocumentChunk } from '../src/models/SourceDocumentChunk';
import { chunkText } from '../src/services/text-chunker';

// Load .env.local if present
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

/**
 * Demo workspace seed script.
 * Creates a public demo workspace with sample FAQs in English, Hindi, and Marathi.
 * Refuses to run unless ALLOW_DEMO_SEED=true is set in the environment.
 */
async function seedDemoWorkspace() {
  console.log('--- Starting Demo Workspace Seed ---');

  // Safety gate: Refuse to run against any database without explicit authorization
  if (process.env.ALLOW_DEMO_SEED !== 'true') {
    console.error('❌ SAFETY REFUSAL: The target database is not marked as demo-safe.');
    console.error('To run this script, set ALLOW_DEMO_SEED=true in your environment or command line.');
    process.exit(1);
  }

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('❌ MONGODB_URI is not set in environment.');
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.log('✓ Connected to MongoDB database successfully');

  const DEMO_SLUG = 'demo';
  const demoUserId = new mongoose.Types.ObjectId('000000000000000000000001');

  // 1. Find or create demo workspace
  let demoWorkspace = await Workspace.findOne({ slug: DEMO_SLUG });

  if (!demoWorkspace) {
    demoWorkspace = await Workspace.create({
      name: 'AnswerDesk Demo (Public)',
      slug: DEMO_SLUG,
      ownerId: demoUserId,
      plan: 'free',
      monthlyMessageCount: 0,
      messageLimit: 20, // Strict message cap for public demo
      dailyMessageCap: 10,
      allowedOrigins: ['*'], // Allow public browser testing
      hideCitationsInWidget: false,
    });
    console.log(`✓ Created new demo workspace "${demoWorkspace.name}" with strict message cap (20 msgs/mo)`);
  } else {
    demoWorkspace.name = 'AnswerDesk Demo (Public)';
    demoWorkspace.messageLimit = 20;
    demoWorkspace.allowedOrigins = ['*'];
    await demoWorkspace.save();
    console.log(`✓ Updated existing demo workspace "${demoWorkspace.name}" (cap: 20 msgs/mo)`);
  }

  // 2. Clean previous demo documents and chunks for clean idempotency
  await SourceDocumentChunk.deleteMany({ workspaceId: demoWorkspace._id });
  await SourceDocument.deleteMany({ workspaceId: demoWorkspace._id });
  console.log('✓ Cleared previous demo documents and chunks');

  // 3. Multilingual Sample FAQs (No real or private customer data)
  const sampleFaqs = [
    {
      title: 'AnswerDesk Product Overview (English)',
      fileType: 'faq' as const,
      content: `What is AnswerDesk?
AnswerDesk is an AI-powered customer support assistant that answers visitor questions using your own verified documentation.

How does AnswerDesk work?
AnswerDesk breaks down your knowledge base articles into semantic chunks, creates high-dimensional representations, and finds relevant sections to answer visitor questions with accurate source citations.

What languages does AnswerDesk support?
AnswerDesk natively understands and answers questions in English, Hindi, and Marathi.

How do I integrate the widget?
You can embed the widget on any website by adding a single script tag with your workspace slug before the closing body tag.

Can AnswerDesk prevent answers to off-topic questions?
Yes, AnswerDesk is grounded strictly in your provided knowledge articles. If an inquiry cannot be answered by your knowledge base, it politely directs the customer to your support team.`,
    },
    {
      title: 'AnswerDesk उत्पाद प्रश्नोत्तरी (हिंदी)',
      fileType: 'faq' as const,
      content: `AnswerDesk क्या है?
AnswerDesk एक AI-आधारित ग्राहक सहायता सहायक है जो आपके ज्ञानकोष (knowledge base) के आधार पर ग्राहकों के सवालों के सटीक उत्तर देता है।

AnswerDesk कैसे काम करता है?
AnswerDesk आपके दस्तावेज़ों को सुरक्षित रूप से संसाधित करता है और जब कोई ग्राहक प्रश्न पूछता है, तो वह सबसे प्रासंगिक जानकारी ढूंढकर सटीक उत्तर प्रदान करता है।

AnswerDesk किन भाषाओं का समर्थन करता है?
AnswerDesk अंग्रेजी, हिंदी और मराठी तीनों भाषाओं में सहजता से संवाद कर सकता है।

वेबसाइट पर विजेट कैसे लगाएं?
आप डैशबोर्ड से एक साधारण जावास्क्रिप्ट कोड कॉपी करके अपनी वेबसाइट के बॉडी टैग के अंत में पेस्ट कर सकते हैं।

यदि कोई सवाल ज्ञानकोष में न हो तो क्या होता है?
यदि किसी प्रश्न का उत्तर ज्ञानकोष में उपलब्ध नहीं है, तो AnswerDesk गलत जानकारी देने के बजाय ग्राहक को आपकी सहायता टीम से संपर्क करने का सुझाव देता है।`,
    },
    {
      title: 'AnswerDesk उत्पादन माहिती (मराठी)',
      fileType: 'faq' as const,
      content: `AnswerDesk म्हणजे काय?
AnswerDesk हे एक AI-संचालित ग्राहक सहाय्यक व्यासपीठ आहे जे तुमच्या अधिकृत माहिती लेखांचा संदर्भ घेऊन ग्राहकांच्या प्रश्नांची अचूक उत्तरे देते.

AnswerDesk कसे कार्य करते?
AnswerDesk तुमच्या दस्तऐवजांमधील माहितीचे विश्लेषण करते आणि ग्राहक विचारत असलेल्या प्रश्नाशी सुसंगत माहिती शोधून संदर्भानुसार उत्तर तयार करते.

AnswerDesk कोणत्या भाषांमध्ये उत्तर देऊ शकते?
AnswerDesk इंग्रजी, हिंदी आणि मराठी या तिन्ही भाषांमध्ये ग्राहकांशी संवाद साधू शकते.

वेबसाइटवर चॅट विजेट कसे जोडायचे?
डॅशबोर्डवर उपलब्ध असलेला जावास्क्रिप्ट कोड कॉपी करून तुमच्या संकेतस्थळावर body टॅग संपण्यापूर्वी जोडा.

माहिती उपलब्ध नसताना AnswerDesk काय करते?
जर एखाद्या प्रश्नाचे उत्तर ज्ञानकोषात नसेल, तर चुकीची माहिती न देता AnswerDesk ग्राहकाला थेट ग्राहक सेवा प्रतिनिधीशी संपर्क साधण्याची विनंती करते.`,
    },
  ];

  const apiKey = process.env.GEMINI_API_KEY;
  const googleAI = apiKey ? createGoogleGenerativeAI({ apiKey }) : null;

  for (const faq of sampleFaqs) {
    console.log(`Processing sample FAQ: "${faq.title}"...`);

    const doc = await SourceDocument.create({
      workspaceId: demoWorkspace._id,
      title: faq.title,
      content: faq.content,
      fileType: faq.fileType,
      status: 'processing',
      chunkCount: 0,
      uploadedBy: demoUserId,
    });

    const chunks = chunkText(faq.content, { targetTokens: 400 });
    const chunkTexts = chunks.map((c) => c.content);

    let embeddings: number[][] = [];
    if (googleAI) {
      try {
        const model = googleAI.textEmbeddingModel('gemini-embedding-001');
        const res = await embedMany({
          model,
          values: chunkTexts,
          dimensions: 768,
          providerOptions: {
            google: {
              taskType: 'RETRIEVAL_DOCUMENT',
            },
          },
        });
        embeddings = res.embeddings;
      } catch {
        console.warn(`[Warning] Embedding call failed for "${faq.title}". Using fallback vector.`);
        embeddings = chunkTexts.map(() => new Array(768).fill(0.001));
      }
    } else {
      embeddings = chunkTexts.map(() => new Array(768).fill(0.001));
    }

    const chunkDocs = chunks.map((chunk, idx) => ({
      workspaceId: demoWorkspace._id,
      documentId: doc._id,
      chunkIndex: idx,
      content: chunk.content,
      tokenCount: chunk.tokenCount,
      embedding: embeddings[idx],
      embeddingModel: 'gemini-embedding-001',
      metadata: {
        sourceTitle: faq.title,
      },
    }));

    await SourceDocumentChunk.insertMany(chunkDocs);

    doc.chunkCount = chunkDocs.length;
    doc.status = 'ready';
    await doc.save();

    console.log(`✓ Indexed "${faq.title}" (${chunkDocs.length} chunks)`);
  }

  console.log('\n========================================');
  console.log(' Demo Workspace Seed Complete! 🎉');
  console.log(` Workspace Slug: ${DEMO_SLUG}`);
  console.log(` Monthly Cap: 20 messages`);
  console.log(' Public Widget Link:');
  console.log(` ${process.env.NEXT_PUBLIC_APP_URL || 'https://answerdesk-ai.vercel.app'}/widget/${DEMO_SLUG}`);
  console.log('========================================\n');

  await mongoose.disconnect();
}

if (require.main === module || process.argv[1]?.includes('seed-demo')) {
  seedDemoWorkspace().catch((err) => {
    console.error('Fatal error in seedDemoWorkspace:', err);
    process.exit(1);
  });
}

export { seedDemoWorkspace };
