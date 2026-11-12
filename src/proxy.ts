import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { connectDB } from '@/lib/db/mongoose';
import { getPublicWorkspaceBySlug } from '@/lib/db/scoped-queries';
import { normalizeOrigin } from '@/lib/origins';

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // 1. Embed Widget Routes: Set dynamic CSP frame-ancestors per workspace
  if (pathname.startsWith('/widget/')) {
    const parts = pathname.split('/');
    const workspaceSlug = parts[2];

    const isProduction = process.env.NODE_ENV === 'production';
    // Production default: empty allowlist restricts framing to 'self' (direct link works, external embeds blocked).
    // Development default: allows open embedding for local development testing (* 'self').
    let frameAncestors = isProduction ? "'self'" : "* 'self'";
    if (workspaceSlug) {
      try {
        const dbPromise = connectDB().then(() => getPublicWorkspaceBySlug(workspaceSlug));
        const timeoutPromise = new Promise<null>((res) => setTimeout(() => res(null), 1500));
        const ws = await Promise.race([dbPromise, timeoutPromise]);
        if (ws && ws.allowedOrigins && ws.allowedOrigins.length > 0) {
          const normalized = ws.allowedOrigins
            .map((o) => {
              try {
                return normalizeOrigin(o);
              } catch {
                return null;
              }
            })
            .filter((o): o is string => Boolean(o));

          if (normalized.length > 0) {
            frameAncestors = `'self' ${normalized.join(' ')}`;
          }
        }
      } catch {
        // Fallback gracefully on DB error
      }
    }

    const response = NextResponse.next();
    response.headers.set('Content-Security-Policy', `frame-ancestors ${frameAncestors};`);
    return response;
  }

  const isDashboardRoute =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/onboarding');

  // NextAuth / Auth.js session token cookie names (secure and standard)
  const sessionToken =
    request.cookies.get('__Secure-authjs.session-token') ||
    request.cookies.get('authjs.session-token') ||
    request.cookies.get('next-auth.session-token') ||
    request.cookies.get('__Secure-next-auth.session-token');

  if (isDashboardRoute && !sessionToken) {
    const callbackUrl = encodeURIComponent(pathname);
    const redirectRes = NextResponse.redirect(
      new URL(`/login?callbackUrl=${callbackUrl}`, request.url)
    );
    redirectRes.headers.set('Content-Security-Policy', "frame-ancestors 'none';");
    redirectRes.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    redirectRes.headers.set('Pragma', 'no-cache');
    redirectRes.headers.set('Expires', '0');
    return redirectRes;
  }

  const response = NextResponse.next();
  // Protect all internal/dashboard routes from clickjacking
  response.headers.set('Content-Security-Policy', "frame-ancestors 'none';");

  if (isDashboardRoute) {
    // Prevent browser bfcache and back-button cache leaks after logout
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
  }

  return response;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};

