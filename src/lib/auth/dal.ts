import { cache } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { connectDB } from '@/lib/db/mongoose';
import { Workspace, IWorkspace } from '@/models/Workspace';
import { Session } from 'next-auth';

export interface WorkspaceAuthResult {
  session: Session;
  workspace: IWorkspace;
}

/**
 * Data Access Layer (DAL) helper for Server Components, Pages, and Server Actions.
 * Wrapped in React cache() to deduplicate database lookups during the same request render tree.
 */
export const verifyWorkspaceOwner = cache(
  async (workspaceSlug: string): Promise<WorkspaceAuthResult> => {
    const session = await auth();
    if (!session?.user?.id) {
      redirect('/login');
    }

    await connectDB();

    const workspace = await Workspace.findOne({
      slug: workspaceSlug.toLowerCase(),
      ownerId: session.user.id,
    }).lean<IWorkspace>();

    if (!workspace) {
      redirect('/dashboard');
    }

    return { session, workspace };
  }
);

/**
 * Retrieves the owned workspace for a user if one exists.
 * Used by dashboard landing and onboarding redirects.
 */
export const getUserWorkspace = cache(
  async (userId: string): Promise<IWorkspace | null> => {
    await connectDB();
    return Workspace.findOne({ ownerId: userId }).lean<IWorkspace>();
  }
);

export type ApiAuthResult =
  | { success: true; session: Session; workspace: IWorkspace }
  | { success: false; error: string; status: 401 | 403 };

/**
 * Data Access Layer (DAL) helper for Route Handlers (APIs).
 * Does NOT redirect, returning 401 Unauthorized or 403 Forbidden status objects.
 * Uses uniform error messaging for not found and unauthorized states to prevent
 * workspace enumeration or timing oracle attacks.
 */
export async function authenticateWorkspaceApi(
  workspaceSlug: string
): Promise<ApiAuthResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: 'Unauthorized', status: 401 };
  }

  await connectDB();

  const workspace = await Workspace.findOne({
    slug: workspaceSlug.toLowerCase(),
  }).lean<IWorkspace>();

  // Constant error message to prevent slug enumeration
  if (!workspace || workspace.ownerId.toString() !== session.user.id) {
    return {
      success: false,
      error: 'Workspace not found or access denied',
      status: 403,
    };
  }

  return { success: true, session, workspace };
}
