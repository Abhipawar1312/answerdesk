import { describe, it, expect } from 'vitest';
import {
  chunkText,
  estimateTokens,
  estimateTokensAccurate,
  estimateTokensConservative,
} from './text-chunker';

describe('Text Chunker Service', () => {
  describe('Dual Token Estimators (Calibrated against gemini-embedding-001)', () => {
    it('accurately estimates Latin text with ~5.3 chars per alphanumeric token', () => {
      const englishText = 'AnswerDesk is a multi-tenant AI support chatbot platform.';
      const tokens = estimateTokensAccurate(englishText);
      expect(tokens).toBeGreaterThan(8);
      expect(tokens).toBeLessThan(18);
    });

    it('accurately estimates Devanagari script with ~2.25 chars per token', () => {
      const devanagariText = 'कंपनीचे नियम आणि धोरणे सर्व कर्मचाऱ्यांसाठी बंधनकारक आहेत।';
      const accurateTokens = estimateTokensAccurate(devanagariText);
      expect(accurateTokens).toBeGreaterThan(20);
      expect(accurateTokens).toBeLessThan(35);
    });

    it('conservative estimator always returns >= accurate estimator across all languages', () => {
      const samples = [
        'Short English sentence for testing.',
        'A much longer English paragraph describing enterprise customer support workflows and billing cycle terms in detail.',
        'ग्राहकांसाठी परतावा धोरण आणि नियम स्पष्ट असावेत.',
        'सुरक्षा आणि गोपनीयता आमच्या सेवेचे मुख्य उद्दिष्ट आहे॥',
        'Customer ID 123456 साठी refund request generate केली आहे, please check करा.',
      ];

      for (const text of samples) {
        const acc = estimateTokensAccurate(text);
        const cons = estimateTokensConservative(text);
        expect(cons).toBeGreaterThanOrEqual(acc);
      }
    });

    it('backwards-compatible alias estimateTokens points to estimateTokensAccurate', () => {
      const sample = 'Sample text for token verification.';
      expect(estimateTokens(sample)).toBe(estimateTokensAccurate(sample));
    });

    it('handles empty and whitespace strings safely', () => {
      expect(estimateTokensAccurate('')).toBe(0);
      expect(estimateTokensAccurate('   ')).toBe(0);
      expect(estimateTokensConservative('')).toBe(0);
      expect(estimateTokensConservative('   \n\t  ')).toBe(0);
    });
  });

  describe('Demonstration of Text Loss in Old Regex vs Lossless Lookbehind (Item 1)', () => {
    it('demonstrates that the old Fix 2 regex loses headings, bullets, and breaks decimals/URLs', () => {
      const sampleInput =
        'Refund policy\nWe refund within 30 days. Fees are 2.5 percent. Visit help.example.com for details.\n- Step one\n- Step two';

      // Old regex from Fix 2: /[^.?!।॥\n]+(?:[.?!।॥]+(?:\s+|$)|$)/gu
      const oldRegex = /[^.?!।॥\n]+(?:[.?!।॥]+(?:\s+|$)|$)/gu;
      const oldMatches = sampleInput.match(oldRegex) || [];

      // Demonstration of what was broken/lost in the old regex:
      // 1. Heading "Refund policy" was skipped because of newline interaction
      expect(oldMatches.some((m) => m.includes('Refund policy'))).toBe(false);
      // 2. Bullet "- Step one" was skipped
      expect(oldMatches.some((m) => m.includes('- Step one'))).toBe(false);
      // 3. Decimal "2.5" was broken: "Fees are 2." was skipped, only "5 percent." matched
      expect(oldMatches.some((m) => m.includes('Fees are 2.5'))).toBe(false);
      // 4. URL "help.example.com" was broken: "Visit help.example." was skipped
      expect(oldMatches.some((m) => m.includes('help.example.com'))).toBe(false);

      // Contrast with the new lossless chunker:
      const chunks = chunkText(sampleInput, { targetTokens: 15, overlapTokens: 5, minChunkTokens: 2 });
      const combined = chunks.map((c) => c.content).join(' ');

      // All elements are 100% preserved
      expect(combined).toContain('Refund policy');
      expect(combined).toContain('We refund within 30 days.');
      expect(combined).toContain('Fees are 2.5 percent.');
      expect(combined).toContain('Visit help.example.com for details.');
      expect(combined).toContain('- Step one');
      expect(combined).toContain('- Step two');
    });
  });

  describe('chunkText with Sentence-Level Overlap & Paragraph Formatting', () => {
    it('does not join sentences from the same paragraph with blank lines', () => {
      const paragraph =
        'Sentence one provides billing info. Sentence two outlines refund windows. Sentence three gives support contact details.';
      const chunks = chunkText(paragraph, { targetTokens: 100, overlapTokens: 20 });

      expect(chunks.length).toBe(1);
      expect(chunks[0].content).not.toContain('\n\n');
      expect(chunks[0].content).toBe(paragraph);
    });

    it('makes overlap work on sentences even within a single paragraph that exceeds targetTokens', () => {
      const s1 = 'Sentence one introduces the product overview.';
      const s2 = 'Sentence two details the monthly billing cycle.';
      const s3 = 'Sentence three explains refund and cancellation guidelines.';
      const s4 = 'Sentence four provides direct escalation contact channels.';
      const singleLongParagraph = `${s1} ${s2} ${s3} ${s4}`;

      const chunks = chunkText(singleLongParagraph, { targetTokens: 25, overlapTokens: 12, minChunkTokens: 5 });

      expect(chunks.length).toBeGreaterThanOrEqual(2);
      const chunk0 = chunks[0];
      const chunk1 = chunks[1];

      // Chunk 0 contains s2
      expect(chunk0.content).toContain(s2);
      // Chunk 1 starts with s2 (the overlapping trailing sentence)
      expect(chunk1.content.startsWith(s2)).toBe(true);
      // Sentences inside Chunk 1 are separated by space, NOT blank lines
      expect(chunk1.content).not.toContain('\n\n');
    });

    it('deduplicates overlapping text when a small final chunk is merged into the previous chunk', () => {
      const s1 = 'First sentence of the document establishes terms and conditions.';
      const s2 = 'Second sentence elaborates upon the user agreement policy.';
      const s3 = 'Third sentence details account closure procedures.';
      const s4 = 'Tiny end.'; // Very few tokens, will trigger minChunkTokens merge
      const fullText = `${s1} ${s2} ${s3} ${s4}`;

      const chunks = chunkText(fullText, {
        targetTokens: 25,
        overlapTokens: 12,
        minChunkTokens: 10,
      });

      for (const chunk of chunks) {
        const s2Occurrences = (chunk.content.match(new RegExp(s2, 'g')) || []).length;
        expect(s2Occurrences).toBeLessThanOrEqual(1);
      }
    });

    it('handles a realistic English FAQ with long multi-sentence paragraphs', () => {
      const p1 =
        'What is your refund and return policy for enterprise software subscriptions? ' +
        'All standard annual licenses are eligible for a prorated refund within the first 30 days of purchase. ' +
        'To request a cancellation, submit a ticket via our customer portal with your invoice number attached. ' +
        'Our billing team will review and process valid claims within five business days.';
      const p2 =
        'How do I upgrade or downgrade my plan during an active billing period? ' +
        'Workspace owners can navigate to the Settings tab and select Upgrade Plan at any time. ' +
        'Upgrades take effect immediately, and the remaining balance from your prior plan will be credited pro-rata. ' +
        'Downgrades will take effect at the conclusion of the current monthly billing period without early termination penalties.';

      const realisticFaq = `${p1}\n\n${p2}`;
      const chunks = chunkText(realisticFaq, { targetTokens: 45, overlapTokens: 15, minChunkTokens: 10 });

      expect(chunks.length).toBeGreaterThanOrEqual(2);
      expect(chunks[0].chunkIndex).toBe(0);
      expect(chunks[1].chunkIndex).toBe(1);

      for (const chunk of chunks) {
        expect(chunk.content.length).toBeGreaterThan(0);
        expect(chunk.tokenCount).toBeGreaterThan(0);
      }
    });

    it('handles a realistic Hindi FAQ with long multi-sentence paragraphs and Devanagari dandas', () => {
      const hindiP1 =
        'प्रश्न: क्या हम वार्षिक योजना को बीच में रद्द कर सकते हैं? ' +
        'उत्तर: हाँ, हमारी कंपनी ग्राहकों को ३० दिनों के भीतर पूर्ण धनवापसी की सुविधा प्रदान करती है। ' +
        'इसके लिए ग्राहक को मूल रसीद और ऑर्डर संख्या के साथ ग्राहक सेवा को ईमेल करना होगा। ' +
        'हमारी टीम ५ कार्य दिवसों के भीतर आपकी समस्या का समाधान करेगी।';
      const hindiP2 =
        'प्रश्न: खाते का पासवर्ड भूल जाने पर क्या करें? ' +
        'उत्तर: आप लॉगिन पृष्ठ पर जाकर पासवर्ड रीसेट लिंक पर क्लिक कर सकते हैं। ' +
        'आपके पंजीकृत ईमेल पते पर एक सुरक्षित सत्यापन कोड भेजा जाएगा। ' +
        'उस कोड की सहायता से आप अपना नया पासवर्ड सेट कर सकते हैं॥';

      const realisticHindiFaq = `${hindiP1}\n\n${hindiP2}`;
      const chunks = chunkText(realisticHindiFaq, { targetTokens: 50, overlapTokens: 20, minChunkTokens: 10 });

      expect(chunks.length).toBeGreaterThanOrEqual(2);
      expect(chunks.some((c) => c.content.includes('।'))).toBe(true);
      expect(chunks.some((c) => c.content.includes('॥'))).toBe(true);
    });

    it('splits Marathi text with mixed numbers and dandas', () => {
      const marathiText =
        'नियम १: कार्यालयीन वेळ सकाळी ९:३० ते संध्याकाळी ६:०० अशी राहील। सर्व कर्मचाऱ्यांनी वेळेचे पालन करणे आवश्यक आहे॥ ' +
        'नियम २: रजेचा अर्ज किमान दोन दिवस आधी सादर करावा लागेल। तातडीच्या प्रसंगी व्यवस्थापकांची पूर्वपरवानगी घ्यावी॥';

      const chunks = chunkText(marathiText, { targetTokens: 35, overlapTokens: 10, minChunkTokens: 5 });

      expect(chunks.length).toBeGreaterThanOrEqual(2);
      for (const chunk of chunks) {
        expect(chunk.content.length).toBeGreaterThan(0);
        expect(chunk.tokenCount).toBeGreaterThan(0);
      }
    });
  });

  describe('Property-Style Test: Zero Word Loss across Complex Inputs (Item 1)', () => {
    function verifyZeroWordLoss(originalText: string, chunks: { content: string }[]) {
      const combinedChunks = chunks.map((c) => c.content).join(' ');
      const words = originalText.trim().split(/\s+/).filter((w) => w.length > 0);
      for (const word of words) {
        expect(combinedChunks).toContain(word);
      }
    }

    it('preserves 100% of words across decimals, URLs, emails, versions, abbreviations, headings, bullets, and dandas', () => {
      const testCases = [
        {
          name: 'Decimals and Percentages',
          text: 'The total bill is $125.75 including tax at 8.25% and service fee of 2.5 percent. Discounts up to 15.5% apply.',
        },
        {
          name: 'URLs and Domains',
          text: 'Visit https://answerdesk.example.com/docs/v2.1 or contact our portal at help.example.com for instant updates.',
        },
        {
          name: 'Email Addresses',
          text: 'Send inquiries to support@answerdesk.io or billing.help@sub.company.org for prompt account assistance.',
        },
        {
          name: 'Version Numbers',
          text: 'Upgraded client from v1.9.0-beta.2 to release v2.4.1 yesterday without service interruption.',
        },
        {
          name: 'Abbreviations with Periods',
          text: 'Support hours are Mon. to Fri. from 9 a.m. to 5 p.m. E.S.T. throughout the calendar year.',
        },
        {
          name: 'Headings and Markdown Titles',
          text: '# Knowledge Base Policy\n## Refund Terms and Conditions\nAll annual subscription licenses are subject to review.',
        },
        {
          name: 'Bullet Lists and Numbered Items',
          text: 'Requirements for onboarding:\n- Step one: Register email\n- Step two: Verify domain\n1. First check\n2. Second check',
        },
        {
          name: 'Q/A Format Lines',
          text: 'Q: How do I cancel my plan?\nA: Visit Settings > Billing > Cancel Subscription at any time.\nQ: Can I get a refund?\nA: Yes, within 30 days.',
        },
        {
          name: 'Devanagari Dandas and Double Dandas (Hindi / Marathi)',
          text: 'नियम १: सर्व सेवा २४ तास उपलब्ध आहेत। संपर्क क्रमांक ९८२३४५६७८९ आहे॥ प्रश्न: मदत कशी मिळेल? उत्तर: ई-मेल पाठवा.',
        },
        {
          name: 'Combined Comprehensive Document with All Formatting Styles',
          text:
            '# AnswerDesk Help Center\n' +
            'Version: v3.2.0-rc.1 (Updated Mon. Oct. 24 at 10 a.m. E.S.T.)\n\n' +
            'Refund policy\n' +
            'We refund within 30 days. Fees are 2.5 percent. Visit help.example.com for details.\n' +
            'Contact support@answerdesk.io for any issues with order #98765.\n\n' +
            'Key Steps:\n' +
            '- Step one: Submit invoice $149.99\n' +
            '- Step two: Wait 3 business days\n' +
            '- Step three: Verify 100% refund received\n\n' +
            'Q: What is the international policy?\n' +
            'A: International users visit global.answerdesk.io for localized guidelines.\n\n' +
            'मराठी मार्गदर्शक:\n' +
            'नियम १: सर्व परतावे ३० दिवसांत केले जातील। अधिक माहितीसाठी संपर्क साधा॥\n' +
            'नियम २: कोणतीही अडचण आल्यास support@example.com वर ई-मेल करा।',
        },
      ];

      for (const tc of testCases) {
        const chunks = chunkText(tc.text, { targetTokens: 30, overlapTokens: 10, minChunkTokens: 5 });
        expect(chunks.length).toBeGreaterThan(0);
        verifyZeroWordLoss(tc.text, chunks);
      }
    });

    it('guarantees no chunk exceeds the embedding model limit of 2,048 tokens even with massive unpunctuated text', () => {
      // Create a 10,000 character continuous sentence with no punctuation marks
      const words = [];
      for (let i = 0; i < 1500; i++) {
        words.push(`word${i}`);
      }
      const massiveUnpunctuatedText = words.join(' ');

      const chunks = chunkText(massiveUnpunctuatedText, { targetTokens: 600, overlapTokens: 100 });

      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        // Every chunk must be strictly below embedding model input limit (2048 tokens)
        expect(chunk.tokenCount).toBeLessThanOrEqual(650);
        expect(chunk.tokenCount).toBeLessThan(2048);
      }

      verifyZeroWordLoss(massiveUnpunctuatedText, chunks);
    });
  });
});
