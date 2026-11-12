'use server';

import { verifyWorkspaceOwner } from '@/lib/auth/dal';
import { connectDB } from '@/lib/db/mongoose';
import { updateWorkspaceAllowedOrigins, updateWorkspaceDisplaySettings } from '@/lib/db/scoped-queries';
import { normalizeOrigin } from '@/lib/origins';

export async function updateAllowedOriginsAction(
  workspaceSlug: string,
  origins: string[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const { workspace } = await verifyWorkspaceOwner(workspaceSlug);

    const normalizedOrigins: string[] = [];
    for (const origin of origins) {
      try {
        const normalized = normalizeOrigin(origin);
        if (!normalizedOrigins.includes(normalized)) {
          normalizedOrigins.push(normalized);
        }
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : `Invalid origin format: ${origin}`,
        };
      }
    }

    await connectDB();
    await updateWorkspaceAllowedOrigins(workspace._id, normalizedOrigins);

    return { success: true };
  } catch (err: unknown) {
    console.error('[Settings Action Error]:', err);
    return {
      success: false,
      error: 'An unexpected error occurred while updating settings.',
    };
  }
}

export async function updateWidgetDisplaySettingsAction(
  workspaceSlug: string,
  hideCitationsInWidget: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const { workspace } = await verifyWorkspaceOwner(workspaceSlug);

    await connectDB();
    await updateWorkspaceDisplaySettings(workspace._id, { hideCitationsInWidget });

    return { success: true };
  } catch (err: unknown) {
    console.error('[Settings Action Error]:', err);
    return {
      success: false,
      error: 'An unexpected error occurred while updating display settings.',
    };
  }
}

