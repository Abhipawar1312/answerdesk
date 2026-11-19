import { Suspense } from 'react';
import { connection } from 'next/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, User, Bot, AlertCircle, Bookmark, Clock } from 'lucide-react';
import { verifyWorkspaceOwner } from '@/lib/auth/dal';
import { connectDB } from '@/lib/db/mongoose';
import {
  getWorkspaceConversationById,
  getWorkspaceMessages,
} from '@/lib/db/scoped-queries';
import { Button } from '@/components/ui/button';
import { formatDateTime, formatTime } from '@/lib/date';
import { cleanAnswerText } from '@/services/citation-resolver';

interface PageProps {
  params: Promise<{
    workspaceSlug: string;
    id: string;
  }>;
}

export default function ConversationDetailPage(props: PageProps) {
  return (
    <Suspense fallback={<ConversationDetailSkeleton />}>
      <ConversationDetailData params={props.params} />
    </Suspense>
  );
}

async function ConversationDetailData({
  params,
}: {
  params: Promise<{ workspaceSlug: string; id: string }>;
}) {
  await connection();
  const { workspaceSlug, id } = await params;

  // Strict owner authorization check via DAL
  const { workspace } = await verifyWorkspaceOwner(workspaceSlug);

  await connectDB();
  const conversation = await getWorkspaceConversationById(workspace._id, id);
  if (!conversation) {
    notFound();
  }

  const messages = await getWorkspaceMessages(workspace._id, conversation._id);
  const formattedStarted = formatDateTime(conversation.startedAt);

  return (
    <div className="max-w-4xl mx-auto w-full space-y-6">
      {/* Back Link & Header */}
      <div className="flex items-center justify-between pb-4 border-b border-border/60">
        <div className="flex items-center gap-3">
          <Link href={`/dashboard/${workspaceSlug}/conversations`}>
            <Button
              variant="outline"
              size="icon"
              className="h-8.5 w-8.5 rounded-xl border-border/80 shadow-2xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
              {conversation.isTest ? 'Test Chat Session' : `Visitor ${conversation.visitorId.slice(0, 14)}`}
              {conversation.isTest && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-muted/60 text-muted-foreground border border-border/60">
                  Sandbox
                </span>
              )}
            </h1>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
              <Clock className="w-3.5 h-3.5" />
              Started on {formattedStarted}
            </p>
          </div>
        </div>

        <div className="text-xs font-mono text-muted-foreground bg-muted/40 px-2.5 py-1 rounded-lg border border-border/50">
          {messages.length} {messages.length === 1 ? 'message' : 'messages'}
        </div>
      </div>

      {/* Message Timeline */}
      <div className="space-y-5">
        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          const msgTime = formatTime(msg.createdAt);

          return (
            <div
              key={msg._id.toString()}
              className={`flex gap-3.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
            >
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 text-xs shadow-2xs ${
                  isUser
                    ? 'bg-primary text-primary-foreground font-semibold'
                    : 'bg-card text-foreground border border-border/80'
                }`}
              >
                {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>

              <div className={`max-w-[82%] space-y-1.5 ${isUser ? 'items-end' : 'items-start'}`}>
                <div className={`flex items-center gap-2 text-[11px] text-muted-foreground px-1 ${isUser ? 'justify-end' : 'justify-start'}`}>
                  <span className="font-medium text-foreground">
                    {isUser ? (conversation.isTest ? 'Test Operator' : 'Visitor') : 'AnswerDesk AI'}
                  </span>
                  <span>&bull;</span>
                  <span className="font-mono text-[10px]">{msgTime}</span>
                  {msg.isUnanswered && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20">
                      <AlertCircle className="w-2.5 h-2.5" />
                      Unanswered
                    </span>
                  )}
                </div>

                <div
                  className={`p-4 rounded-2xl text-xs leading-relaxed shadow-xs ${
                    isUser
                      ? 'bg-primary text-primary-foreground rounded-tr-xs'
                      : 'bg-card text-foreground border border-border/80 rounded-tl-xs'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{isUser ? msg.content : cleanAnswerText(msg.content)}</p>
                </div>

                {/* Citations / Sources */}
                {msg.citations && msg.citations.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                      <Bookmark className="w-3 h-3 text-primary" />
                      Sources referenced ({msg.citations.length}):
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {msg.citations.map((cite, idx) => (
                        <div
                          key={idx}
                          className="p-2.5 rounded-xl text-xs bg-muted/30 border border-border/70 text-foreground max-w-sm shadow-2xs space-y-1"
                        >
                          <span className="font-semibold block text-primary text-[11px]">{cite.sourceTitle}</span>
                          {cite.textSnippet && (
                            <p className="text-[10px] font-mono text-muted-foreground line-clamp-2 leading-snug">
                              &ldquo;{cite.textSnippet}&rdquo;
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ConversationDetailSkeleton() {
  return (
    <div className="p-6 max-w-4xl mx-auto w-full space-y-6 animate-pulse">
      <div className="h-8 w-48 bg-muted rounded" />
      <div className="space-y-4">
        <div className="h-20 bg-muted/40 rounded-xl" />
        <div className="h-20 bg-muted/40 rounded-xl" />
      </div>
    </div>
  );
}
