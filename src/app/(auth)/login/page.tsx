import { Suspense } from 'react';
import Image from 'next/image';
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
    <div className="flex min-h-screen items-center justify-center bg-background px-4 relative overflow-hidden">
      {/* Ambient background glow */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-primary/10 blur-[120px] rounded-full" />
      <Suspense fallback={null}>
        <LoggedInRedirect />
      </Suspense>
      <div className="w-full max-w-sm rounded-2xl border border-border/80 bg-card/90 backdrop-blur-md p-8 shadow-xl relative z-10">
        <div className="mb-6 text-center">
          <Link href="/" className="inline-flex items-center gap-2.5 mb-4 group">
            <Image
              src="/icon.svg"
              alt="AnswerDesk Logo"
              width={28}
              height={28}
              className="rounded-lg shadow-2xs group-hover:scale-105 transition-transform"
              priority
            />
            <span className="text-base font-bold tracking-tight text-foreground">
              AnswerDesk
            </span>
          </Link>
          <h1 className="text-lg font-bold tracking-tight text-foreground">
            Sign in to AnswerDesk
          </h1>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            Manage your AI knowledge bases, monitor visitor conversations, and customize widgets.
          </p>
        </div>

        <form
          action={async () => {
            'use server';
            await signIn('google', { redirectTo: '/dashboard' });
          }}
        >
          <Button
            type="submit"
            variant="outline"
            className="w-full text-xs font-semibold h-10 rounded-xl border-border/80 shadow-2xs hover:bg-muted transition-all flex items-center justify-center gap-2.5"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
            >
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                fill="#EA4335"
              />
            </svg>
            <span>Continue with Google</span>
          </Button>
        </form>

        <p className="mt-6 text-center text-[11px] text-muted-foreground leading-normal">
          By signing in, you agree to workspace tenant isolation and data protection policies.
        </p>
      </div>
    </div>
  );
}

