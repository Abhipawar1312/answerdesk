'use client';

import { useState } from 'react';
import Link from 'next/link';
import { HelpCircle, PlusCircle, ArrowUpRight, MessageSquare, Clock, X, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { createFaqDocumentAction } from '@/actions/document';
import { dismissUnansweredQuestionAction, dismissAllUnansweredQuestionsAction } from '@/actions/unanswered';
import { formatDateTime } from '@/lib/date';

interface UnansweredItem {
  messageId: string;
  conversationId: string;
  question: string;
  askedAt: string;
  visitorId: string;
  isTest?: boolean;
}

interface UnansweredClientProps {
  workspaceSlug: string;
  unansweredQuestions: UnansweredItem[];
}

export function UnansweredClient({
  workspaceSlug,
  unansweredQuestions,
}: UnansweredClientProps) {
  const [questions, setQuestions] = useState<UnansweredItem[]>(unansweredQuestions);
  const [activeQuestion, setActiveQuestion] = useState<UnansweredItem | null>(null);
  const [faqTitle, setFaqTitle] = useState('');
  const [faqAnswer, setFaqAnswer] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [isDismissingAll, setIsDismissingAll] = useState(false);

  const handleDismiss = async (messageId: string) => {
    setDismissingId(messageId);
    try {
      const res = await dismissUnansweredQuestionAction({
        workspaceSlug,
        messageId,
      });
      if (res.success) {
        setQuestions((prev) => prev.filter((q) => q.messageId !== messageId));
      }
    } finally {
      setDismissingId(null);
    }
  };

  const handleDismissAll = async () => {
    if (!window.confirm('Dismiss all unanswered questions from review?')) return;
    setIsDismissingAll(true);
    try {
      const res = await dismissAllUnansweredQuestionsAction({ workspaceSlug });
      if (res.success) {
        setQuestions([]);
      }
    } finally {
      setIsDismissingAll(false);
    }
  };

  const handleOpenFaqModal = (item: UnansweredItem) => {
    setActiveQuestion(item);
    setFaqTitle(item.question);
    setFaqAnswer('');
    setError(null);
  };

  const handleCreateFaq = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!faqTitle.trim() || !faqAnswer.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await createFaqDocumentAction({
        workspaceSlug,
        title: faqTitle.trim(),
        content: `Question: ${faqTitle.trim()}\nAnswer: ${faqAnswer.trim()}`,
      });

      if (!result.success) {
        setError(result.error || 'Failed to create FAQ entry.');
        setIsSubmitting(false);
        return;
      }

      // Remove question from active review list
      if (activeQuestion) {
        setQuestions((prev) => prev.filter((q) => q.messageId !== activeQuestion.messageId));
      }
      setActiveQuestion(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="pb-4 border-b border-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
              <HelpCircle className="h-4 w-4" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Unanswered Questions Review
            </h1>
          </div>
          <p className="text-xs text-muted-foreground mt-1.5 ml-10">
            Questions where confidence fell below fallback threshold. Add knowledge answers to automate responses for future visitors.
          </p>
        </div>
        {questions.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleDismissAll}
            disabled={isDismissingAll}
            className="h-8.5 text-xs rounded-xl border-border/80 shadow-2xs shrink-0 self-start sm:self-auto hover:bg-muted"
          >
            {isDismissingAll ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
            ) : (
              <Check className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
            )}
            Dismiss All
          </Button>
        )}
      </div>

      {/* List */}
      {questions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center border-2 border-dashed border-border/70 rounded-2xl bg-card/40">
          <div className="w-12 h-12 rounded-2xl bg-muted/60 border border-border/80 flex items-center justify-center text-muted-foreground mb-3.5">
            <HelpCircle className="w-6 h-6" />
          </div>
          <h2 className="text-sm font-semibold text-foreground">Zero unanswered questions</h2>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm leading-relaxed">
            All customer inquiries have been successfully resolved by your knowledge base sources.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {questions.map((item) => {
            const formattedDate = formatDateTime(item.askedAt);

            return (
              <div
                key={item.messageId}
                className="p-5 rounded-2xl border border-border/70 bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-border transition-all shadow-xs"
              >
                <div className="space-y-1.5 min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground leading-snug">
                    &ldquo;{item.question}&rdquo;
                  </p>
                  <div className="flex items-center gap-3 text-[11px] font-mono text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formattedDate}
                    </span>
                    <span>&bull;</span>
                    <span className="truncate">
                      {item.isTest ? 'Sandbox test' : `Visitor ${item.visitorId.slice(0, 10)}`}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDismiss(item.messageId)}
                    disabled={dismissingId === item.messageId}
                    className="h-8 text-xs text-muted-foreground hover:text-foreground rounded-lg"
                    title="Dismiss question"
                  >
                    {dismissingId === item.messageId ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                    ) : (
                      <Check className="w-3.5 h-3.5 mr-1" />
                    )}
                    Dismiss
                  </Button>

                  <Link
                    href={`/dashboard/${workspaceSlug}/conversations/${item.conversationId}`}
                    className="inline-flex"
                  >
                    <Button variant="outline" size="sm" className="h-8 text-xs text-muted-foreground rounded-lg border-border/80 shadow-2xs hover:text-foreground">
                      <MessageSquare className="w-3.5 h-3.5 mr-1" />
                      View Chat
                    </Button>
                  </Link>

                  <Button
                    size="sm"
                    onClick={() => handleOpenFaqModal(item)}
                    className="h-8 text-xs flex items-center gap-1.5 rounded-lg font-medium shadow-2xs"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    Add Knowledge
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add FAQ Modal Dialog */}
      {activeQuestion && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-xs"
        >
          <div className="relative w-full max-w-lg rounded-2xl border border-border/80 bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3.5 border-b border-border/60">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                  <PlusCircle className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Answer Question as Knowledge</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Index knowledge to answer this question automatically for future visitors.
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setActiveQuestion(null)}
                className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground"
                aria-label="Close dialog"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <form onSubmit={handleCreateFaq} className="space-y-4 pt-1">
              <div className="space-y-1.5">
                <label htmlFor="faq-question-title" className="text-xs font-medium text-foreground">
                  Question / Title
                </label>
                <Input
                  id="faq-question-title"
                  value={faqTitle}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFaqTitle(e.target.value)}
                  placeholder="Question title"
                  className="text-xs h-9 bg-background"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="faq-answer-content" className="text-xs font-medium text-foreground">
                  Answer / Ground Truth Content
                </label>
                <Textarea
                  id="faq-answer-content"
                  value={faqAnswer}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFaqAnswer(e.target.value)}
                  placeholder="Write the clear, accurate answer here..."
                  rows={4}
                  className="text-xs resize-none bg-background leading-relaxed"
                  required
                />
              </div>

              {error && (
                <div className="text-xs text-rose-500 bg-rose-500/10 p-3 rounded-xl border border-rose-500/20 font-medium">
                  {error}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/60">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveQuestion(null)}
                  className="text-xs h-8.5 px-3.5"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSubmitting || !faqTitle.trim() || !faqAnswer.trim()}
                  className="text-xs h-8.5 px-4 flex items-center gap-1.5 font-medium shadow-2xs"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Indexing...
                    </>
                  ) : (
                    <>
                      <span>Save & Index</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
