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
    <div className="flex min-h-screen flex-col bg-background text-foreground relative overflow-hidden">
      {/* Subtle ambient background glow */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-primary/10 blur-[120px] rounded-full" />
      <Header />
      <div className="flex flex-1 items-center justify-center px-4 py-16 relative z-10">
        <div className="w-full max-w-md rounded-2xl border border-border/80 bg-card/90 backdrop-blur-md p-8 shadow-xl">
          <div className="mb-6">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase font-semibold bg-primary/10 text-primary border border-primary/20">
              Workspace Setup
            </span>
            <h1 className="mt-2.5 text-xl font-bold tracking-tight text-foreground">
              Create your workspace
            </h1>
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
              Name your organization or product to start grounding your autonomous customer support assistant.
            </p>
          </div>
          <OnboardingForm />
        </div>
      </div>
    </div>
  );
}
