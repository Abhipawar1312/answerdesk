import { Suspense } from 'react';
import { connection } from 'next/server';
import { verifyWorkspaceOwner } from '@/lib/auth/dal';
import { connectDB } from '@/lib/db/mongoose';
import {
  countRecentWorkspaceTestMessages,
  countWorkspaceDocuments,
} from '@/lib/db/scoped-queries';
import { TestChatClient } from './test-chat-client';

export default function TestChatPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  return (
    <Suspense fallback={<TestChatSkeleton />}>
      <TestChatData params={params} />
    </Suspense>
  );
}

async function TestChatData({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  await connection();
  const { workspaceSlug } = await params;
  const { workspace } = await verifyWorkspaceOwner(workspaceSlug);

  await connectDB();

  const recentHourlyCount = await countRecentWorkspaceTestMessages(workspace._id, 3600 * 1000);
  const activeDocCount = await countWorkspaceDocuments(workspace._id);

  return (
    <TestChatClient
      workspaceSlug={workspace.slug}
      workspaceName={workspace.name}
      initialHourlyCount={recentHourlyCount}
      hasActiveDocs={activeDocCount > 0}
    />
  );
}

function TestChatSkeleton() {
  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem-2rem)] sm:h-[calc(100vh-3.5rem-3rem)] w-full max-w-6xl mx-auto border border-border rounded-xl bg-card overflow-hidden animate-pulse">
      <div className="p-4 border-b border-border bg-muted/20 h-14" />
      <div className="flex-1 p-4 space-y-4">
        <div className="h-16 w-3/4 bg-muted/40 rounded-xl" />
        <div className="h-16 w-1/2 ml-auto bg-muted/40 rounded-xl" />
      </div>
      <div className="p-4 border-t border-border bg-card h-20" />
    </div>
  );
}
