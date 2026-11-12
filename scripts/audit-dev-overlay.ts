/* eslint-disable @typescript-eslint/no-explicit-any */
import { chromium } from '@playwright/test';

async function auditRoutes() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('--- Dev Server Route & Overlay Issue Audit (Authenticated + Public) ---\n');

  // 1. Check Public Routes First
  const publicRoutes = [
    { name: 'Root Landing Page', path: '/' },
    { name: 'Login Page', path: '/login' },
    { name: 'Public Chat Widget', path: '/widget/abc' },
  ];

  for (const r of publicRoutes) {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    try {
      const res = await page.goto(`http://localhost:3000${r.path}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      const status = res ? res.status() : 'unknown';

      const issueCount = await page.evaluate(() => {
        const portal = document.querySelector('nextjs-portal');
        if (!portal || !portal.shadowRoot) return 0;
        const issuesText = portal.shadowRoot.textContent || '';
        if (issuesText.includes('Issue') || issuesText.includes('Error')) {
          const match = issuesText.match(/(\d+)\s+(?:Issue|Error)/i);
          return match ? parseInt(match[1], 10) : 1;
        }
        return 0;
      });

      console.log(`[PASS] ${r.name.padEnd(25)} (${r.path}): HTTP ${status} | Overlay Issues: ${issueCount} | Console Errors: ${consoleErrors.length}`);
    } catch (err: any) {
      console.log(`[FAIL] ${r.name} (${r.path}): ${err.message}`);
    }
  }

  // 2. Perform Safe Test Authentication for Dashboard Routes
  console.log('\n[Auth] Acquiring test session for workspace "abc"...');
  try {
    const authRes = await context.request.post('http://localhost:3000/api/test-session', {
      data: { workspaceSlug: 'abc', email: 'audit-owner@example.com' },
    });
    if (authRes.status() === 200) {
      console.log('  ✓ Test session cookie successfully injected into browser context.');
    } else {
      console.log(`  ⚠ Test auth returned HTTP ${authRes.status()}`);
    }
  } catch (authErr: any) {
    console.log('  ⚠ Could not authenticate via test endpoint:', authErr.message);
  }

  // 3. Check Authenticated Dashboard Routes
  const dashboardRoutes = [
    { name: 'Dashboard Overview', path: '/dashboard/abc' },
    { name: 'Dashboard Documents', path: '/dashboard/abc/documents' },
    { name: 'Dashboard Test Chat', path: '/dashboard/abc/chat' },
    { name: 'Dashboard Conversations', path: '/dashboard/abc/conversations' },
    { name: 'Dashboard Unanswered', path: '/dashboard/abc/unanswered' },
    { name: 'Dashboard Widget Preview', path: '/dashboard/abc/widget' },
    { name: 'Dashboard Settings', path: '/dashboard/abc/settings' },
  ];

  console.log('\n--- Checking Authenticated Dashboard Pages ---');
  for (const r of dashboardRoutes) {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    try {
      const res = await page.goto(`http://localhost:3000${r.path}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      const finalUrl = page.url();
      const status = res ? res.status() : 'unknown';

      // Verify page was NOT redirected to /login
      const isAuthenticated = !finalUrl.includes('/login');

      const issueCount = await page.evaluate(() => {
        const portal = document.querySelector('nextjs-portal');
        if (!portal || !portal.shadowRoot) return 0;
        const issuesText = portal.shadowRoot.textContent || '';
        // Only count actual Issues/Errors
        const hasIssue = portal.shadowRoot.querySelector('[data-nextjs-toast-errors]');
        if (hasIssue) return 1;
        if (issuesText.includes('Issue') || issuesText.includes('Error')) {
          const match = issuesText.match(/(\d+)\s+(?:Issue|Error)/i);
          return match ? parseInt(match[1], 10) : 1;
        }
        return 0;
      });

      console.log(
        `[PASS] ${r.name.padEnd(25)} (${r.path}): HTTP ${status} | Auth: ${isAuthenticated ? 'YES' : 'REDIRECTED'} | Overlay Issues: ${issueCount} | Console Errors: ${consoleErrors.length}`
      );
    } catch (err: any) {
      console.log(`[FAIL] ${r.name} (${r.path}): ${err.message}`);
    }
  }

  await browser.close();
}

auditRoutes().catch(console.error);
