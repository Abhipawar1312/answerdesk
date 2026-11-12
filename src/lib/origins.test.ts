import { describe, it, expect, vi } from 'vitest';
import { normalizeOrigin, isValidAllowedOrigin, isPublicChatOriginAllowed } from './origins';

describe('Allowed Origins Normalization & Validation', () => {
  describe('normalizeOrigin', () => {
    it('normalizes http://localhost:5000/ to http://localhost:5000 (stripping trailing slash)', () => {
      expect(normalizeOrigin('http://localhost:5000/')).toBe('http://localhost:5000');
    });

    it('normalizes http://localhost:5000 to http://localhost:5000', () => {
      expect(normalizeOrigin('http://localhost:5000')).toBe('http://localhost:5000');
    });

    it('normalizes http://127.0.0.1:8080/ to http://127.0.0.1:8080', () => {
      expect(normalizeOrigin('http://127.0.0.1:8080/')).toBe('http://127.0.0.1:8080');
    });

    it('normalizes https://mycompany.com/path?foo=bar#section to https://mycompany.com (lowercase, no path)', () => {
      expect(normalizeOrigin('https://MYCOMPANY.COM/path?foo=bar#section')).toBe('https://mycompany.com');
    });

    it('rejects HTTP on public non-localhost domains (HTTPS required)', () => {
      expect(() => normalizeOrigin('http://example.com')).toThrow(
        /HTTPS is required for all domains except localhost/i
      );
      expect(() => normalizeOrigin('http://sub.company.org/')).toThrow(
        /HTTPS is required for all domains except localhost/i
      );
    });

    it('rejects non-HTTP/HTTPS schemes like javascript:', () => {
      expect(() => normalizeOrigin('javascript:alert(1)')).toThrow(
        /Origin must use HTTP or HTTPS protocol/i
      );
    });

    it('rejects malformed inputs like abc or http://', () => {
      expect(() => normalizeOrigin('abc')).toThrow(/Invalid origin format/i);
      expect(() => normalizeOrigin('http://')).toThrow(/Invalid origin format/i);
      expect(() => normalizeOrigin('   ')).toThrow(/Origin cannot be empty/i);
    });
  });

  describe('isValidAllowedOrigin', () => {
    it('returns valid: true and normalized origin for valid input', () => {
      const res = isValidAllowedOrigin('http://localhost:5000/');
      expect(res.valid).toBe(true);
      expect(res.normalized).toBe('http://localhost:5000');
    });

    it('returns valid: false and error message for rejected inputs', () => {
      expect(isValidAllowedOrigin('abc').valid).toBe(false);
      expect(isValidAllowedOrigin('javascript:alert(1)').valid).toBe(false);
      expect(isValidAllowedOrigin('http://').valid).toBe(false);
      expect(isValidAllowedOrigin('http://example.com').valid).toBe(false);
    });
  });

  describe('isPublicChatOriginAllowed', () => {
    const allowed = ['http://localhost:5000', 'https://example.com'];

    it('allows any request when allowedOrigins is empty in development', () => {
      vi.stubEnv('NODE_ENV', 'development');
      const req = new Request('http://localhost:3000/api/chat/public', {
        headers: { origin: 'https://anywhere.com' },
      });
      expect(isPublicChatOriginAllowed(req, [])).toBe(true);
      vi.unstubAllEnvs();
    });

    it('in production with empty allowlist: permits direct visits but rejects external embeds', () => {
      vi.stubEnv('NODE_ENV', 'production');

      const directReq = new Request('http://localhost:3000/api/chat/public', {
        headers: {
          origin: 'http://localhost:3000',
          'sec-fetch-site': 'same-origin',
        },
      });
      // Direct visit works
      expect(isPublicChatOriginAllowed(directReq, [])).toBe(true);

      // External embed with clientHostOrigin is blocked
      expect(isPublicChatOriginAllowed(directReq, [], 'https://thirdparty.com')).toBe(false);

      // Cross-origin request is blocked
      const crossReq = new Request('http://localhost:3000/api/chat/public', {
        headers: { origin: 'https://thirdparty.com', 'sec-fetch-site': 'cross-site' },
      });
      expect(isPublicChatOriginAllowed(crossReq, [])).toBe(false);

      vi.unstubAllEnvs();
    });

    it('allows direct visit to /widget/<slug> on the app own origin even when allowlist is non-empty', () => {
      const req = new Request('http://localhost:3000/api/chat/public', {
        headers: {
          origin: 'http://localhost:3000',
          referer: 'http://localhost:3000/widget/my-support',
          'sec-fetch-site': 'same-origin',
        },
      });
      // Direct visit without embed clientHostOrigin
      expect(isPublicChatOriginAllowed(req, allowed)).toBe(true);
    });

    it('allows embedded widget request when clientHostOrigin matches allowlist', () => {
      const req = new Request('http://localhost:3000/api/chat/public', {
        headers: {
          origin: 'http://localhost:3000',
          referer: 'http://localhost:3000/widget/my-support',
          'sec-fetch-site': 'same-origin',
        },
      });
      // Embedded from customer allowed origin http://localhost:5000
      expect(isPublicChatOriginAllowed(req, allowed, 'http://localhost:5000')).toBe(true);
    });

    it('rejects embedded widget request when clientHostOrigin does not match allowlist', () => {
      const req = new Request('http://localhost:3000/api/chat/public', {
        headers: {
          origin: 'http://localhost:3000',
          referer: 'http://localhost:3000/widget/my-support',
          'sec-fetch-site': 'same-origin',
        },
      });
      // Embedded from unapproved origin http://evil.com
      expect(isPublicChatOriginAllowed(req, allowed, 'http://evil.com')).toBe(false);
    });

    it('rejects cross-origin direct API fetch from unapproved origin', () => {
      const req = new Request('http://localhost:3000/api/chat/public', {
        headers: {
          origin: 'http://evil.com',
          'sec-fetch-site': 'cross-site',
        },
      });
      expect(isPublicChatOriginAllowed(req, allowed)).toBe(false);
    });
  });
});

