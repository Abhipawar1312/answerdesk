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

// Matches estimateTokens in src/services/text-chunker.ts
function estimateTokens(text) {
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

  // Conservatively calibrated for gemini-embedding-001:
  // - Devanagari (Hindi, Marathi): ~1.7 chars/token to ensure complex conjuncts never under-count
  // - Latin (English, Hinglish): ~3.4 chars/token to cover subword tokenization in romanized terms
  // - Other (punctuation, spaces, symbols): ~2.5 chars/token
  const estimated = Math.ceil(
    devanagariCount / 1.7 + latinCount / 3.4 + otherCount / 2.5
  );

  return Math.max(1, estimated);
}

const testCorpus = {
  English: [
    "To reset your password, visit account settings and click on 'Security'. An email with a verification link will be dispatched immediately.",
    "Our refund policy allows complete returns within thirty days of purchase, provided the product remains in its pristine original packaging.",
    "AnswerDesk is an enterprise-grade AI customer support copilot engineered to streamline ticket resolution and automate routine business inquiries.",
    "Webhook notifications are dispatched over HTTPS using POST requests. Ensure your endpoint returns a 200 OK status code within five seconds.",
    "Multi-tenant data isolation is enforced at the database layer using scoped tenant identifiers on every query and mutation.",
    "The maximum file size permitted for PDF uploads is 10 megabytes on the Free tier and 50 megabytes on the Enterprise tier.",
    "We recommend chunking documents into segments of approximately 600 tokens with a 100 token overlap to preserve semantic context across boundaries.",
    "If your API request encounters an HTTP 429 status, implement exponential backoff with random jitter before retrying the transmission.",
    "Two-factor authentication adds an indispensable layer of defense to prevent unauthorized administrative dashboard logins.",
    "System maintenance is scheduled for every Sunday between 02:00 UTC and 04:00 UTC. During this maintenance window, background indexing is paused."
  ],
  Hindi: [
    "अपना पासवर्ड रीसेट करने के लिए, खाता सेटिंग्स पर जाएं और 'सुरक्षा' पर क्लिक करें। एक सत्यापन लिंक तुरंत ईमेल किया जाएगा।",
    "हमारी धनवापसी नीति खरीद के तीस दिनों के भीतर पूर्ण वापसी की अनुमति देती है, बशर्ते उत्पाद अपनी मूल पैकेजिंग में रहे।",
    "उत्तरडेस्क एक उद्यम-स्तरीय एआई ग्राहक सहायता प्रणाली है जिसे सामान्य व्यावसायिक पूछताछ को स्वचालित करने के लिए बनाया गया है।",
    "वेबहुक सूचनाएं सुरक्षित एचटीटीपीएस के माध्यम से भेजी जाती हैं। सुनिश्चित करें कि आपका सर्वर पांच सेकंड के भीतर जवाब दे।",
    "मल्टी-टेनेंट डेटा अलगाव हर डेटाबेस क्वेरी पर कार्यक्षेत्र पहचानकर्ता लागू करके सुनिश्चित किया जाता है।",
    "मुफ्त योजना पर फ़ाइल अपलोड के लिए अधिकतम अनुमत आकार दस मेगाबाइट है और व्यावसायिक योजना पर पचास मेगाबाइट है।",
    "हम संदर्भ बनाए रखने के लिए दस्तावेजों को लगभग छह सौ टोकन के खंडों में विभाजित करने की सलाह देते हैं।",
    "यदि आपका अनुरोध दर सीमा त्रुटि का सामना करता है, तो पुनः प्रयास करने से पहले कुछ सेकंड प्रतीक्षा करें।",
    "दो-चरणीय प्रमाणीकरण आपके व्यवस्थापक खाते को अनधिकृत पहुंच से सुरक्षित रखने के लिए सुरक्षा की एक अतिरिक्त परत जोड़ता है।",
    "नियमित रखरखाव हर रविवार को सुबह दो बजे से चार बजे तक निर्धारित है। इस दौरान अनुक्रमणिका अस्थायी रूप से रुक सकती है।"
  ],
  Marathi: [
    "आपला पासवर्ड रीसेट करण्यासाठी, खाते सेटिंग्जवर जा आणि 'सुरक्षा' वर क्लिक करा. एक पडताळणी लिंक त्वरित पाठवली जाईल.",
    "आमचे परतावा धोरण खरेदीच्या तीस दिवसांच्या आत संपूर्ण परताव्याची परवानगी देते, जर उत्पादन त्याच्या मूळ स्थितीत असेल.",
    "आन्सरडेस्क हे एक आधुनिक एआय ग्राहक सेवा व्यासपीठ आहे जे दैनंदिन प्रश्न स्वयंचलितपणे सोडवण्यासाठी डिझाइन केले आहे.",
    "वेबहुक सूचना सुरक्षित एचटीटीपीएस वापरून पाठवल्या जातात. आपल्या सर्व्हरने पाच सेकंदांच्या आत प्रतिसाद देणे आवश्यक आहे.",
    "मल्टी-टेनंट डेटा सुरक्षितता डेटाबेस स्तरावर प्रत्येक विनंतीमध्ये कार्यक्षेत्र आयडी लागू करून सुनिश्चित केली जाते.",
    "मोफत योजनेवर कागदपत्र अपलोडसाठी कमाल मर्यादा दहा मेगाबाईट आहे आणि व्यवसाय योजनेवर पन्नास मेगाबाईट आहे.",
    "आम्ही अर्थ समजण्यासाठी कागदपत्रांचे सुमारे सहाशे टोकनच्या भागात विभाजन करण्याची शिफारस करतो.",
    "जर आपल्या विनंतीला मर्यादेची त्रुटी आली, तर पुन्हा प्रयत्न करण्यापूर्वी काही सेकंद थांबा.",
    "द्वि-घटक प्रमाणीकरण आपल्या प्रशासकीय खात्याचे अनधिकृत प्रवेशापासून संरक्षण करण्यासाठी अत्यंत आवश्यक आहे.",
    "नियमित देखभाल प्रत्येक रविवारी सकाळी दोन ते चार या वेळेत केली जाते. या वेळेत शोध प्रणाली थोडा वेळ बंद राहू शकते."
  ],
  Mixed_Hinglish: [
    "Apna account verify karne ke liye register email par check karein aur verification button par click karein.",
    "Order cancel karne ke baad refund directly aapke original payment mode me 5-7 business days me credit ho jayega.",
    "Support team se direct contact karne ke liye dashboard me jakar 'New Ticket' button click karein aur issue describe karein.",
    "Document upload fail hone par check karein ki file size 10MB se jyada na ho aur format PDF ya Markdown ho.",
    "Webhook setup complete karne ke liye Settings > Webhooks me jakar endpoint URL paste karein aur secret save karein.",
    "Password change kartana dhyan theva ki kamit kami 8 characters ani 1 special symbol asava.",
    "Subscription upgrade karnyasathi Billing page var jaun 'Pro Plan' select kara ani checkout complete kara.",
    "API request karte samay Authorization header me Bearer token send karna mandatory hai.",
    "Rate limit exceed hone par system automatic 60 seconds ka cooldown activate kar deta hai.",
    "Vector embeddings update hone ke baad search results automatically refresh ho jate hain without restart."
  ]
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

async function runCalibration() {
  const key = loadEnvKey();
  if (!key) {
    console.error('Error: GEMINI_API_KEY not found in .env.local');
    process.exit(1);
  }

  console.log('=== COMPREHENSIVE TOKEN CALIBRATION REPORT ===');
  console.log('Model: models/gemini-embedding-001\n');

  const categoryResults = {};

  for (const [category, samples] of Object.entries(testCorpus)) {
    console.log(`Testing category: ${category} (${samples.length} samples)...`);
    const results = [];

    for (let i = 0; i < samples.length; i++) {
      const text = samples[i];
      const estimated = estimateTokens(text);
      const apiActual = await countTokensViaApi('models/gemini-embedding-001', text, key);
      const diffTokens = estimated - apiActual;
      const overCountPercent = ((diffTokens / apiActual) * 100);

      results.push({
        sampleIndex: i + 1,
        chars: text.length,
        estimated,
        actual: apiActual,
        diff: diffTokens,
        overCountPercent,
      });

      // Brief sleep to avoid hitting API rate limits during calibration
      await new Promise((r) => setTimeout(r, 200));
    }

    const overCounts = results.map((r) => r.overCountPercent);
    const minOver = Math.min(...overCounts);
    const maxOver = Math.max(...overCounts);
    const avgOver = overCounts.reduce((a, b) => a + b, 0) / overCounts.length;
    const underCounted = results.filter((r) => r.diff < 0).length;

    categoryResults[category] = {
      count: samples.length,
      minOverCountPercent: minOver.toFixed(1) + '%',
      maxOverCountPercent: maxOver.toFixed(1) + '%',
      avgOverCountPercent: avgOver.toFixed(1) + '%',
      underCountCount: underCounted,
      samples: results,
    };
  }

  console.log('\n================ SUMMARY TABLE ================');
  console.log('| Language / Script | Samples | Min Overcount | Max Overcount | Avg Overcount | Under-count? |');
  console.log('|-------------------|---------|---------------|---------------|---------------|--------------|');

  let totalUnderCounted = 0;
  for (const [cat, summary] of Object.entries(categoryResults)) {
    totalUnderCounted += summary.underCountCount;
    const safeStatus = summary.underCountCount === 0 ? '0 (None - SAFE)' : `${summary.underCountCount} (ALERT)`;
    console.log(
      `| ${cat.padEnd(17)} | ${String(summary.count).padEnd(7)} | ${summary.minOverCountPercent.padEnd(13)} | ${summary.maxOverCountPercent.padEnd(13)} | ${summary.avgOverCountPercent.padEnd(13)} | ${safeStatus.padEnd(12)} |`
    );
  }

  console.log('\nSafety Check: ' + (totalUnderCounted === 0 ? 'PASSED (Conservative over-counting verified across all scripts)' : 'FAILED (Under-counting detected!)'));
}

runCalibration().catch((err) => {
  console.error('Calibration error:', err.message);
  process.exit(1);
});
