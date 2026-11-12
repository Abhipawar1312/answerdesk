import { Schema, model, models, Model } from 'mongoose';

export interface IProcessedStripeEvent {
  eventId: string;
  eventType: string;
  processedAt: Date;
}

const ProcessedStripeEventSchema = new Schema<IProcessedStripeEvent>(
  {
    eventId: { type: String, required: true, unique: true, index: true },
    eventType: { type: String, required: true },
    processedAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

// Expire idempotency records after 30 days
ProcessedStripeEventSchema.index({ processedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

export const ProcessedStripeEvent: Model<IProcessedStripeEvent> =
  models.ProcessedStripeEvent ||
  model<IProcessedStripeEvent>('ProcessedStripeEvent', ProcessedStripeEventSchema);

