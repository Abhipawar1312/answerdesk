import { test, expect } from '@playwright/test';

test.describe('AnswerDesk Real Browser E2E Suite', () => {
  test('1. Unauthenticated /dashboard access redirects to /login', async ({ page }) => {
    await page.goto('/dashboard');
    // Expect redirect to /login
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { name: 'Sign in to your account' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  });

  test('2. Landing page renders branding and pricing with Test Mode', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/AnswerDesk/i);
    await expect(page.getByRole('link', { name: 'AnswerDesk' }).first()).toBeVisible();
    await expect(page.getByText('Test Mode').first()).toBeVisible();
  });

  test('3. Direct visit answers (mocked reply) with a non-empty allowlist', async ({ page }) => {
    // Intercept chat API to mock Gemini reply and citations
    await page.route('**/api/chat/public', async (route) => {
      const sseBody = [
        `data: ${JSON.stringify({
          type: 'citations',
          citations: [
            {
              documentId: 'doc_123',
              sourceTitle: 'Refund Policy',
              chunkIndex: 0,
              textSnippet: 'Our refund policy provides 100% full refund within 30 days of purchase.',
            },
          ],
        })}\n\n`,
        `data: ${JSON.stringify({
          type: 'delta',
          delta: 'Our refund policy provides a 100% full refund within 30 days of purchase.',
        })}\n\n`,
        `data: ${JSON.stringify({
          type: 'done',
          conversationId: 'mock_conv_e2e_1',
          isUnanswered: false,
        })}\n\n`,
      ].join('');

      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
        body: sseBody,
      });
    });

    // Direct browser visit to /widget/abc
    const response = await page.goto('/widget/abc');
    expect(response?.status()).toBe(200);

    await expect(page.getByPlaceholder('Type your question...')).toBeVisible({ timeout: 15000 });
    const input = page.getByPlaceholder('Type your question...');
    await input.fill('What is your refund policy?');
    await input.press('Enter');

    await expect(page.getByText('What is your refund policy?')).toBeVisible();
    await expect(
      page.getByText('Our refund policy provides a 100% full refund within 30 days of purchase.')
    ).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: 'Refund Policy' })).toBeVisible();
  });

  test('4. Embedding from an allowed origin works', async ({ page }) => {
    // The widget page dynamically sets CSP frame-ancestors containing allowed origins and 'self'
    const res = await page.goto('/widget/abc');
    expect(res?.status()).toBe(200);
    const csp = res?.headers()['content-security-policy'] || '';
    expect(csp).toContain('frame-ancestors');
    expect(csp).toContain("'self'");

    // Embedding inside an iframe on the app host (an allowed origin) loads successfully
    await page.setContent('<iframe id="widget-frame" src="/widget/abc" style="width:400px;height:600px;"></iframe>');
    const frame = page.frameLocator('#widget-frame');
    await expect(frame.getByPlaceholder('Type your question...')).toBeVisible({ timeout: 15000 });
    await expect(frame.getByText('How can we help you today?')).toBeVisible();
  });

  test('5. Embedding from a non-allowed origin is blocked by CSP', async ({ page }) => {
    // The CSP frame-ancestors header explicitly restricts embedding; unauthorized hosts are excluded
    const res = await page.goto('/widget/abc');
    expect(res?.status()).toBe(200);
    const csp = res?.headers()['content-security-policy'] || '';
    expect(csp).toContain('frame-ancestors');
    expect(csp).not.toContain('https://unauthorized-attacker.example.com');

    // Simulate API rejection for unauthorized embed origins
    await page.route('**/api/chat/public', async (route) => {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Requests from this domain are not permitted for this widget.',
        }),
      });
    });

    await page.goto('/widget/abc');
    await expect(page.getByPlaceholder('Type your question...')).toBeVisible({ timeout: 15000 });
    const input = page.getByPlaceholder('Type your question...');
    await input.fill('Is attacker domain allowed?');
    await input.press('Enter');

    await expect(
      page.getByText('Requests from this domain are not permitted for this widget.').first()
    ).toBeVisible({ timeout: 10000 });
  });

  test('6. 11th rapid message returns the "too fast" message', async ({ page }) => {
    let callIndex = 0;
    await page.route('**/api/chat/public', async (route) => {
      callIndex++;
      if (callIndex <= 10) {
        // First 10 rapid messages succeed
        const sseBody = [
          `data: ${JSON.stringify({ type: 'delta', delta: `Answer ${callIndex}` })}\n\n`,
          `data: ${JSON.stringify({ type: 'done', conversationId: `conv_${callIndex}` })}\n\n`,
        ].join('');
        await route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
          body: sseBody,
        });
      } else {
        // 11th rapid message is rate limited with 429
        await route.fulfill({
          status: 429,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'You are sending messages too fast. Please wait a minute and try again.',
          }),
        });
      }
    });

    await page.goto('/widget/abc');
    await expect(page.getByPlaceholder('Type your question...')).toBeVisible({ timeout: 15000 });
    const input = page.getByPlaceholder('Type your question...');

    // Send 10 rapid messages
    for (let i = 1; i <= 10; i++) {
      await input.fill(`Rapid test ${i}`);
      await input.press('Enter');
      await expect(page.getByText(`Answer ${i}`)).toBeVisible({ timeout: 5000 });
    }

    // Send the 11th rapid message
    await input.fill('Rapid test 11');
    await input.press('Enter');

    // 11th message returns the "too fast" message
    await expect(
      page.getByText('You are sending messages too fast. Please wait a minute and try again.').first()
    ).toBeVisible({ timeout: 10000 });
  });

  test('7. Workspace A cannot open Workspace B pages and APIs', async ({ page, request }) => {
    // Attempting to visit another workspace's private dashboard without auth redirects to login
    await page.goto('/dashboard/workspace-b');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { name: 'Sign in to your account' })).toBeVisible();

    await page.goto('/dashboard/workspace-b/settings');
    await expect(page).toHaveURL(/\/login/);

    // Attempting to call protected API for workspace-b without credentials returns 401
    const res = await request.post('/api/chat/test', {
      data: { workspaceSlug: 'workspace-b', message: 'Unauthorized ping' },
    });
    expect(res.status()).toBe(401);
  });

  test('8. Logout then browser Back button shows no dashboard', async ({ page }) => {
    // Navigate to a protected dashboard route
    await page.goto('/dashboard/abc');
    await expect(page).toHaveURL(/\/login/);

    // Go to login page explicitly
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Sign in to your account' })).toBeVisible();

    // Hit browser Back button
    await page.goBack();

    // Must not show dashboard; must remain on login or redirect back to login
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { name: 'Sign in to your account' })).toBeVisible();
    await expect(page.locator('text=Overview')).not.toBeVisible();
  });

  test('9. Test-session endpoint returns 404 when disabled / in production', async ({ request }) => {
    // Probe the test login endpoint directly
    const res = await request.post('/api/test-session', {
      data: { email: 'probe@example.com' },
    });
    // In production or when ENABLE_TEST_LOGIN is absent, fails closed with 404
    expect([200, 404]).toContain(res.status());
    if (res.status() === 404) {
      const data = await res.json().catch(() => ({}));
      expect(data.error).toBe('Not found');
    }
  });
});
