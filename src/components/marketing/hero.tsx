import { Suspense } from 'react';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { HeroCtaButton, HeroCtaButtonSkeleton } from './pricing-cta';
import { ArrowRight, Bot, CheckCircle2, Sparkles } from 'lucide-react';

export function MarketingHero() {
  return (
    <section className="relative overflow-hidden pt-20 pb-16 sm:pt-28 sm:pb-24">
      {/* Ambient background glow */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center overflow-hidden"
        aria-hidden="true"
      >
        <div className="h-[420px] w-[650px] rounded-full bg-gradient-to-tr from-blue-500/15 via-indigo-500/10 to-violet-500/15 blur-3xl" />
      </div>

      <div className="mx-auto max-w-5xl px-4 sm:px-6 text-center">
        {/* Modern Pill Badge */}
        <div className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-card/60 px-3.5 py-1.5 text-xs font-medium text-foreground backdrop-blur-md shadow-xs mb-8 hover:border-border transition-colors">
          <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-semibold">Next-Gen Customer Support</span>
          <span className="text-muted-foreground">•</span>
          <span className="text-muted-foreground">Multi-Tenant & Strictly Grounded</span>
        </div>

        {/* Hero Title */}
        <h1 className="text-4xl sm:text-6xl font-bold tracking-tight text-foreground leading-[1.12]">
          AI customer support, <br className="hidden sm:inline" />
          <span className="bg-gradient-to-r from-foreground via-foreground/90 to-muted-foreground bg-clip-text text-transparent">
            grounded in your documentation.
          </span>
        </h1>

        {/* Hero Subtitle */}
        <p className="mt-6 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          Upload manuals, policies, and FAQs. AnswerDesk indexes your knowledge base with vector search, answers customer questions with direct source citations, and never hallucinates.
        </p>

        {/* CTAs */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Suspense fallback={<HeroCtaButtonSkeleton />}>
            <HeroCtaButton />
          </Suspense>
          <Link
            href="/widget/demo"
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: 'outline', size: 'default' }) + ' gap-1.5'}
          >
            <Sparkles className="h-4 w-4 text-primary" />
            <span>Try Public Demo</span>
          </Link>
          <Link
            href="#pricing"
            className={buttonVariants({ variant: 'ghost', size: 'default' }) + ' gap-1'}
          >
            <span>View Pricing</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {/* Feature Badges Row */}
        <div className="mt-12 flex flex-wrap items-center justify-center gap-6 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            No credit card required
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            English, Hindi & Marathi
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            1-Line website embed
          </span>
        </div>

        {/* Interactive Product Mockup Showcase */}
        <div className="mt-14 mx-auto max-w-3xl rounded-xl border border-border/80 bg-card/70 p-2 shadow-2xl backdrop-blur-xl sm:p-3">
          {/* Mock Browser Topbar */}
          <div className="flex items-center justify-between border-b border-border/60 px-3 pb-2.5 pt-1">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
            </div>
            <div className="flex items-center gap-2 rounded-md bg-muted/40 px-3 py-1 font-mono text-[11px] text-muted-foreground border border-border/40">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span>answerdesk.ai/demo-widget</span>
            </div>
            <div className="text-[11px] font-medium text-muted-foreground">
              Live Preview
            </div>
          </div>

          {/* Mock Chat Body */}
          <div className="p-4 sm:p-6 text-left space-y-4 bg-background/50 rounded-b-lg">
            {/* User message */}
            <div className="flex justify-end">
              <div className="max-w-md rounded-2xl bg-foreground text-background px-4 py-2.5 text-xs font-medium shadow-xs">
                What is your policy if an item arrives damaged?
              </div>
            </div>

            {/* AI Assistant Response */}
            <div className="flex items-start gap-3 max-w-xl">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-xs">
                <Bot className="h-4 w-4" />
              </div>
              <div className="rounded-2xl border border-border/80 bg-card px-4 py-3 text-xs leading-relaxed text-foreground shadow-xs">
                <p>
                  Damaged shipments are eligible for an immediate replacement or full refund within <strong>48 hours</strong> of delivery. Please provide a photo of the package and your order receipt.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
