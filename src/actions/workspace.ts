'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { connectDB } from '@/lib/db/mongoose';
import { Workspace } from '@/models/Workspace';
import { RESERVED_SLUGS, PLAN_LIMITS } from '@/lib/constants';

const createWorkspaceSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(50),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'Slug must be at least 3 characters')
    .max(32, 'Slug must be 32 characters or fewer')
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      'Slug can only contain lowercase letters, numbers, and hyphens'
    )
    .refine((slug) => !RESERVED_SLUGS.includes(slug as (typeof RESERVED_SLUGS)[number]), {
      message: 'This workspace URL slug is reserved and cannot be used.',
    }),
});

export type CreateWorkspaceState = {
  error?: string;
  fieldErrors?: {
    name?: string[];
    slug?: string[];
  };
};

export async function createWorkspaceAction(
  prevState: CreateWorkspaceState,
  formData: FormData
): Promise<CreateWorkspaceState> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login');
  }

  const rawData = {
    name: formData.get('name'),
    slug: formData.get('slug'),
  };

  const parsed = createWorkspaceSchema.safeParse(rawData);
  if (!parsed.success) {
    return {
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { name, slug } = parsed.data;

  await connectDB();

  // 1. Enforce max workspace limit per user from PLAN_LIMITS
  const maxWorkspaces = PLAN_LIMITS.free.maxWorkspaces;
  const userWorkspaceCount = await Workspace.countDocuments({ ownerId: session.user.id });
  if (userWorkspaceCount >= maxWorkspaces) {
    return {
      error: `You have reached the maximum limit of ${maxWorkspaces} workspace${maxWorkspaces > 1 ? 's' : ''} per user on the Free tier.`,
    };
  }

  // 2. Pre-check slug availability
  const existingWorkspace = await Workspace.findOne({ slug }).lean();
  if (existingWorkspace) {
    return {
      fieldErrors: {
        slug: ['This slug is already taken. Please choose another.'],
      },
    };
  }

  // 3. Attempt creation and catch duplicate-key race conditions (Mongo error code 11000)
  try {
    await Workspace.create({
      name,
      slug,
      ownerId: session.user.id,
      plan: 'free',
      monthlyMessageCount: 0,
      messageLimit: PLAN_LIMITS.free.monthlyMessages,
      allowedOrigins: [],
    });
  } catch (err: unknown) {
    const mongoError = err as {
      code?: number;
      keyPattern?: Record<string, number>;
      keyValue?: Record<string, unknown>;
    };
    if (mongoError?.code === 11000) {
      if (mongoError.keyPattern?.ownerId || (mongoError.keyValue && 'ownerId' in mongoError.keyValue)) {
        return {
          error: `You have reached the maximum limit of ${maxWorkspaces} workspace${maxWorkspaces > 1 ? 's' : ''} per user on the Free tier.`,
        };
      }
      return {
        fieldErrors: {
          slug: ['This slug is already taken. Please choose another.'],
        },
      };
    }
    console.error('Unexpected error creating workspace:', err);
    return {
      error: 'An unexpected database error occurred while creating your workspace.',
    };
  }

  redirect(`/dashboard/${slug}`);
}
