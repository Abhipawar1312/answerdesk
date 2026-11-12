'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, X, ExternalLink, Bot, User, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cleanAnswerText } from '@/services/citation-resolver';

interface Citation {
  documentId: string;
  sourceTitle: string;
  chunkIndex: number;
  textSnippet?: string;
}

interface MessageItem {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  isStreaming?: boolean;
}

interface WidgetChatClientProps {
  workspaceName: string;
  workspaceSlug: string;
  initialVisitorId: string;
  initialHostOrigin?: string;
}

export function WidgetChatClient({
  workspaceName,
  workspaceSlug,
  initialVisitorId,
  initialHostOrigin,
}: WidgetChatClientProps) {
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleClose = () => {
    window.parent?.postMessage('answerdesk:close', '*');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;

    setInput('');
    setErrorMessage(null);

    const userMessage: MessageItem = {
      id: 'msg-' + Date.now(),
      role: 'user',
      content: trimmed,
    };

    const assistantPlaceholderId = 'asst-' + Date.now();
    const assistantPlaceholder: MessageItem = {
      id: assistantPlaceholderId,
      role: 'assistant',
      content: '',
      isStreaming: true,
      citations: [],
    };

    setMessages((prev) => [...prev, userMessage, assistantPlaceholder]);
    setIsStreaming(true);

    try {
      const response = await fetch('/api/chat/public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceSlug,
          message: trimmed,
          visitorId: initialVisitorId,
          conversationId: conversationId || undefined,
          hostOrigin: initialHostOrigin || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server responded with status ${response.status}`);
      }

      if (!response.body) {
        throw new Error('No readable response body stream received.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine.startsWith('data: ')) continue;

          const dataStr = trimmedLine.slice(6);
          if (dataStr === '[DONE]') continue;

          try {
            const data = JSON.parse(dataStr);

            if (data.type === 'citations') {
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantPlaceholderId
                    ? { ...msg, citations: data.citations || [] }
                    : msg
                )
              );
            } else if (data.type === 'delta') {
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantPlaceholderId
                    ? { ...msg, content: msg.content + data.delta }
                    : msg
                )
              );
            } else if (data.type === 'done') {
              if (data.conversationId) {
                setConversationId(data.conversationId);
              }
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantPlaceholderId ? { ...msg, isStreaming: false } : msg
                )
              );
            } else if (data.type === 'error') {
              setErrorMessage(data.error);
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantPlaceholderId
                    ? {
                        ...msg,
                        content: data.error || 'A problem occurred while answering.',
                        isStreaming: false,
                      }
                    : msg
                )
              );
            }
          } catch {
            // Ignore partial SSE JSON parse failures
          }
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to connect to support assistant.';
      setErrorMessage(msg);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantPlaceholderId
            ? { ...m, content: msg, isStreaming: false }
            : m
        )
      );
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-background border border-border">
      {/* Header */}
      <header className="px-4 py-3 border-b border-border bg-card shrink-0">
        <div className="max-w-[760px] mx-auto w-full flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium text-xs">
              {workspaceName.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-sm font-semibold tracking-tight leading-tight">{workspaceName}</h1>
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-muted-foreground" />
                Support assistant
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClose}
            aria-label="Close widget"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </header>

      {/* Messages Scroll Area */}
      <div
        ref={scrollRef}
        role="log"
        aria-live="polite"
        className="flex-1 overflow-y-auto p-4 space-y-4 text-sm min-h-0"
      >
        <div className="max-w-[760px] mx-auto w-full space-y-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-4 space-y-3 my-auto py-12">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-medium">How can we help you today?</h2>
                <p className="text-xs text-muted-foreground mt-1 max-w-[240px]">
                  Ask questions about our policies, pricing, or product documentation.
                </p>
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${
                  msg.role === 'user' ? 'items-end' : 'items-start'
                } space-y-1`}
              >
                <div
                  className={`flex gap-2 max-w-[85%] ${
                    msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-xs ${
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {msg.role === 'user' ? <User className="w-3 h-3" /> : <Bot className="w-3 h-3" />}
                  </div>

                  <div
                    className={`p-3 rounded-2xl text-xs leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground rounded-tr-sm'
                        : 'bg-muted/60 text-foreground border border-border/50 rounded-tl-sm'
                    }`}
                  >
                    {(msg.role === 'assistant' ? cleanAnswerText(msg.content) : msg.content) || (msg.isStreaming && (
                      <span className="inline-block animate-pulse text-muted-foreground">
                        Thinking...
                      </span>
                    ))}
                  </div>
                </div>

                {/* Citations block for assistant responses */}
                {msg.citations && msg.citations.length > 0 && (
                  <div className="flex flex-col gap-1 mt-1 pl-8 max-w-[85%]">
                    <span className="text-[10px] font-medium text-muted-foreground">Sources</span>
                    <div className="flex flex-wrap gap-1">
                      {msg.citations.slice(0, 3).map((cite, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            if (cite.textSnippet) {
                              setSelectedCitation(selectedCitation === cite ? null : cite);
                            }
                          }}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-muted/80 hover:bg-muted text-muted-foreground border border-border/40 transition-colors"
                          title={cite.textSnippet || cite.sourceTitle}
                        >
                          <ExternalLink className="w-2.5 h-2.5" />
                          <span className="truncate max-w-[140px]">{cite.sourceTitle}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}

          {/* Selected citation drawer / modal snippet preview */}
          {selectedCitation && (
            <div className="p-2.5 rounded-lg border border-border bg-card text-card-foreground text-xs shadow-sm">
              <div className="flex items-center justify-between font-semibold border-b border-border/50 pb-1 mb-1">
                <span className="truncate">{selectedCitation.sourceTitle}</span>
                <button
                  type="button"
                  onClick={() => setSelectedCitation(null)}
                  className="text-muted-foreground hover:text-foreground text-[10px]"
                >
                  Close
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {selectedCitation.textSnippet || 'No preview available.'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Error Notice */}
      {errorMessage && (
        <div className="px-4 py-1.5 bg-destructive/10 text-destructive text-[11px] border-t border-destructive/20 text-center shrink-0">
          <div className="max-w-[760px] mx-auto w-full">
            {errorMessage}
          </div>
        </div>
      )}

      {/* Input Footer */}
      <footer className="p-3 border-t border-border bg-card shrink-0">
        <div className="max-w-[760px] mx-auto w-full">
          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <Input
              value={input}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInput(e.target.value)}
              placeholder="Type your question..."
              disabled={isStreaming}
              className="flex-1 text-xs h-9"
            />
            <Button
              type="submit"
              size="icon"
              disabled={isStreaming || !input.trim()}
              className="h-9 w-9 shrink-0"
              aria-label="Send message"
            >
              <Send className="w-4 h-4" />
            </Button>
          </form>
          <div className="flex justify-between items-center text-[10px] text-muted-foreground mt-2 px-1">
            <span>Powered by AnswerDesk</span>
            <span>Support assistant</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
