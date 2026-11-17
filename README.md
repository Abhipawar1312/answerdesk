# AnswerDesk

AnswerDesk is an AI-powered customer support assistant and knowledge base platform built with Next.js 16, MongoDB Atlas Vector Search, and Gemini 3.1 Flash Lite.

- **Live URL:** [https://answerdesk-ai.vercel.app](https://answerdesk-ai.vercel.app)
- **Public Interactive Demo (No Login Required):** [https://answerdesk-ai.vercel.app/widget/demo](https://answerdesk-ai.vercel.app/widget/demo)

It ingests support FAQs and company documentation, losslessly chunks and embeds them via `gemini-embedding-001`, and serves grounded answers with citations to visitors through an embeddable website widget.

---

## Try the Demo (No Google Login Required)

To test AnswerDesk without signing in:

1. Open the public widget directly: [https://answerdesk-ai.vercel.app/widget/demo](https://answerdesk-ai.vercel.app/widget/demo)
2. Ask questions in **English**, **Hindi (हिंदी)**, or **Marathi (मराठी)**.
3. To re-seed or reset the demo workspace locally or in production:
   ```bash
   ALLOW_DEMO_SEED=true npx tsx scripts/seed-demo.ts
   ```
   *(Note: The seed script requires `ALLOW_DEMO_SEED=true` and refuses to run against a database not marked as demo-safe).*

The demo workspace has a strict cap of 20 messages per month and contains sample multilingual FAQs (no real or private customer data).

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
   - `AUTH_SECRET`: NextAuth / Auth.js secret key (min 32 characters in production)
   - `AUTH_GOOGLE_ID`: Google OAuth client ID
   - `AUTH_GOOGLE_SECRET`: Google OAuth client secret
   - `NEXT_PUBLIC_APP_URL`: Canonical application URL (e.g. `https://answerdesk-ai.vercel.app`)
   - `UPSTASH_REDIS_REST_URL`: Upstash Redis REST URL (required in production for distributed rate limiting)
   - `UPSTASH_REDIS_REST_TOKEN`: Upstash Redis REST Token (required in production)
   - `STRIPE_SECRET_KEY`: Stripe API secret key
   - `STRIPE_WEBHOOK_SECRET`: Stripe webhook signing secret
   - `STRIPE_PRO_PRICE_ID`: Stripe recurring price ID (`price_...`)
   - `HEALTH_CHECK_TOKEN`: Secret token protecting the `/api/health` monitoring endpoint

3. **Run development server**:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) to access the landing page and dashboard.

---

## Production Environment Variables & Fail-Safe Behavior

| Environment Variable | Production Required | Behavior When Missing |
| :--- | :---: | :--- |
| `NODE_ENV` | Yes | Defaults to `development`. |
| `AUTH_SECRET` | Yes | App halts at startup; Zod validation throws error (min 32 characters required). |
| `AUTH_GOOGLE_ID` | Yes | App halts at startup; Google authentication fails. |
| `AUTH_GOOGLE_SECRET`| Yes | App halts at startup; Google OAuth code exchange fails. |
| `MONGODB_URI` | Yes | App halts at startup; database connection cannot be established. |
| `NEXT_PUBLIC_APP_URL` | Yes | App halts at startup; embed snippets and widget routing fail. |
| `GEMINI_API_KEY` | Yes | App halts at startup; embedding ingestion and chat models fail. |
| `UPSTASH_REDIS_REST_URL` | Yes | **Fails loudly**; `getRateLimiter` throws a fatal error on the first public chat request. |
| `UPSTASH_REDIS_REST_TOKEN` | Yes | **Fails loudly**; `getRateLimiter` throws a fatal error in production. |
| `STRIPE_SECRET_KEY` | Optional | Pro checkout session creation and customer portal redirect return configuration error. |
| `STRIPE_WEBHOOK_SECRET` | Optional | Webhook verification fails; returns HTTP 500 without updating subscriptions. |
| `STRIPE_PRO_PRICE_ID` | Optional | Falls back to default price ID or errors on checkout creation. |
| `HEALTH_CHECK_TOKEN` | Optional | Falls back to `CRON_SECRET` or `AUTH_SECRET`; returns HTTP 401 if unauthorized. |

---

## Health Check Endpoint (`/api/health`)

A monitoring endpoint is available at `/api/health`.

- **Access Control:** Protected by bearer token or query parameter. Requires matching `HEALTH_CHECK_TOKEN`, `CRON_SECRET`, or `AUTH_SECRET`.
  ```bash
  curl -H "Authorization: Bearer <YOUR_HEALTH_CHECK_TOKEN>" https://answerdesk-ai.vercel.app/api/health
  ```
- **Response Format:** Returns clean status flags (never leaks secrets, API keys, or connection strings):
  ```json
  {
    "status": "ok",
    "database": true,
    "vectorIndex": true,
    "geminiConfig": true
  }
  ```

---

## Honest Architecture & Operational Limitations

1. **Shared Free Gemini Quota**:
   - The default configuration uses the free-tier Google Gemini API (`gemini-embedding-001` and `gemini-2.0-flash-lite`).
   - Free tier is subject to strict limits: **15 RPM**, **1,500 requests/day**, and a shared **30,000 TPM** budget.
   - AnswerDesk protects this budget with aggressive sliding-window token accounting, single-retry backoff, and 8-chunk batching. However, during high burst traffic, requests may experience temporary throttling. Production workloads with heavy traffic should connect a paid Google AI Studio tier.

2. **Hindi & Marathi PDF Extraction**:
   - Text extraction from uploaded PDF documents relies on PDF Unicode font tables (`pdf-parse`).
   - Standard UTF-8 digital PDFs extract accurately. However, scanned documents, PDFs using non-standard legacy Indian font encodings (e.g. Kruti Dev, Shree Lipi), or image-only pages cannot extract readable text without external OCR.
   - For regional Indian languages, pasting clean UTF-8 text into the FAQ editor or uploading structured Markdown (`.md`) is strongly recommended.

3. **Origin Header & Script Spoofing Boundary**:
   - Browsers natively enforce the HTTP `Content-Security-Policy: frame-ancestors` header, which prevents unauthorized websites from embedding your widget in an iframe.
   - However, any automated script, curl command, or non-browser client can trivially forge the HTTP `Origin` header. Therefore, API origin checks are a defense-in-depth convenience, not a cryptographic perimeter. The true production boundary protecting customer quota against scripts is **distributed IP + visitor rate limiting via Upstash Redis**.

4. **In-Memory Rate Limiter on Serverless**:
   - The local in-memory fallback rate limiter (`MemoryRateLimiter`) only tracks hits inside a single Node.js process memory.
   - On serverless platforms like Vercel or AWS Lambda, incoming requests spawn and execute across isolated containers that do not share memory.
   - Consequently, in production (`NODE_ENV=production`), AnswerDesk **fails loudly** if Upstash Redis credentials are not configured, preventing unmetered abuse.

---

## Embeddable Chat Widget

To embed the AnswerDesk chat widget on any website, add the following script before the closing `</body>` tag:

```html
<script
  src="https://answerdesk-ai.vercel.app/widget.js"
  data-workspace="your-workspace-slug"
  async>
</script>
```

The script automatically derives its API origin from the script source URL (`NEXT_PUBLIC_APP_URL`) and loads the responsive iframe.

---

## Commands & Verification

- `npm test`: Run complete Vitest suite across unit, tenancy isolation, error handling, and rate limiter tests.
- `npm run lint`: Run ESLint checks with zero warnings and strict tenancy enforcement.
- `npm run build`: Verify Next.js production build and route compilation with Partial Prerendering.
- `ALLOW_DEMO_SEED=true npx tsx scripts/seed-demo.ts`: Seed the public multilingual demo workspace.
- `npx tsx scripts/live-verify.ts`: End-to-end live cloud infrastructure verification suite.
