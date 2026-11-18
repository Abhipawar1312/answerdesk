import Link from 'next/link';
import Image from 'next/image';
import { connection } from 'next/server';
import { ThemeToggle } from '@/components/common/theme-toggle';
import { buttonVariants } from '@/components/ui/button';
import { auth } from '@/lib/auth';
import { signOutAction } from '@/actions/auth';
import { LogOut } from 'lucide-react';

export async function Header() {
  await connection();
  const session = await auth();

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur-xs">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2.5">
            <Image
              src="/icon.svg"
              alt="AnswerDesk Logo"
              width={22}
              height={22}
              className="rounded-sm"
              priority
            />
            <span className="text-sm font-semibold tracking-tight text-foreground">
              AnswerDesk
            </span>
          </Link>
          <nav className="hidden sm:flex items-center gap-4 text-xs font-medium text-muted-foreground">
            <Link href="#features" className="hover:text-foreground transition-colors">
              Features
            </Link>
            <Link href="#pricing" className="hover:text-foreground transition-colors">
              Pricing
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          {session?.user ? (
            <div className="flex items-center gap-2.5">
              <Link
                href="/dashboard"
                className={buttonVariants({ variant: 'outline', size: 'sm' }) + ' h-8 text-xs font-medium'}
              >
                Dashboard
              </Link>
              <div className="hidden sm:flex flex-col text-right">
                <span className="text-xs font-medium text-foreground leading-tight">
                  {session.user.name || 'User'}
                </span>
                {session.user.email && (
                  <span className="text-[10px] text-muted-foreground leading-tight">
                    {session.user.email}
                  </span>
                )}
              </div>
              <form action={signOutAction}>
                <button
                  type="submit"
                  className={buttonVariants({ variant: 'ghost', size: 'sm' }) + ' h-8 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 cursor-pointer'}
                  title="Sign out"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Sign out</span>
                </button>
              </form>
            </div>
          ) : (
            <Link
              href="/login"
              className={buttonVariants({ variant: 'outline', size: 'sm' }) + ' h-8 text-xs font-medium'}
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
