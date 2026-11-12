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
      <div className="pb-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-muted-foreground" />
            Unanswered Questions Review
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            These questions could not be answered from your knowledge base. Add knowledge entries to answer them automatically.
          </p>
        </div>
        {questions.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleDismissAll}
            disabled={isDismissingAll}
            className="h-8 text-xs shrink-0 self-start sm:self-auto"
          >
            {isDismissingAll ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
            ) : (
              <Check className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
            )}
            Dismiss all
          </Button>
        )}
      </div>

      {/* List */}
      {questions.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed border-border rounded-xl bg-card/30">
          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground mb-3">
            <HelpCircle className="w-5 h-5" />
          </div>
          <h2 className="text-sm font-medium text-foreground">Zero unanswered questions</h2>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm">
            All customer inquiries have been successfully matched to knowledge sources.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {questions.map((item) => {
            const formattedDate = formatDateTime(item.askedAt);

            return (
              <div
                key={item.messageId}
                className="p-4 rounded-xl border border-border bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-foreground/20 transition-colors"
              >
                <div className="space-y-1.5 min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground leading-snug">
                    &ldquo;{item.question}&rdquo;
                  </p>
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formattedDate}
                    </span>
                    <span>•</span>
                    <span className="truncate">
                      {item.isTest ? 'Test chat' : `Visitor ${item.visitorId.slice(0, 10)}`}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDismiss(item.messageId)}
                    disabled={dismissingId === item.messageId}
                    className="h-8 text-xs text-muted-foreground hover:text-foreground"
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
                    <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground">
                      <MessageSquare className="w-3.5 h-3.5 mr-1" />
                      View Chat
                    </Button>
                  </Link>

                  <Button
                    size="sm"
                    onClick={() => handleOpenFaqModal(item)}
                    className="h-8 text-xs flex items-center gap-1.5"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    Add FAQ
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
          <div className="relative w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div>
                <h2 className="text-base font-semibold text-foreground">Answer Question as FAQ</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Save knowledge to answer this question automatically for future visitors.
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setActiveQuestion(null)}
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                aria-label="Close dialog"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <form onSubmit={handleCreateFaq} className="space-y-4 pt-1">
              <div className="space-y-1">
                <label htmlFor="faq-question-title" className="text-xs font-medium text-foreground">
                  Question / Title
                </label>
                <Input
                  id="faq-question-title"
                  value={faqTitle}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFaqTitle(e.target.value)}
                  placeholder="Question title"
                  className="text-xs"
                  required
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="faq-answer-content" className="text-xs font-medium text-foreground">
                  Answer / Knowledge Content
                </label>
                <Textarea
                  id="faq-answer-content"
                  value={faqAnswer}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFaqAnswer(e.target.value)}
                  placeholder="Write the clear, accurate answer here..."
                  rows={4}
                  className="text-xs resize-none"
                  required
                />
              </div>

              {error && (
                <div className="text-xs text-destructive bg-destructive/10 p-2 rounded border border-destructive/20">
                  {error}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveQuestion(null)}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSubmitting || !faqTitle.trim() || !faqAnswer.trim()}
                  className="text-xs flex items-center gap-1.5"
                >
                  {isSubmitting ? 'Indexing...' : 'Save & Index FAQ'}
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
