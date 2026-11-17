import { Suspense } from 'react';
import { Header } from '@/components/common/header';
import { MarketingHero } from '@/components/marketing/hero';
import Link from 'next/link';
import { Check } from 'lucide-react';
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
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded bg-foreground text-[11px] font-bold text-background">
            A
          </span>
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
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <Suspense fallback={<HeaderSkeleton />}>
        <Header />
      </Suspense>
      
      <main className="flex-1">
        <MarketingHero />

        {/* Features Section */}
        <section id="features" className="border-t border-border py-20">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <div className="mb-12">
              <p className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">
                Architecture
              </p>
              <h2 className="mt-2 text-xl sm:text-2xl font-semibold tracking-tight">
                Designed for precision and multi-tenant security
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div className="rounded border border-border p-5 bg-card">
                <span className="font-mono text-xs text-muted-foreground">01</span>
                <h3 className="mt-3 text-sm font-semibold">Strict Multi-Tenant Scoping</h3>
                <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                  Every document, indexed section, and conversation is strictly isolated by workspace ID at the database layer.
                </p>
              </div>

              <div className="rounded border border-border p-5 bg-card">
                <span className="font-mono text-xs text-muted-foreground">02</span>
                <h3 className="mt-3 text-sm font-semibold">Strict Document Grounding</h3>
                <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                  Responses are generated from grounded knowledge sources with direct citations. When documentation does not cover a topic, the assistant indicates it cannot answer.
                </p>
              </div>

              <div className="rounded border border-border p-5 bg-card">
                <span className="font-mono text-xs text-muted-foreground">03</span>
                <h3 className="mt-3 text-sm font-semibold">One-Script Embed Widget</h3>
                <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                  Embed on any external site with an iframe snippet. Protected by origin validation and per-visitor rate limits.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing Section */}
        <section id="pricing" className="border-t border-border py-20 bg-muted/20">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <div className="mb-12 text-center">
              <p className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">
                Transparent Plans
              </p>
              <h2 className="mt-2 text-xl sm:text-2xl font-semibold tracking-tight">
                Simple, deterministic pricing
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 max-w-3xl mx-auto">
              {/* Free Plan */}
              <div className="rounded border border-border bg-card p-6 flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-semibold">Starter</h3>
                  <p className="mt-1 text-xs text-muted-foreground">For small teams and prototypes.</p>
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-3xl font-semibold">₹0</span>
                    <span className="text-xs text-muted-foreground">/ month</span>
                  </div>

                  <ul className="mt-6 space-y-3 text-xs text-muted-foreground">
                    <li className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-foreground" />
                      <span>100 messages / month</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-foreground" />
                      <span>Up to 5 source documents (PDF, TXT, MD)</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-foreground" />
                      <span>5MB max file size</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-foreground" />
                      <span>Semantic knowledge search</span>
                    </li>
                  </ul>
                </div>

                <div className="mt-8">
                  <Suspense fallback={<StarterPricingButtonSkeleton />}>
                    <StarterPricingButton />
                  </Suspense>
                </div>
              </div>

              {/* Pro Plan */}
              <div className="rounded border border-foreground bg-card p-6 flex flex-col justify-between shadow-xs">
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Pro</h3>
                    <span className="rounded bg-foreground px-2 py-0.5 text-[10px] font-medium text-background">
                      Recommended
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">For production customer support.</p>
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-3xl font-semibold">{process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE || '₹999'}</span>
                    <span className="text-xs text-muted-foreground">/ month</span>
                    <span className="ml-2 text-[10px] font-medium px-1.5 py-0.5 rounded border border-border text-muted-foreground bg-muted">
                      Test Mode
                    </span>
                  </div>

                  <ul className="mt-6 space-y-3 text-xs text-muted-foreground">
                    <li className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-foreground" />
                      <span className="text-foreground">2,500 messages / month</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-foreground" />
                      <span>Up to 50 source documents</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-foreground" />
                      <span>20MB max file size</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-foreground" />
                      <span>Custom domain origin validation</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-foreground" />
                      <span>Priority document processing queue</span>
                    </li>
                  </ul>
                </div>

                <div className="mt-8">
                  <Suspense fallback={<ProPricingButtonSkeleton />}>
                    <ProPricingButton />
                  </Suspense>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
        <div className="mx-auto max-w-5xl px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© 2026 AnswerDesk. Strictly grounded support intelligence.</p>
          <div className="flex items-center gap-4">
            <Link href="#features" className="hover:text-foreground">Architecture</Link>
            <Link href="#pricing" className="hover:text-foreground">Pricing</Link>
            <Link href="/login" className="hover:text-foreground">Sign In</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
