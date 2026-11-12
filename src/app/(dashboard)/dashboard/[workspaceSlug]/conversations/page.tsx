import { Suspense } from 'react';
import { connection } from 'next/server';
import { verifyWorkspaceOwner } from '@/lib/auth/dal';
import { ConversationsClient } from './conversations-client';

interface PageProps {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{ filter?: string }>;
}

export default function ConversationsPage(props: PageProps) {
  return (
    <div className="max-w-6xl mx-auto w-full">
      <Suspense fallback={<ConversationsSkeleton />}>
        <ConversationsData params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

async function ConversationsData({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{ filter?: string }>;
}) {
  await connection();
  const { workspaceSlug } = await params;
  const { filter } = await searchParams;

  // Strict owner authorization check via DAL
  await verifyWorkspaceOwner(workspaceSlug);

  const initialFilter = filter === 'unanswered' ? 'unanswered' : 'all';

  return (
    <ConversationsClient
      workspaceSlug={workspaceSlug}
      initialFilter={initialFilter}
    />
  );
}

function ConversationsSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-10 w-48 bg-muted/40 rounded" />
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 rounded-xl border border-border bg-card/40" />
        ))}
      </div>
    </div>
  );
}
