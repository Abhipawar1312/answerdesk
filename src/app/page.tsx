import { Suspense } from 'react';
import Image from 'next/image';
import { Header } from '@/components/common/header';
import { MarketingHero } from '@/components/marketing/hero';
import Link from 'next/link';
import {
  Check,
  ShieldCheck,
  Languages,
  Code2,
  FileCheck,
  HelpCircle,
  Search,
  Sparkles,
} from 'lucide-react';
import {
  StarterPricingButton,
  StarterPricingButtonSkeleton,
  ProPricingButton,
  ProPricingButtonSkeleton,
} from '@/components/marketing/pricing-cta';

function HeaderSkeleton() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur-xs">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <Image
            src="/icon.svg"
            alt="AnswerDesk Logo"
            width={22}
            height={22}
            className="rounded-sm"
          />
          <span className="text-sm font-semibold tracking-tight text-foreground">
            AnswerDesk
          </span>
        </div>
      </div>
    </header>
  );
}

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground antialiased selection:bg-primary selection:text-primary-foreground">
      <Suspense fallback={<HeaderSkeleton />}>
        <Header />
      </Suspense>

      <main className="flex-1">
        <MarketingHero />

        {/* Bento Grid Features Section */}
        <section id="features" className="border-t border-border/80 py-24 sm:py-32 bg-muted/10 relative">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <div className="mb-16 text-center max-w-2xl mx-auto">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground mb-3 bg-card">
                <Sparkles className="h-3 w-3 text-primary" />
                <span>Engineered for Reliability</span>
              </div>
              <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-foreground">
                Built for accuracy, compliance, and enterprise security
              </h2>
              <p className="mt-3 text-sm text-muted-foreground">
                Unlike generic LLM wrappers, AnswerDesk enforces strict multi-tenant boundary isolation and document-grounded citation proofs.
              </p>
            </div>

            {/* Bento Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Bento Card 1 (Span 2) */}
              <div className="md:col-span-2 rounded-2xl border border-border/80 bg-card p-6 sm:p-8 flex flex-col justify-between shadow-xs hover:border-primary/40 transition-all group">
                <div>
                  <div className="h-10 w-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center mb-5 group-hover:scale-105 transition-transform">
                    <Search className="h-5 w-5" />
                  </div>
                  <h3 className="text-base sm:text-lg font-semibold tracking-tight">
                    Strict Semantic Grounding & Citation Proofs
                  </h3>
                  <p className="mt-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                    Queries are vectorized against your chunked knowledge base. Every generated answer cites the exact filename and chunk number. If the query falls outside your knowledge base, the assistant explicitly declines to answer.
                  </p>
                </div>

                <div className="mt-6 rounded-lg border border-border/60 bg-muted/40 p-3 font-mono text-[11px] text-muted-foreground flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span>Cosine Similarity Threshold: &ge; 0.65</span>
                  </span>
                  <span className="text-[10px] uppercase font-semibold text-foreground">
                    Hallucination Blocked
                  </span>
                </div>
              </div>

              {/* Bento Card 2 (Span 1) */}
              <div className="rounded-2xl border border-border/80 bg-card p-6 sm:p-8 flex flex-col justify-between shadow-xs hover:border-primary/40 transition-all group">
                <div>
                  <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center mb-5 group-hover:scale-105 transition-transform">
                    <Languages className="h-5 w-5" />
                  </div>
                  <h3 className="text-base sm:text-lg font-semibold tracking-tight">
                    Native Multilingual AI
                  </h3>
                  <p className="mt-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                    First-class support for English, Hindi (हिंदी), and Marathi (मराठी). Seamless tokenization and multilingual semantics built-in.
                  </p>
                </div>

                <div className="mt-6 flex flex-wrap gap-1.5">
                  <span className="px-2.5 py-1 rounded-md bg-muted text-[11px] font-medium">English</span>
                  <span className="px-2.5 py-1 rounded-md bg-muted text-[11px] font-medium">हिंदी</span>
                  <span className="px-2.5 py-1 rounded-md bg-muted text-[11px] font-medium">मराठी</span>
                </div>
              </div>

              {/* Bento Card 3 (Span 1) */}
              <div className="rounded-2xl border border-border/80 bg-card p-6 sm:p-8 flex flex-col justify-between shadow-xs hover:border-primary/40 transition-all group">
                <div>
                  <div className="h-10 w-10 rounded-xl bg-violet-500/10 text-violet-500 flex items-center justify-center mb-5 group-hover:scale-105 transition-transform">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <h3 className="text-base sm:text-lg font-semibold tracking-tight">
                    Multi-Tenant Isolation
                  </h3>
                  <p className="mt-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                    Every document, vector chunk, and conversation is strictly isolated by workspace ID at the database layer with automated Mongoose security hooks.
                  </p>
                </div>

                <div className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
                  <FileCheck className="h-4 w-4 text-emerald-500" />
                  <span>Zero cross-tenant data leaks</span>
                </div>
              </div>

              {/* Bento Card 4 (Span 2) */}
              <div className="md:col-span-2 rounded-2xl border border-border/80 bg-card p-6 sm:p-8 flex flex-col justify-between shadow-xs hover:border-primary/40 transition-all group">
                <div>
                  <div className="h-10 w-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center mb-5 group-hover:scale-105 transition-transform">
                    <Code2 className="h-5 w-5" />
                  </div>
                  <h3 className="text-base sm:text-lg font-semibold tracking-tight">
                    1-Line Embeddable Widget
                  </h3>
                  <p className="mt-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                    Drop a single script tag into your WordPress, Shopify, Next.js, or HTML site. Fortified with per-visitor burst rate limits and strict HTTP Origin domain validation.
                  </p>
                </div>

                <div className="mt-6 rounded-lg border border-border/60 bg-muted/60 p-3 font-mono text-[11px] text-foreground overflow-x-auto">
                  <code>{`<script src="https://answerdesk-ai.vercel.app/widget.js" data-workspace="your-workspace" defer></script>`}</code>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing Section */}
        <section id="pricing" className="border-t border-border/80 py-24 sm:py-32">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <div className="mb-16 text-center max-w-xl mx-auto">
              <span className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">
                Predictable Billing
              </span>
              <h2 className="mt-2 text-2xl sm:text-4xl font-bold tracking-tight text-foreground">
                Simple, transparent pricing
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Start for free with your documentation. Upgrade anytime as your traffic grows.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto items-stretch">
              {/* Free Plan */}
              <div className="rounded-2xl border border-border/80 bg-card p-8 flex flex-col justify-between shadow-xs hover:border-border transition-colors">
                <div>
                  <h3 className="text-base font-semibold text-foreground">Starter</h3>
                  <p className="mt-1 text-xs text-muted-foreground">For small websites, testing, and prototypes.</p>
                  
                  <div className="mt-6 flex items-baseline gap-1">
                    <span className="text-4xl font-bold tracking-tight">₹0</span>
                    <span className="text-xs text-muted-foreground font-medium">/ month</span>
                  </div>

                  <ul className="mt-8 space-y-3.5 text-xs text-muted-foreground">
                    <li className="flex items-center gap-2.5">
                      <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                      <span><strong>50 AI answers</strong> every month</span>
                    </li>
                    <li className="flex items-center gap-2.5">
                      <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                      <span>Up to 5 source documents (PDF, TXT, MD)</span>
                    </li>
                    <li className="flex items-center gap-2.5">
                      <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                      <span>5MB maximum file size</span>
                    </li>
                    <li className="flex items-center gap-2.5">
                      <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                      <span>English, Hindi & Marathi processing</span>
                    </li>
                    <li className="flex items-center gap-2.5">
                      <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                      <span>Standard web chat widget</span>
                    </li>
                  </ul>
                </div>

                <div className="mt-10">
                  <Suspense fallback={<StarterPricingButtonSkeleton />}>
                    <StarterPricingButton />
                  </Suspense>
                </div>
              </div>

              {/* Pro Plan */}
              <div className="relative rounded-2xl border-2 border-primary/90 bg-card p-8 flex flex-col justify-between shadow-xl shadow-primary/5">
                <div className="absolute -top-3 right-6 rounded-full bg-primary px-3 py-0.5 text-[10px] font-semibold tracking-wide text-primary-foreground uppercase shadow-xs">
                  Most Popular
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold text-foreground">Pro</h3>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">For businesses delivering 24/7 customer support.</p>
                  
                  <div className="mt-6 flex items-baseline gap-1">
                    <span className="text-4xl font-bold tracking-tight">
                      {process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE || '₹999'}
                    </span>
                    <span className="text-xs text-muted-foreground font-medium">/ month</span>
                  </div>

                  <ul className="mt-8 space-y-3.5 text-xs text-muted-foreground">
                    <li className="flex items-center gap-2.5">
                      <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                      <span className="text-foreground font-medium"><strong>1,000 AI answers</strong> every month</span>
                    </li>
                    <li className="flex items-center gap-2.5">
                      <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                      <span><strong>500 questions/day</strong> burst protection</span>
                    </li>
                    <li className="flex items-center gap-2.5">
                      <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                      <span>Up to 50 knowledge documents (20MB each)</span>
                    </li>
                    <li className="flex items-center gap-2.5">
                      <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                      <span>Strict origin domain security locking</span>
                    </li>
                    <li className="flex items-center gap-2.5">
                      <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                      <span>Priority semantic search & instant re-indexing</span>
                    </li>
                    <li className="flex items-center gap-2.5">
                      <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                      <span>Cancel anytime (retains access through period end)</span>
                    </li>
                  </ul>
                </div>

                <div className="mt-10">
                  <Suspense fallback={<ProPricingButtonSkeleton />}>
                    <ProPricingButton />
                  </Suspense>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Frequently Asked Questions */}
        <section className="border-t border-border/80 py-20 bg-muted/10">
          <div className="mx-auto max-w-4xl px-4 sm:px-6">
            <div className="text-center mb-14">
              <h2 className="text-2xl font-bold tracking-tight text-foreground">
                Frequently Asked Questions
              </h2>
              <p className="mt-2 text-xs sm:text-sm text-muted-foreground">
                Everything you need to know about setting up AnswerDesk.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="rounded-xl border border-border/80 bg-card p-5">
                <h3 className="text-xs sm:text-sm font-semibold flex items-center gap-2 text-foreground">
                  <HelpCircle className="h-4 w-4 text-primary shrink-0" />
                  How does the AI prevent hallucinations?
                </h3>
                <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                  AnswerDesk performs strict Retrieval-Augmented Generation (RAG). Queries without a strong semantic match in your docs trigger an honest refusal rather than speculative guesses.
                </p>
              </div>

              <div className="rounded-xl border border-border/80 bg-card p-5">
                <h3 className="text-xs sm:text-sm font-semibold flex items-center gap-2 text-foreground">
                  <HelpCircle className="h-4 w-4 text-primary shrink-0" />
                  How do I add the widget to my website?
                </h3>
                <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                  Just copy the 1-line script tag from your dashboard and paste it right before the closing &lt;/body&gt; tag on any website (WordPress, Shopify, React, or static HTML).
                </p>
              </div>

              <div className="rounded-xl border border-border/80 bg-card p-5">
                <h3 className="text-xs sm:text-sm font-semibold flex items-center gap-2 text-foreground">
                  <HelpCircle className="h-4 w-4 text-primary shrink-0" />
                  What happens when I cancel my Pro plan?
                </h3>
                <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                  Auto-renewal is cancelled immediately with zero future charges. You keep full 100% Pro access until the end of your prepaid 30-day billing period.
                </p>
              </div>

              <div className="rounded-xl border border-border/80 bg-card p-5">
                <h3 className="text-xs sm:text-sm font-semibold flex items-center gap-2 text-foreground">
                  <HelpCircle className="h-4 w-4 text-primary shrink-0" />
                  Is my data secure and isolated?
                </h3>
                <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                  Yes. All database operations strictly filter by workspace ID with automated tenancy hooks. Your documents and vectors are never accessible by other workspaces.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/80 py-10 bg-card text-xs text-muted-foreground">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2.5">
            <Image
              src="/icon.svg"
              alt="AnswerDesk Logo"
              width={20}
              height={20}
              className="rounded-sm"
            />
            <span className="font-semibold text-foreground tracking-tight">AnswerDesk</span>
            <span className="text-muted-foreground/60">·</span>
            <span>AI Customer Support</span>
          </div>

          <div className="flex items-center gap-6">
            <Link href="#features" className="hover:text-foreground transition-colors">
              Features
            </Link>
            <Link href="#pricing" className="hover:text-foreground transition-colors">
              Pricing
            </Link>
            <Link href="/widget/demo" target="_blank" className="hover:text-foreground transition-colors">
              Live Demo
            </Link>
          </div>

          <div className="text-[11px] text-muted-foreground">
            &copy; 2026 AnswerDesk. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
