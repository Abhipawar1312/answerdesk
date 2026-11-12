import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Workspace } from '@/models/Workspace';
import { ProcessedStripeEvent } from '@/models/ProcessedStripeEvent';
import { POST } from './route';

const mockConstructEvent = vi.fn();

vi.mock('@/lib/stripe/client', () => ({
  STRIPE_CONFIG: {
    webhookSecret: 'whsec_test_secret_123',
    proPriceId: 'price_test_pro',
  },
  getStripe: () => ({
    webhooks: {
      constructEvent: mockConstructEvent,
    },
  }),
}));

vi.mock('@/lib/db/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}));

describe('Stripe Webhook Handler (/api/webhooks/stripe)', () => {
  let mongoServer: MongoMemoryServer;
  const ownerId = new mongoose.Types.ObjectId();
  let workspaceId: mongoose.Types.ObjectId;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
    await ProcessedStripeEvent.syncIndexes();

    const ws = await Workspace.create({
      name: 'Webhook WS',
      slug: 'webhook-ws',
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
    await ProcessedStripeEvent.deleteMany({});

    await Workspace.updateOne(
      { _id: workspaceId },
      {
        $set: {
          plan: 'free',
          stripeCustomerId: undefined,
          stripeSubscriptionId: undefined,
          messageLimit: 100,
          dailyMessageCap: 50,
        },
      }
    );
  });

  it('rejects requests missing stripe-signature header with 400', async () => {
    const req = new Request('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      body: JSON.stringify({ type: 'ping' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Missing stripe-signature header');
  });

  it('handles checkout.session.completed and upgrades workspace to Pro plan', async () => {
    const fakeEvent = {
      id: 'evt_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_success',
          client_reference_id: workspaceId.toString(),
          customer: 'cus_stripe_abc',
          subscription: 'sub_stripe_xyz',
        },
      },
    };

    mockConstructEvent.mockReturnValueOnce(fakeEvent);

    const req = new Request('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      headers: {
        'stripe-signature': 'sig_test_valid',
      },
      body: JSON.stringify(fakeEvent),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const updatedWs = await Workspace.findById(workspaceId);
    expect(updatedWs?.plan).toBe('pro');
    expect(updatedWs?.messageLimit).toBe(2500);
    expect(updatedWs?.dailyMessageCap).toBe(500);
    expect(updatedWs?.stripeCustomerId).toBe('cus_stripe_abc');
    expect(updatedWs?.stripeSubscriptionId).toBe('sub_stripe_xyz');
  });

  it('handles customer.subscription.deleted and downgrades workspace to Free plan', async () => {
    await Workspace.updateOne(
      { _id: workspaceId },
      {
        $set: {
          plan: 'pro',
          stripeCustomerId: 'cus_active_sub',
          stripeSubscriptionId: 'sub_to_cancel',
          messageLimit: 2500,
        },
      }
    );

    const fakeEvent = {
      id: 'evt_2',
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_to_cancel',
          customer: 'cus_active_sub',
        },
      },
    };

    mockConstructEvent.mockReturnValueOnce(fakeEvent);

    const req = new Request('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      headers: {
        'stripe-signature': 'sig_test_valid',
      },
      body: JSON.stringify(fakeEvent),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const downgradedWs = await Workspace.findById(workspaceId);
    expect(downgradedWs?.plan).toBe('free');
    expect(downgradedWs?.messageLimit).toBe(100);
    expect(downgradedWs?.stripeSubscriptionId).toBeNull();
  });

  it('handles customer.subscription.updated when status becomes canceled', async () => {
    await Workspace.updateOne(
      { _id: workspaceId },
      {
        $set: {
          plan: 'pro',
          stripeCustomerId: 'cus_active_update',
          stripeSubscriptionId: 'sub_to_update',
          messageLimit: 2500,
        },
      }
    );

    const fakeEvent = {
      id: 'evt_3',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_to_update',
          customer: 'cus_active_update',
          status: 'canceled',
        },
      },
    };

    mockConstructEvent.mockReturnValueOnce(fakeEvent);

    const req = new Request('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      headers: {
        'stripe-signature': 'sig_test_valid',
      },
      body: JSON.stringify(fakeEvent),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const updatedWs = await Workspace.findById(workspaceId);
    expect(updatedWs?.plan).toBe('free');
    expect(updatedWs?.messageLimit).toBe(100);
  });

  it('drops duplicate webhook events with { received: true, duplicate: true }', async () => {
    const fakeEvent = {
      id: 'evt_duplicate_test',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_duplicate',
          client_reference_id: workspaceId.toString(),
          customer: 'cus_dup_1',
          subscription: 'sub_dup_1',
        },
      },
    };

    mockConstructEvent.mockReturnValue(fakeEvent);

    const makeReq = () =>
      new Request('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        headers: { 'stripe-signature': 'sig_valid' },
        body: JSON.stringify(fakeEvent),
      });

    // First call: successfully processed
    const res1 = await POST(makeReq());
    expect(res1.status).toBe(200);
    const data1 = await res1.json();
    expect(data1).toEqual({ received: true });

    // Verify event is in ProcessedStripeEvent
    const stored = await ProcessedStripeEvent.findOne({ eventId: 'evt_duplicate_test' });
    expect(stored).not.toBeNull();
    expect(stored?.eventType).toBe('checkout.session.completed');

    // Second call: duplicate event detected
    const res2 = await POST(makeReq());
    expect(res2.status).toBe(200);
    const data2 = await res2.json();
    expect(data2).toEqual({ received: true, duplicate: true });
  });

  it('handles parallel duplicate webhook requests atomically via unique index', async () => {
    const fakeEvent = {
      id: 'evt_parallel_race_test',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_race_1',
          client_reference_id: workspaceId.toString(),
          customer: 'cus_race_1',
          subscription: 'sub_race_1',
        },
      },
    };

    mockConstructEvent.mockReturnValue(fakeEvent);

    const makeReq = () =>
      new Request('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        headers: { 'stripe-signature': 'sig_race' },
        body: JSON.stringify(fakeEvent),
      });

    // Fire 5 identical requests concurrently
    const responses = await Promise.all([
      POST(makeReq()),
      POST(makeReq()),
      POST(makeReq()),
      POST(makeReq()),
      POST(makeReq()),
    ]);

    const results = await Promise.all(responses.map((r) => r.json()));

    // Exactly 1 must have { received: true } and 4 must have { received: true, duplicate: true }
    const processed = results.filter((r) => r.received === true && !r.duplicate);
    const duplicates = results.filter((r) => r.received === true && r.duplicate === true);

    expect(processed.length).toBe(1);
    expect(duplicates.length).toBe(4);
  });

  it('cleans up idempotency record if processing fails so Stripe can retry', async () => {
    const fakeEvent = {
      id: 'evt_failure_cleanup_test',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_failing_session',
          client_reference_id: workspaceId.toString(),
          customer: 'cus_fail_customer',
          subscription: 'sub_fail_sub',
        },
      },
    };

    mockConstructEvent.mockReturnValue(fakeEvent);

    // Mock an unexpected database error during updateWorkspaceSubscription
    const scopedQueries = await import('@/lib/db/scoped-queries');
    const updateSpy = vi
      .spyOn(scopedQueries, 'updateWorkspaceSubscription')
      .mockRejectedValueOnce(new Error('Simulated DB network fault during update'));

    const req = new Request('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': 'sig_fail' },
      body: JSON.stringify(fakeEvent),
    });

    const res = await POST(req);
    expect(res.status).toBe(500);

    // Record should be deleted so Stripe retry can proceed
    const stored = await ProcessedStripeEvent.findOne({ eventId: 'evt_failure_cleanup_test' });
    expect(stored).toBeNull();

    updateSpy.mockRestore();
  });
});

