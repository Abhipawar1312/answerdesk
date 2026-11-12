import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { Session } from 'next-auth';
import { Workspace } from '@/models/Workspace';
import { PLAN_LIMITS } from '@/lib/constants';
import { createWorkspaceAction } from './workspace';
import * as authModule from '@/lib/auth';

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/db/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}));

describe('Workspace Model & Action Limit Enforcement', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);

    // Ensure all unique indexes (slug and ownerId) are built in MongoDB
    await Workspace.init();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await Workspace.deleteMany({});
    vi.clearAllMocks();
  });

  describe('Database Layer: Unique index on ownerId', () => {
    it('verifies that the unique index on ownerId exists in MongoDB collection', async () => {
      const indexes = await Workspace.collection.indexes();
      const ownerIdIndex = indexes.find((idx) => idx.key && idx.key.ownerId === 1);

      expect(ownerIdIndex).toBeDefined();
      expect(ownerIdIndex?.unique).toBe(true);
    });

    it('rejects a second workspace for the same ownerId via MongoDB unique constraint (E11000)', async () => {
      const ownerId = new mongoose.Types.ObjectId();

      // First workspace creation succeeds
      await Workspace.create({
        name: 'Workspace One',
        slug: 'workspace-one',
        ownerId,
        plan: 'free',
        messageLimit: PLAN_LIMITS.free.monthlyMessages,
      });

      // Second workspace creation for same ownerId fails with duplicate key error
      await expect(
        Workspace.create({
          name: 'Workspace Two',
          slug: 'workspace-two',
          ownerId,
          plan: 'free',
          messageLimit: PLAN_LIMITS.free.monthlyMessages,
        })
      ).rejects.toThrow(/E11000.*ownerId/);
    });

    it('prevents race conditions: parallel requests for same ownerId result in only one creation', async () => {
      const ownerId = new mongoose.Types.ObjectId();

      const results = await Promise.allSettled([
        Workspace.create({
          name: 'Parallel One',
          slug: 'parallel-one',
          ownerId,
          plan: 'free',
          messageLimit: PLAN_LIMITS.free.monthlyMessages,
        }),
        Workspace.create({
          name: 'Parallel Two',
          slug: 'parallel-two',
          ownerId,
          plan: 'free',
          messageLimit: PLAN_LIMITS.free.monthlyMessages,
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const totalInDb = await Workspace.countDocuments({ ownerId });
      expect(totalInDb).toBe(1);
    });
  });

  describe('Application Layer: createWorkspaceAction limit check', () => {
    it('reads limit from PLAN_LIMITS.free.maxWorkspaces and blocks creation if count >= limit', async () => {
      const userId = new mongoose.Types.ObjectId();
      vi.mocked(authModule.auth as () => Promise<Session | null>).mockResolvedValue({
        user: { id: userId.toString(), email: 'test@example.com' },
        expires: new Date(Date.now() + 86400000).toISOString(),
      });

      // Pre-seed 1 workspace for this user (reaching the limit)
      await Workspace.create({
        name: 'Existing Workspace',
        slug: 'existing-ws',
        ownerId: userId,
        plan: 'free',
        messageLimit: PLAN_LIMITS.free.monthlyMessages,
      });

      const formData = new FormData();
      formData.set('name', 'Second Workspace');
      formData.set('slug', 'second-ws');

      const result = await createWorkspaceAction({}, formData);

      expect(result.error).toContain(
        `You have reached the maximum limit of ${PLAN_LIMITS.free.maxWorkspaces} workspace`
      );
    });

    it('handles race condition E11000 on ownerId and returns user-friendly limit error', async () => {
      const userId = new mongoose.Types.ObjectId();
      vi.mocked(authModule.auth as () => Promise<Session | null>).mockResolvedValue({
        user: { id: userId.toString(), email: 'test@example.com' },
        expires: new Date(Date.now() + 86400000).toISOString(),
      });

      // Spy on Workspace.countDocuments to simulate a race condition where count returns 0
      vi.spyOn(Workspace, 'countDocuments').mockResolvedValueOnce(0);

      // But another request sneaks in and creates the workspace in the DB
      await Workspace.create({
        name: 'Sneaky Workspace',
        slug: 'sneaky-ws',
        ownerId: userId,
        plan: 'free',
        messageLimit: PLAN_LIMITS.free.monthlyMessages,
      });

      const formData = new FormData();
      formData.set('name', 'Concurrent Workspace');
      formData.set('slug', 'concurrent-ws');

      const result = await createWorkspaceAction({}, formData);

      // Should catch the E11000 on ownerId and return the limit error
      expect(result.error).toContain(
        `You have reached the maximum limit of ${PLAN_LIMITS.free.maxWorkspaces} workspace`
      );
    });

    it('creates workspace and redirects when user has 0 workspaces', async () => {
      const userId = new mongoose.Types.ObjectId();
      vi.mocked(authModule.auth as () => Promise<Session | null>).mockResolvedValue({
        user: { id: userId.toString(), email: 'new@example.com' },
        expires: new Date(Date.now() + 86400000).toISOString(),
      });

      const formData = new FormData();
      formData.set('name', 'Valid New Workspace');
      formData.set('slug', 'valid-new-ws');

      await expect(createWorkspaceAction({}, formData)).rejects.toThrow(
        'NEXT_REDIRECT:/dashboard/valid-new-ws'
      );

      const created = await Workspace.findOne({ slug: 'valid-new-ws' });
      expect(created).not.toBeNull();
      expect(created?.ownerId.toString()).toBe(userId.toString());
    });
  });
});

