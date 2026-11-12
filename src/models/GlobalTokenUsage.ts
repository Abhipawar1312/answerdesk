import { Schema, model, models, Model } from 'mongoose';

export interface IGlobalTokenUsage {
  tokens: number;
  createdAt: Date;
}

const GlobalTokenUsageSchema = new Schema<IGlobalTokenUsage>(
  {
    tokens: { type: Number, required: true },
    createdAt: { type: Date, default: Date.now, index: { expires: '5m' } },
  },
  { timestamps: false }
);

/**
 * Global Token Usage Model.
 *
 * Tracks project-wide Gemini API token consumption to guard the 30,000 TPM free-tier limit.
 *
 * NOTE:
 * - This collection holds NO tenant data (no workspaceId, no documentId, no user data).
 * - It does NOT use the enforceWorkspaceScoping plugin because it is an infrastructure counter,
 *   not tenant data.
 * - In Phase 3, this MongoDB-based sliding window will be replaced by Upstash Redis.
 */
export const GlobalTokenUsage: Model<IGlobalTokenUsage> =
  models.GlobalTokenUsage || model<IGlobalTokenUsage>('GlobalTokenUsage', GlobalTokenUsageSchema);

