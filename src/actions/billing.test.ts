import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { Session } from 'next-auth';
import { Workspace } from '@/models/Workspace';
import { createCheckoutSessionAction, createCustomerPortalAction } from './billing';
import * as authModule from '@/lib/auth';

const mockStripeCustomersCreate = vi.fn();
const mockStripeCheckoutSessionsCreate = vi.fn();
const mockStripeBillingPortalSessionsCreate = vi.fn();

vi.mock('@/lib/stripe/client', () => ({
  STRIPE_CONFIG: {
    proPriceId: 'price_test_pro_123',
    webhookSecret: 'whsec_test_secret',
  },
  getStripe: () => ({
    customers: {
      create: mockStripeCustomersCreate,
    },
    checkout: {
      sessions: {
        create: mockStripeCheckoutSessionsCreate,
      },
    },
    billingPortal: {
      sessions: {
        create: mockStripeBillingPortalSessionsCreate,
      },
    },
  }),
}));

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Map([['host', 'test.answerdesk.app']])),
}));

vi.mock('@/lib/db/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}));

describe('Billing Server Actions (Stripe Test Mode)', () => {
  let mongoServer: MongoMemoryServer;
  const ownerId = new mongoose.Types.ObjectId();
  let workspaceId: mongoose.Types.ObjectId;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);

    const ws = await Workspace.create({
      name: 'Billing Test WS',
      slug: 'billing-ws',
      ownerId,
      plan: 'free',
      monthlyMessageCount: 0,
      messageLimit: 100,
    });
    workspaceId = ws._id;
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    vi.clearAllMocks();

    const mockSession: Session = {
      user: {
        id: ownerId.toString(),
        name: 'Test Owner',
        email: 'owner@example.com',
      },
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
    vi.mocked(authModule.auth as () => Promise<Session | null>).mockResolvedValue(mockSession);

    await Workspace.updateOne(
      { _id: workspaceId },
      {
        $set: { plan: 'free' },
        $unset: { stripeCustomerId: 1, stripeSubscriptionId: 1 },
      }
    );
  });

  describe('createCheckoutSessionAction', () => {
    it('creates customer and checkout session for a free workspace', async () => {
      mockStripeCustomersCreate.mockResolvedValueOnce({ id: 'cus_test_123' });
      mockStripeCheckoutSessionsCreate.mockResolvedValueOnce({
        id: 'cs_test_session',
        url: 'https://checkout.stripe.com/pay/cs_test_session',
      });

      const res = await createCheckoutSessionAction('billing-ws');
      expect(res.success).toBe(true);
      expect(res.url).toBe('https://checkout.stripe.com/pay/cs_test_session');

      // Verify stripe customer was created with owner email
      expect(mockStripeCustomersCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'owner@example.com',
          name: 'Billing Test WS',
        })
      );

      // Verify workspace stored the new customer ID
      const updatedWs = await Workspace.findById(workspaceId);
      expect(updatedWs?.stripeCustomerId).toBe('cus_test_123');
    });

    it('reuses existing stripeCustomerId without recreating customer', async () => {
      await Workspace.updateOne(
        { _id: workspaceId },
        { $set: { stripeCustomerId: 'cus_existing_999' } }
      );

      mockStripeCheckoutSessionsCreate.mockResolvedValueOnce({
        id: 'cs_test_session_2',
        url: 'https://checkout.stripe.com/pay/cs_test_session_2',
      });

      const res = await createCheckoutSessionAction('billing-ws');
      expect(res.success).toBe(true);
      expect(mockStripeCustomersCreate).not.toHaveBeenCalled();
      expect(mockStripeCheckoutSessionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: 'cus_existing_999',
        })
      );
    });

    it('rejects upgrade if workspace is already on pro plan', async () => {
      await Workspace.updateOne(
        { _id: workspaceId },
        { $set: { plan: 'pro' } }
      );

      const res = await createCheckoutSessionAction('billing-ws');
      expect(res.success).toBe(false);
      expect(res.error).toContain('already on the Pro plan');
    });
  });

  describe('createCustomerPortalAction', () => {
    it('creates customer portal session for a workspace with billing profile', async () => {
      await Workspace.updateOne(
        { _id: workspaceId },
        { $set: { stripeCustomerId: 'cus_portal_123' } }
      );

      mockStripeBillingPortalSessionsCreate.mockResolvedValueOnce({
        url: 'https://billing.stripe.com/session/portal_123',
      });

      const res = await createCustomerPortalAction('billing-ws');
      expect(res.success).toBe(true);
      expect(res.url).toBe('https://billing.stripe.com/session/portal_123');
      expect(mockStripeBillingPortalSessionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: 'cus_portal_123',
        })
      );
    });

    it('rejects portal request when no stripeCustomerId exists', async () => {
      const res = await createCustomerPortalAction('billing-ws');
      expect(res.success).toBe(false);
      expect(res.error).toContain('No active billing profile found');
    });
  });
});

