import { Suspense } from 'react';
import { connection } from 'next/server';
import { verifyWorkspaceOwner } from '@/lib/auth/dal';
import {
  countWorkspaceDocuments,
  countWorkspaceConversations,
  countWorkspaceUnansweredMessages,
} from '@/lib/db/scoped-queries';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { FileText, MessageSquare, AlertCircle } from 'lucide-react';

export default function WorkspaceOverviewPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  return (
    <div className="space-y-6 max-w-6xl mx-auto w-full">
      {/* Title & Subtitle kept strictly outside Suspense — contains zero workspace data */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Overview
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Knowledge base health, conversation volume, and unanswered queries.
        </p>
      </div>

      <Suspense fallback={<OverviewSkeleton />}>
        <OverviewData params={params} />
      </Suspense>
    </div>
  );
}

async function OverviewData({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  await connection();
  const { workspaceSlug } = await params;
  const { workspace } = await verifyWorkspaceOwner(workspaceSlug);

  // Redundant connectDB() removed — verifyWorkspaceOwner connects internally.
  const [documentCount, conversationCount, unansweredCount] = await Promise.all([
    countWorkspaceDocuments(workspace._id),
    countWorkspaceConversations(workspace._id),
    countWorkspaceUnansweredMessages(workspace._id),
  ]);

  return (
    <div className="space-y-6">
      {/* Action Buttons Row — primary action uses high-contrast default variant */}
      <div className="flex flex-wrap items-center justify-start sm:justify-end gap-2">
        <Link
          href={`/dashboard/${workspace.slug}/documents`}
          className={buttonVariants({ variant: 'default', size: 'sm' }) + ' text-xs h-8'}
        >
          View Documents
        </Link>
        <Link
          href={`/dashboard/${workspace.slug}/chat`}
          className={buttonVariants({ variant: 'outline', size: 'sm' }) + ' text-xs h-8'}
        >
          Test Chat
        </Link>
        <Link
          href={`/dashboard/${workspace.slug}/widget`}
          className={buttonVariants({ variant: 'outline', size: 'sm' }) + ' text-xs h-8'}
        >
          Embed Widget
        </Link>
      </div>

      {/* Metrics Row — body text at 12px (text-xs) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded border border-border bg-card p-4">
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-xs font-medium">Source Documents</span>
            <FileText className="h-4 w-4" />
          </div>
          <div className="text-2xl font-semibold tracking-tight font-mono">
            {documentCount}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Ready for chatbot answers
          </p>
        </div>

        <div className="rounded border border-border bg-card p-4">
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-xs font-medium">Total Conversations</span>
            <MessageSquare className="h-4 w-4" />
          </div>
          <div className="text-2xl font-semibold tracking-tight font-mono">
            {conversationCount}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Customer chat sessions
          </p>
        </div>

        <div className="rounded border border-border bg-card p-4">
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-xs font-medium">Unanswered Questions</span>
            <AlertCircle className="h-4 w-4" />
          </div>
          <div className="text-2xl font-semibold tracking-tight font-mono">
            {unansweredCount}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Queries where documents lacked answers
          </p>
        </div>
      </div>

      {/* Quick Setup Card */}
      <div className="rounded border border-border bg-muted/20 p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Getting Started
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="rounded border border-border bg-card p-3.5">
            <h3 className="font-medium text-foreground">1. Documents Knowledge Base</h3>
            <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
              Review source documents, text FAQs, and manuals for your chatbot.
            </p>
            <Link
              href={`/dashboard/${workspace.slug}/documents`}
              className="inline-block mt-3 text-xs font-medium text-foreground hover:underline"
            >
              View Documents →
            </Link>
          </div>

          <div className="rounded border border-border bg-card p-3.5">
            <h3 className="font-medium text-foreground">2. Add to your Website</h3>
            <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
              Configure allowed domains and paste a one-line script tag into your web application.
            </p>
            <Link
              href={`/dashboard/${workspace.slug}/widget`}
              className="inline-block mt-3 text-xs font-medium text-foreground hover:underline"
            >
              Widget Settings →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Action Buttons Skeleton */}
      <div className="flex items-center justify-end gap-2">
        <div className="h-8 w-28 bg-muted/40 rounded" />
        <div className="h-8 w-24 bg-muted/40 rounded" />
        <div className="h-8 w-32 bg-muted/40 rounded" />
      </div>

      {/* Metrics Row Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-28 rounded border border-border bg-card p-4">
            <div className="h-3.5 w-28 bg-muted/40 rounded mb-4" />
            <div className="h-7 w-12 bg-muted/60 rounded mb-2" />
            <div className="h-3.5 w-36 bg-muted/40 rounded" />
          </div>
        ))}
      </div>

      {/* Quick Setup Card Skeleton */}
      <div className="h-44 rounded border border-border bg-muted/20 p-5" />
    </div>
  );
}
