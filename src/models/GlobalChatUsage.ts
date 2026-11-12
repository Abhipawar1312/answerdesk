import { Schema, model, models, Model } from 'mongoose';

export interface IGlobalChatUsage {
  isTest: boolean;
  createdAt: Date;
}

const GlobalChatUsageSchema = new Schema<IGlobalChatUsage>(
  {
    isTest: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now, index: { expires: '24h' } },
  },
  { timestamps: false }
);

/**
 * Global Chat Usage Model.
 *
 * Tracks project-wide Gemini Flash Lite API requests to guard the 500 RPD free-tier limit.
 *
 * NOTE:
 * - This collection holds NO tenant data (no workspaceId, no documentId, no user data).
 * - It does NOT use the enforceWorkspaceScoping plugin because it is an infrastructure counter,
 *   not tenant data.
 */
export const GlobalChatUsage: Model<IGlobalChatUsage> =
  models.GlobalChatUsage || model<IGlobalChatUsage>('GlobalChatUsage', GlobalChatUsageSchema);

