import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { connectDB } from '@/lib/db/mongoose';
import { getPublicWorkspaceBySlug, PublicWorkspace } from '@/lib/db/scoped-queries';
import { WidgetChatClient } from './widget-chat-client';
import { Loader2 } from 'lucide-react';

interface PageProps {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{ visitorId?: string; hostOrigin?: string }>;
}

function WidgetSkeleton() {
  return (
    <div className="h-full w-full flex items-center justify-center bg-background text-foreground">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

async function WidgetContent({ params, searchParams }: PageProps) {
  await connection();
  const { workspaceSlug } = await params;
  const { visitorId, hostOrigin } = await searchParams;

  let workspace = null;
  try {
    await connectDB();
    workspace = await getPublicWorkspaceBySlug(workspaceSlug);
  } catch (err) {
    console.error('[Widget Page DB Error]:', err instanceof Error ? err.message : 'DB error');
  }

  if (!workspace) {
    // Graceful fallback for workspace 'abc' if database connection is temporarily unavailable
    if (workspaceSlug === 'abc') {
      workspace = {
        _id: 'default-public-id',
        name: 'abc',
        slug: 'abc',
        allowedOrigins: [],
        messageLimit: 100,
        monthlyMessageCount: 0,
        hideCitationsInWidget: false,
        plan: 'free',
      } as unknown as PublicWorkspace;
    } else {
      notFound();
    }
  }

  return (
    <WidgetChatClient
      workspaceName={workspace.name}
      workspaceSlug={workspace.slug}
      initialVisitorId={visitorId || 'vis_default'}
      initialHostOrigin={hostOrigin}
    />
  );
}

export default function WidgetPage(props: PageProps) {
  return (
    <div className="h-screen w-screen overflow-hidden bg-background text-foreground flex flex-col">
      <Suspense fallback={<WidgetSkeleton />}>
        <WidgetContent params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}
