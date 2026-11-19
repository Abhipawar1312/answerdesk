'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { MessageSquare, AlertCircle, Clock, ChevronRight, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/lib/date';

interface ConversationSummary {
  _id: string;
  visitorId: string;
  startedAt: string;
  lastMessageAt: string;
  status: 'active' | 'resolved';
  isTest?: boolean;
  messageCount: number;
  hasUnanswered: boolean;
  lastMessageSnippet?: string;
}

interface ConversationsClientProps {
  workspaceSlug: string;
  initialFilter?: 'all' | 'unanswered';
}

export function ConversationsClient({
  workspaceSlug,
  initialFilter = 'all',
}: ConversationsClientProps) {
  const [filter, setFilter] = useState<'all' | 'unanswered'>(initialFilter);

  // TanStack Query polls recent conversations every 10s to keep customer support messages up to date without manual page reloads.
  const { data, isLoading, isRefetching, refetch } = useQuery<{
    conversations: ConversationSummary[];
  }>({
    queryKey: ['conversations', workspaceSlug, filter],
    queryFn: async () => {
      const res = await fetch(
        `/api/workspaces/${workspaceSlug}/conversations?filter=${filter}`
      );
      if (!res.ok) {
        throw new Error('Failed to load conversations');
      }
      return res.json();
    },
    refetchInterval: 10000,
  });

  const conversations = data?.conversations || [];

  return (
    <div className="space-y-6">
      {/* Header and Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/60">
        <div>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <MessageSquare className="h-4 w-4" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Conversations
            </h1>
          </div>
          <p className="text-xs text-muted-foreground mt-1.5 ml-10">
            Audit customer chats, monitor automated assistant responses, and flag unresolved questions.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <div className="inline-flex rounded-xl border border-border/80 p-1 bg-muted/30 shadow-2xs">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                filter === 'all'
                  ? 'bg-card text-foreground shadow-xs border border-border/60'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              All Inquiries
            </button>
            <button
              type="button"
              onClick={() => setFilter('unanswered')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 ${
                filter === 'unanswered'
                  ? 'bg-card text-foreground shadow-xs border border-border/60'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
              Unanswered
            </button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isRefetching}
            className="h-8.5 px-3 text-xs text-muted-foreground rounded-xl border-border/80 shadow-2xs hover:text-foreground"
            aria-label="Refresh conversations"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Conversations List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-20 rounded-2xl border border-border/70 bg-card/50 animate-pulse"
            />
          ))}
        </div>
      ) : conversations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center border-2 border-dashed border-border/70 rounded-2xl bg-card/40">
          <div className="w-12 h-12 rounded-2xl bg-muted/60 border border-border/80 flex items-center justify-center text-muted-foreground mb-3.5">
            <MessageSquare className="w-6 h-6" />
          </div>
          <h2 className="text-sm font-semibold text-foreground">No conversations found</h2>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm leading-relaxed">
            {filter === 'unanswered'
              ? 'Great job! There are currently zero unanswered visitor questions.'
              : 'Embed the widget on your site or run a simulated session in Test Chat to see visitor logs here.'}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border/60 rounded-2xl border border-border/70 bg-card overflow-hidden shadow-xs">
          {conversations.map((conv) => {
            const formattedDate = formatDateTime(conv.lastMessageAt);

            return (
              <Link
                key={conv._id}
                href={`/dashboard/${workspaceSlug}/conversations/${conv._id}`}
                className="flex items-center justify-between p-4.5 hover:bg-muted/30 transition-colors group"
              >
                <div className="min-w-0 flex-1 pr-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs font-semibold text-foreground truncate">
                      {conv.isTest ? 'Test Chat' : `Visitor ${conv.visitorId.slice(0, 12)}`}
                    </span>

                    {conv.isTest && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-muted/60 text-muted-foreground border border-border/60">
                        Sandbox
                      </span>
                    )}

                    {conv.hasUnanswered && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20">
                        <AlertCircle className="w-2.5 h-2.5" />
                        Unanswered
                      </span>
                    )}

                    <span className="text-[11px] font-mono text-muted-foreground flex items-center gap-1 ml-auto sm:ml-0">
                      <Clock className="w-3 h-3" />
                      {formattedDate}
                    </span>
                  </div>

                  <p className="text-xs text-muted-foreground truncate leading-normal">
                    {conv.lastMessageSnippet || 'No messages recorded'}
                  </p>
                </div>

                <div className="flex items-center gap-3.5 shrink-0">
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-muted/40 border border-border/40 text-muted-foreground">
                    {conv.messageCount} {conv.messageCount === 1 ? 'msg' : 'msgs'}
                  </span>
                  <div className="h-7 w-7 rounded-lg border border-border/60 bg-muted/20 flex items-center justify-center text-muted-foreground group-hover:text-foreground group-hover:border-border transition-colors">
                    <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

