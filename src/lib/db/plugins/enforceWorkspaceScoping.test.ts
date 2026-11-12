import { describe, it, expect } from 'vitest';
import mongoose, { Schema } from 'mongoose';
import {
  enforceWorkspaceScoping,
  TenantIsolationError,
  isValidObjectId,
} from './enforceWorkspaceScoping';

describe('enforceWorkspaceScoping Mongoose Plugin (Unit Tests)', () => {
  const TestSchema = new Schema({
    workspaceId: { type: Schema.Types.ObjectId, required: true },
    title: String,
  });

  TestSchema.plugin(enforceWorkspaceScoping);

  const TestModel =
    mongoose.models.TenantTestModel ||
    mongoose.model('TenantTestModel', TestSchema);

  describe('Query operations reject missing or invalid workspaceId', () => {
    it('rejects find() without workspaceId', async () => {
      await expect(TestModel.find({ title: 'test' }).exec()).rejects.toThrow(
        TenantIsolationError
      );
    });

    it('rejects findOne() without workspaceId', async () => {
      await expect(TestModel.findOne({ title: 'test' }).exec()).rejects.toThrow(
        TenantIsolationError
      );
    });

    it('rejects findOneAndUpdate() without workspaceId', async () => {
      await expect(
        TestModel.findOneAndUpdate({ title: 'test' }, { title: 'updated' }).exec()
      ).rejects.toThrow(TenantIsolationError);
    });

    it('rejects updateOne() without workspaceId', async () => {
      await expect(
        TestModel.updateOne({ title: 'test' }, { title: 'updated' }).exec()
      ).rejects.toThrow(TenantIsolationError);
    });

    it('rejects updateMany() without workspaceId', async () => {
      await expect(
        TestModel.updateMany({ title: 'test' }, { title: 'updated' }).exec()
      ).rejects.toThrow(TenantIsolationError);
    });

    it('rejects findOneAndDelete() without workspaceId', async () => {
      await expect(
        TestModel.findOneAndDelete({ title: 'test' }).exec()
      ).rejects.toThrow(TenantIsolationError);
    });

    it('rejects deleteOne() without workspaceId', async () => {
      await expect(
        TestModel.deleteOne({ title: 'test' }).exec()
      ).rejects.toThrow(TenantIsolationError);
    });

    it('rejects deleteMany() without workspaceId', async () => {
      await expect(TestModel.deleteMany({ title: 'test' }).exec()).rejects.toThrow(
        TenantIsolationError
      );
    });

    it('rejects replaceOne() without workspaceId', async () => {
      await expect(
        TestModel.replaceOne({ title: 'test' }, { title: 'replaced' }).exec()
      ).rejects.toThrow(TenantIsolationError);
    });

    it('rejects findOneAndReplace() without workspaceId', async () => {
      await expect(
        TestModel.findOneAndReplace({ title: 'test' }, { title: 'replaced' }).exec()
      ).rejects.toThrow(TenantIsolationError);
    });

    it('rejects distinct() without workspaceId', async () => {
      await expect(
        TestModel.distinct('title', { title: 'test' }).exec()
      ).rejects.toThrow(TenantIsolationError);
    });

    it('rejects countDocuments() without workspaceId', async () => {
      await expect(
        TestModel.countDocuments({ title: 'test' }).exec()
      ).rejects.toThrow(TenantIsolationError);
    });
  });

  describe('Operator injection resistance (rejects non-ObjectId objects)', () => {
    it('rejects { $ne: null } operator filter on workspaceId', async () => {
      await expect(
        TestModel.find({ workspaceId: { $ne: null } as unknown as mongoose.Types.ObjectId }).exec()
      ).rejects.toThrow(TenantIsolationError);
    });

    it('rejects { $exists: true } operator filter on workspaceId', async () => {
      await expect(
        TestModel.find({ workspaceId: { $exists: true } as unknown as mongoose.Types.ObjectId }).exec()
      ).rejects.toThrow(TenantIsolationError);
    });

    it('rejects arbitrary string non-hex values on workspaceId', async () => {
      await expect(
        TestModel.find({ workspaceId: 'not-a-valid-24-hex-id' as unknown as mongoose.Types.ObjectId }).exec()
      ).rejects.toThrow(TenantIsolationError);
    });
  });

  describe('insertMany validation', () => {
    it('rejects insertMany when a document lacks workspaceId', async () => {
      await expect(
        TestModel.insertMany([
          { workspaceId: new mongoose.Types.ObjectId(), title: 'doc 1' },
          { title: 'doc 2 without workspace' },
        ])
      ).rejects.toThrow(TenantIsolationError);
    });

    it('rejects insertMany when workspaceId is an operator object', async () => {
      await expect(
        TestModel.insertMany([
          { workspaceId: { $exists: true } as unknown as mongoose.Types.ObjectId, title: 'exploit' },
        ])
      ).rejects.toThrow(TenantIsolationError);
    });
  });

  describe('Aggregation pipelines hardening', () => {
    it('rejects empty aggregation pipeline', async () => {
      await expect(TestModel.aggregate([]).exec()).rejects.toThrow(
        TenantIsolationError
      );
    });

    it('rejects aggregation when first stage is not $match or $vectorSearch', async () => {
      const workspaceId = new mongoose.Types.ObjectId();
      await expect(
        TestModel.aggregate([
          { $project: { title: 1 } },
          { $match: { workspaceId } },
        ]).exec()
      ).rejects.toThrow(TenantIsolationError);
    });

    it('rejects aggregation when $vectorSearch lacks workspaceId filter', async () => {
      await expect(
        TestModel.aggregate([
          {
            $vectorSearch: {
              index: 'vector_index',
              path: 'embedding',
              queryVector: [0.1, 0.2],
              numCandidates: 10,
              limit: 5,
            },
          },
        ]).exec()
      ).rejects.toThrow(TenantIsolationError);
    });

    it('rejects aggregation containing banned $lookup stage', async () => {
      const workspaceId = new mongoose.Types.ObjectId();
      await expect(
        TestModel.aggregate([
          { $match: { workspaceId } },
          {
            $lookup: {
              from: 'other_tenant_collection',
              localField: 'title',
              foreignField: 'title',
              as: 'leaked',
            },
          },
        ]).exec()
      ).rejects.toThrow(TenantIsolationError);
    });

    it('rejects aggregation containing banned $unionWith stage', async () => {
      const workspaceId = new mongoose.Types.ObjectId();
      await expect(
        TestModel.aggregate([
          { $match: { workspaceId } },
          { $unionWith: { coll: 'other_tenant_collection' } },
        ]).exec()
      ).rejects.toThrow(TenantIsolationError);
    });

    it('rejects aggregation containing banned $out stage', async () => {
      const workspaceId = new mongoose.Types.ObjectId();
      await expect(
        TestModel.aggregate([
          { $match: { workspaceId } },
          { $out: 'target_collection' },
        ]).exec()
      ).rejects.toThrow(TenantIsolationError);
    });

    it('rejects aggregation containing banned $merge stage', async () => {
      const workspaceId = new mongoose.Types.ObjectId();
      await expect(
        TestModel.aggregate([
          { $match: { workspaceId } },
          { $merge: { into: 'target_collection' } },
        ]).exec()
      ).rejects.toThrow(TenantIsolationError);
    });

    it('rejects aggregation containing banned $facet stage', async () => {
      const workspaceId = new mongoose.Types.ObjectId();
      await expect(
        TestModel.aggregate([
          { $match: { workspaceId } },
          { $facet: { sub: [{ $project: { title: 1 } }] } },
        ]).exec()
      ).rejects.toThrow(/banned stage "\$facet"/);
    });

    it('rejects aggregation when workspaceId is a string instead of a real ObjectId instance', async () => {
      const stringId = '507f1f77bcf86cd799439011';
      // In aggregate pipelines, strings are rejected because MongoDB aggregate stages do not auto-cast
      await expect(
        TestModel.aggregate([
          { $match: { workspaceId: stringId } },
        ]).exec()
      ).rejects.toThrow(/real workspaceId ObjectId instance \(strings are rejected\)/);
    });

    it('rejects aggregation $vectorSearch when workspaceId is a string instead of a real ObjectId', async () => {
      const stringId = '507f1f77bcf86cd799439011';
      await expect(
        TestModel.aggregate([
          {
            $vectorSearch: {
              index: 'vector_index',
              path: 'embedding',
              queryVector: [0.1, 0.2],
              numCandidates: 10,
              limit: 5,
              filter: { workspaceId: stringId },
            },
          },
        ]).exec()
      ).rejects.toThrow(/real workspaceId ObjectId instance \(strings are rejected\)/);
    });

    it('accepts $vectorSearch and $match with { workspaceId: { $eq: ObjectId } } form', async () => {
      const realId = new mongoose.Types.ObjectId();
      // Should not throw TenantIsolationError during validation
      const vectorPipeline = TestModel.aggregate([
        {
          $vectorSearch: {
            index: 'vector_index',
            path: 'embedding',
            queryVector: [0.1, 0.2],
            numCandidates: 10,
            limit: 5,
            filter: { workspaceId: { $eq: realId } },
          },
        },
      ]);
      // Validation hook runs during aggregate pipeline creation; expect it not to throw TenantIsolationError
      await expect(vectorPipeline.exec()).rejects.not.toThrow(TenantIsolationError);

      const matchPipeline = TestModel.aggregate([
        { $match: { workspaceId: { $eq: realId } } },
      ]);
      await expect(matchPipeline.exec()).rejects.not.toThrow(TenantIsolationError);
    });
  });

  describe('isValidObjectId strict type validation (no _bsontype duck typing)', () => {
    it('accepts real mongoose.Types.ObjectId instances', () => {
      expect(isValidObjectId(new mongoose.Types.ObjectId())).toBe(true);
    });

    it('accepts valid 24-character hex strings', () => {
      expect(isValidObjectId('507f1f77bcf86cd799439011')).toBe(true);
      expect(isValidObjectId('0123456789abcdefABCDEF01')).toBe(true);
    });

    it('rejects duck-typed _bsontype objects', () => {
      expect(isValidObjectId({ _bsontype: 'ObjectID' })).toBe(false);
      expect(isValidObjectId({ _bsontype: 'ObjectId', id: 'fake' })).toBe(false);
    });

    it('rejects operator injection objects and non-hex strings', () => {
      expect(isValidObjectId({ $exists: true })).toBe(false);
      expect(isValidObjectId({ $ne: null })).toBe(false);
      expect(isValidObjectId({ $or: [] })).toBe(false);
      expect(isValidObjectId('not-hex')).toBe(false);
      expect(isValidObjectId('12345')).toBe(false);
      expect(isValidObjectId(null)).toBe(false);
      expect(isValidObjectId(undefined)).toBe(false);
      expect(isValidObjectId(123456)).toBe(false);
    });
  });
});
