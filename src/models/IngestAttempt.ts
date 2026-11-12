import { Schema, model, models, Model, Types } from 'mongoose';
import { enforceWorkspaceScoping } from '@/lib/db/plugins/enforceWorkspaceScoping';

export interface IIngestAttempt {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  documentId?: Types.ObjectId;
  attemptType: 'create' | 'retry';
  chunkCount: number;
  status: 'started' | 'success' | 'failed';
  createdAt: Date;
}

const IngestAttemptSchema = new Schema<IIngestAttempt>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    documentId: { type: Schema.Types.ObjectId, ref: 'SourceDocument', required: false },
    attemptType: { type: String, enum: ['create', 'retry'], required: true },
    chunkCount: { type: Number, required: true },
    status: {
      type: String,
      enum: ['started', 'success', 'failed'],
      default: 'started',
      required: true,
    },
    // TTL index: 2 hours (7200 seconds). Automatically cleaned up by MongoDB.
    createdAt: { type: Date, default: Date.now, index: { expires: '2h' } },
  },
  { timestamps: false }
);

// Compound index for querying recent workspace attempts and chunk velocity
IngestAttemptSchema.index({ workspaceId: 1, createdAt: -1 });

// Guarded by tenant isolation plugin
IngestAttemptSchema.plugin(enforceWorkspaceScoping);

export const IngestAttempt: Model<IIngestAttempt> =
  models.IngestAttempt || model<IIngestAttempt>('IngestAttempt', IngestAttemptSchema);

