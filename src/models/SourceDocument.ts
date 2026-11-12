import { Schema, model, models, Model, Types } from 'mongoose';
import { enforceWorkspaceScoping } from '@/lib/db/plugins/enforceWorkspaceScoping';

export interface ISourceDocument {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  title: string;
  content?: string;
  fileName?: string;
  fileSize?: number;
  fileType: 'pdf' | 'txt' | 'md' | 'faq';
  fileUrl?: string;
  fileKey?: string;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  errorMessage?: string;
  chunkCount: number;
  processingStartedAt?: Date;
  uploadedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const SourceDocumentSchema = new Schema<ISourceDocument>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    title: { type: String, required: true, trim: true },
    content: { type: String, required: false },
    fileName: { type: String, required: false },
    fileSize: { type: Number, required: false },
    fileType: { type: String, enum: ['pdf', 'txt', 'md', 'faq'], required: true },
    fileUrl: { type: String, required: false },
    fileKey: { type: String, required: false },
    status: {
      type: String,
      enum: ['pending', 'processing', 'ready', 'failed'],
      default: 'pending',
      index: true,
    },
    errorMessage: { type: String },
    chunkCount: { type: Number, default: 0 },
    processingStartedAt: { type: Date },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

// Compound index for fast tenant query retrieval
SourceDocumentSchema.index({ workspaceId: 1, createdAt: -1 });

// Attach tenant isolation plugin
SourceDocumentSchema.plugin(enforceWorkspaceScoping);

export const SourceDocument: Model<ISourceDocument> =
  models.SourceDocument || model<ISourceDocument>('SourceDocument', SourceDocumentSchema);

