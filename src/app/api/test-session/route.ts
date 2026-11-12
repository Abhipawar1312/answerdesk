import { NextResponse } from 'next/server';
import { encode } from 'next-auth/jwt';
import { cookies } from 'next/headers';
import { connectDB } from '@/lib/db/mongoose';
import { User } from '@/models/User';
// eslint-disable-next-line no-restricted-imports
import { Workspace } from '@/models/Workspace';

/**
 * Test-Only Authentication Endpoint.
 *
 * HARD GUARDS:
 * 1. Permanently disabled in production (NODE_ENV === 'production' returns 404).
 * 2. Requires explicit opt-in flag (ENABLE_TEST_LOGIN === 'true').
 *
 * Generates an encrypted NextAuth session cookie for end-to-end browser tests
 * and development overlay auditing without mocking OAuth credentials.
 */
export async function POST(req: Request) {
  // Fail-closed guard: completely unavailable in production or when flag is absent
  if (process.env.NODE_ENV === 'production' || process.env.ENABLE_TEST_LOGIN !== 'true') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    await connectDB();
    const body = await req.json().catch(() => ({}));
    const email = body.email || 'test-e2e-owner@example.com';
    const workspaceSlug = body.workspaceSlug || 'abc';

    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({
        email,
        name: 'E2E Test User',
        image: '',
        googleId: 'google_test_sub_' + Date.now(),
      });
    }

    // Ensure test workspace exists and is owned by this user
    let ws = await Workspace.findOne({ slug: workspaceSlug });
    if (!ws) {
      ws = await Workspace.create({
        name: 'ABC Corp',
        slug: workspaceSlug,
        ownerId: user._id,
        plan: 'free',
        messageLimit: 100,
        monthlyMessageCount: 0,
      });
    } else if (ws.ownerId.toString() !== user._id.toString()) {
      await Workspace.updateOne({ _id: ws._id }, { $set: { ownerId: user._id } });
    }

    const secret = process.env.AUTH_SECRET;
    if (!secret) {
      return NextResponse.json({ error: 'AUTH_SECRET missing' }, { status: 500 });
    }

    const token = await encode({
      token: {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        sub: user._id.toString(),
      },
      secret,
      salt: 'authjs.session-token',
    });

    const cookieStore = await cookies();
    cookieStore.set('authjs.session-token', token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: false, // dev/test localhost
    });

    return NextResponse.json({
      success: true,
      userId: user._id.toString(),
      workspaceSlug,
      token,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET() {
  if (process.env.NODE_ENV === 'production' || process.env.ENABLE_TEST_LOGIN !== 'true') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ error: 'Method not allowed. Use POST.' }, { status: 405 });
}
