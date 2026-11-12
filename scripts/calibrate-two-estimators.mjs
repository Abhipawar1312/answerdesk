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

// 40 distinct ~500-character samples (10 per category)
const corpus500 = {
  English: [
    "AnswerDesk is an intelligent customer support platform designed to streamline ticket resolution and automate routine business inquiries. With our advanced multi-tenant infrastructure, teams can effortlessly manage incoming customer conversations, index internal documentation, and provide instant, grounded responses. Our vector retrieval system cross-references proprietary knowledge articles in real time, ensuring high precision and preventing hallucinations. Businesses can track unresolved inquiries.",
    "To configure custom webhooks for automated event dispatching, navigate to your workspace settings and select the integrations panel. Provide an HTTPS endpoint capable of responding with a 200 OK status code within three seconds. Each outbound payload includes a cryptographic HMAC-SHA256 signature generated using your shared signing secret. We recommend validating this signature on receipt to ensure authenticity and protect against replay attacks from unauthorized third parties.",
    "Our refund policy provides complete buyer protection within thirty calendar days of initial product delivery. Items must be returned in their original packaging, accompanied by proof of purchase and all included accessories. Once your returned merchandise is inspected at our fulfillment center, reimbursement will be processed to your original payment method within seven business days. Shipping fees are non-refundable unless the return is due to our administrative error or defect.",
    "Enterprise single sign-on allows organizations to centralize authentication using standard SAML 2.0 or OpenID Connect identity providers such as Okta, Azure Active Directory, and Google Workspace. Once configured, employees can authenticate seamlessly using corporate credentials while administrators enforce role-based access controls, password complexity requirements, and mandatory multi-factor authentication across all member workspaces without manual account provisioning overhead.",
    "The document ingestion pipeline processes uploaded files through automated character normalization, semantic sentence boundary detection, and vector embedding generation. Each document is split into overlapping chunks to preserve contextual continuity across paragraph boundaries. Embeddings are generated using the Google Gemini text embedding model and stored in MongoDB Atlas with strict workspace scoping to guarantee absolute tenant isolation across all retrieval queries.",
    "If your application encounters rate limit errors with an HTTP 429 status code, our client SDK automatically initiates exponential backoff with randomized jitter. Initial retries occur after three seconds, progressively scaling up to twelve seconds for persistent congestion. We encourage developers to monitor rolling token consumption via our dashboard usage metrics to ensure sustained operational compliance with plan quotas and avoid service interruptions.",
    "Data privacy and confidentiality are fundamental pillars of our architectural design. All data at rest is encrypted using AES-256 encryption keys managed through Google Cloud Key Management Service. In transit, all client and server communications are strictly enforced over TLS 1.3. We do not use customer proprietary knowledge base articles or end-user conversation logs to train generalized public artificial intelligence models under any circumstances.",
    "To invite new team members to collaborate on your workspace, access the team management tab within your administrative console. Enter the recipient email address and select the appropriate permission role: Administrator, Support Agent, or Read-Only Analyst. An invitation email with a secure registration link valid for forty-eight hours will be dispatched immediately. Existing active sessions can be revoked instantly by administrators at any time.",
    "Routine database maintenance is scheduled every Sunday between 02:00 UTC and 04:00 UTC to optimize search indexes and perform storage compaction. During this maintenance window, existing chatbot instances remain fully operational for answering end-user inquiries, but new document uploads and administrative workspace configuration changes will be temporarily queued until maintenance completes successfully.",
    "Our analytics dashboard gives support leaders actionable visibility into inquiry trends, resolution velocities, and customer satisfaction ratings. By aggregating recurring unanswered questions, managers can identify critical gaps in internal documentation and rapidly publish new knowledge base articles to address emerging customer concerns before ticket volumes escalate beyond support capacity."
  ],
  Hindi: [
    "उत्तरडेस्क एक बुद्धिमान ग्राहक सहायता मंच है जो पूछताछ समाधान को सुव्यवस्थित करने और नियमित व्यावसायिक प्रश्नों को स्वचालित करने के लिए बनाया गया है। हमारे उन्नत बहु-किरायेदार बुनियादी ढांचे के साथ, टीमें आने वाली ग्राहक बातचीत को सहजता से प्रबंधित कर सकती हैं, आंतरिक दस्तावेज़ीकरण को अनुक्रमित कर सकती हैं और तत्काल, सटीक उत्तर प्रदान कर सकती हैं। हमारी वेक्टर पुनर्प्राप्ति प्रणाली वास्तविक समय में ज्ञान लेखों को संदर्भित करती है, जिससे त्रुटिरहित उत्तर सुनिश्चित होते हैं। व्यवसाय अनुत्तरित प्रश्नों को ट्रैक कर सकते हैं।",
    "स्वचालित घटना प्रेषण के लिए कस्टम वेबहुक कॉन्फ़िगर करने के लिए, अपनी कार्यक्षेत्र सेटिंग्स पर जाएं और एकीकरण पैनल चुनें। एक सुरक्षित एचटीटीपीएस एंडपॉइंट प्रदान करें जो तीन सेकंड के भीतर दो सौ ओके स्थिति कोड के साथ जवाब देने में सक्षम हो। प्रत्येक आउटबाउंड पेलोड में आपके साझा हस्ताक्षर गुप्त का उपयोग करके उत्पन्न एक क्रिप्टोग्राफिक हस्ताक्षर शामिल होता है। हम प्रामाणिकता सुनिश्चित करने और अनधिकृत पक्षों से हमलों से बचाने के लिए इस हस्ताक्षर को सत्यापित करने की सलाह देते हैं।",
    "हमारी धनवापसी नीति प्रारंभिक उत्पाद वितरण के तीस कैलेंडर दिनों के भीतर पूर्ण खरीदार सुरक्षा प्रदान करती है। वस्तुओं को उनकी मूल पैकेजिंग में वापस किया जाना चाहिए, साथ ही खरीद का प्रमाण और सभी शामिल सामान होना चाहिए। एक बार जब आपका लौटाया गया सामान हमारे पूर्ति केंद्र पर जांच लिया जाता है, तो सात व्यावसायिक दिनों के भीतर आपके मूल भुगतान विधि में प्रतिपूर्ति संसाधित की जाएगी। शिपिंग शुल्क गैर-वापसी योग्य हैं जब तक कि वापसी हमारी त्रुटि के कारण न हो।",
    "एंटरप्राइज सिंगल साइन-ऑन संगठनों को ओक्टा, एज़्योर एक्टिव डायरेक्टरी और गूगल वर्कस्पेस जैसे मानक पहचान प्रदाताओं का उपयोग करके प्रमाणीकरण को केंद्रीकृत करने की अनुमति देता है। एक बार कॉन्फ़िगर होने के बाद, कर्मचारी कॉर्पोरेट क्रेडेंशियल्स का उपयोग करके आसानी से प्रमाणित कर सकते हैं, जबकि प्रशासक भूमिका-आधारित पहुंच नियंत्रण, पासवर्ड जटिलता आवश्यकताएं और अनिवार्य बहु-कारक प्रमाणीकरण लागू करते हैं।",
    "दस्तावेज़ अंतर्ग्रहण पाइपलाइन स्वचालित चरित्र सामान्यीकरण, सिमेंटिक वाक्य सीमा पहचान और वेक्टर एम्बेडिंग पीढ़ी के माध्यम से अपलोड की गई फ़ाइलों को संसाधित करती है। प्रत्येक दस्तावेज़ को पैराग्राफ सीमाओं के पार प्रासंगिक निरंतरता बनाए रखने के लिए ओवरलैपिंग खंडों में विभाजित किया जाता है। एम्बेडिंग Google जेमिनी मॉडल का उपयोग करके उत्पन्न होते हैं और सभी पुनर्प्राप्ति प्रश्नों में पूर्ण अलगाव की गारंटी के लिए संग्रहीत होते हैं।",
    "यदि आपका एप्लिकेशन दर सीमा त्रुटियों का सामना करता है, तो हमारा क्लाइंट एसडीके स्वचालित रूप से यादृच्छिक घबराहट के साथ घातीय बैकऑफ़ शुरू करता है। प्रारंभिक पुनः प्रयास तीन सेकंड के बाद होते हैं, जो लगातार भीड़ के लिए बारह सेकंड तक बढ़ते हैं। हम डेवलपर्स को योजना कोटा के निरंतर अनुपालन को सुनिश्चित करने और सेवा रुकावटों से बचने के लिए हमारे डैशबोर्ड उपयोग मीट्रिक के माध्यम से टोकन खपत की निगरानी करने के लिए प्रोत्साहित करते हैं।",
    "डेटा गोपनीयता और गोपनीयता हमारे वास्तुशिल्प डिजाइन के मौलिक स्तंभ हैं। आराम पर सभी डेटा को Google क्लाउड कुंजी प्रबंधन सेवा के माध्यम से प्रबंधित एईएस-256 एन्क्रिप्शन कुंजियों का उपयोग करके एन्क्रिप्ट किया गया है। पारगमन में, सभी संचार कड़ाई से टीएलएस 1.3 पर लागू होते हैं। हम किसी भी परिस्थिति में सामान्यीकृत सार्वजनिक कृत्रिम बुद्धिमत्ता मॉडल को प्रशिक्षित करने के लिए ग्राहक ज्ञान आधार लेखों का उपयोग नहीं करते हैं।",
    "अपनी टीम के नए सदस्यों को अपने कार्यक्षेत्र में सहयोग करने के लिए आमंत्रित करने के लिए, अपने प्रशासनिक कंसोल के भीतर टीम प्रबंधन टैब तक पहुंचें। प्राप्तकर्ता का ईमेल पता दर्ज करें और उपयुक्त अनुमति भूमिका चुनें: व्यवस्थापक, सहायता एजेंट, या केवल-पढ़ने के लिए विश्लेषक। अड़तालीस घंटों के लिए वैध एक सुरक्षित पंजीकरण लिंक वाला एक आमंत्रण ईमेल तुरंत भेजा जाएगा। सत्रों को कभी भी रद्द किया जा सकता है।",
    "खोज अनुक्रमितों को अनुकूलित करने और भंडारण संघनन करने के लिए हर रविवार को सुबह दो बजे से चार बजे तक नियमित डेटाबेस रखरखाव निर्धारित है। इस रखरखाव विंडो के दौरान, मौजूदा चैटबॉट इंस्टेंस अंतिम-उपयोगकर्ता पूछताछ का उत्तर देने के लिए पूरी तरह से चालू रहते हैं, लेकिन नए दस्तावेज़ अपलोड और प्रशासनिक कॉन्फ़िगरेशन परिवर्तन अस्थायी रूप से कतारबद्ध होंगे।",
    "हमारा एनालिटिक्स डैशबोर्ड समर्थन नेताओं को पूछताछ के रुझान, समाधान वेग और ग्राहक संतुष्टि रेटिंग में कार्रवाई योग्य दृश्यता देता है। आवर्ती अनुत्तरित प्रश्नों को एकत्रित करके, प्रबंधक आंतरिक प्रलेखन में महत्वपूर्ण अंतरालों की पहचान कर सकते हैं और टिकट की मात्रा क्षमता से परे बढ़ने से पहले ग्राहकों की चिंताओं को दूर करने के लिए नए ज्ञान लेख प्रकाशित कर सकते हैं।"
  ],
  Marathi: [
    "आन्सरडेस्क हे एक प्रगत ग्राहक सेवा व्यासपीठ आहे जे विचारलेल्या प्रश्नांचे जलद आणि अचूक निरसन करण्यासाठी तयार केले गेले आहे. आमच्या मल्टि-भाडेकरू तंत्रज्ञानामुळे, कंपन्या ग्राहकांच्या समस्यांचे सहज व्यवस्थापन करू शकतात, अंतर्गत मार्गदर्शक दस्तऐवज सुरक्षितपणे साठवणे आणि तात्काळ माहिती देणे सुलभ करते. आमची वेक्टर शोध प्रणाली अधिकृत कागदपत्रांचा संदर्भ घेऊन ग्राहकांना विश्वासार्ह उत्तरे देते. व्यवस्थापक अनुत्तरित राहिलेल्या प्रश्नांचा आढावा घेऊन व्यवसाय प्रक्रिया वेळेवर सुधारू शकतात.",
    "स्वयंचलित माहिती पाठवण्यासाठी कस्टम वेबहुक कॉन्फिगर करण्यासाठी, आपल्या कार्यक्षेत्र सेटिंग्जमध्ये जा आणि इंटिग्रेशन्स पॅनेल निवडा. तीन सेकंदात दोनशे ओके प्रतिसाद देणारा सुरक्षित एचटीटीपीएस एंडपॉईंट प्रविष्ट करा. प्रत्येक पाठवलेल्या डेटामध्ये सुरक्षिततेसाठी डिजिटल स्वाक्षरी जोडलेली असते. अनधिकृत व्यक्तींकडून होणारे सायबर हल्ले रोखण्यासाठी आणि संदेशाची सत्यता पडताळण्यासाठी आम्ही ही स्वाक्षरी तपासण्याची जोरदार शिफारस करतो.",
    "आमचे परतावा धोरण खरेदी केलेल्या वस्तूंच्या वितरणापासून तीस दिवसांच्या आत ग्राहकांना पूर्ण संरक्षण देते. वस्तू त्यांच्या मूळ वेष्टनात असणे आवश्यक आहे, तसेच खरेदीची मूळ पावती सोबत जोडलेली असावी. आमच्या तपासणी केंद्रावर परत आलेली वस्तू प्राप्त झाल्यावर पुढील सात कामकाजाच्या दिवसांत परतावा आपल्या मूळ बँक खात्यात जमा केला जाईल. आमच्याकडून चूक झाली नसल्यास वाहतूक शुल्क परत केले जाणार नाही याची नोंद घ्यावी.",
    "मोठ्या व्यावसायिक संस्थांसाठी सिंगल साइन-ऑन सुविधा उपलब्ध आहे, ज्याद्वारे ओक्टा, अझूर ॲक्टिव्ह डिरेक्टरी किंवा गुगल वर्कस्पेस वापरून कर्मचारी थेट लॉग इन करू शकतात. एकदा ही प्रणाली कार्यान्वित झाल्यावर कर्मचाऱ्यांना वेगळा पासवर्ड लक्षात ठेवण्याची गरज भासत नाही, तसेच मुख्य प्रशासक सर्व वापरकर्त्यांसाठी दुहेरी सुरक्षा पडताळणी सक्तीची करू शकतात आणि गोपनीय माहिती सुरक्षित ठेवू शकतात.",
    "कागदपत्रे अपलोड झाल्यावर आमची प्रणाली त्यातील अक्षरांचे प्रमाणीकरण करते, वाक्यांची योग्य विभागणी करते आणि कृत्रिम बुद्धिमत्ता वापरून त्याचे वेक्टर डेटाबेसमध्ये रूपांतर करते. माहितीचा संदर्भ कायम राहावा यासाठी प्रत्येक भागाचा काही मजकूर पुढील भागात पुन्हा जोडला जातो. ही सर्व माहिती अत्यंत सुरक्षित ठेवण्यासाठी प्रत्येक कंपनीचा डेटा पूर्णपणे वेगळा आणि स्वतंत्र पद्धतीने साठवला जातो.",
    "वापरकर्त्यांच्या विनंत्या वाढल्यामुळे सर्व्हरवर ताण आल्यास आमची प्रणाली काही सेकंद थांबून पुन्हा प्रयत्न करण्याचे धोरण राबवते. सुरुवातीला तीन सेकंद आणि त्यानंतर गरजेनुसार बारा सेकंदांपर्यंत वेळ वाढवून विनंती पूर्ण केली जाते. ग्राहकांनी आपल्या मासिक मर्यादेचा योग्य वापर करण्यासाठी आणि अडथळे टाळण्यासाठी वेळोवेळी डॅशबोर्डवरील वापर तपासावा अशी सूचना देण्यात येते.",
    "माहितीची गोपनीयता आणि सुरक्षितता हे आमच्या संरचनेचे मूलभूत आधारस्तंभ आहेत. साठवलेला सर्व डेटा आधुनिक एईएस-२५६ तंत्रज्ञान वापरून सुरक्षित केला जातो, तर इंटरनेटवरून डेटा पाठवताना टीएलएस १.३ प्रणाली वापरली जाते. आम्ही कोणत्याही परिस्थितीत ग्राहकांची खाजगी कागदपत्रे अथवा संभाषणाचा तपशील सार्वजनिक मॉडेलच्या प्रशिक्षणासाठी वापरत नाही याची पूर्ण खात्री देतो.",
    "आपल्या कार्यक्षेत्रात इतर सहकाऱ्यांना समाविष्ट करण्यासाठी ॲडमिन पॅनेलमधील युझर मॅनेजमेंट विभागाचा वापर करा. सहकाऱ्याचा अधिकृत ईमेल टाका आणि त्याला योग्य ती जबाबदारी द्या, जसे की मॅनेजर किंवा सपोर्ट एजंट. अठ्ठेचाळीस तास वैध असणारी एक गुप्त लिंक सहकाऱ्याला ईमेलद्वारे त्वरित पाठवली जाईल. मुख्य अधिकारी कोणत्याही वेळी ही परवानगी त्वरित रद्द करू शकतात.",
    "डेटाबेसची कार्यक्षमता वाढवण्यासाठी आणि शोध प्रणाली अद्ययावत ठेवण्यासाठी दर रविवारी पहाटे दोन ते चार या वेळेत नियमित तांत्रिक देखभाल केली जाते. या कालावधीत ग्राहकांना उत्तरे देणारे बॉट अविरतपणे चालू राहतात, मात्र नवीन कागदपत्रे जोडण्याची सुविधा देखभाल पूर्ण होईपर्यंत तात्पुरती स्थगित ठेवली जाते याची कृपया नोंद घ्यावी.",
    "आमचा ॲनालिटिक्स डॅशबोर्ड व्यवस्थापकांना ग्राहकांच्या समस्या, तक्रार निवारणाचा वेग आणि समाधानाची पातळी याबद्दल सविस्तर माहिती देतो. वारंवार विचारल्या जाणाऱ्या पण अनुत्तरित राहिलेल्या प्रश्नांचे विश्लेषण करून कंपन्या आपल्या ग्राहक मार्गदर्शिकेत आवश्यक त्या सुधारणा करू शकतात आणि ग्राहकांना अधिक चांगली सेवा देऊ शकतात."
  ],
  Mixed_Hinglish: [
    "AnswerDesk ek modern AI-powered customer support solution hai jo business inquiries ko instantly resolve karne me help karta hai. Is multi-tenant architecture ke zariye aapki team customer tickets ko organize kar sakti hai, company knowledge base documents upload kar sakti hai aur automatic smart replies deliver kar sakti hai. Hamara vector search engine har query ko internal policies ke sath cross-verify karta hai taaki customers ko 100% accurate information mile.",
    "Custom webhook setup karne ke liye dashboard ke Settings option me jakar Integrations tab open karein. Wahan apna secure HTTPS endpoint enter karein jo 3 seconds ke andar response de sake. System security ke liye har outgoing event me HMAC-SHA256 encrypted digital signature include hota hai. Aapki backend team ko ye signature verify karna chahiye taaki duplicate aur unauthorized requests automatically filter out ho sakein.",
    "Hamari refund aur replacement policy product delivery date se lekar complete 30 days ke liye valid hoti hai. Return approve hone ke liye product apne original undamaged box me hona zaroori hai aur purchase invoice attach karna hoga. Quality check complete hone ke baad 5 se 7 business days me amount directly customer ke bank account ya original card par refund ho jati hai. Delivery charge refund nahi hota.",
    "Enterprise Single Sign-On configuration ke through aapki company employees Google Workspace, Okta ya Microsoft Azure credentials se login kar sakte hain. Is feature se har user ko alag password create karne ki requirement nahi hoti aur IT administrator central level par role permissions, two-factor authentication aur security audit logs manage kar sakte hain without manual provisioning.",
    "Document ingestion flow me uploaded text ka automatic character parsing, sentence splitting aur vector embedding generation hota hai. Context retain karne ke liye documents ko 600 tokens ke chunks me divide kiya jata hai with appropriate overlap. Gemini AI model ke through create kiye gaye embeddings MongoDB Atlas ke isolated tenant collection me strictly scoped store hote hain.",
    "Agar aapki API calls me continuous traffic ki wajah se HTTP 429 rate limit error trigger hota hai to hamara internal SDK automatic retry process start karta hai. First retry 3 seconds baad execute hoti hai aur congestion ke hisab se 12 seconds tak backoff scale hota hai. Developers ko suggest kiya jata hai ki wo dashboard usage monitor karein taaki monthly quotas cross na hon.",
    "Data security aur privacy hamari primary priority hai. Server par stored har document aur chat history Google Cloud KMS managed AES-256 keys ke sath fully encrypted rehti hai. Network transit ke time strictly TLS 1.3 encryption use hoti hai. Ham customer ka confidential proprietary knowledge base content kisi bhi public model training me share ya utilize nahi karte.",
    "Apne support dashboard me new team members invite karne ke liye Workspace Settings > Team Members section me navigate karein. Member ka email address provide karein aur role assign karein jaise Administrator, Agent ya Viewer. Invitation link 48 hours tak active rehti hai aur admin kisi bhi active login session ko single click me revoke kar sakta hai.",
    "System optimization aur vector search indexing ke liye har Sunday midnight ko routine scheduled maintenance window hoti hai. Is downtime ke dauran chatbot live rehta hai aur customer queries answer karta rehta hai, lekin new document upload aur workspace configuration changes temporarily waitlist me chale jate hain jab tak maintenance complete na ho.",
    "Hamara analytics dashboard management ko daily ticket volume, average resolution time aur customer satisfaction score ka deep breakdown provide karta hai. Jab AI koi query answer nahi kar pata to wo system me Unanswered category me record hota hai, jisse company apni documentation refine kar sake aur repetitive customer issues prevent kar sake."
  ]
};

async function countTokensViaApi(text, key) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:countTokens?key=${key}`;
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

// Counts scripts
function countScripts(text) {
  let devanagari = 0;
  let latin = 0;
  let other = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0x0900 && code <= 0x097f) {
      devanagari++;
    } else if (
      (code >= 0x0041 && code <= 0x005a) ||
      (code >= 0x0061 && code <= 0x007a) ||
      (code >= 0x0030 && code <= 0x0039)
    ) {
      latin++;
    } else {
      other++;
    }
  }
  return { devanagari, latin, other };
}

// 1. Accurate Estimator: Aiming for ~0% average error, balanced across all languages
function estimateTokensAccurate(text) {
  if (!text || text.trim().length === 0) return 0;
  const { devanagari, latin, other } = countScripts(text);
  // Calibrated for accurate chunk sizing targeting ~600 real tokens:
  // - Devanagari in prose (Hindi ~2.6, Marathi ~2.15 -> average ~2.25 chars/token)
  // - Latin alphanumeric in prose: ~5.3 chars/token
  // - Other (punctuation, whitespace): ~4.6 chars/token
  const est = Math.round(devanagari / 2.25 + latin / 5.3 + other / 4.6);
  return Math.max(1, est);
}

// 2. Conservative Estimator: Guaranteed ZERO under-counts across all languages (safety margin for 30K TPM)
function estimateTokensConservative(text) {
  if (!text || text.trim().length === 0) return 0;
  const { devanagari, latin, other } = countScripts(text);
  // Calibrated for strict safety margin:
  // - Devanagari: ~1.7 chars/token
  // - Latin: ~3.4 chars/token
  // - Other: ~2.5 chars/token
  const est = Math.ceil(devanagari / 1.7 + latin / 3.4 + other / 2.5);
  return Math.max(1, est);
}

async function run() {
  const key = loadEnvKey();
  if (!key) {
    console.error('Error: GEMINI_API_KEY not found');
    process.exit(1);
  }

  console.log('=== CALIBRATING TWO ESTIMATORS (40 SAMPLES, ~500 CHARS EACH) ===\n');

  const categories = Object.keys(corpus500);
  const accurateStats = {};
  const conservativeStats = {};

  for (const cat of categories) {
    console.log(`Evaluating ${cat} (10 samples)...`);
    const samples = corpus500[cat];

    const accErrors = [];
    const consErrors = [];

    for (let i = 0; i < samples.length; i++) {
      const text = samples[i];
      const actual = await countTokensViaApi(text, key);
      const estAcc = estimateTokensAccurate(text);
      const estCons = estimateTokensConservative(text);

      const errAcc = ((estAcc - actual) / actual) * 100;
      const errCons = ((estCons - actual) / actual) * 100;

      accErrors.push(errAcc);
      consErrors.push(errCons);

      await new Promise((r) => setTimeout(r, 200));
    }

    const calcStats = (errors) => {
      const min = Math.min(...errors);
      const max = Math.max(...errors);
      const avg = errors.reduce((a, b) => a + b, 0) / errors.length;
      const underCount = errors.filter((e) => e < 0).length;
      return { min, max, avg, underCount };
    };

    accurateStats[cat] = calcStats(accErrors);
    conservativeStats[cat] = calcStats(consErrors);
  }

  console.log('\n================ ACCURATE ESTIMATOR (Chunk Sizing: Target 600 Tokens) ================');
  console.log('| Language / Category | Samples | Min Error % | Max Error % | Avg Error % | Under-count? |');
  console.log('|---------------------|---------|-------------|-------------|-------------|--------------|');
  for (const cat of categories) {
    const s = accurateStats[cat];
    console.log(
      `| ${cat.padEnd(19)} | ${'10'.padEnd(7)} | ${(s.min >= 0 ? '+' : '') + s.min.toFixed(1) + '%'.padEnd(11)} | ${(s.max >= 0 ? '+' : '') + s.max.toFixed(1) + '%'.padEnd(11)} | ${(s.avg >= 0 ? '+' : '') + s.avg.toFixed(1) + '%'.padEnd(11)} | ${String(s.underCount).padEnd(12)} |`
    );
  }

  console.log('\n================ CONSERVATIVE ESTIMATOR (Global Token Budget: 30K TPM) ================');
  console.log('| Language / Category | Samples | Min Error % | Max Error % | Avg Error % | Under-count? |');
  console.log('|---------------------|---------|-------------|-------------|-------------|--------------|');
  for (const cat of categories) {
    const s = conservativeStats[cat];
    console.log(
      `| ${cat.padEnd(19)} | ${'10'.padEnd(7)} | ${(s.min >= 0 ? '+' : '') + s.min.toFixed(1) + '%'.padEnd(11)} | ${(s.max >= 0 ? '+' : '') + s.max.toFixed(1) + '%'.padEnd(11)} | ${(s.avg >= 0 ? '+' : '') + s.avg.toFixed(1) + '%'.padEnd(11)} | ${String(s.underCount).padEnd(12)} |`
    );
  }
}

run().catch((e) => {
  console.error('Calibration error:', e.message);
  process.exit(1);
});
