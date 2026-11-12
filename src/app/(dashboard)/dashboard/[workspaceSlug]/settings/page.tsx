import { Suspense } from 'react';
import { connection } from 'next/server';
import { verifyWorkspaceOwner } from '@/lib/auth/dal';
import { SettingsClient } from './settings-client';

interface PageProps {
  params: Promise<{ workspaceSlug: string }>;
}

export default function SettingsPage(props: PageProps) {
  return (
    <Suspense fallback={<SettingsSkeleton />}>
      <SettingsData params={props.params} />
    </Suspense>
  );
}

async function SettingsData({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  await connection();
  const { workspaceSlug } = await params;

  // Strict owner authorization check via DAL
  const { workspace } = await verifyWorkspaceOwner(workspaceSlug);

  return (
    <div className="max-w-5xl mx-auto w-full">
      <SettingsClient
        workspaceSlug={workspace.slug}
        workspaceName={workspace.name}
        allowedOrigins={workspace.allowedOrigins || []}
        hideCitationsInWidget={Boolean(workspace.hideCitationsInWidget)}
        plan={workspace.plan}
        monthlyMessageCount={workspace.monthlyMessageCount || 0}
        messageLimit={workspace.messageLimit || 100}
      />
    </div>
  );
}

function SettingsSkeleton() {
  return (
    <div className="max-w-5xl mx-auto w-full space-y-8 animate-pulse">
      <div className="h-8 w-48 bg-muted rounded" />
      <div className="space-y-6">
        <div className="h-44 rounded-xl border border-border bg-card/40" />
        <div className="h-56 rounded-xl border border-border bg-card/40" />
      </div>
    </div>
  );
}
