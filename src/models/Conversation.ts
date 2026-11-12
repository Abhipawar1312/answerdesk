import { Schema, model, models, Model, Types } from 'mongoose';
import { enforceWorkspaceScoping } from '@/lib/db/plugins/enforceWorkspaceScoping';

export interface IConversation {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  visitorId: string; // RFC4122 UUID v4
  startedAt: Date;
  lastMessageAt: Date;
  status: 'active' | 'resolved';
  isTest?: boolean;
}

const ConversationSchema = new Schema<IConversation>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    visitorId: { type: String, required: true, index: true },
    startedAt: { type: Date, default: Date.now },
    lastMessageAt: { type: Date, default: Date.now },
    status: { type: String, enum: ['active', 'resolved'], default: 'active' },
    isTest: { type: Boolean, default: false, index: true },
  },
  { timestamps: false }
);

// Compound index for visitor lookups within a workspace
ConversationSchema.index({ workspaceId: 1, visitorId: 1, lastMessageAt: -1 });

// Attach tenant isolation plugin
ConversationSchema.plugin(enforceWorkspaceScoping);

export const Conversation: Model<IConversation> =
  models.Conversation || model<IConversation>('Conversation', ConversationSchema);

