'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { createFaqDocumentAction } from '@/actions/document';
import { FAQ_LIMITS } from '@/lib/constants';
import { Loader2, PlusCircle, CheckCircle2, AlertCircle } from 'lucide-react';

interface Props {
  workspaceSlug: string;
}

export function FaqUploadForm({ workspaceSlug }: Props) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [title, setTitle] = React.useState('');
  const [content, setContent] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [statusMessage, setStatusMessage] = React.useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);

    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();

    if (trimmedTitle.length < 2) {
      setStatusMessage({ type: 'error', text: 'Please enter a title (at least 2 characters).' });
      return;
    }

    if (trimmedContent.length < FAQ_LIMITS.minTextLength) {
      setStatusMessage({
        type: 'error',
        text: `Please enter some content (at least ${FAQ_LIMITS.minTextLength} characters).`,
      });
      return;
    }

    if (trimmedContent.length > FAQ_LIMITS.maxTextLength) {
      setStatusMessage({
        type: 'error',
        text: `Content is too long. Please keep it under ${FAQ_LIMITS.maxTextLength.toLocaleString()} characters.`,
      });
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await createFaqDocumentAction({
        workspaceSlug,
        title: trimmedTitle,
        content: trimmedContent,
      });

      if (!res.success) {
        setStatusMessage({ type: 'error', text: res.error || 'Could not save FAQ. Please try again.' });
      } else {
        setStatusMessage({
          type: 'success',
          text: 'Entry saved and indexed.',
        });
        setTitle('');
        setContent('');
        setTimeout(() => {
          setStatusMessage(null);
          setIsOpen(false);
        }, 2000);
      }
    } catch {
      setStatusMessage({
        type: 'error',
        text: 'An unexpected connection issue occurred. Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) {
    return (
      <div className="rounded-2xl border border-border/70 bg-card p-5 sm:p-6 shadow-xs hover:border-border transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
              <PlusCircle className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Quick Text / FAQ Ingestion
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Add policy excerpts, store hours, refund rules, or custom answers directly without uploading files.
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={() => setIsOpen(true)}
            className="text-xs h-8.5 px-3.5 gap-1.5 shrink-0 self-start sm:self-auto font-medium"
          >
            <PlusCircle className="h-3.5 w-3.5" />
            Add Knowledge
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/70 bg-card p-5 sm:p-6 shadow-xs space-y-4">
      <div className="flex items-center justify-between pb-3.5 border-b border-border/60">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
            <PlusCircle className="h-4.5 w-4.5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Add Knowledge or FAQ
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Your chatbot will use this entry as ground truth to answer customer inquiries.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setIsOpen(false);
            setStatusMessage(null);
          }}
          disabled={isSubmitting}
          className="text-xs text-muted-foreground hover:text-foreground font-medium px-2 py-1 rounded-md hover:bg-muted transition-colors"
        >
          Cancel
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 pt-1">
        <div className="space-y-1.5">
          <label htmlFor="faq-title" className="block text-xs font-medium text-foreground">
            Topic or Question
          </label>
          <input
            id="faq-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={isSubmitting}
            placeholder="e.g. Return Policy & Warranty Terms"
            maxLength={FAQ_LIMITS.maxTitleLength}
            className="w-full rounded-xl border border-border/80 bg-background px-3.5 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring transition-colors"
            required
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="faq-content" className="block text-xs font-medium text-foreground">
              Knowledge Content / Answer
            </label>
            <span className="text-[11px] font-mono text-muted-foreground bg-muted/40 px-2 py-0.5 rounded-md border border-border/40">
              {content.length} / {FAQ_LIMITS.maxTextLength.toLocaleString()} characters
            </span>
          </div>
          <textarea
            id="faq-content"
            rows={5}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={isSubmitting}
            placeholder="e.g. Customers can return items in their original packaging within 30 days of purchase for a full refund or exchange..."
            maxLength={FAQ_LIMITS.maxTextLength}
            className="w-full rounded-xl border border-border/80 bg-background p-3.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring transition-colors resize-y leading-relaxed"
            required
          />
        </div>

        {statusMessage && (
          <div
            className={`flex items-start gap-2.5 p-3 rounded-xl text-xs border ${
              statusMessage.type === 'success'
                ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-500'
                : 'border-rose-500/20 bg-rose-500/10 text-rose-500'
            }`}
          >
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            )}
            <p className="font-medium">{statusMessage.text}</p>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/60">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setIsOpen(false);
              setStatusMessage(null);
            }}
            disabled={isSubmitting}
            className="text-xs h-8.5 px-3.5"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="default"
            size="sm"
            disabled={isSubmitting}
            className="text-xs h-8.5 px-4 gap-1.5 font-medium"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Indexing into Knowledge Base...
              </>
            ) : (
              'Save to Knowledge Base'
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}

