'use server';

import { signOut } from '@/lib/auth';

/**
 * Server Action for signing out the authenticated user.
 * Clears the session JWT and redirects to the landing page ('/').
 */
export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: '/' });
}

