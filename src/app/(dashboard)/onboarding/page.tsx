import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { auth } from '@/lib/auth';
import { getUserWorkspace } from '@/lib/auth/dal';
import { Header } from '@/components/common/header';
import { OnboardingForm } from './onboarding-form';

export default async function OnboardingPage() {
  await connection();
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/login');
  }

  const workspace = await getUserWorkspace(session.user.id);

  if (workspace) {
    redirect(`/dashboard/${workspace.slug}`);
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <Header />
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md rounded border border-border bg-card p-6 shadow-xs">
          <div className="mb-6">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Setup
            </span>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground">
              Create your workspace
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Get started by naming your workspace. You can invite your team later.
            </p>
          </div>
          <OnboardingForm />
        </div>
      </div>
    </div>
  );
}
