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
    <div className="max-w-5xl mx-auto w-full space-y-6">
      {/* Back Link & Header */}
      <div className="flex items-center justify-between pb-4 border-b border-border">
        <div className="flex items-center gap-3">
          <Link href={`/dashboard/${workspaceSlug}/conversations`}>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
              {conversation.isTest ? 'Test Chat' : `Visitor ${conversation.visitorId.slice(0, 14)}`}
              {conversation.isTest && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                  Test
                </span>
              )}
            </h1>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
              <Clock className="w-3 h-3" />
              Started on {formattedStarted}
            </p>
          </div>
        </div>

        <div className="text-xs text-muted-foreground">
          {messages.length} {messages.length === 1 ? 'message' : 'messages'}
        </div>
      </div>

      {/* Message Timeline */}
      <div className="space-y-4">
        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          const msgTime = formatTime(msg.createdAt);

          return (
            <div
              key={msg._id.toString()}
              className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
            >
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-xs ${
                  isUser
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground border border-border'
                }`}
              >
                {isUser ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
              </div>

              <div className={`max-w-[80%] space-y-1.5 ${isUser ? 'items-end' : 'items-start'}`}>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground px-1">
                  <span>{isUser ? (conversation.isTest ? 'Test' : 'Visitor') : 'AnswerDesk AI'}</span>
                  <span>•</span>
                  <span>{msgTime}</span>
                  {msg.isUnanswered && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-muted text-foreground border border-border">
                      <AlertCircle className="w-2.5 h-2.5" />
                      Unanswered
                    </span>
                  )}
                </div>

                <div
                  className={`p-3.5 rounded-2xl text-xs leading-relaxed ${
                    isUser
                      ? 'bg-primary text-primary-foreground rounded-tr-sm'
                      : 'bg-card text-foreground border border-border rounded-tl-sm'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{isUser ? msg.content : cleanAnswerText(msg.content)}</p>
                </div>

                {/* Citations / Sources */}
                {msg.citations && msg.citations.length > 0 && (
                  <div className="space-y-1 pt-1">
                    <p className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
                      <Bookmark className="w-2.5 h-2.5" />
                      Sources referenced:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {msg.citations.map((cite, idx) => (
                        <div
                          key={idx}
                          className="px-2 py-1 rounded-md text-[10px] bg-muted/60 border border-border text-foreground max-w-sm"
                        >
                          <span className="font-semibold">{cite.sourceTitle}</span>
                          {cite.textSnippet && (
                            <p className="text-[9px] text-muted-foreground mt-0.5 line-clamp-2">
                              {cite.textSnippet}
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
