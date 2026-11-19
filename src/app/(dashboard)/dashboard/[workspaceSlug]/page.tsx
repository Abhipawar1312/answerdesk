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
import {
  FileText,
  MessageSquare,
  AlertCircle,
  ArrowRight,
  Upload,
  Play,
  Code2,
  CheckCircle,
} from 'lucide-react';

export default function WorkspaceOverviewPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  return (
    <div className="space-y-8 max-w-6xl mx-auto w-full">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-border/60">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            Overview
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Real-time knowledge base health, conversation volume, and customer insights.
          </p>
        </div>
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

  const [documentCount, conversationCount, unansweredCount] = await Promise.all([
    countWorkspaceDocuments(workspace._id),
    countWorkspaceConversations(workspace._id),
    countWorkspaceUnansweredMessages(workspace._id),
  ]);

  return (
    <div className="space-y-8">
      {/* Quick Action Navigation Buttons */}
      <div className="flex flex-wrap items-center justify-start sm:justify-end gap-2.5">
        <Link
          href={`/dashboard/${workspace.slug}/documents`}
          className={buttonVariants({ variant: 'default', size: 'sm' }) + ' text-xs h-8 gap-1.5 shadow-xs'}
        >
          <Upload className="h-3.5 w-3.5" />
          <span>Upload Documents</span>
        </Link>
        <Link
          href={`/dashboard/${workspace.slug}/chat`}
          className={buttonVariants({ variant: 'outline', size: 'sm' }) + ' text-xs h-8 gap-1.5'}
        >
          <Play className="h-3.5 w-3.5 text-primary" />
          <span>Test Assistant</span>
        </Link>
        <Link
          href={`/dashboard/${workspace.slug}/widget`}
          className={buttonVariants({ variant: 'outline', size: 'sm' }) + ' text-xs h-8 gap-1.5'}
        >
          <Code2 className="h-3.5 w-3.5" />
          <span>Widget Snippet</span>
        </Link>
      </div>

      {/* Metrics Row — Modern Cards with Subtle Accents */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        {/* Metric 1 */}
        <div className="rounded-xl border border-border/80 bg-card p-5 shadow-xs hover:border-primary/40 transition-all group">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-muted-foreground">Source Documents</span>
            <div className="h-8 w-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center group-hover:scale-105 transition-transform">
              <FileText className="h-4 w-4" />
            </div>
          </div>
          <div className="text-3xl font-bold tracking-tight font-mono text-foreground">
            {documentCount}
          </div>
          <div className="flex items-center gap-1.5 mt-2 text-[11px] text-muted-foreground">
            <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
            <span>Indexed in Vector Database</span>
          </div>
        </div>

        {/* Metric 2 */}
        <div className="rounded-xl border border-border/80 bg-card p-5 shadow-xs hover:border-primary/40 transition-all group">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-muted-foreground">Total Conversations</span>
            <div className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center group-hover:scale-105 transition-transform">
              <MessageSquare className="h-4 w-4" />
            </div>
          </div>
          <div className="text-3xl font-bold tracking-tight font-mono text-foreground">
            {conversationCount}
          </div>
          <div className="flex items-center gap-1.5 mt-2 text-[11px] text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span>Customer interactions</span>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="rounded-xl border border-border/80 bg-card p-5 shadow-xs hover:border-primary/40 transition-all group">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-muted-foreground">Unanswered Inquiries</span>
            <div className="h-8 w-8 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center group-hover:scale-105 transition-transform">
              <AlertCircle className="h-4 w-4" />
            </div>
          </div>
          <div className="text-3xl font-bold tracking-tight font-mono text-foreground">
            {unansweredCount}
          </div>
          <div className="flex items-center gap-1.5 mt-2 text-[11px] text-muted-foreground">
            {unansweredCount > 0 ? (
              <span className="text-amber-500 font-medium">Documentation gaps to review</span>
            ) : (
              <span className="text-emerald-500 font-medium">All customer queries answered</span>
            )}
          </div>
        </div>
      </div>

      {/* Quick Setup Walkthrough Section */}
      <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-xs">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-border/60">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Launch Checklist
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              3 steps to have your AI support agent live on your production website.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-border/60 bg-muted/20 p-4 flex flex-col justify-between hover:border-border transition-colors">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                  1
                </span>
                <h3 className="text-xs font-semibold text-foreground">Knowledge Ingestion</h3>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed pl-7">
                Upload your company PDFs, policies, and FAQs. Documents are chunked and vectorized automatically.
              </p>
            </div>
            <div className="pl-7 pt-3">
              <Link
                href={`/dashboard/${workspace.slug}/documents`}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <span>Upload Documents</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-muted/20 p-4 flex flex-col justify-between hover:border-border transition-colors">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                  2
                </span>
                <h3 className="text-xs font-semibold text-foreground">Deploy Widget</h3>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed pl-7">
                Configure allowed website domains and embed the 1-line script tag on your site.
              </p>
            </div>
            <div className="pl-7 pt-3">
              <Link
                href={`/dashboard/${workspace.slug}/widget`}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <span>Embed Script</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="flex items-center justify-end gap-2">
        <div className="h-8 w-28 bg-muted/40 rounded-lg" />
        <div className="h-8 w-24 bg-muted/40 rounded-lg" />
        <div className="h-8 w-32 bg-muted/40 rounded-lg" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 rounded-xl border border-border bg-card p-5">
            <div className="h-3.5 w-28 bg-muted/40 rounded mb-4" />
            <div className="h-8 w-14 bg-muted/60 rounded mb-2" />
            <div className="h-3.5 w-36 bg-muted/40 rounded" />
          </div>
        ))}
      </div>

      <div className="h-52 rounded-2xl border border-border bg-card p-6" />
    </div>
  );
}
