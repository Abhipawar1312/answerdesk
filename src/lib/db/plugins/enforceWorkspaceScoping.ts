import mongoose, { Schema } from 'mongoose';

export class TenantIsolationError extends Error {
  constructor(message: string) {
    super(`[TenantIsolationViolation]: ${message}`);
    this.name = 'TenantIsolationError';
  }
}

/**
 * Validates that an identifier is a genuine ObjectId or 24-char hex string.
 * Explicitly rejects query operator objects like { $ne: null }, { $exists: true }, or { $or: [...] }.
 */
export function isValidObjectId(id: unknown): id is mongoose.Types.ObjectId | string {
  if (!id) return false;
  // Strictly accept only genuine mongoose.Types.ObjectId instance or 24-char hex string.
  // Rejects _bsontype duck typing and query operator objects.
  if (id instanceof mongoose.Types.ObjectId) {
    return true;
  }
  if (typeof id === 'string') {
    return /^[0-9a-fA-F]{24}$/.test(id);
  }
  return false;
}

/**
 * Helper to cast a workspaceId to a real mongoose.Types.ObjectId.
 * NOTE: While Mongoose automatically casts strings to ObjectIds in standard query filters,
 * MongoDB aggregation pipeline stages (like $match and $vectorSearch) DO NOT auto-cast.
 * Always wrap workspaceIds passed to aggregate pipelines with this helper.
 */
export function toObjectId(id: unknown): mongoose.Types.ObjectId {
  if (!isValidObjectId(id)) {
    throw new TenantIsolationError(
      `Cannot convert value to ObjectId: expected 24-character hexadecimal string or ObjectId, received ${typeof id}.`
    );
  }
  return id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(id as string);
}

const BANNED_AGGREGATION_STAGES = [
  '$lookup',
  '$unionWith',
  '$graphLookup',
  '$out',
  '$merge',
  '$facet',
] as const;

/**
 * Mongoose Plugin: Enforces workspaceId scoping across all database operations.
 * Throws unconditionally in both development and production if a tenant-scoped query
 * or aggregation is initiated without a strictly valid workspaceId.
 *
 * NOTE ON BULKWRITE AND RAW ACCESS:
 * Model.collection.* and Model.bulkWrite() bypass Mongoose middleware hooks completely.
 * Direct access to Model.collection is banned across the application. All tenant queries
 * and mutations MUST use Mongoose Model methods or functions in @/lib/db/scoped-queries.
 */
export function enforceWorkspaceScoping(schema: Schema) {
  const queryOps = [
    'find',
    'findOne',
    'findOneAndUpdate',
    'updateOne',
    'updateMany',
    'findOneAndDelete',
    'deleteOne',
    'deleteMany',
    'countDocuments',
    'replaceOne',
    'findOneAndReplace',
    'distinct',
  ] as const;

  // 1. Guard Query Operations
  for (const op of queryOps) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    schema.pre(op as any, function (this: any) {
      const filter = this.getQuery?.();
      if (!filter || !isValidObjectId(filter.workspaceId)) {
        throw new TenantIsolationError(
          `Query "${op}" on model "${this.model?.modelName || 'unknown'}" attempted without a valid workspaceId ObjectId filter.`
        );
      }
    });
  }

  // 2. Guard Document Inserts via insertMany
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema.pre('insertMany', function (this: any, next: any, docs: any) {
    // Handle both Mongoose callback signature (next, docs) and modern async/promise signature (docs)
    const rawDocs = typeof next === 'function' ? docs : next;
    const documents = Array.isArray(rawDocs) ? rawDocs : [rawDocs];
    for (const doc of documents) {
      const record = doc as Record<string, unknown> | undefined;
      if (!record || !isValidObjectId(record.workspaceId)) {
        throw new TenantIsolationError(
          'insertMany operation attempted on tenant collection with one or more documents missing a valid workspaceId ObjectId.'
        );
      }
    }
    if (typeof next === 'function') {
      next();
    }
  });

  // 3. Guard Aggregation Pipelines (including Atlas $vectorSearch)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema.pre('aggregate', function (this: any) {
    const pipeline = this.pipeline();
    if (!pipeline || pipeline.length === 0) {
      throw new TenantIsolationError(
        'Empty aggregation pipeline executed on tenant collection.'
      );
    }

    // A. Check for Banned Stages across entire pipeline (cross-collection & multi-facet prevention)
    for (const stage of pipeline) {
      const stageObj = stage as unknown as Record<string, unknown>;
      for (const banned of BANNED_AGGREGATION_STAGES) {
        if (stageObj[banned] !== undefined) {
          throw new TenantIsolationError(
            `Aggregation pipeline contains banned stage "${banned}". Cross-collection or multi-faceted aggregation is strictly prohibited on tenant collections.`
          );
        }
      }
    }

    // B. Enforce that FIRST stage is a tenant filter ($match or $vectorSearch)
    // In aggregate pipelines, workspaceId MUST be a real mongoose.Types.ObjectId instance (strings are rejected)
    // because MongoDB aggregation stages DO NOT auto-cast string IDs to ObjectIds.
    const firstStage = pipeline[0] as unknown as Record<string, unknown>;

    let hasValidFirstStage = false;

    if (firstStage.$vectorSearch) {
      const vs = firstStage.$vectorSearch as Record<string, unknown>;
      const filter = vs.filter as Record<string, unknown> | undefined;
      const ws = filter?.workspaceId;
      const isDirectId = ws instanceof mongoose.Types.ObjectId;
      const isEqId =
        typeof ws === 'object' &&
        ws !== null &&
        (ws as Record<string, unknown>).$eq instanceof mongoose.Types.ObjectId;

      if (isDirectId || isEqId) {
        hasValidFirstStage = true;
      }
    } else if (firstStage.$match) {
      const match = firstStage.$match as Record<string, unknown>;
      const ws = match.workspaceId;
      const isDirectId = ws instanceof mongoose.Types.ObjectId;
      const isEqId =
        typeof ws === 'object' &&
        ws !== null &&
        (ws as Record<string, unknown>).$eq instanceof mongoose.Types.ObjectId;

      if (isDirectId || isEqId) {
        hasValidFirstStage = true;
      }
    }

    if (!hasValidFirstStage) {
      throw new TenantIsolationError(
        'The first stage of a tenant aggregation pipeline must be a $match or $vectorSearch stage with a real workspaceId ObjectId instance (strings are rejected).'
      );
    }
  });
}
