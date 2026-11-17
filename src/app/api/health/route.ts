import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db/mongoose';
import { checkVectorSearchHealth } from '@/lib/db/scoped-queries';

/**
 * Health check endpoint protected by a simple bearer token from env.
 * Returns only boolean status flags (no secrets, no connection strings, no keys).
 */
export async function GET(req: NextRequest) {
  const expectedToken =
    process.env.HEALTH_CHECK_TOKEN ||
    process.env.CRON_SECRET ||
    process.env.AUTH_SECRET;

  const authHeader = req.headers.get('authorization') || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const customHeaderToken = req.headers.get('x-health-token') || '';
  const queryToken = req.nextUrl.searchParams.get('token') || '';

  const providedToken = bearerToken || customHeaderToken || queryToken;

  if (!expectedToken || !providedToken || providedToken !== expectedToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 1. Check Database connection
  let databaseOk = false;
  try {
    await connectDB();
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.db?.admin().ping();
      databaseOk = true;
    }
  } catch {
    databaseOk = false;
  }

  // 2. Check Vector Index availability via scoped helper
  let vectorIndexOk = false;
  try {
    vectorIndexOk = databaseOk ? await checkVectorSearchHealth() : false;
  } catch {
    vectorIndexOk = databaseOk;
  }

  // 3. Check Gemini API configuration
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const geminiOk = Boolean(geminiApiKey && geminiApiKey.length > 5 && !geminiApiKey.includes('mock'));

  const isHealthy = databaseOk && geminiOk;

  return NextResponse.json(
    {
      status: isHealthy ? 'ok' : 'degraded',
      database: databaseOk,
      vectorIndex: vectorIndexOk,
      geminiConfig: geminiOk,
    },
    { status: isHealthy ? 200 : 503 }
  );
}
