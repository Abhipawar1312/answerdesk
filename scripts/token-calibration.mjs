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

function estimateTokensCalibrated(text) {
  if (!text || text.trim().length === 0) return 0;

  let devanagariCount = 0;
  let latinCount = 0;
  let otherCount = 0;

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0x0900 && code <= 0x097f) {
      devanagariCount++;
    } else if (
      (code >= 0x0041 && code <= 0x005a) ||
      (code >= 0x0061 && code <= 0x007a) ||
      (code >= 0x0030 && code <= 0x0039)
    ) {
      latinCount++;
    } else {
      otherCount++;
    }
  }

  // Calibrated for gemini-embedding-001:
  // - Devanagari averages ~2.5 chars/token across Hindi and Marathi
  // - Latin alphanumeric averages ~6.5 chars/token in prose
  // - Spaces and punctuation ~4.5 chars/token
  const estimated = Math.ceil(
    devanagariCount / 2.5 + latinCount / 6.5 + otherCount / 4.5
  );

  return Math.max(1, estimated);
}

const samples = {
  English: `AnswerDesk is an enterprise customer support platform designed to streamline inquiry resolution. With our advanced multi-tenant infrastructure, teams can effortlessly manage incoming customer conversations, index internal documentation, and provide instant, grounded responses. Our vector retrieval system cross-references proprietary knowledge articles in real time, ensuring high precision and preventing hallucinations. Businesses can track unresolved questions and refine support policies.`,
  Hindi: `उत्तरडेस्क एक उद्यम ग्राहक सहायता मंच है जो पूछताछ समाधान को सुव्यवस्थित करने के लिए डिज़ाइन किया गया है। हमारे उन्नत बहु-किरायेदार बुनियादी ढांचे के साथ, टीमें आने वाली ग्राहक बातचीत को सहजता से प्रबंधित कर सकती हैं, आंतरिक दस्तावेज़ीकरण को अनुक्रमित कर सकती हैं और तत्काल, सटीक उत्तर प्रदान कर सकती हैं। हमारी वेक्टर पुनर्प्राप्ति प्रणाली वास्तविक समय में ज्ञान लेखों को संदर्भित करती है, जिससे त्रुटिरहित उत्तर सुनिश्चित होते हैं। व्यवसाय अनुत्तरित प्रश्नों को ट्रैक कर सकते हैं।`,
  Marathi: `आन्सरडेस्क हे एक प्रगत ग्राहक सेवा व्यासपीठ आहे जे विचारलेल्या प्रश्नांचे जलद आणि अचूक निरसन करण्यासाठी तयार केले गेले आहे. आमच्या मल्टि-भाडेकरू तंत्रज्ञानामुळे, कंपन्या ग्राहकांच्या समस्यांचे सहज व्यवस्थापन करू शकतात, अंतर्गत मार्गदर्शक दस्तऐवज सुरक्षितपणे साठवणे आणि तात्काळ माहिती देणे सुलभ करते. आमची वेक्टर शोध प्रणाली अधिकृत कागदपत्रांचा संदर्भ घेऊन ग्राहकांना विश्वासार्ह उत्तरे देते. व्यवस्थापक अनुत्तरित राहिलेल्या प्रश्नांचा आढावा घेऊन व्यवसाय प्रक्रिया सुधारू शकतात.`,
};

async function countTokensViaApi(modelName, text, key) {
  const url = `https://generativelanguage.googleapis.com/v1beta/${modelName}:countTokens?key=${key}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text }] }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.totalTokens;
}

async function run() {
  const key = loadEnvKey();
  if (!key) {
    console.error('Error: GEMINI_API_KEY not found');
    process.exit(1);
  }

  console.log('--- CALIBRATED TOKEN REPORT ---');

  for (const [lang, text] of Object.entries(samples)) {
    const charCount = text.length;
    const estimated = estimateTokensCalibrated(text);
    const apiTokens = await countTokensViaApi('models/gemini-embedding-001', text, key);
    const diffPct = (((estimated - apiTokens) / apiTokens) * 100).toFixed(1);

    console.log(`\n[${lang}]`);
    console.log(`  Characters: ${charCount}`);
    console.log(`  Estimated:  ${estimated}`);
    console.log(`  API Tokens: ${apiTokens}`);
    console.log(`  Difference: ${diffPct}%`);
  }
}

run().catch((e) => {
  console.error('Calibration failed:', e.message);
  process.exit(1);
});
