'use server';

import { verifyWorkspaceOwner } from '@/lib/auth/dal';
import { connectDB } from '@/lib/db/mongoose';
import { getStripe, STRIPE_CONFIG } from '@/lib/stripe/client';
import { updateWorkspaceSubscription } from '@/lib/db/scoped-queries';
import { headers } from 'next/headers';

/**
 * Creates a Stripe Checkout Session for upgrading a workspace from Free to Pro.
 */
export async function createCheckoutSessionAction(
  workspaceSlug: string
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const { workspace, session } = await verifyWorkspaceOwner(workspaceSlug);

    if (workspace.plan === 'pro') {
      return { success: false, error: 'Your workspace is already on the Pro plan.' };
    }

    await connectDB();
    const stripe = getStripe();

    const headersList = await headers();
    const host = headersList.get('host') || 'localhost:3000';
    const proto = headersList.get('x-forwarded-proto') || 'http';
    const appBaseUrl = `${proto}://${host}`;

    // 1. Create or retrieve Stripe Customer
    let customerId = workspace.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: session.user?.email || undefined,
        name: workspace.name,
        metadata: {
          workspaceId: workspace._id.toString(),
          workspaceSlug: workspace.slug,
          ownerId: workspace.ownerId.toString(),
        },
      });
      customerId = customer.id;

      // Persist customer ID on workspace
      await updateWorkspaceSubscription(workspace._id, {
        plan: 'free',
        stripeCustomerId: customerId,
        messageLimit: workspace.messageLimit,
        dailyMessageCap: workspace.dailyMessageCap || 50,
      });
    }

    // 2. Create Stripe Checkout Session
    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [
        {
          price: STRIPE_CONFIG.proPriceId,
          quantity: 1,
        },
      ],
      client_reference_id: workspace._id.toString(),
      metadata: {
        workspaceId: workspace._id.toString(),
        workspaceSlug: workspace.slug,
      },
      success_url: `${appBaseUrl}/dashboard/${workspace.slug}/settings?upgrade=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appBaseUrl}/dashboard/${workspace.slug}/settings?upgrade=cancelled`,
    });

    if (!checkoutSession.url) {
      return { success: false, error: 'Failed to generate Stripe checkout URL.' };
    }

    return { success: true, url: checkoutSession.url };
  } catch (err: unknown) {
    console.error('[Billing Action Error]:', err instanceof Error ? err.message : 'Unknown error');
    return {
      success: false,
      error: 'An unexpected error occurred while initiating upgrade. Please try again.',
    };
  }
}

/**
 * Creates a Stripe Customer Billing Portal Session for managing active subscriptions.
 */
export async function createCustomerPortalAction(
  workspaceSlug: string
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const { workspace } = await verifyWorkspaceOwner(workspaceSlug);

    if (!workspace.stripeCustomerId) {
      return {
        success: false,
        error: 'No active billing profile found for this workspace. Please upgrade first.',
      };
    }

    const stripe = getStripe();
    const headersList = await headers();
    const host = headersList.get('host') || 'localhost:3000';
    const proto = headersList.get('x-forwarded-proto') || 'http';
    const returnUrl = `${proto}://${host}/dashboard/${workspace.slug}/settings`;

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: workspace.stripeCustomerId,
      return_url: returnUrl,
    });

    return { success: true, url: portalSession.url };
  } catch (err: unknown) {
    console.error('[Portal Action Error]:', err instanceof Error ? err.message : 'Unknown error');
    return {
      success: false,
      error: 'An unexpected error occurred opening the billing portal. Please try again.',
    };
  }
}

