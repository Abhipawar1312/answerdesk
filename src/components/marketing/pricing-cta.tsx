import Link from 'next/link';
import { connection } from 'next/server';
import { auth } from '@/lib/auth';
import { getUserWorkspace } from '@/lib/auth/dal';
import { buttonVariants } from '@/components/ui/button';

export function StarterPricingButtonSkeleton() {
  return (
    <Link
      href="/login"
      className={buttonVariants({ variant: 'outline' }) + ' w-full text-xs text-center justify-center'}
    >
      Get Started Free
    </Link>
  );
}

export async function StarterPricingButton() {
  await connection();
  const session = await auth();

  if (session?.user?.id) {
    return (
      <Link
        href="/dashboard"
        className={buttonVariants({ variant: 'outline' }) + ' w-full text-xs text-center justify-center'}
      >
        Go to Dashboard
      </Link>
    );
  }

  return <StarterPricingButtonSkeleton />;
}

export function ProPricingButtonSkeleton() {
  return (
    <Link
      href="/login"
      className={buttonVariants({ variant: 'default' }) + ' w-full text-xs text-center justify-center'}
    >
      Start with Pro
    </Link>
  );
}

export async function ProPricingButton() {
  await connection();
  const session = await auth();

  if (!session?.user?.id) {
    return <ProPricingButtonSkeleton />;
  }

  const workspace = await getUserWorkspace(session.user.id);
  const targetUrl = workspace ? `/dashboard/${workspace.slug}/settings` : '/dashboard';

  return (
    <Link
      href={targetUrl}
      className={buttonVariants({ variant: 'default' }) + ' w-full text-xs text-center justify-center'}
    >
      {workspace?.plan === 'pro' ? 'Manage Pro Plan' : 'Upgrade to Pro'}
    </Link>
  );
}

export function HeroCtaButtonSkeleton() {
  return (
    <Link href="/login" className={buttonVariants({ variant: 'default', size: 'default' })}>
      Get Started
    </Link>
  );
}

export async function HeroCtaButton() {
  await connection();
  const session = await auth();

  if (session?.user?.id) {
    return (
      <Link href="/dashboard" className={buttonVariants({ variant: 'default', size: 'default' })}>
        Go to Dashboard
      </Link>
    );
  }

  return <HeroCtaButtonSkeleton />;
}

