import { Schema, model, models, Model, Types } from 'mongoose';
import { enforceWorkspaceScoping } from '@/lib/db/plugins/enforceWorkspaceScoping';

export interface IMessage {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  conversationId: Types.ObjectId;
  role: 'user' | 'assistant' | 'system';
  content: string;
  sourceChunkIds?: Types.ObjectId[];
  citations?: Array<{
    documentId: Types.ObjectId;
    sourceTitle: string;
    chunkIndex: number;
    textSnippet?: string;
  }>;
  isUnanswered: boolean;
  isDismissed?: boolean;
  isGreeting?: boolean;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
  };
  createdAt: Date;
}

const MessageSchema = new Schema<IMessage>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
    role: { type: String, enum: ['user', 'assistant', 'system'], required: true },
    content: { type: String, required: true },
    sourceChunkIds: [{ type: Schema.Types.ObjectId, ref: 'SourceDocumentChunk' }],
    citations: [
      {
        documentId: { type: Schema.Types.ObjectId, ref: 'SourceDocument', required: true },
        sourceTitle: { type: String, required: true },
        chunkIndex: { type: Number, required: true },
        textSnippet: { type: String },
      },
    ],
    isUnanswered: { type: Boolean, default: false, index: true },
    isDismissed: { type: Boolean, default: false, index: true },
    isGreeting: { type: Boolean, default: false, index: true },
    tokenUsage: {
      promptTokens: { type: Number, default: 0 },
      completionTokens: { type: Number, default: 0 },
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Compound index for rendering messages in chronological order per conversation
MessageSchema.index({ workspaceId: 1, conversationId: 1, createdAt: 1 });

// Attach tenant isolation plugin
MessageSchema.plugin(enforceWorkspaceScoping);

export const Message: Model<IMessage> =
  models.Message || model<IMessage>('Message', MessageSchema);

