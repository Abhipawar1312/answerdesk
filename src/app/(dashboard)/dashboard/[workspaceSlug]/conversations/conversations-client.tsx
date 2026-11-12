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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Conversations</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Review incoming visitor interactions and identify knowledge gaps.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/40">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                filter === 'all'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setFilter('unanswered')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
                filter === 'unanswered'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <AlertCircle className="w-3 h-3 text-muted-foreground" />
              Unanswered
            </button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isRefetching}
            className="h-8 px-2.5 text-xs text-muted-foreground"
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
              className="h-20 rounded-xl border border-border bg-card/50 animate-pulse"
            />
          ))}
        </div>
      ) : conversations.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed border-border rounded-xl bg-card/30">
          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground mb-3">
            <MessageSquare className="w-5 h-5" />
          </div>
          <h2 className="text-sm font-medium text-foreground">No conversations found</h2>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm">
            {filter === 'unanswered'
              ? 'Great job! There are no unanswered visitor questions.'
              : 'Embed the widget on your site or start a conversation using the widget preview.'}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border bg-card overflow-hidden">
          {conversations.map((conv) => {
            const formattedDate = formatDateTime(conv.lastMessageAt);

            return (
              <Link
                key={conv._id}
                href={`/dashboard/${workspaceSlug}/conversations/${conv._id}`}
                className="flex items-center justify-between p-4 hover:bg-muted/40 transition-colors group"
              >
                <div className="min-w-0 flex-1 pr-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-foreground truncate">
                      {conv.isTest ? 'Test Chat' : `Visitor ${conv.visitorId.slice(0, 12)}`}
                    </span>

                    {conv.hasUnanswered && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-foreground border border-border">
                        <AlertCircle className="w-2.5 h-2.5" />
                        Unanswered
                      </span>
                    )}

                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" />
                      {formattedDate}
                    </span>
                  </div>

                  <p className="text-xs text-muted-foreground truncate">
                    {conv.lastMessageSnippet || 'No messages yet'}
                  </p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-[11px] text-muted-foreground">
                    {conv.messageCount} {conv.messageCount === 1 ? 'msg' : 'msgs'}
                  </span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-transform group-hover:translate-x-0.5" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

