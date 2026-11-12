import { describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import { resolveUsedCitations, cleanAnswerText } from './citation-resolver';
import { RetrievedChunk } from '@/lib/db/scoped-queries';

describe('Citation Resolver Service', () => {
  const docId1 = new Types.ObjectId();
  const docId2 = new Types.ObjectId();
  const docId3 = new Types.ObjectId();

  const mockChunks: RetrievedChunk[] = [
    {
      _id: new Types.ObjectId(),
      workspaceId: new Types.ObjectId(),
      documentId: docId1,
      chunkIndex: 0,
      content: 'Croissants are $3 each or $15 for a box of six. Pain au chocolat is $3.50.',
      tokenCount: 20,
      score: 0.92,
      metadata: { sourceTitle: 'Menu & Pricing' },
    },
    {
      _id: new Types.ObjectId(),
      workspaceId: new Types.ObjectId(),
      documentId: docId2,
      chunkIndex: 0,
      content: 'We are open Monday to Friday 7am to 6pm, and Saturday 8am to 4pm. Closed Sundays.',
      tokenCount: 20,
      score: 0.82,
      metadata: { sourceTitle: 'Opening hours' },
    },
    {
      _id: new Types.ObjectId(),
      workspaceId: new Types.ObjectId(),
      documentId: docId3,
      chunkIndex: 0,
      content: 'Our return policy covers packaged items within 14 days with original receipt.',
      tokenCount: 15,
      score: 0.75,
      metadata: { sourceTitle: 'Return Policy' },
    },
  ];

  it('excludes "Opening hours" when answering "How much is a box of six croissants?"', () => {
    const question = 'How much is a box of six croissants?';
    const answer = 'A box of six croissants costs $15 (or $3 each).';

    const citations = resolveUsedCitations(answer, mockChunks, question, true);

    expect(citations).toHaveLength(1);
    expect(citations[0].sourceTitle).toBe('Menu & Pricing');
    expect(citations[0].documentId).toEqual(docId1);
    // Opening hours MUST NOT appear
    const titles = citations.map((c) => c.sourceTitle);
    expect(titles).not.toContain('Opening hours');
    expect(titles).not.toContain('Return Policy');
  });

  it('respects explicit bracket citations [1] from the model output', () => {
    const question = 'What are your hours and croissant prices?';
    const answer = 'Croissants are $15 for a box of six [1]. We are open Monday to Friday 7am to 6pm [2].';

    const citations = resolveUsedCitations(answer, mockChunks, question, true);

    expect(citations).toHaveLength(2);
    expect(citations[0].sourceTitle).toBe('Menu & Pricing');
    expect(citations[1].sourceTitle).toBe('Opening hours');
  });

  it('returns empty array [] for deflection ("I do not have enough information")', () => {
    const question = 'Can I pay with Martian cryptocurrency?';
    const answer = 'I do not have enough information in the knowledge base to answer this question. Please reach out to customer support for further assistance.';

    const citations = resolveUsedCitations(answer, mockChunks, question, true);
    expect(citations).toEqual([]);
  });

  it('caps citations at at most 3', () => {
    const manyChunks: RetrievedChunk[] = [
      ...mockChunks,
      {
        _id: new Types.ObjectId(),
        workspaceId: new Types.ObjectId(),
        documentId: new Types.ObjectId(),
        chunkIndex: 0,
        content: 'Special catering orders for croissant boxes require 24 hours advance notice.',
        tokenCount: 15,
        score: 0.88,
        metadata: { sourceTitle: 'Catering Guide' },
      },
      {
        _id: new Types.ObjectId(),
        workspaceId: new Types.ObjectId(),
        documentId: new Types.ObjectId(),
        chunkIndex: 0,
        content: 'All our croissant pastries are freshly baked every morning.',
        tokenCount: 12,
        score: 0.85,
        metadata: { sourceTitle: 'Baking Schedule' },
      },
    ];

    const answer = 'Croissants are $15 for a box of six, require 24 hours catering advance notice, and are freshly baked every morning.';
    const citations = resolveUsedCitations(answer, manyChunks, 'Tell me about croissants', true);

    expect(citations.length).toBeLessThanOrEqual(3);
    expect(citations.length).toBeGreaterThan(0);
  });

  it('hides snippets when showSnippets is false', () => {
    const question = 'How much is a box of six croissants?';
    const answer = 'A box of six croissants costs $15.';

    const citations = resolveUsedCitations(answer, mockChunks, question, false);
    expect(citations).toHaveLength(1);
    expect(citations[0].textSnippet).toBe('');
  });

  describe('cleanAnswerText', () => {
    it('removes trailing [1]. from English answer and preserves punctuation', () => {
      const raw = 'A box of six croissants costs 450 rupees [1].';
      expect(cleanAnswerText(raw)).toBe('A box of six croissants costs 450 rupees.');
    });

    it('removes trailing [1] । from Hindi answer and preserves danda', () => {
      const raw = 'छह क्रोइसैन के एक डिब्बे की कीमत 450 रुपये है [1] ।';
      expect(cleanAnswerText(raw)).toBe('छह क्रोइसैन के एक डिब्बे की कीमत 450 रुपये है।');
    });

    it('removes trailing [1] । from Marathi answer', () => {
      const raw = 'सहा क्रोइसॉंच्या बॉक्सची किंमत ४५० रुपये आहे [1] ।';
      expect(cleanAnswerText(raw)).toBe('सहा क्रोइसॉंच्या बॉक्सची किंमत ४५० रुपये आहे।');
    });

    it('removes mid-sentence and multiple bracket citations [1][2] and [source 1]', () => {
      const raw = 'Croissants cost 450 rupees [1] and are freshly baked [2]. Orders require notice [source 3].';
      expect(cleanAnswerText(raw)).toBe(
        'Croissants cost 450 rupees and are freshly baked. Orders require notice.'
      );
    });

    it('leaves text without bracket citations untouched', () => {
      const clean = 'A box of six croissants costs 450 rupees.';
      expect(cleanAnswerText(clean)).toBe(clean);
    });
  });
});

