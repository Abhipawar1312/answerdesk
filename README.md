# AnswerDesk

AnswerDesk is an AI-powered customer support assistant and knowledge base platform built with Next.js 16, MongoDB Atlas Vector Search, and Gemini 3.1 Flash Lite.

It ingests support FAQs and company documentation, losslessly chunks and embeds them via `gemini-embedding-001`, and serves grounded answers with citations to visitors through an embeddable website widget.

---

## Getting Started

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment variables**:
   Create a `.env.local` file with the required credentials:
   - `GEMINI_API_KEY`: Google AI Studio API key
   - `MONGODB_URI`: MongoDB Atlas connection string with Vector Search index enabled
   - `AUTH_SECRET`: NextAuth / Auth.js secret key
   - `AUTH_GOOGLE_ID`: Google OAuth client ID
   - `AUTH_GOOGLE_SECRET`: Google OAuth client secret
   - `UPSTASH_REDIS_REST_URL`: Upstash Redis REST URL (required in production for distributed rate limiting)
   - `UPSTASH_REDIS_REST_TOKEN`: Upstash Redis REST Token (required in production)

3. **Run development server**:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) to access the landing page and dashboard.

---

## Embeddable Chat Widget

To add the AnswerDesk chat widget to any website, add the following script before the closing `</body>` tag:

```html
<script
  src="https://your-domain.com/widget.js"
  data-workspace="your-workspace-slug"
  async>
</script>
```

### Security & Allowed Origins

AnswerDesk enforces multi-tenant isolation and clickjacking prevention at both the HTTP header and API levels:

1. **Content Security Policy (`frame-ancestors`)**:
   - The embed route `/widget/[workspaceSlug]` dynamically issues a `Content-Security-Policy: frame-ancestors ...` header tailored to the specific workspace's allowed domains.
   - **Empty Allowlist Behavior**: When the allowed origins list is empty, AnswerDesk enforces environment-aware defaults:
     - **Production (`NODE_ENV=production`)**: Strictly restricts framing to `frame-ancestors 'self'`, blocking unauthorized external websites from embedding your widget and consuming your quota. Direct visits to `/widget/[workspaceSlug]` continue to function normally.
     - **Development (`NODE_ENV !== 'production'`)**: Operates in open embed mode (`frame-ancestors * 'self'`) to streamline local multi-port testing (e.g. localhost:5000 embedding localhost:3000).
   - In both Settings and Embed Widget pages, plain warnings inform owners of the empty allowlist behavior so they configure their authorized production domains.
   - If specific domains are configured (e.g., `https://example.com`), browsers block the iframe from loading on any unauthorized domain via native CSP enforcement.

2. **Origin Limitations & Script Spoofing Notice**:
   - **Browser vs. Script Boundary**: While the browser strictly and natively enforces CSP `frame-ancestors` (preventing unauthorized sites from framing the widget), any external script, curl command, or non-browser client can trivially forge HTTP request headers (`Origin`, `Referer`, or payload parameters like `hostOrigin`). Therefore, API origin checks provide an additional defense-in-depth soft check, but the true browser security perimeter is CSP `frame-ancestors`.
   - **No URL Paths**: Under the W3C Content Security Policy specification, `frame-ancestors` only matches hostnames and ports (e.g., `https://example.com` or `https://*.example.com`). Path patterns such as `https://example.com/blog/*` are **not valid** in CSP and will be ignored by browsers.
   - **Protocol Strictness**: `https://` and `http://` are treated as different origins. Production sites should always use HTTPS (HTTP is only permitted on `localhost`).
   - **Explicit Ports**: If running locally or on non-standard ports, the port must be included (e.g. `http://localhost:5000`).
   - **Double-Layer Defense**: In addition to CSP `frame-ancestors`, the `/api/chat/public` endpoint checks the browser's `Origin` / `hostOrigin` against the normalized allowlist. Direct visits from the application's own origin are always permitted.

3. **Rate Limiting & Privacy**:
   - Client IPs are hashed using SHA-256 with a secret server salt before rate limit evaluation. Raw visitor IPs are never stored or logged in plain text.
   - Dual-bucket limits protect each workspace: 10 requests/minute per visitor ID and 20 requests/minute per hashed IP.
   - **Serverless Limitation Notice**: The local in-memory fallback rate limiter (`MemoryRateLimiter`) only tracks requests inside a single Node.js process memory. It does **not** work across serverless instances or multi-container clusters (e.g., Vercel, AWS Lambda) where memory is isolated per instance. Therefore, in production (`NODE_ENV=production`), missing or placeholder Upstash Redis credentials will fail loudly with a fatal error at startup or first request. Real Upstash Redis credentials are required in production.

4. **Retrieval Threshold Calibration**:
   - The vector similarity cutoff is managed in a single constant `RETRIEVAL_CONFIG.similarityThreshold` (currently `0.80`) in `src/lib/constants.ts`.
   - On the Atlas cosine scale `(1 + cos) / 2`, scores for on-topic and domain-adjacent queries can overlap depending on phrasing and vocabulary. **Important:** This threshold must be rechecked and calibrated with your workspace's real knowledge documents and production customer questions.

---

## Commands & Verification

- `npm test`: Run complete Vitest suite (unit, scoping, rate limiter, and prompt builder tests).
- `npm run lint`: Run ESLint checks with zero warnings.
- `npm run build`: Verify Next.js production build and route compilation.
- `npx tsx scripts/live-verify.ts`: Verify live database connectivity, vector index, embedding dimensions, and generative chat model.
