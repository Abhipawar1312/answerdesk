import { Suspense } from 'react';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { HeroCtaButton, HeroCtaButtonSkeleton } from './pricing-cta';

export function MarketingHero() {
  return (
    <section className="mx-auto max-w-4xl px-4 py-24 sm:py-32 text-center">
      <div className="inline-flex items-center rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground mb-6">
        Multi-tenant Knowledge Retrieval
      </div>
      <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight text-foreground">
        AI customer support, grounded in your documentation.
      </h1>
      <p className="mt-6 text-sm sm:text-base text-muted-foreground max-w-2xl mx-auto leading-relaxed">
        Upload manuals, policies, and FAQs. AnswerDesk indexes your knowledge base with vector search
        and answers customer inquiries with direct source citations, explicitly indicating when information is not found in your documentation.
      </p>
      <div className="mt-8 flex items-center justify-center gap-3">
        <Suspense fallback={<HeroCtaButtonSkeleton />}>
          <HeroCtaButton />
        </Suspense>
        <Link href="#pricing" className={buttonVariants({ variant: 'outline', size: 'default' })}>
          View Pricing
        </Link>
      </div>
    </section>
  );
}
