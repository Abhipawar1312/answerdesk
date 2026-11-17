import 'server-only';
import { z } from 'zod';

const nodeEnv = (process.env.NODE_ENV || 'development') as 'development' | 'production' | 'test';

const isProduction = nodeEnv === 'production';

// Production schema: all secrets are strictly required, no mock defaults permitted.
const prodSchema = z.object({
  NODE_ENV: z.literal('production'),
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters in production'),
  AUTH_GOOGLE_ID: z.string().min(1, 'AUTH_GOOGLE_ID is required in production'),
  AUTH_GOOGLE_SECRET: z.string().min(1, 'AUTH_GOOGLE_SECRET is required in production'),
  MONGODB_URI: z
    .string()
    .min(1, 'MONGODB_URI is required in production')
    .regex(/^mongodb(\+srv)?:\/\//, 'MONGODB_URI must be a valid MongoDB connection string'),
  // Stripe secrets optional in production until Phase 4 (Stripe billing integration)
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRO_PRICE_ID: z.string().optional(),
  NEXT_PUBLIC_STRIPE_PRO_PRICE: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url('NEXT_PUBLIC_APP_URL must be a valid URL in production'),
  GEMINI_API_KEY: z.string().min(1, 'GEMINI_API_KEY is required in production'),
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  UPSTASH_REDIS_REST_URL: z.string().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional().default('AnswerDesk <onboarding@resend.dev>'),
});

// Non-production schema: safe defaults permitted for local development and test runners.
const nonProdSchema = z.object({
  NODE_ENV: z.enum(['development', 'test']).default('development'),
  AUTH_SECRET: z.string().min(16).default('development-secret-must-be-at-least-16-chars'),
  AUTH_GOOGLE_ID: z.string().optional().default('mock-google-client-id'),
  AUTH_GOOGLE_SECRET: z.string().optional().default('mock-google-client-secret'),
  MONGODB_URI: z.string().min(1).default('mongodb://127.0.0.1:27017/answerdesk'),
  STRIPE_SECRET_KEY: z.string().optional().default('sk_test_mock'),
  STRIPE_WEBHOOK_SECRET: z.string().optional().default('whsec_mock'),
  STRIPE_PRO_PRICE_ID: z.string().optional().default('price_1TestProMonthly'),
  NEXT_PUBLIC_STRIPE_PRO_PRICE: z.string().optional().default('₹999'),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  GEMINI_API_KEY: z.string().optional().default('mock-gemini-api-key'),
  BLOB_READ_WRITE_TOKEN: z.string().optional().default('mock-blob-token'),
  UPSTASH_REDIS_REST_URL: z.string().optional().default('https://mock-redis.upstash.io'),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional().default('mock-redis-token'),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional().default('AnswerDesk <onboarding@resend.dev>'),
});

const schema = isProduction ? prodSchema : nonProdSchema;
const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Environment validation failed:', parsed.error.format());
  throw new Error('Invalid environment variables. Application halted.');
}

export const env = parsed.data;
