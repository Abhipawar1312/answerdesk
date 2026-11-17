'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { Send, Bot, User, AlertCircle, FileText, Sparkles, Loader2, ArrowRight, Plus, RotateCcw } from 'lucide-react';
import { useWorkspaceUsage } from '@/components/dashboard/dashboard-shell';
import { cleanAnswerText } from '@/services/citation-resolver';

interface Citation {
  documentId: string;
  sourceTitle: string;
  chunkIndex: number;
  textSnippet?: string;
  score?: number;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  isUnanswered?: boolean;
  topScore?: number;
  isError?: boolean;
  retryPrompt?: string;
}

export function TestChatClient({
  workspaceSlug,
  workspaceName,
  initialHourlyCount,
  hasActiveDocs,
}: {
  workspaceSlug: string;
  workspaceName: string;
  initialHourlyCount: number;
  hasActiveDocs: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hourlyCount, setHourlyCount] = useState(initialHourlyCount);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [vectorIndexMissing, setVectorIndexMissing] = useState(false);

  const usage = useWorkspaceUsage();
  const scrollRef = useRef<HTMLDivElement>(null);
  const retryPromptRef = useRef<string>('');

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleRetry = (e: React.MouseEvent<HTMLButtonElement>) => {
    const prompt = e.currentTarget.getAttribute('data-prompt');
    if (!prompt || isLoading) return;
    retryPromptRef.current = prompt;
    const form = document.querySelector('form');
    if (form) {
      form.requestSubmit();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const promptToSend = retryPromptRef.current || input;
    retryPromptRef.current = '';
    const trimmed = promptToSend.trim();
    if (!trimmed || isLoading) return;

    if (hourlyCount >= 20) {
      setErrorMessage('You have reached the test limit of 20 messages per hour. Please wait for the window to reset.');
      return;
    }

    setErrorMessage(null);
    setVectorIndexMissing(false);
    setInput('');

    const userMessageId = `user_${Date.now()}`;
    const assistantMessageId = `asst_${Date.now()}`;

    // Append user message and placeholder assistant message immediately
    setMessages((prev) => [
      ...prev,
      { id: userMessageId, role: 'user', content: trimmed },
      { id: assistantMessageId, role: 'assistant', content: '' },
    ]);
    setIsLoading(true);

    const markAssistantError = (errMsg?: string) => {
      const fallbackText = 'Something went wrong. Please try again.';
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMessageId
            ? {
                ...m,
                content: errMsg || fallbackText,
                isError: true,
                retryPrompt: trimmed,
              }
            : m
        )
      );
    };

    try {
      const res = await fetch('/api/chat/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceSlug,
          message: trimmed,
          conversationId: conversationId ?? undefined,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        if (res.status === 503 && errorData.isVectorIndexMissing) {
          setVectorIndexMissing(true);
        }
        markAssistantError(errorData.error || 'Something went wrong. Please try again.');
        return;
      }

      if (!res.body) {
        markAssistantError('Something went wrong. Please try again.');
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = '';
      let receivedCitations: Citation[] = [];
      let isUnansweredQuery = false;
      let highestScore = 0;
      let streamSucceeded = false;

      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine.startsWith('data: ')) continue;
          const dataStr = trimmedLine.slice(6).trim();

          if (dataStr === '[DONE]') {
            streamSucceeded = true;
            break;
          }

          try {
            const parsed = JSON.parse(dataStr);

            if (parsed.type === 'metadata') {
              if (parsed.conversationId) {
                setConversationId(parsed.conversationId);
              }
              receivedCitations = parsed.citations || [];
              isUnansweredQuery = Boolean(parsed.isUnanswered);
              highestScore = parsed.topScore || 0;

              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId
                    ? {
                        ...m,
                        citations: receivedCitations,
                        isUnanswered: isUnansweredQuery,
                        topScore: highestScore,
                      }
                    : m
                )
              );
            } else if (parsed.type === 'text-delta') {
              assistantText += parsed.delta;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId
                    ? {
                        ...m,
                        content: assistantText,
                      }
                    : m
                )
              );
            } else if (parsed.type === 'error') {
              markAssistantError(parsed.error || 'Something went wrong. Please try again.');
              return;
            }
          } catch {
            // Ignore partial JSON parses in chunk boundaries
          }
        }
      }

      // If stream ended without error and with content, count towards hourly limit
      if (streamSucceeded || assistantText.trim().length > 0) {
        setHourlyCount((prev) => prev + 1);
      } else {
        markAssistantError('Something went wrong. Please try again.');
      }
    } catch {
      markAssistantError('Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
      usage?.refreshUsage?.();
    }
  };

  const handleNewChat = () => {
    setMessages([]);
    setConversationId(null);
    setInput('');
    setErrorMessage(null);
    setVectorIndexMissing(false);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem-2rem)] sm:h-[calc(100vh-3.5rem-3rem)] w-full max-w-6xl mx-auto">
      {/* Header with Title, Actions, and Hourly Quota */}
      <div className="shrink-0 space-y-3 pb-3 border-b border-border">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-semibold tracking-tight text-foreground">
                Test Chat
              </h1>
              <span className="font-mono text-[11px] px-2 py-0.5 rounded border border-border bg-muted/20 text-muted-foreground shrink-0">
                {hourlyCount} / 20 this hour
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Test how your chatbot responds to customer inquiries using your knowledge base articles.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-muted-foreground hidden md:inline">
              Test chats are not saved in this view
            </span>
            <button
              type="button"
              onClick={handleNewChat}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted text-foreground text-xs font-medium transition-colors shadow-xs"
            >
              <Plus className="h-3.5 w-3.5 text-muted-foreground" />
              <span>New test chat</span>
            </button>
          </div>
        </div>

        {/* Mobile visible note */}
        <div className="md:hidden flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/40">
          <span>Test chats are not saved in this view</span>
        </div>

        {/* Search Index Missing Notice */}
        {vectorIndexMissing && (
          <div className="rounded border border-border bg-card p-4 space-y-2">
            <div className="flex items-center gap-2 text-foreground font-medium text-xs">
              <AlertCircle className="h-4 w-4 text-amber-500" />
              <span>Search Setup Required</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Knowledge search index is not ready yet. Please configure the search index in MongoDB Atlas as detailed in{' '}
              <code className="font-mono text-foreground">SETUP_FOR_ME.md</code>.
            </p>
          </div>
        )}

        {/* No Active Documents Warning */}
        {!hasActiveDocs && (
          <div className="rounded border border-border bg-card p-4 space-y-2">
            <div className="flex items-center gap-2 text-foreground font-medium text-xs">
              <FileText className="h-4 w-4" />
              <span>No Ready Knowledge Base Articles</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Your workspace has no active documents. The assistant requires at least one ready knowledge base article to answer questions.
            </p>
            <div>
              <Link
                href={`/dashboard/${workspaceSlug}/documents`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-border text-xs font-medium text-foreground hover:bg-muted/30 transition-colors"
              >
                <span>Add Knowledge Entry</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Full-Height Chat Panel */}
      <div className="flex-1 flex flex-col min-h-0 rounded-xl border border-border bg-card overflow-hidden w-full mt-3 shadow-xs">
        {/* Messages Stream Container (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 min-h-0">
          <div className="max-w-[760px] mx-auto w-full space-y-6">
            {messages.length === 0 ? (
              <div className="h-full min-h-[280px] flex flex-col items-center justify-center text-center p-8 space-y-3">
                <div className="h-10 w-10 rounded border border-border flex items-center justify-center bg-muted/20 text-muted-foreground">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-xs font-semibold text-foreground">Start a test conversation</h3>
                  <p className="text-xs text-muted-foreground max-w-sm">
                    Ask a question in English, Hindi, or Marathi to test answer accuracy, source attribution, and boundary enforcement.
                  </p>
                </div>
              </div>
            ) : (
              messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {m.role === 'assistant' && (
                    <div className="h-7 w-7 rounded border border-border bg-foreground text-background flex items-center justify-center shrink-0 mt-0.5">
                      <Bot className="h-3.5 w-3.5" />
                    </div>
                  )}

                  <div className={`space-y-2 max-w-[85%] ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                    {/* Message Bubble */}
                    <div
                      className={`rounded px-4 py-2.5 text-xs leading-relaxed ${
                        m.role === 'user'
                          ? 'bg-foreground text-background font-medium'
                          : m.isError
                          ? 'border border-destructive/30 bg-destructive/5 text-foreground'
                          : 'border border-border bg-muted/20 text-foreground'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">
                        {m.role === 'assistant'
                          ? cleanAnswerText(m.content) || (m.isError ? 'Something went wrong. Please try again.' : '')
                          : m.content}
                      </p>
                      {m.isError && (
                        <div className="pt-2">
                          <button
                            type="button"
                            onClick={handleRetry}
                            data-prompt={m.retryPrompt}
                            disabled={isLoading || hourlyCount >= 20}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium border border-border bg-card hover:bg-muted text-foreground transition-colors disabled:opacity-50"
                          >
                            <RotateCcw className="h-3 w-3" />
                            <span>Retry</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Fallback Unanswered Tag */}
                    {m.isUnanswered && (
                      <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-border text-[11px] font-mono text-muted-foreground">
                        <AlertCircle className="h-3 w-3 text-amber-500" />
                        <span>This question was saved in Unanswered</span>
                      </div>
                    )}

                    {/* Source References & Citations */}
                    {m.citations && m.citations.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Sources ({m.citations.slice(0, 3).length})
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {m.citations.slice(0, 3).map((c, i) => (
                            <div
                              key={i}
                              className="rounded border border-border bg-card px-2.5 py-1 text-[11px] text-muted-foreground space-y-0.5"
                            >
                              <div className="flex items-center gap-1 font-medium text-foreground">
                                <FileText className="h-3 w-3" />
                                <span className="truncate max-w-[180px]">{c.sourceTitle}</span>
                              </div>
                              {c.textSnippet && (
                                <p className="line-clamp-2 text-[10px] text-muted-foreground font-mono max-w-[220px]">
                                  {c.textSnippet}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {m.role === 'user' && (
                    <div className="h-7 w-7 rounded border border-border bg-muted/30 text-foreground flex items-center justify-center shrink-0 mt-0.5">
                      <User className="h-3.5 w-3.5" />
                    </div>
                  )}
                </div>
              ))
            )}

            {isLoading && messages[messages.length - 1]?.role === 'user' && (
              <div className="flex gap-3 items-center text-muted-foreground text-xs">
                <div className="h-7 w-7 rounded border border-border bg-foreground text-background flex items-center justify-center shrink-0">
                  <Bot className="h-3.5 w-3.5" />
                </div>
                <div className="inline-flex items-center gap-2 px-3 py-2 rounded border border-border bg-muted/10">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Searching knowledge base and drafting answer...</span>
                </div>
              </div>
            )}

            <div ref={scrollRef} />
          </div>
        </div>

        {/* Error Banner */}
        {errorMessage && (
          <div className="shrink-0 border-t border-border bg-muted/10 px-4 py-2">
            <div className="max-w-[760px] mx-auto w-full flex items-center gap-2 text-xs text-foreground">
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-500" />
              <span className="truncate">{errorMessage}</span>
            </div>
          </div>
        )}

        {/* Pinned Bottom Input Form */}
        <div className="shrink-0 p-3 sm:p-4 border-t border-border bg-card">
          <div className="max-w-[760px] mx-auto w-full">
            <form onSubmit={handleSubmit} className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={`Ask a question about ${workspaceName}...`}
                disabled={isLoading || hourlyCount >= 20}
                className="flex-1 rounded-lg border border-border bg-background px-3.5 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim() || hourlyCount >= 20}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg border border-border bg-foreground text-background font-medium text-xs hover:opacity-90 transition-opacity disabled:opacity-50 shrink-0"
              >
                {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                <span className="hidden sm:inline">Send</span>
              </button>
            </form>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-2 px-1">
              <span>Isolated test session &bull; Does not consume customer quota</span>
              <span>Test chats are not saved in this view</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

