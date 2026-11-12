import { Suspense } from 'react';
import { connection } from 'next/server';
import { verifyWorkspaceOwner } from '@/lib/auth/dal';
import { connectDB } from '@/lib/db/mongoose';
import { listWorkspaceUnansweredQuestions } from '@/lib/db/scoped-queries';
import { UnansweredClient } from './unanswered-client';

interface PageProps {
  params: Promise<{ workspaceSlug: string }>;
}

export default function UnansweredQuestionsPage(props: PageProps) {
  return (
    <Suspense fallback={<UnansweredSkeleton />}>
      <UnansweredData params={props.params} />
    </Suspense>
  );
}

async function UnansweredData({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  await connection();
  const { workspaceSlug } = await params;

  // Strict owner authorization check via DAL
  const { workspace } = await verifyWorkspaceOwner(workspaceSlug);

  await connectDB();
  const rawQuestions = await listWorkspaceUnansweredQuestions(workspace._id, { limit: 50 });

  const serializedQuestions = rawQuestions.map((q) => ({
    messageId: q.messageId,
    conversationId: q.conversationId,
    question: q.question,
    askedAt: q.askedAt.toISOString(),
    visitorId: q.visitorId,
    isTest: q.isTest ?? false,
  }));

  return (
    <div className="max-w-6xl mx-auto w-full">
      <UnansweredClient
        workspaceSlug={workspaceSlug}
        unansweredQuestions={serializedQuestions}
      />
    </div>
  );
}

function UnansweredSkeleton() {
  return (
    <div className="p-6 max-w-5xl mx-auto w-full space-y-6 animate-pulse">
      <div className="h-8 w-64 bg-muted rounded" />
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 rounded-xl border border-border bg-card/40" />
        ))}
      </div>
    </div>
  );
}
