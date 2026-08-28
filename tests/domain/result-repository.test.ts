import { describe, expect, it, vi } from 'vitest';
import { ResultRepository, isResultIdempotencyConflict } from '../../packages/database/src/repositories/result-repository.js';
import type { PrismaClient } from '../../packages/database/src/generated/prisma/client.js';

function resultKeyConflict() {
  return {
    code: 'P2002',
    meta: { driverAdapterError: { cause: { kind: 'UniqueConstraintViolation', constraint: { fields: ['created_by_user_id', 'task_id', 'idempotency_key'] } } } }
  };
}

describe('ResultRepository idempotency conflict classification', () => {
  it('recognizes only the exact Result creator/task/key constraint', () => {
    expect(isResultIdempotencyConflict(resultKeyConflict())).toBe(true);
    expect(isResultIdempotencyConflict({ ...resultKeyConflict(), meta: { driverAdapterError: { cause: { kind: 'UniqueConstraintViolation', constraint: { fields: ['id'] } } } } })).toBe(false);
    expect(isResultIdempotencyConflict({ ...resultKeyConflict(), meta: { driverAdapterError: { cause: { kind: 'UniqueConstraintViolation', constraint: { fields: ['task_id', 'created_by_user_id', 'idempotency_key'] } } } } })).toBe(false);
  });

  it('returns NOT_FOUND when exact-conflict recovery loses authorization and rethrows unrelated conflicts', async () => {
    const exact = resultKeyConflict();
    const transaction = vi.fn()
      .mockRejectedValueOnce(exact)
      .mockImplementationOnce(async (callback: (tx: unknown) => unknown) =>
        callback({ result: { findFirst: async () => null } })
      );
    const prisma = { $transaction: transaction, result: { findFirst: async () => null } } as unknown as PrismaClient;
    await expect(new ResultRepository(prisma).createForTaskForUser({ resultId: 'result', taskId: 'task', userId: 'user', artifactIds: ['artifact'], idempotencyKey: 'key', now: new Date() })).resolves.toBe('NOT_FOUND');

    const unrelated = { ...exact, meta: { driverAdapterError: { cause: { kind: 'UniqueConstraintViolation', constraint: { fields: ['id'] } } } } };
    const rejected = { $transaction: async () => { throw unrelated; } } as unknown as PrismaClient;
    await expect(new ResultRepository(rejected).createForTaskForUser({ resultId: 'result', taskId: 'task', userId: 'user', artifactIds: ['artifact'], idempotencyKey: 'key', now: new Date() })).rejects.toBe(unrelated);
  });
});
