import Stripe from 'stripe';

export const STRIPE_CONFIG = {
  proPriceId: process.env.STRIPE_PRO_PRICE_ID || 'price_1TestProMonthly',
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
};

let stripeClient: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder_key_for_testing';
    stripeClient = new Stripe(key, {
      apiVersion: '2025-02-24.acacia' as Stripe.LatestApiVersion,
      typescript: true,
    });
  }
  return stripeClient;
}

