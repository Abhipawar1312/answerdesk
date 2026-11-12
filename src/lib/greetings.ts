/**
 * Greeting and Thanks Detection Service.
 *
 * Intercepts conversational pleasantries (greetings and thank-you messages)
 * across English, Hindi, and Marathi to provide instant, friendly replies
 * without invoking AI models and without consuming workspace message quotas.
 */

export interface GreetingResponse {
  isHandled: boolean;
  type?: 'greeting' | 'thanks';
  language?: 'en' | 'hi' | 'mr';
  reply?: string;
}

// Normalize by stripping punctuation, extra whitespace, and emojis
function cleanInput(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?'"!\।\॥]/g, '')
    .trim();
}

const EN_GREETINGS = new Set([
  'hi',
  'hello',
  'hey',
  'hey there',
  'hello there',
  'hi there',
  'good morning',
  'good afternoon',
  'good evening',
  'greetings',
  'howdy',
]);

const EN_THANKS = new Set([
  'thanks',
  'thank you',
  'thank you so much',
  'thank you very much',
  'thanks a lot',
  'thx',
  'ty',
  'appreciate it',
  'much appreciated',
]);

const HI_GREETINGS = new Set([
  'नमस्ते',
  'नमस्कार',
  'प्रणाम',
  'हेलो',
  'हाय',
  'शुभ प्रभात',
]);

const HI_THANKS = new Set([
  'धन्यवाद',
  'शुक्रिया',
  'बहुत धन्यवाद',
  'बहुत शुक्रिया',
  'थैंक यू',
]);

const MR_GREETINGS = new Set([
  'नमस्कार',
  'शुभ प्रभात',
  'हॅलो',
]);

const MR_THANKS = new Set([
  'धन्यवाद',
  'मनःपूर्वक धन्यवाद',
  'खूप खूप धन्यवाद',
  'खूप धन्यवाद',
]);

export function detectGreetingOrThanks(input: string, workspaceName?: string): GreetingResponse {
  const cleaned = cleanInput(input);
  if (!cleaned) {
    return { isHandled: false };
  }

  const wsName = workspaceName ? ` ${workspaceName}` : '';

  // Marathi checks (specific phrases and greetings)
  if (MR_THANKS.has(cleaned) && (cleaned.includes('खूप') || cleaned.includes('मनःपूर्वक'))) {
    return {
      isHandled: true,
      type: 'thanks',
      language: 'mr',
      reply: 'आपले स्वागत आहे! आपल्याला आणखी काही मदत हवी असल्यास नक्की सांगा.',
    };
  }

  if (MR_GREETINGS.has(cleaned)) {
    return {
      isHandled: true,
      type: 'greeting',
      language: 'mr',
      reply: `नमस्कार! मी${wsName} सहाय्यक आहे. मी तुम्हाला कशी मदत करू शकतो? तुम्ही आमच्या सेवा किंवा धोरणांबद्दल विचारू शकता.`,
    };
  }

  // Hindi checks
  if (HI_GREETINGS.has(cleaned)) {
    return {
      isHandled: true,
      type: 'greeting',
      language: 'hi',
      reply: `नमस्ते! मैं${wsName} सहायता सहायक हूँ। मैं आपकी क्या सहायता कर सकता हूँ? आप हमारी नीतियों या सेवाओं के बारे में प्रश्न पूछ सकते हैं।`,
    };
  }

  if (HI_THANKS.has(cleaned)) {
    return {
      isHandled: true,
      type: 'thanks',
      language: 'hi',
      reply: 'आपका स्वागत है! यदि आपको किसी अन्य सहायता की आवश्यकता हो तो अवश्य बताएं।',
    };
  }

  // English checks
  if (EN_GREETINGS.has(cleaned)) {
    return {
      isHandled: true,
      type: 'greeting',
      language: 'en',
      reply: `Hello! How can I help you today? Feel free to ask any question about${wsName ? ` ${workspaceName}'s` : ''} policies, pricing, or documentation.`,
    };
  }

  if (EN_THANKS.has(cleaned)) {
    return {
      isHandled: true,
      type: 'thanks',
      language: 'en',
      reply: "You're welcome! Let me know if you need help with anything else.",
    };
  }

  return { isHandled: false };
}
