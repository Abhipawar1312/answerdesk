import { verifyWorkspaceOwner } from '@/lib/auth/dal';
import { connection } from 'next/server';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';

export const instant = false;

export default async function WorkspaceDashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ workspaceSlug: string }>;
}) {
  await connection();
  const { workspaceSlug } = await params;
  const { workspace, session } = await verifyWorkspaceOwner(workspaceSlug);

  return (
    <DashboardShell
      workspace={{
        name: workspace.name,
        slug: workspace.slug,
        plan: workspace.plan,
        monthlyMessageCount: workspace.monthlyMessageCount,
        messageLimit: workspace.messageLimit,
      }}
      sessionUser={session.user}
    >
      {children}
    </DashboardShell>
  );
}

