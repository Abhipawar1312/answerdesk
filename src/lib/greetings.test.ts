import { describe, it, expect } from 'vitest';
import { detectGreetingOrThanks } from './greetings';

describe('Greeting and Thanks Detection (greetings.ts)', () => {
  it('detects English greetings without case sensitivity or punctuation', () => {
    const res1 = detectGreetingOrThanks('Hi!');
    expect(res1.isHandled).toBe(true);
    expect(res1.type).toBe('greeting');
    expect(res1.language).toBe('en');
    expect(res1.reply).toContain('Hello! How can I help you today?');

    const res2 = detectGreetingOrThanks('  Hello There.  ');
    expect(res2.isHandled).toBe(true);
    expect(res2.type).toBe('greeting');

    const res3 = detectGreetingOrThanks('Good morning!!', 'Acme Corp');
    expect(res3.isHandled).toBe(true);
    expect(res3.reply).toContain('Acme Corp');
  });

  it('detects English thank-you messages', () => {
    const res1 = detectGreetingOrThanks('Thank you so much!');
    expect(res1.isHandled).toBe(true);
    expect(res1.type).toBe('thanks');
    expect(res1.reply).toContain("You're welcome!");

    const res2 = detectGreetingOrThanks('thanks');
    expect(res2.isHandled).toBe(true);
    expect(res2.type).toBe('thanks');
  });

  it('detects Hindi greetings and thanks', () => {
    const greet = detectGreetingOrThanks('नमस्ते');
    expect(greet.isHandled).toBe(true);
    expect(greet.type).toBe('greeting');
    expect(greet.language).toBe('hi');
    expect(greet.reply).toContain('नमस्ते!');

    const thanks = detectGreetingOrThanks('धन्यवाद!');
    expect(thanks.isHandled).toBe(true);
    expect(thanks.type).toBe('thanks');
    expect(thanks.reply).toContain('आपका स्वागत है!');
  });

  it('detects Marathi greetings and thanks', () => {
    const greet = detectGreetingOrThanks('नमस्कार');
    expect(greet.isHandled).toBe(true);
    expect(greet.type).toBe('greeting');

    const thanks = detectGreetingOrThanks('खूप खूप धन्यवाद');
    expect(thanks.isHandled).toBe(true);
    expect(thanks.type).toBe('thanks');
    expect(thanks.language).toBe('mr');
    expect(thanks.reply).toContain('आपले स्वागत आहे!');
  });

  it('returns isHandled: false for actual questions', () => {
    expect(detectGreetingOrThanks('What is your refund policy?').isHandled).toBe(false);
    expect(detectGreetingOrThanks('How do I contact support?').isHandled).toBe(false);
    expect(detectGreetingOrThanks('नमस्ते, मुझे रिफंड कैसे मिलेगा?').isHandled).toBe(false);
    expect(detectGreetingOrThanks('').isHandled).toBe(false);
  });
});

