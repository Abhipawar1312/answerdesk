import { describe, it, expect, vi, beforeEach } from 'vitest';
import { signOutAction } from './auth';
import * as authModule from '@/lib/auth';

vi.mock('@/lib/auth', () => ({
  signOut: vi.fn(),
}));

describe('Authentication Actions (Sign Out)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls Auth.js signOut with redirect to "/"', async () => {
    await signOutAction();
    expect(authModule.signOut).toHaveBeenCalledWith({ redirectTo: '/' });
  });
});

