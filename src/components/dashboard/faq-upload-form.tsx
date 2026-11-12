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
      <div className="rounded border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground">
              Add Text or FAQ
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Add common questions and answers or policy notes directly.
            </p>
          </div>
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={() => setIsOpen(true)}
            className="text-xs h-8 gap-1.5 shrink-0 self-start sm:self-auto"
          >
            <PlusCircle className="h-3.5 w-3.5" />
            Add Knowledge
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded border border-border bg-card p-5">
      <div className="flex items-center justify-between pb-3 border-b border-border mb-4">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground">
            Add Knowledge or FAQ
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Your chatbot will use this information to answer customer questions.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setIsOpen(false);
            setStatusMessage(null);
          }}
          disabled={isSubmitting}
          className="text-xs text-muted-foreground hover:text-foreground font-medium"
        >
          Cancel
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="faq-title" className="block text-xs font-medium text-foreground mb-1">
            Topic or Question
          </label>
          <input
            id="faq-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={isSubmitting}
            placeholder="e.g. Return Policy & Store Hours"
            maxLength={FAQ_LIMITS.maxTitleLength}
            className="w-full rounded border border-border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-foreground"
            required
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label htmlFor="faq-content" className="block text-xs font-medium text-foreground">
              Information or Answer
            </label>
            <span className="text-[11px] font-mono text-muted-foreground">
              {content.length} / {FAQ_LIMITS.maxTextLength.toLocaleString()} characters
            </span>
          </div>
          <textarea
            id="faq-content"
            rows={5}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={isSubmitting}
            placeholder="e.g. Customers can return unworn items within 30 days of purchase with original receipt for a full refund..."
            maxLength={FAQ_LIMITS.maxTextLength}
            className="w-full rounded border border-border bg-background p-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-foreground resize-y"
            required
          />
        </div>

        {statusMessage && (
          <div className="flex items-start gap-2 p-3 rounded text-xs border border-border bg-muted/40 text-foreground">
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-foreground" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-foreground" />
            )}
            <p>{statusMessage.text}</p>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setIsOpen(false);
              setStatusMessage(null);
            }}
            disabled={isSubmitting}
            className="text-xs h-8"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="default"
            size="sm"
            disabled={isSubmitting}
            className="text-xs h-8 gap-1.5"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Saving to Chatbot...
              </>
            ) : (
              'Save to Chatbot'
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}

