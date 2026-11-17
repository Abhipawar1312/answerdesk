import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  sendEmail,
  sendWelcomeEmail,
  sendSubscriptionSuccessEmail,
  sendSubscriptionCancelledEmail,
} from './index';

describe('Email Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('safely handles simulated email delivery in test environment without crashing', async () => {
    const result = await sendEmail({
      to: 'test@example.com',
      subject: 'Test Subject',
      html: '<p>Test content</p>',
    });

    expect(result.success).toBe(true);
    expect(result.simulated).toBe(true);
  });

  it('builds and delivers welcome email template properly', async () => {
    const result = await sendWelcomeEmail({
      to: 'newuser@example.com',
      name: 'Abhishek Pawar',
      appUrl: 'https://answerdesk-ai.vercel.app',
    });

    expect(result.success).toBe(true);
    expect(result.simulated).toBe(true);
  });

  it('builds and delivers subscription upgrade confirmation email', async () => {
    const result = await sendSubscriptionSuccessEmail({
      to: 'customer@example.com',
      name: 'Abhishek',
      workspaceName: 'Acme Corp',
    });

    expect(result.success).toBe(true);
    expect(result.simulated).toBe(true);
  });

  it('builds and delivers subscription cancellation reminder email', async () => {
    const result = await sendSubscriptionCancelledEmail({
      to: 'customer@example.com',
      name: 'Abhishek',
      workspaceName: 'Acme Corp',
      periodEndDate: 'Dec 13, 2026',
    });

    expect(result.success).toBe(true);
    expect(result.simulated).toBe(true);
  });
});

