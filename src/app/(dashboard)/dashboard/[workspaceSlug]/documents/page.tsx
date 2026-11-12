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

  return (
    <div className="space-y-6 sm:space-y-8 max-w-6xl mx-auto w-full">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Source Documents
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Upload documents. The chatbot will base its answers strictly on these files.
        </p>
      </div>

      {/* Text / FAQ Ingestion Form */}
      <FaqUploadForm workspaceSlug={workspace.slug} />

      {/* Upload Zone */}
      <div className="rounded border border-border bg-card p-4 sm:p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Document File Upload
          </h2>
          <span className="font-mono text-xs text-muted-foreground">
            {activeDocCount} / {limits.maxDocuments} documents
          </span>
        </div>
        <DocumentUploadDropzone
          workspaceSlug={workspace.slug}
          maxFileSizeMB={limits.maxFileSizeMB}
        />
      </div>

      {/* Document Inventory Table */}
      <div className="rounded border border-border bg-card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border flex items-center justify-between bg-muted/10">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground">
            Knowledge Base ({documents.length})
          </h2>
        </div>

        {documents.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
            <h3 className="text-xs font-medium text-foreground">No knowledge base entries yet</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Add common questions and answers above so your chatbot can start answering customer queries.
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
