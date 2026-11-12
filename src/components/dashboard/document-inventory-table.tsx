'use client';

import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Loader2, AlertCircle, Clock } from 'lucide-react';
import { DocumentRowActions } from '@/components/dashboard/document-row-actions';
import { formatDate } from '@/lib/date';

export interface DocumentItem {
  id: string;
  title: string;
  fileType: string;
  fileSize?: number;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  chunkCount: number;
  errorMessage?: string;
  createdAt: string;
}

interface DocumentInventoryTableProps {
  workspaceSlug: string;
  initialDocuments: DocumentItem[];
}

export function DocumentInventoryTable({
  workspaceSlug,
  initialDocuments,
}: DocumentInventoryTableProps) {
  // TanStack Query polls document indexing statuses every 3s while documents are pending/processing to show real-time progress.
  const { data } = useQuery<{
    documents: Array<{ id: string; status: DocumentItem['status']; chunkCount: number; errorMessage?: string }>;
  }>({
    queryKey: ['documents-status', workspaceSlug],
    queryFn: async () => {
      const res = await fetch(`/api/workspaces/${workspaceSlug}/documents/status`);
      if (!res.ok) throw new Error('Failed to fetch document status');
      return res.json();
    },
    refetchInterval: (query) => {
      const docs = query.state.data?.documents;
      const stillWorking = docs?.some((d) => d.status === 'processing' || d.status === 'pending');
      return stillWorking ? 3000 : false;
    },
    initialData: {
      documents: initialDocuments.map((d) => ({
        id: d.id,
        status: d.status,
        chunkCount: d.chunkCount,
        errorMessage: d.errorMessage,
      })),
    },
  });

  const statusMap = new Map(data?.documents.map((d) => [d.id, d]));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="border-b border-border bg-muted/20 text-muted-foreground uppercase text-[11px] tracking-wider font-medium">
          <tr>
            <th className="px-5 py-2.5">Title</th>
            <th className="px-4 py-2.5">Format</th>
            <th className="px-4 py-2.5">Size</th>
            <th className="px-4 py-2.5">Status</th>
            <th className="px-4 py-2.5">Sections</th>
            <th className="px-4 py-2.5">Created</th>
            <th className="px-4 py-2.5 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border font-mono text-xs">
          {initialDocuments.map((doc) => {
            const liveInfo = statusMap.get(doc.id);
            const currentStatus = liveInfo?.status ?? doc.status;
            const currentChunks = liveInfo?.chunkCount ?? doc.chunkCount;
            const currentError = liveInfo?.errorMessage ?? doc.errorMessage;

            const sizeDisplay = doc.fileSize
              ? `${(doc.fileSize / 1024).toFixed(1)} KB`
              : 'Text FAQ';

            return (
              <tr key={doc.id} className="hover:bg-muted/10 transition-colors">
                <td className="px-5 py-3 font-sans font-medium text-foreground">
                  {doc.title}
                </td>
                <td className="px-4 py-3 uppercase text-xs text-muted-foreground">
                  {doc.fileType}
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">
                  {sizeDisplay}
                </td>
                <td className="px-4 py-3">
                  <div className="space-y-1">
                    {currentStatus === 'ready' && (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium border border-border bg-muted/40 text-foreground font-sans">
                        <CheckCircle2 className="h-3 w-3" />
                        Ready
                      </span>
                    )}
                    {currentStatus === 'processing' && (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium border border-border bg-muted/40 text-muted-foreground font-sans">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Processing
                      </span>
                    )}
                    {currentStatus === 'pending' && (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium border border-border bg-muted/40 text-muted-foreground font-sans">
                        <Clock className="h-3 w-3" />
                        Pending
                      </span>
                    )}
                    {currentStatus === 'failed' && (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium border border-border bg-muted/40 text-foreground font-semibold font-sans">
                        <AlertCircle className="h-3 w-3" />
                        Failed
                      </span>
                    )}
                    {currentError && currentStatus === 'failed' && (
                      <p
                        className="text-[11px] text-muted-foreground font-sans max-w-[220px] truncate"
                        title={currentError}
                      >
                        {currentError}
                      </p>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">
                  {currentChunks ?? 0}
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">
                  {formatDate(doc.createdAt)}
                </td>
                <td className="px-4 py-3 text-right">
                  <DocumentRowActions
                    workspaceSlug={workspaceSlug}
                    documentId={doc.id}
                    canRetry={currentStatus === 'failed'}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

