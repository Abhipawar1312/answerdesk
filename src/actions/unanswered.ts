'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { verifyWorkspaceOwner } from '@/lib/auth/dal';
import { connectDB } from '@/lib/db/mongoose';
import {
  dismissWorkspaceUnansweredMessage,
  dismissAllWorkspaceUnansweredMessages,
} from '@/lib/db/scoped-queries';

const dismissSchema = z.object({
  workspaceSlug: z.string().min(1),
  messageId: z.string().min(1),
});

export async function dismissUnansweredQuestionAction(data: z.infer<typeof dismissSchema>) {
  try {
    const validated = dismissSchema.parse(data);
    const { workspace } = await verifyWorkspaceOwner(validated.workspaceSlug);
    await connectDB();

    const success = await dismissWorkspaceUnansweredMessage(workspace._id, validated.messageId);
    if (!success) {
      return { success: false, error: 'Question not found or already dismissed.' };
    }

    revalidatePath(`/dashboard/${validated.workspaceSlug}/unanswered`);
    revalidatePath(`/dashboard/${validated.workspaceSlug}`);
    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to dismiss question.',
    };
  }
}

const dismissAllSchema = z.object({
  workspaceSlug: z.string().min(1),
});

export async function dismissAllUnansweredQuestionsAction(data: z.infer<typeof dismissAllSchema>) {
  try {
    const validated = dismissAllSchema.parse(data);
    const { workspace } = await verifyWorkspaceOwner(validated.workspaceSlug);
    await connectDB();

    const count = await dismissAllWorkspaceUnansweredMessages(workspace._id);

    revalidatePath(`/dashboard/${validated.workspaceSlug}/unanswered`);
    revalidatePath(`/dashboard/${validated.workspaceSlug}`);
    return { success: true, count };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to dismiss all questions.',
    };
  }
}

