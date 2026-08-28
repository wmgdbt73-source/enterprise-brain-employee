import { describe, expect, it } from 'vitest';
import { ArtifactRepository } from '../../packages/database/src/repositories/artifact-repository.js';
import type { PrismaClient } from '../../packages/database/src/generated/prisma/client.js';

describe('ArtifactRepository idempotency fallback', () => {
  it('returns NOT_FOUND when source-unique recovery loses authorization', async () => {
    const sourceUniqueConflict = {
      code: 'P2002',
      meta: { driverAdapterError: { cause: { kind: 'UniqueConstraintViolation', constraint: { fields: ['source_tool_call_id'] } } } }
    };
    const prisma = {
      $transaction: async () => { throw sourceUniqueConflict; },
      agentRun: { findFirst: async () => null }
    } as unknown as PrismaClient;
    await expect(new ArtifactRepository(prisma).registerFromRunForUser({
      artifactId: 'artifact', agentRunId: 'run', userId: 'revoked-user', now: new Date()
    })).resolves.toBe('NOT_FOUND');
  });

  it('does not treat a different unique conflict as an idempotent fallback', async () => {
    const unrelatedConflict = {
      code: 'P2002',
      meta: { driverAdapterError: { cause: { kind: 'UniqueConstraintViolation', constraint: { fields: ['id'] } } } }
    };
    const prisma = {
      $transaction: async () => { throw unrelatedConflict; },
      agentRun: { findFirst: async () => null }
    } as unknown as PrismaClient;
    await expect(new ArtifactRepository(prisma).registerFromRunForUser({
      artifactId: 'artifact', agentRunId: 'run', userId: 'user', now: new Date()
    })).rejects.toBe(unrelatedConflict);
  });
});
