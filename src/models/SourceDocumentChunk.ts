import { Schema, model, models, Model, Types } from 'mongoose';
import { enforceWorkspaceScoping } from '@/lib/db/plugins/enforceWorkspaceScoping';
import { EMBEDDING_CONFIG } from '@/lib/constants';

export interface ISourceDocumentChunk {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  documentId: Types.ObjectId;
  chunkIndex: number;
  content: string;
  tokenCount: number;
  embedding: number[]; // 768-dimensional float vector from gemini-embedding-001
  embeddingModel: string; // e.g. 'gemini-embedding-001' to guard against vector space mismatch
  metadata: {
    sourceTitle: string;
    pageNumber?: number;
  };
  createdAt: Date;
}

const SourceDocumentChunkSchema = new Schema<ISourceDocumentChunk>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    documentId: { type: Schema.Types.ObjectId, ref: 'SourceDocument', required: true, index: true },
    chunkIndex: { type: Number, required: true },
    content: { type: String, required: true },
    tokenCount: { type: Number, required: true },
    embedding: {
      type: [Number],
      required: true,
      validate: {
        validator: (v: number[]) => v.length === EMBEDDING_CONFIG.dimensions,
        message: `Embedding must have exactly ${EMBEDDING_CONFIG.dimensions} dimensions.`,
      },
    },
    embeddingModel: { type: String, required: true },
    metadata: {
      sourceTitle: { type: String, required: true },
      pageNumber: { type: Number },
    },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

// Compound index for document cleanup and scoped retrieval
SourceDocumentChunkSchema.index({ workspaceId: 1, documentId: 1, chunkIndex: 1 });

// Attach tenant isolation plugin
SourceDocumentChunkSchema.plugin(enforceWorkspaceScoping);

export const SourceDocumentChunk: Model<ISourceDocumentChunk> =
  models.SourceDocumentChunk ||
  model<ISourceDocumentChunk>('SourceDocumentChunk', SourceDocumentChunkSchema);

