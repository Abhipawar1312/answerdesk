import { Schema, model, models, Model, Types } from 'mongoose';
import { PLAN_LIMITS } from '@/lib/constants';

export interface IWorkspace {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  ownerId: Types.ObjectId;
  plan: 'free' | 'pro';
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  monthlyMessageCount: number;
  messageLimit: number;
  dailyMessageCount?: number;
  dailyMessageDate?: string;
  dailyMessageCap?: number;
  billingCycleAnchor?: Date;
  hideCitationsInWidget?: boolean;
  allowedOrigins: string[];
  ingestLockUntil?: Date | null;
  ingestLockToken?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const WorkspaceSchema = new Schema<IWorkspace>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
    // Note: unique: true enforces maxWorkspaces = 1 at the database layer (preventing race conditions).
    // If multi-workspace support is introduced in future plans, this unique index must be dropped.
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    plan: { type: String, enum: ['free', 'pro'], default: 'free' },
    stripeCustomerId: { type: String },
    stripeSubscriptionId: { type: String },
    monthlyMessageCount: { type: Number, default: 0 },
    messageLimit: { type: Number, default: PLAN_LIMITS.free.monthlyMessages },
    dailyMessageCount: { type: Number, default: 0 },
    dailyMessageDate: { type: String, default: '' },
    dailyMessageCap: { type: Number, default: 50 },
    billingCycleAnchor: { type: Date, default: Date.now },
    hideCitationsInWidget: { type: Boolean, default: false },
    allowedOrigins: { type: [String], default: [] },
    ingestLockUntil: { type: Date, default: null },
    ingestLockToken: { type: String, default: null },
  },
  { timestamps: true }
);

export const Workspace: Model<IWorkspace> =
  models.Workspace || model<IWorkspace>('Workspace', WorkspaceSchema);

