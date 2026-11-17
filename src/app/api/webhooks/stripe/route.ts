import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { connectDB } from '@/lib/db/mongoose';
import { getStripe, STRIPE_CONFIG } from '@/lib/stripe/client';
import {
  updateWorkspaceSubscription,
  getWorkspaceByStripeCustomerId,
  getWorkspaceByStripeSubscriptionId,
} from '@/lib/db/scoped-queries';
import { PLAN_LIMITS } from '@/lib/constants';
import { ProcessedStripeEvent } from '@/models/ProcessedStripeEvent';
import { sendSubscriptionSuccessEmail, sendSubscriptionCancelledEmail } from '@/lib/email';

export async function POST(req: Request) {
  const stripe = getStripe();
  const signature = req.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  const rawBody = await req.text();
  let event: Stripe.Event;

  try {
    if (!STRIPE_CONFIG.webhookSecret) {
      // In development / testing without secret, parse directly if in test env
      if (process.env.NODE_ENV === 'test') {
        event = JSON.parse(rawBody) as Stripe.Event;
      } else {
        throw new Error('STRIPE_WEBHOOK_SECRET is not configured on the server.');
      }
    } else {
      event = stripe.webhooks.constructEvent(rawBody, signature, STRIPE_CONFIG.webhookSecret);
    }
  } catch (err: unknown) {
    console.error('[Stripe Webhook Signature Error]:', err instanceof Error ? err.message : 'Invalid signature');
    return NextResponse.json({ error: 'Invalid webhook signature.' }, { status: 400 });
  }

  await connectDB();

  // Strict Webhook Idempotency: Atomic insert on unique eventId index
  let insertedEventId: string | null = null;
  if (event.id) {
    try {
      await ProcessedStripeEvent.create({
        eventId: event.id,
        eventType: event.type,
      });
      insertedEventId = event.id;
    } catch (insertErr: unknown) {
      const isDuplicateKey =
        insertErr &&
        typeof insertErr === 'object' &&
        'code' in insertErr &&
        (insertErr as { code: number }).code === 11000;

      if (isDuplicateKey) {
        return NextResponse.json({ received: true, duplicate: true });
      }
      throw insertErr;
    }
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const workspaceId = session.client_reference_id || session.metadata?.workspaceId;

        if (workspaceId) {
          const customerId =
            typeof session.customer === 'string'
              ? session.customer
              : session.customer?.id;
          const subscriptionId =
            typeof session.subscription === 'string'
              ? session.subscription
              : session.subscription?.id;

          await updateWorkspaceSubscription(workspaceId, {
            plan: 'pro',
            stripeCustomerId: customerId || undefined,
            stripeSubscriptionId: subscriptionId || null,
            messageLimit: PLAN_LIMITS.pro.monthlyMessages,
            dailyMessageCap: 500,
          });

          // Send confirmation email asynchronously without blocking webhook return
          const customerEmail = session.customer_details?.email || session.customer_email;
          if (customerEmail) {
            sendSubscriptionSuccessEmail({
              to: customerEmail,
              name: session.customer_details?.name || undefined,
              workspaceName: session.metadata?.workspaceSlug || 'Workspace',
            }).catch((emailErr) => {
              console.warn('[Subscription Success Email Non-blocking Error]:', emailErr);
            });
          }
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const subId = subscription.id;
        const customerId =
          typeof subscription.customer === 'string'
            ? subscription.customer
            : subscription.customer?.id;

        const workspace =
          (await getWorkspaceByStripeSubscriptionId(subId)) ||
          (customerId ? await getWorkspaceByStripeCustomerId(customerId) : null);

        if (workspace) {
          const isActive = subscription.status === 'active' || subscription.status === 'trialing';
          if (isActive) {
            await updateWorkspaceSubscription(workspace._id, {
              plan: 'pro',
              stripeSubscriptionId: subId,
              messageLimit: PLAN_LIMITS.pro.monthlyMessages,
              dailyMessageCap: 500,
            });

            // If subscription is scheduled to cancel at period end, notify customer
            if (subscription.cancel_at_period_end && customerId) {
              try {
                const customer = await stripe.customers.retrieve(customerId);
                if (customer && !('deleted' in customer) && customer.email) {
                  const subWithPeriod = subscription as unknown as { current_period_end?: number };
                  const periodEndDate = subWithPeriod.current_period_end
                    ? new Date(subWithPeriod.current_period_end * 1000).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })
                    : undefined;

                  sendSubscriptionCancelledEmail({
                    to: customer.email,
                    name: customer.name || undefined,
                    workspaceName: workspace.name || 'Workspace',
                    periodEndDate,
                  }).catch((emailErr) => {
                    console.warn('[Subscription Cancel Email Non-blocking Error]:', emailErr);
                  });
                }
              } catch (custErr) {
                console.warn('[Stripe Customer Retrieve Warning]:', custErr);
              }
            }
          } else {
            // Subscription canceled, past_due, or unpaid
            await updateWorkspaceSubscription(workspace._id, {
              plan: 'free',
              stripeSubscriptionId: null,
              messageLimit: PLAN_LIMITS.free.monthlyMessages,
              dailyMessageCap: 50,
            });
          }
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const subId = subscription.id;
        const customerId =
          typeof subscription.customer === 'string'
            ? subscription.customer
            : subscription.customer?.id;

        const workspace =
          (await getWorkspaceByStripeSubscriptionId(subId)) ||
          (customerId ? await getWorkspaceByStripeCustomerId(customerId) : null);

        if (workspace) {
          await updateWorkspaceSubscription(workspace._id, {
            plan: 'free',
            stripeSubscriptionId: null,
            messageLimit: PLAN_LIMITS.free.monthlyMessages,
            dailyMessageCap: 50,
          });
        }
        break;
      }

      default:
        // Ignore other Stripe events
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err: unknown) {
    console.error('[Stripe Webhook Processing Error]:', err instanceof Error ? err.message : 'Unknown error');
    // If business processing fails after the idempotency record was inserted, delete the record
    // so Stripe's automatic webhook retry mechanism can re-attempt processing.
    if (insertedEventId) {
      await ProcessedStripeEvent.deleteOne({ eventId: insertedEventId }).catch(() => {});
    }
    return NextResponse.json(
      { error: 'Webhook processing encountered an error.' },
      { status: 500 }
    );
  }
}

