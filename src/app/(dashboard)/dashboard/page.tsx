import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { auth } from '@/lib/auth';
import { getUserWorkspace } from '@/lib/auth/dal';

export default async function DashboardIndexPage() {
  await connection();
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/login');
  }

  const workspace = await getUserWorkspace(session.user.id);

  if (workspace) {
    redirect(`/dashboard/${workspace.slug}`);
  }

  redirect('/onboarding');
}
