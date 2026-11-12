export const RESERVED_SLUGS = [
  'login',
  'signup',
  'auth',
  'api',
  'widget',
  'embed',
  'onboarding',
  'dashboard',
  'settings',
  'admin',
  'account',
  'pricing',
  'terms',
  'privacy',
  'docs',
  'status',
  'support',
  'help',
  'billing',
  'webhooks',
] as const;

export const PLAN_LIMITS = {
  free: {
    maxWorkspaces: 1,
    monthlyMessages: 100,
    maxDocuments: 5,
    maxChunks: 200,
    maxFileSizeMB: 5,
    allowedFileTypes: ['application/pdf', 'text/plain', 'text/markdown'],
  },
  pro: {
    maxWorkspaces: 1,
    monthlyMessages: 2500,
    maxDocuments: 50,
    maxChunks: 2500,
    maxFileSizeMB: 20,
    allowedFileTypes: ['application/pdf', 'text/plain', 'text/markdown'],
  },
} as const;

export const FAQ_LIMITS = {
  maxTitleLength: 200,
  minTextLength: 10,
  maxTextLength: 10000, // 10,000 characters (~1,500-2,500 words / ~2,000 tokens)
} as const;

export const EMBEDDING_CONFIG = {
  model: 'gemini-embedding-001',
  dimensions: 768,
  batchSize: 8,
  interBatchDelayMs: 1500,
} as const;

export const CHAT_CONFIG = {
  model: 'gemini-3.1-flash-lite',
  unansweredFallbackMessage:
    'I do not have enough information in the knowledge base to answer this question. Please reach out to customer support for further assistance.',
} as const;

export const INGESTION_LIMITS = {
  maxChunksPerMinutePerWorkspace: 15, // Raised from 10 to 15 so max-length 10k-char Marathi/Hindi entries (11-12 chunks) always fit
  maxAttemptsPerHourPerWorkspace: 10,
  globalTpmBudget: 30000,
  globalTpmThresholdPercent: 0.6, // 18,000 tokens (60% of 30,000)
  lockDurationMs: 5 * 60 * 1000, // 5 minutes
  processingTimeoutMs: 5 * 60 * 1000, // 5 minutes timeout (matching lockDurationMs)
} as const;

export const RETRIEVAL_CONFIG = {
  vectorIndexName: 'vector_index',
  dimensions: 768,
  numCandidates: 40,
  limit: 6,
  similarityThreshold: 0.80, // Calibrated on Atlas vectorSearchScore scale (1 + cosine)/2: 100% injection & off-topic block
} as const;

export const TEST_CHAT_LIMITS = {
  maxMessagesPerHourPerWorkspace: 20, // 20 test chats per hour for workspace owner
  globalDailyTestChatBudget: 100, // Prevents test chats from burning the shared 500 RPD
  maxQueryLength: 500, // Query character cap
} as const;
