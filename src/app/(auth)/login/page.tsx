import { Suspense } from 'react';
import { signIn, auth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';

async function LoggedInRedirect() {
  await connection();
  const session = await auth();
  if (session?.user?.id) {
    redirect('/dashboard');
  }
  return null;
}

export default async function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Suspense fallback={null}>
        <LoggedInRedirect />
      </Suspense>
      <div className="w-full max-w-sm rounded border border-border bg-card p-6 shadow-xs">
        <div className="mb-6">
          <Link href="/" className="inline-flex items-center gap-2 mb-4">
            <span className="flex h-5 w-5 items-center justify-center rounded bg-foreground text-[11px] font-bold text-background">
              A
            </span>
            <span className="text-sm font-semibold tracking-tight text-foreground">
              AnswerDesk
            </span>
          </Link>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            Sign in to your account
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Authenticate with Google to manage your workspaces and knowledge bases.
          </p>
        </div>

        <form
          action={async () => {
            'use server';
            await signIn('google', { redirectTo: '/dashboard' });
          }}
        >
          <Button type="submit" variant="outline" className="w-full text-xs font-medium h-9">
            <svg
              className="mr-2 h-4 w-4"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
            </svg>
            Continue with Google
          </Button>
        </form>

        <p className="mt-6 text-center text-[11px] text-muted-foreground leading-normal">
          By signing in, you agree to workspace scoping and data isolation policies.
        </p>
      </div>
    </div>
  );
}

