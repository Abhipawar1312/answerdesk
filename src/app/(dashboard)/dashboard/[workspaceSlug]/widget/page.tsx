import { Suspense } from 'react';
import { connection } from 'next/server';
import { verifyWorkspaceOwner } from '@/lib/auth/dal';
import { WidgetPreviewClient } from './widget-preview-client';

interface PageProps {
  params: Promise<{ workspaceSlug: string }>;
}

export default function EmbedWidgetPage(props: PageProps) {
  return (
    <Suspense fallback={<WidgetSkeleton />}>
      <WidgetData params={props.params} />
    </Suspense>
  );
}

async function WidgetData({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  await connection();
  const { workspaceSlug } = await params;

  // Strict owner authorization check via DAL
  const { workspace } = await verifyWorkspaceOwner(workspaceSlug);

  return (
    <div className="max-w-6xl mx-auto w-full">
      <WidgetPreviewClient
        workspaceSlug={workspace.slug}
        workspaceName={workspace.name}
        allowedOrigins={workspace.allowedOrigins || []}
      />
    </div>
  );
}

function WidgetSkeleton() {
  return (
    <div className="max-w-6xl mx-auto w-full space-y-6 animate-pulse">
      <div className="h-8 w-48 bg-muted rounded" />
      <div className="h-64 rounded-xl border border-border bg-card/40" />
    </div>
  );
}
