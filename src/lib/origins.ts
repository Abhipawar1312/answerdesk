/**
 * Allowed Origins Normalization & Validation Service
 *
 * Rules:
 * - Uses new URL(x).origin (lowercased, removes path, trailing slashes, query params, hash).
 * - Accepts http: or https: protocol only.
 * - Enforces HTTPS for all domains except localhost / 127.0.0.1 / [::1].
 */

export function normalizeOrigin(input: string): string {
  const trimmed = (input || '').trim();
  if (!trimmed) {
    throw new Error('Origin cannot be empty.');
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error('Invalid origin format. Must be a valid URL (e.g. https://example.com or http://localhost:5000).');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Origin must use HTTP or HTTPS protocol.');
  }

  const hostname = url.hostname.toLowerCase();
  const isLocalhost =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname.endsWith('.localhost');

  if (url.protocol === 'http:' && !isLocalhost) {
    throw new Error('HTTPS is required for all domains except localhost.');
  }

  // Returns origin without trailing slash, e.g. "http://localhost:5000" or "https://example.com"
  return url.origin.toLowerCase();
}

/**
 * Validates whether an origin string is acceptable for the allowedOrigins list.
 */
export function isValidAllowedOrigin(input: string): { valid: boolean; normalized?: string; error?: string } {
  try {
    const normalized = normalizeOrigin(input);
    return { valid: true, normalized };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : 'Invalid origin.' };
  }
}

/**
 * Checks whether an incoming API request to /api/chat/public is permitted.
 *
 * Architecture:
 * 1. If workspace.allowedOrigins is empty, allow (permissive mode for dev / initial onboarding).
 * 2. If the request comes from the AnswerDesk app itself (same-origin, or direct visit to /widget/<slug>):
 *    - If a clientHostOrigin is reported by widget.js embed, verify it against the workspace allowlist.
 *    - Direct visits to /widget/<slug> without embed host origin are allowed.
 * 3. Cross-origin direct API requests (Origin header) must match allowedOrigins.
 */
export function isPublicChatOriginAllowed(
  req: Request,
  allowedOrigins: string[],
  clientHostOrigin?: string
): boolean {
  const isProduction = process.env.NODE_ENV === 'production';

  // Empty allowlist handling:
  // In development: permissive open embed mode for local dev.
  // In production: direct visits to /widget/<slug> work, but external site embeds are blocked.
  if (!allowedOrigins || allowedOrigins.length === 0) {
    if (!isProduction) {
      return true;
    }

    const originHeader = req.headers.get('origin');
    const refererHeader = req.headers.get('referer');
    const secFetchSite = req.headers.get('sec-fetch-site');

    let appOrigin = '';
    try {
      appOrigin = new URL(req.url).origin.toLowerCase();
    } catch {}

    let reqOrigin = '';
    if (originHeader && originHeader !== 'null') {
      try {
        reqOrigin = new URL(originHeader).origin.toLowerCase();
      } catch {
        reqOrigin = originHeader.toLowerCase().trim();
      }
    }

    let refOrigin = '';
    if (refererHeader) {
      try {
        refOrigin = new URL(refererHeader).origin.toLowerCase();
      } catch {}
    }

    const isFromAppItself =
      secFetchSite === 'same-origin' ||
      (reqOrigin && appOrigin && reqOrigin === appOrigin) ||
      (!reqOrigin && refOrigin && appOrigin && refOrigin === appOrigin);

    return Boolean(isFromAppItself && !clientHostOrigin);
  }

  const normalizedAllowed = allowedOrigins.map((o) => {
    try {
      return normalizeOrigin(o);
    } catch {
      return o.toLowerCase().trim();
    }
  });

  const originHeader = req.headers.get('origin');
  const refererHeader = req.headers.get('referer');
  const secFetchSite = req.headers.get('sec-fetch-site');

  let appOrigin = '';
  try {
    appOrigin = new URL(req.url).origin.toLowerCase();
  } catch {
    // fallback
  }

  let requestOrigin = '';
  if (originHeader && originHeader !== 'null') {
    try {
      requestOrigin = new URL(originHeader).origin.toLowerCase();
    } catch {
      requestOrigin = originHeader.toLowerCase().trim();
    }
  }

  let refererOrigin = '';
  if (refererHeader) {
    try {
      refererOrigin = new URL(refererHeader).origin.toLowerCase();
    } catch {
      // ignore invalid referer
    }
  }

  // Check if request is from the widget page itself (same-origin with app)
  const isFromAppItself =
    secFetchSite === 'same-origin' ||
    (requestOrigin && appOrigin && requestOrigin === appOrigin) ||
    (!requestOrigin && refererOrigin && appOrigin && refererOrigin === appOrigin);

  if (isFromAppItself) {
    // If the widget is embedded in a customer website via widget.js,
    // widget.js passes the customer website's hostOrigin
    if (clientHostOrigin) {
      try {
        const normalizedClientHost = normalizeOrigin(clientHostOrigin);
        return normalizedAllowed.includes(normalizedClientHost);
      } catch {
        return false;
      }
    }
    // Direct visit to /widget/<slug> on the AnswerDesk app without embed hostOrigin
    return true;
  }

  // Direct cross-origin API call from external site
  if (requestOrigin) {
    return normalizedAllowed.includes(requestOrigin);
  }

  if (refererOrigin) {
    return normalizedAllowed.includes(refererOrigin);
  }

  // In test / non-production environments without browser origin headers
  return process.env.NODE_ENV !== 'production';
}

