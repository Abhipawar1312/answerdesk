'use client';

import * as React from 'react';
import { Trash2, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { deleteDocumentAction, retryDocumentAction } from '@/actions/document';

interface Props {
  workspaceSlug: string;
  documentId: string;
  canRetry?: boolean;
}

export function DocumentRowActions({ workspaceSlug, documentId, canRetry = false }: Props) {
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [isRetrying, setIsRetrying] = React.useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      setActionError(null);
      const res = await deleteDocumentAction(workspaceSlug, documentId);
      if (!res.success) {
        setActionError(res.error || 'Could not delete entry.');
        setIsConfirmingDelete(false);
      }
    } catch {
      setActionError('An error occurred while deleting.');
      setIsConfirmingDelete(false);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRetry = async () => {
    try {
      setIsRetrying(true);
      setActionError(null);
      const res = await retryDocumentAction(workspaceSlug, documentId);
      if (!res.success) {
        setActionError(res.error || 'Retry could not be completed.');
      }
    } catch {
      setActionError('An error occurred while retrying.');
    } finally {
      setIsRetrying(false);
    }
  };

  if (isConfirmingDelete) {
    return (
      <div className="flex items-center justify-end gap-1.5 font-sans">
        <span className="text-[11px] text-muted-foreground mr-1">Delete entry?</span>
        <Button
          variant="destructive"
          size="sm"
          disabled={isDeleting}
          onClick={handleDelete}
          className="h-6.5 px-2.5 text-[11px] rounded-lg shadow-2xs font-medium"
        >
          {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Yes, delete'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={isDeleting}
          onClick={() => {
            setIsConfirmingDelete(false);
            setActionError(null);
          }}
          className="h-6.5 px-2 text-[11px] rounded-lg border-border/80"
        >
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center justify-end gap-1.5">
        {canRetry && (
          <Button
            variant="outline"
            size="sm"
            disabled={isRetrying || isDeleting}
            onClick={handleRetry}
            className="h-7 px-2.5 text-[11px] gap-1.5 text-foreground rounded-lg border-border/80 hover:bg-muted/60 transition-colors shadow-2xs"
            title="Retry indexing"
          >
            {isRetrying ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RotateCcw className="h-3 w-3" />
            )}
            <span>Retry</span>
          </Button>
        )}

        <Button
          variant="ghost"
          size="sm"
          disabled={isDeleting || isRetrying}
          onClick={() => {
            setActionError(null);
            setIsConfirmingDelete(true);
          }}
          className="h-7 w-7 p-0 rounded-lg text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
          aria-label="Delete document"
          title="Delete entry"
        >
          {isDeleting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>

      {actionError && (
        <span className="text-[11px] text-rose-500 font-sans max-w-[200px] truncate" title={actionError}>
          {actionError}
        </span>
      )}
    </div>
  );
}
