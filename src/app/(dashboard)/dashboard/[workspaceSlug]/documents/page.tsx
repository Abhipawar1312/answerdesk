import { Suspense } from 'react';
import { connection } from 'next/server';
import { verifyWorkspaceOwner } from '@/lib/auth/dal';
import { connectDB } from '@/lib/db/mongoose';
import {
  getWorkspaceDocuments,
  countWorkspaceDocuments,
  isProcessingTimedOut,
} from '@/lib/db/scoped-queries';
import { DocumentUploadDropzone } from '@/components/dashboard/document-upload-dropzone';
import { FaqUploadForm } from '@/components/dashboard/faq-upload-form';
import { DocumentInventoryTable } from '@/components/dashboard/document-inventory-table';
import { PLAN_LIMITS } from '@/lib/constants';
import { FileText } from 'lucide-react';
import DocumentsLoading from './loading';

export default function DocumentsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  return (
    <Suspense fallback={<DocumentsLoading />}>
      <DocumentsData params={params} />
    </Suspense>
  );
}

async function DocumentsData({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  await connection();
  const { workspaceSlug } = await params;
  const { workspace } = await verifyWorkspaceOwner(workspaceSlug);

  await connectDB();

  // Scoped query via repository layer
  const documents = await getWorkspaceDocuments(workspace._id);
  const activeDocCount = await countWorkspaceDocuments(workspace._id);

  const plan = workspace.plan || 'free';
  const limits = PLAN_LIMITS[plan];
  const quotaPercent = Math.min(100, Math.round((activeDocCount / limits.maxDocuments) * 100));

  return (
    <div className="space-y-6 sm:space-y-8 max-w-6xl mx-auto w-full">
      {/* Header & Quota Overview */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border/60">
        <div>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <FileText className="h-4 w-4" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Knowledge Base
            </h1>
          </div>
          <p className="text-xs text-muted-foreground mt-1.5 ml-10">
            Upload PDFs, Markdown files, or FAQ entries. Your AI agent strictly grounds its answers on this verified content.
          </p>
        </div>

        {/* Quota Progress Pill */}
        <div className="sm:text-right shrink-0 bg-card/80 border border-border/80 rounded-xl p-3 sm:min-w-[180px] shadow-2xs">
          <div className="flex items-center justify-between gap-3 text-xs mb-1.5">
            <span className="text-[11px] font-medium text-muted-foreground">Document Storage</span>
            <span className="font-mono text-xs font-semibold text-foreground">
              {activeDocCount} / {limits.maxDocuments}
            </span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                quotaPercent >= 90 ? 'bg-amber-500' : 'bg-primary'
              }`}
              style={{ width: `${Math.max(4, quotaPercent)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Text / FAQ Ingestion Form */}
      <FaqUploadForm workspaceSlug={workspace.slug} />

      {/* Upload Zone */}
      <div className="rounded-2xl border border-border/70 bg-card p-5 sm:p-6 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              File Ingestion
            </h2>
            <p className="text-xs text-muted-foreground/80 mt-0.5">
              Drag and drop source manuals, policies, or export files to chunk and vector-index.
            </p>
          </div>
          <span className="font-mono text-[11px] px-2 py-0.5 rounded-md bg-muted/60 border border-border/60 text-muted-foreground">
            Max {limits.maxFileSizeMB}MB / file
          </span>
        </div>
        <DocumentUploadDropzone
          workspaceSlug={workspace.slug}
          maxFileSizeMB={limits.maxFileSizeMB}
        />
      </div>

      {/* Document Inventory Table */}
      <div className="rounded-2xl border border-border/70 bg-card overflow-hidden shadow-xs">
        <div className="px-5 py-4 border-b border-border/60 flex items-center justify-between bg-muted/20">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground">
              Indexed Knowledge Sources
            </h2>
            <span className="inline-flex items-center justify-center px-2 py-0.5 text-[10px] font-mono font-medium rounded-full bg-primary/10 text-primary border border-primary/20">
              {documents.length}
            </span>
          </div>
        </div>

        {documents.length === 0 ? (
          <div className="py-16 px-6 text-center">
            <div className="h-12 w-12 rounded-2xl bg-muted/60 border border-border/80 flex items-center justify-center mx-auto mb-3.5 text-muted-foreground">
              <FileText className="h-6 w-6" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">No knowledge base sources yet</h3>
            <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
              Upload customer support documents or add frequently asked questions above so your chatbot can immediately start answering visitor inquiries.
            </p>
          </div>
        ) : (
          <DocumentInventoryTable
            workspaceSlug={workspace.slug}
            initialDocuments={documents.map((doc) => {
              const isTimedOut =
                doc.status === 'processing' && isProcessingTimedOut(doc.processingStartedAt);
              return {
                id: doc._id.toString(),
                title: doc.title,
                fileType: doc.fileType,
                fileSize: doc.fileSize,
                status: isTimedOut ? 'failed' : doc.status,
                chunkCount: doc.chunkCount ?? 0,
                errorMessage: isTimedOut ? 'Indexing timed out after 5 minutes.' : doc.errorMessage,
                createdAt: doc.createdAt.toISOString(),
              };
            })}
          />
        )}
      </div>
    </div>
  );
}
