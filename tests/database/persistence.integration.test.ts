import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createPrismaClient } from '../../packages/database/src/index.js';
import { isSourceToolCallUniqueConflict } from '../../packages/database/src/repositories/artifact-repository.js';
import { ResultRepository } from '../../packages/database/src/repositories/result-repository.js';
import { encodePassword, hashSessionToken } from '../../packages/database/src/index.js';
import type { PrismaClient } from '../../packages/database/src/generated/prisma/client.js';

const connectionString = process.env.DATABASE_URL;
const database = connectionString
  ? createPrismaClient(connectionString)
  : undefined;

function requireDatabase() {
  if (!database) {
    throw new Error('DATABASE_URL is required for database integration tests');
  }

  return database;
}

async function createProjectFixture() {
  const db = requireDatabase();
  const now = new Date('2026-08-25T00:00:00.123Z');

  await db.user.create({
    data: {
      id: 'user-owner',
      name: 'Owner',
      systemRole: 'EMPLOYEE',
      createdAt: now,
      updatedAt: now
    }
  });
  await db.project.create({
    data: {
      id: 'project-1',
      name: 'Project',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now
    }
  });
  await db.projectMember.create({
    data: {
      id: 'member-owner',
      projectId: 'project-1',
      userId: 'user-owner',
      role: 'OWNER',
      createdAt: now,
      updatedAt: now
    }
  });

  return { db, now };
}

describe('PostgreSQL persistence constraints', () => {
  beforeEach(async () => {
    const db = requireDatabase();
    await db.session.deleteMany();
    await db.account.deleteMany();
    await db.humanConfirmation.deleteMany();
    await db.review.deleteMany();
    await db.resultArtifact.deleteMany();
    await db.result.deleteMany();
    await db.artifact.deleteMany();
    await db.agentToolCall.deleteMany();
    await db.agentRun.deleteMany();
    await db.taskDependency.deleteMany();
    await db.taskAssignment.deleteMany();
    await db.task.deleteMany();
    await db.projectMember.deleteMany();
    await db.project.deleteMany();
    await db.user.deleteMany();
  });

  afterAll(async () => {
    await database?.$disconnect();
  });

  it('preserves domain-owned timestamps on a PostgreSQL round trip', async () => {
    const { db, now } = await createProjectFixture();
    const user = await db.user.findUniqueOrThrow({
      where: { id: 'user-owner' }
    });

    expect(user.createdAt.toISOString()).toBe(now.toISOString());
    expect(user.updatedAt.toISOString()).toBe(now.toISOString());
  });

  it('enforces Account and hashed Session persistence boundaries', async () => {
    const { db, now } = await createProjectFixture();
    const passwordHash = await encodePassword('DemoPassword!2026');
    await db.account.create({ data: { id: 'account-1', userId: 'user-owner', login: 'owner@example.test', passwordHash, status: 'ACTIVE', createdAt: now, updatedAt: now } });
    await expect(db.account.create({ data: { id: 'account-duplicate', userId: 'user-owner', login: 'other@example.test', passwordHash, status: 'ACTIVE', createdAt: now, updatedAt: now } })).rejects.toMatchObject({ code: 'P2002' });
    const rawToken = 'opaque-demo-token'; const tokenHash = hashSessionToken(rawToken);
    await db.session.create({ data: { id: 'session-1', accountId: 'account-1', tokenHash, createdAt: now, expiresAt: new Date(now.getTime() + 1_000) } });
    expect((await db.session.findUniqueOrThrow({ where: { id: 'session-1' } })).tokenHash).not.toBe(rawToken);
    await expect(db.session.create({ data: { id: 'session-duplicate', accountId: 'account-1', tokenHash, createdAt: now, expiresAt: new Date(now.getTime() + 1_000) } })).rejects.toMatchObject({ code: 'P2002' });
    await expect(db.account.create({ data: { id: 'account-noncanonical', userId: 'missing-user', login: 'Owner@Example.Test', passwordHash, status: 'ACTIVE', createdAt: now, updatedAt: now } })).rejects.toMatchObject({ code: 'P2003' });
    await db.user.create({ data: { id: 'user-canonical-check', name: 'Canonical', systemRole: 'EMPLOYEE', createdAt: now, updatedAt: now } });
    await expect(db.account.create({ data: { id: 'account-uppercase', userId: 'user-canonical-check', login: 'OWNER@EXAMPLE.TEST', passwordHash, status: 'ACTIVE', createdAt: now, updatedAt: now } })).rejects.toBeDefined();
    await expect(db.session.create({ data: { id: 'session-missing-account', accountId: 'missing-account', tokenHash: 'b'.repeat(64), createdAt: now, expiresAt: new Date(now.getTime() + 1_000) } })).rejects.toMatchObject({ code: 'P2003' });
  });

  it('rejects duplicate membership and a second OWNER', async () => {
    const { db, now } = await createProjectFixture();

    await expect(
      db.projectMember.create({
        data: {
          id: 'member-duplicate',
          projectId: 'project-1',
          userId: 'user-owner',
          role: 'MEMBER',
          createdAt: now,
          updatedAt: now
        }
      })
    ).rejects.toMatchObject({ code: 'P2002' });

    await db.user.create({
      data: {
        id: 'user-second-owner',
        name: 'Second owner',
        systemRole: 'EMPLOYEE',
        createdAt: now,
        updatedAt: now
      }
    });
    await expect(
      db.projectMember.create({
        data: {
          id: 'member-second-owner',
          projectId: 'project-1',
          userId: 'user-second-owner',
          role: 'OWNER',
          createdAt: now,
          updatedAt: now
        }
      })
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('rejects invalid foreign keys and non-member task assignment', async () => {
    const { db, now } = await createProjectFixture();

    await expect(
      db.task.create({
        data: {
          id: 'task-invalid-project',
          projectId: 'missing-project',
          title: 'Invalid',
          priority: 'P2',
          status: 'TODO',
          acceptanceCriteria: [],
          createdAt: now,
          updatedAt: now
        }
      })
    ).rejects.toMatchObject({ code: 'P2003' });

    await db.task.create({
      data: {
        id: 'task-1',
        projectId: 'project-1',
        title: 'Assigned task',
        priority: 'P2',
        status: 'TODO',
        acceptanceCriteria: [],
        createdAt: now,
        updatedAt: now
      }
    });
    await db.user.create({
      data: {
        id: 'user-outsider',
        name: 'Outsider',
        systemRole: 'EMPLOYEE',
        createdAt: now,
        updatedAt: now
      }
    });
    await expect(
      db.taskAssignment.create({
        data: {
          taskId: 'task-1',
          projectId: 'project-1',
          userId: 'user-outsider'
        }
      })
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('rejects a second assignment and invalid or duplicate dependencies', async () => {
    const { db, now } = await createProjectFixture();
    await db.task.createMany({
      data: [
        {
          id: 'task-1',
          projectId: 'project-1',
          title: 'One',
          priority: 'P2',
          status: 'TODO',
          acceptanceCriteria: [],
          createdAt: now,
          updatedAt: now
        },
        {
          id: 'task-2',
          projectId: 'project-1',
          title: 'Two',
          priority: 'P2',
          status: 'TODO',
          acceptanceCriteria: [],
          createdAt: now,
          updatedAt: now
        }
      ]
    });
    await db.taskAssignment.create({
      data: { taskId: 'task-1', projectId: 'project-1', userId: 'user-owner' }
    });
    await expect(
      db.taskAssignment.create({
        data: {
          taskId: 'task-1',
          projectId: 'project-1',
          userId: 'user-owner'
        }
      })
    ).rejects.toMatchObject({ code: 'P2002' });

    await expect(
      db.taskDependency.create({
        data: { taskId: 'task-1', dependsOnTaskId: 'missing-task', projectId: 'project-1' }
      })
    ).rejects.toMatchObject({ code: 'P2003' });

    await db.taskDependency.create({
      data: { taskId: 'task-1', dependsOnTaskId: 'task-2', projectId: 'project-1' }
    });
    await expect(
      db.taskDependency.create({
        data: { taskId: 'task-1', dependsOnTaskId: 'task-2', projectId: 'project-1' }
      })
    ).rejects.toMatchObject({ code: 'P2002' });
    await db.project.create({ data: { id: 'project-2', name: 'Other', status: 'ACTIVE', createdAt: now, updatedAt: now } });
    await db.task.create({ data: { id: 'task-3', projectId: 'project-2', title: 'Other', priority: 'P2', status: 'TODO', acceptanceCriteria: [], createdAt: now, updatedAt: now } });
    await expect(db.taskDependency.create({ data: { taskId: 'task-2', dependsOnTaskId: 'task-1', projectId: 'project-2' } })).rejects.toMatchObject({ code: 'P2003' });
    await expect(db.taskDependency.create({ data: { taskId: 'task-2', dependsOnTaskId: 'task-3', projectId: 'project-1' } })).rejects.toMatchObject({ code: 'P2003' });
  });

  it('enforces Artifact provenance composite foreign keys and source uniqueness', async () => {
    const { db, now } = await createProjectFixture();
    await db.task.create({
      data: {
        id: 'task-1',
        projectId: 'project-1',
        title: 'Task',
        priority: 'P2',
        status: 'TODO',
        acceptanceCriteria: [],
        createdAt: now,
        updatedAt: now
      }
    });
    await db.agentRun.create({
      data: {
        id: 'run-1',
        userId: 'user-owner',
        projectId: 'project-1',
        taskId: 'task-1',
        agentDefinitionKey: 'read-only-work-agent-v1',
        intent: { name: 'read_file', relativePath: 'a.md' },
        status: 'SUCCEEDED',
        createdAt: now,
        startedAt: now,
        finishedAt: now,
        updatedAt: now
      }
    });
    await db.agentToolCall.create({
      data: {
        id: 'call-1',
        agentRunId: 'run-1',
        sequence: 1,
        name: 'read_file',
        request: { name: 'read_file', relativePath: 'a.md' },
        status: 'SUCCEEDED',
        receipt: { status: 'SUCCEEDED' },
        createdAt: now,
        completedAt: now
      }
    });
    await db.agentToolCall.create({
      data: {
        id: 'call-2',
        agentRunId: 'run-1',
        sequence: 2,
        name: 'read_file',
        request: { name: 'read_file', relativePath: 'b.md' },
        status: 'SUCCEEDED',
        receipt: { status: 'SUCCEEDED' },
        createdAt: now,
        completedAt: now
      }
    });
    const valid = {
      id: 'artifact-1',
      projectId: 'project-1',
      taskId: 'task-1',
      agentRunId: 'run-1',
      sourceToolCallId: 'call-1',
      type: 'FILE' as const,
      storageKind: 'LOCAL_WORKSPACE' as const,
      relativePath: 'a.md',
      size: 1,
      encoding: 'utf-8',
      sha256: 'a'.repeat(64),
      version: 1,
      createdByUserId: 'user-owner',
      createdAt: now
    };
    await db.artifact.create({ data: valid });
    let duplicateSourceError: unknown;
    try {
      await db.artifact.create({ data: { ...valid, id: 'duplicate-source' } });
    } catch (error) {
      duplicateSourceError = error;
    }
    expect(isSourceToolCallUniqueConflict(duplicateSourceError)).toBe(true);
    await expect(
      db.artifact.create({
        data: {
          ...valid,
          id: 'wrong-owner',
          sourceToolCallId: 'call-2',
          createdByUserId: 'wrong-user'
        }
      })
    ).rejects.toThrow();
    await db.task.create({
      data: {
        id: 'task-2',
        projectId: 'project-1',
        title: 'Second task',
        priority: 'P2',
        status: 'TODO',
        acceptanceCriteria: [],
        createdAt: now,
        updatedAt: now
      }
    });
    await db.agentRun.create({
      data: {
        id: 'run-2',
        userId: 'user-owner',
        projectId: 'project-1',
        taskId: 'task-2',
        agentDefinitionKey: 'read-only-work-agent-v1',
        intent: { name: 'read_file', relativePath: 'b.md' },
        status: 'SUCCEEDED',
        createdAt: now,
        startedAt: now,
        finishedAt: now,
        updatedAt: now
      }
    });
    await db.agentToolCall.create({
      data: {
        id: 'call-run-2',
        agentRunId: 'run-2',
        sequence: 1,
        name: 'read_file',
        request: { name: 'read_file', relativePath: 'b.md' },
        status: 'SUCCEEDED',
        receipt: { status: 'SUCCEEDED' },
        createdAt: now,
        completedAt: now
      }
    });
    await expect(
      db.artifact.create({
        data: {
          ...valid,
          id: 'source-run-mismatch',
          sourceToolCallId: 'call-run-2'
        }
      })
    ).rejects.toThrow();
    await db.project.create({ data: { id: 'project-2', name: 'Other', status: 'ACTIVE', createdAt: now, updatedAt: now } });
    await db.projectMember.create({ data: { id: 'member-other-project', projectId: 'project-2', userId: 'user-owner', role: 'OWNER', createdAt: now, updatedAt: now } });
    await db.task.create({ data: { id: 'task-other-project', projectId: 'project-2', title: 'Other', priority: 'P2', status: 'TODO', acceptanceCriteria: [], createdAt: now, updatedAt: now } });
    await expect(db.artifact.create({ data: { ...valid, id: 'project-task-run-mismatch', sourceToolCallId: 'call-2', projectId: 'project-2', taskId: 'task-other-project' } })).rejects.toThrow();
  });

  it('classifies only the adapter-pg source ToolCall unique violation', () => {
    const source = {
      code: 'P2002',
      meta: {
        driverAdapterError: {
          cause: {
            kind: 'UniqueConstraintViolation',
            constraint: { fields: ['source_tool_call_id'] }
          }
        }
      }
    };
    const primaryKey = {
      code: 'P2002',
      meta: {
        driverAdapterError: {
          cause: {
            kind: 'UniqueConstraintViolation',
            constraint: { fields: ['artifact_id'] }
          }
        }
      }
    };
    expect(isSourceToolCallUniqueConflict(source)).toBe(true);
    expect(isSourceToolCallUniqueConflict(primaryKey)).toBe(false);
    expect(isSourceToolCallUniqueConflict({ code: 'P2003' })).toBe(false);
  });

  it('enforces ResultArtifact composite provenance and rolls back incomplete composition', async () => {
    const { db, now } = await createProjectFixture();
    await createResultPersistenceFixture(db, now);
    const result = resultRow('result-1', 'task-1', 'project-1', now);
    await db.result.create({ data: result });
    await db.resultArtifact.create({ data: { resultId: result.id, artifactId: 'artifact-1', taskId: 'task-1', projectId: 'project-1' } });
    // This tuple is valid for result-1. It must be rejected by Artifact's own
    // (artifact_id, task_id, project_id) composite foreign key, not Result's.
    await expect(db.resultArtifact.create({ data: { resultId: result.id, artifactId: 'artifact-2', taskId: 'task-1', projectId: 'project-1' } })).rejects.toMatchObject({ code: 'P2003' });
    await db.project.create({ data: { id: 'project-2', name: 'Other', status: 'ACTIVE', createdAt: now, updatedAt: now } });
    await db.projectMember.create({ data: { id: 'member-project-2', projectId: 'project-2', userId: 'user-owner', role: 'OWNER', createdAt: now, updatedAt: now } });
    await db.task.create({ data: { id: 'task-3', projectId: 'project-2', title: 'Three', priority: 'P2', status: 'TODO', acceptanceCriteria: [], createdAt: now, updatedAt: now } });
    await db.agentRun.create({ data: { id: 'result-run-3', userId: 'user-owner', projectId: 'project-2', taskId: 'task-3', agentDefinitionKey: 'read-only-work-agent-v1', intent: { name: 'read_file', relativePath: '3.md' }, status: 'SUCCEEDED', createdAt: now, startedAt: now, finishedAt: now, updatedAt: now } });
    await db.agentToolCall.create({ data: { id: 'result-call-3', agentRunId: 'result-run-3', sequence: 1, name: 'read_file', request: { id: 'result-call-3', runId: 'result-run-3', userId: 'user-owner', projectId: 'project-2', name: 'read_file', relativePath: '3.md' }, status: 'SUCCEEDED', receipt: { toolCallId: 'result-call-3', status: 'SUCCEEDED', metadata: { relativePath: '3.md', size: 1, encoding: 'utf-8', sha256: '3'.repeat(64) } }, createdAt: now, completedAt: now } });
    await db.artifact.create({ data: { id: 'artifact-3', projectId: 'project-2', taskId: 'task-3', agentRunId: 'result-run-3', sourceToolCallId: 'result-call-3', type: 'FILE', storageKind: 'LOCAL_WORKSPACE', relativePath: '3.md', size: 1, encoding: 'utf-8', sha256: '3'.repeat(64), version: 1, createdByUserId: 'user-owner', createdAt: now } });
    // Likewise, retain Result's valid scope so only Artifact provenance can fail.
    await expect(db.resultArtifact.create({ data: { resultId: result.id, artifactId: 'artifact-3', taskId: 'task-1', projectId: 'project-1' } })).rejects.toMatchObject({ code: 'P2003' });
    await expect(db.result.create({ data: resultRow('forged-result', 'task-3', 'project-1', now) })).rejects.toMatchObject({ code: 'P2003' });
    await expect(db.resultArtifact.create({ data: { resultId: result.id, artifactId: 'artifact-1', taskId: 'task-1', projectId: 'project-1' } })).rejects.toMatchObject({ code: 'P2002' });

    const repository = new ResultRepository(wrapPrismaForResultTests(db, {
      beforeResultArtifactCreateMany: async () => { throw new Error('inject link creation failure'); }
    }));
    await expect(repository.createForTaskForUser({
      resultId: 'rolled-back-result', taskId: 'task-1', userId: 'user-owner',
      artifactIds: ['artifact-1'], idempotencyKey: 'rolled-back-result-key', now
    })).rejects.toThrow('inject link creation failure');
    expect(await db.result.findUnique({ where: { id: 'rolled-back-result' } })).toBeNull();
    expect(await db.resultArtifact.count({ where: { resultId: 'rolled-back-result' } })).toBe(0);
  });

  it('keeps ResultRepository scoped reads on one RepeatableRead snapshot', async () => {
    const { db, now } = await createProjectFixture();
    await createResultPersistenceFixture(db, now);
    await db.result.create({ data: resultRow('snapshot-result', 'task-1', 'project-1', now) });
    await db.resultArtifact.create({ data: { resultId: 'snapshot-result', artifactId: 'artifact-1', taskId: 'task-1', projectId: 'project-1' } });
    const boundary = boundedGate(1);
    const repository = new ResultRepository(wrapPrismaForResultTests(db, {
      afterResultFindFirst: () => boundary.arriveAndWait()
    }));
    const read = repository.findForUser('snapshot-result', 'user-owner');
    try {
      await boundary.waitUntilReached();
      // A separate committed connection changes the composition after the first
      // repository query. RepeatableRead must keep the later link query on the
      // original snapshot, so artifact-4 cannot appear in this response.
      await db.resultArtifact.create({ data: { resultId: 'snapshot-result', artifactId: 'artifact-4', taskId: 'task-1', projectId: 'project-1' } });
      boundary.release();
      await expect(read).resolves.toMatchObject({ artifactIds: ['artifact-1'] });
    } finally {
      boundary.cleanup();
    }
  });

  it('coordinates real ResultRepository transactions before insertion for idempotent concurrency', async () => {
    const { db, now } = await createProjectFixture();
    await createResultPersistenceFixture(db, now);
    const sameGate = boundedGate(2);
    const leftClient = createPrismaClient(connectionString!);
    const rightClient = createPrismaClient(connectionString!);
    const sameRepository = new ResultRepository(wrapPrismaForResultTests(leftClient, {
      beforeResultCreate: () => sameGate.arriveAndWait()
    }));
    const sameRightRepository = new ResultRepository(wrapPrismaForResultTests(rightClient, {
      beforeResultCreate: () => sameGate.arriveAndWait()
    }));
    const sameInput = (resultId: string) => ({ resultId, taskId: 'task-1', userId: 'user-owner', artifactIds: ['artifact-1'], idempotencyKey: 'same-key', now });
    const sameLeft = sameRepository.createForTaskForUser(sameInput('same-left'));
    const sameRight = sameRightRepository.createForTaskForUser(sameInput('same-right'));
    let sameResults: Exclude<Awaited<typeof sameLeft>, string>[];
    try {
      await sameGate.waitUntilReached();
      expect(sameGate.arrivals).toBe(2);
      sameGate.release();
      const same = await Promise.all([sameLeft, sameRight]);
      expect(same.filter((value) => typeof value !== 'string')).toHaveLength(2);
      sameResults = same.filter((value): value is Exclude<typeof value, string> => typeof value !== 'string');
      expect(new Set(sameResults.map((value) => value.result.id)).size).toBe(1);
      expect(sameResults.map((value) => value.created).sort()).toEqual([false, true]);
      expect(await db.resultArtifact.findMany({ where: { resultId: sameResults[0].result.id }, orderBy: { artifactId: 'asc' } })).toMatchObject([{ artifactId: 'artifact-1' }]);
    } finally {
      sameGate.cleanup();
    }

    const conflictGate = boundedGate(2);
    const conflictRepository = new ResultRepository(wrapPrismaForResultTests(leftClient, {
      beforeResultCreate: () => conflictGate.arriveAndWait()
    }));
    const conflictRightRepository = new ResultRepository(wrapPrismaForResultTests(rightClient, {
      beforeResultCreate: () => conflictGate.arriveAndWait()
    }));
    const conflictLeft = conflictRepository.createForTaskForUser({ resultId: 'conflict-left', taskId: 'task-1', userId: 'user-owner', artifactIds: ['artifact-1'], idempotencyKey: 'conflict-key', now });
    const conflictRight = conflictRightRepository.createForTaskForUser({ resultId: 'conflict-right', taskId: 'task-1', userId: 'user-owner', artifactIds: ['artifact-4'], idempotencyKey: 'conflict-key', now });
    try {
      await conflictGate.waitUntilReached();
      expect(conflictGate.arrivals).toBe(2);
      conflictGate.release();
      const conflict = await Promise.all([conflictLeft, conflictRight]);
      expect(conflict.filter((value) => value === 'IDEMPOTENCY_CONFLICT')).toHaveLength(1);
      const winner = conflict.find((value): value is Exclude<typeof value, string> => typeof value !== 'string');
      expect(winner).toBeDefined();
      const winnerLinks = await db.resultArtifact.findMany({ where: { resultId: winner!.result.id }, orderBy: { artifactId: 'asc' } });
      expect(winnerLinks.map((link) => link.artifactId)).toEqual(winner!.result.artifactIds);
      expect(await db.result.count({ where: { idempotencyKey: 'conflict-key' } })).toBe(1);
    } finally {
      conflictGate.cleanup();
      await leftClient.$disconnect();
      await rightClient.$disconnect();
    }
  });

  it('returns NOT_FOUND when membership is revoked before real idempotency conflict recovery', async () => {
    const { db, now } = await createProjectFixture();
    await createResultPersistenceFixture(db, now);
    const existing = resultRow('recovery-result', 'task-1', 'project-1', now);
    existing.idempotencyKey = 'recovery-key';
    await db.result.create({ data: existing });
    await db.resultArtifact.create({ data: { resultId: existing.id, artifactId: 'artifact-1', taskId: 'task-1', projectId: 'project-1' } });
    const recoveryBoundary = boundedGate(1);
    let transactionCount = 0;
    const repository = new ResultRepository(wrapPrismaForResultTests(db, {
      onTransaction() { transactionCount += 1; return transactionCount; },
      beforeRecoveryResultFindFirst: () => recoveryBoundary.arriveAndWait()
    }));
    const retry = repository.createForTaskForUser({ resultId: 'recovery-retry', taskId: 'task-1', userId: 'user-owner', artifactIds: ['artifact-1'], idempotencyKey: 'recovery-key', now });
    try {
      await recoveryBoundary.waitUntilReached();
      await db.projectMember.delete({ where: { projectId_userId: { projectId: 'project-1', userId: 'user-owner' } } });
      recoveryBoundary.release();
      await expect(retry).resolves.toBe('NOT_FOUND');
    } finally {
      recoveryBoundary.cleanup();
    }
  });

  it('returns NOT_FOUND when membership is revoked before submit-for-review recovery', async () => {
    const { db, now } = await createProjectFixture();
    await createResultPersistenceFixture(db, now);
    await db.task.update({ where: { id: 'task-1' }, data: { status: 'IN_PROGRESS', updatedAt: now } });
    await db.result.create({ data: resultRow('submit-recovery', 'task-1', 'project-1', now) });
    await db.resultArtifact.create({ data: { resultId: 'submit-recovery', artifactId: 'artifact-1', taskId: 'task-1', projectId: 'project-1' } });
    let interleaved = false;
    const repository = new ResultRepository(wrapPrismaForResultTests(db, {
      beforeSubmissionResultUpdate: async () => {
        if (interleaved) return;
        interleaved = true;
        await db.$transaction(async (other) => {
          await other.result.update({ where: { id: 'submit-recovery' }, data: { status: 'HUMAN_REVIEW', submittedByUserId: 'user-owner', submittedAt: now, updatedAt: now } });
          await other.projectMember.delete({ where: { projectId_userId: { projectId: 'project-1', userId: 'user-owner' } } });
        });
      }
    }));
    await expect(repository.submitForReviewForCreator('submit-recovery', 'user-owner', now)).resolves.toBe('NOT_FOUND');
  });

  it('coordinates concurrent Candidate submissions at the production Task CAS boundary', async () => {
    const { db, now } = await createProjectFixture();
    await createResultPersistenceFixture(db, now);
    await db.task.update({ where: { id: 'task-1' }, data: { status: 'IN_PROGRESS', updatedAt: now } });
    for (const [id, artifactId] of [['submit-left', 'artifact-1'], ['submit-right', 'artifact-4']] as const) {
      await db.result.create({ data: resultRow(id, 'task-1', 'project-1', now) });
      await db.resultArtifact.create({ data: { resultId: id, artifactId, taskId: 'task-1', projectId: 'project-1' } });
    }

    const leftClient = createPrismaClient(connectionString!);
    const rightClient = createPrismaClient(connectionString!);
    const gate = boundedGate(2);
    const left = new ResultRepository(wrapPrismaForResultTests(leftClient, { beforeTaskUpdate: () => gate.arriveAndWait() }));
    const right = new ResultRepository(wrapPrismaForResultTests(rightClient, { beforeTaskUpdate: () => gate.arriveAndWait() }));
    const leftSubmit = left.submitForReviewForCreator('submit-left', 'user-owner', now);
    const rightSubmit = right.submitForReviewForCreator('submit-right', 'user-owner', now);

    try {
      await gate.waitUntilReached();
      expect(gate.arrivals).toBe(2);
      gate.release();
      const outcomes = await Promise.all([leftSubmit, rightSubmit]);
      expect(outcomes.filter((value) => value === 'INVALID_STATE')).toHaveLength(1);
      expect(outcomes.filter((value) => typeof value !== 'string')).toHaveLength(1);
      expect(await db.task.findUniqueOrThrow({ where: { id: 'task-1' } })).toMatchObject({ status: 'READY_FOR_REVIEW' });
      const submitted = await db.result.findMany({ where: { id: { in: ['submit-left', 'submit-right'] } }, orderBy: { id: 'asc' } });
      expect(submitted.map((result) => result.status).sort()).toEqual(['CANDIDATE', 'HUMAN_REVIEW']);
    } finally {
      gate.cleanup();
      await leftClient.$disconnect();
      await rightClient.$disconnect();
    }
  });

  it('rolls back submission and review when the production Task CAS write fails', async () => {
    const { db, now } = await createProjectFixture();
    await createResultPersistenceFixture(db, now);
    await db.task.update({ where: { id: 'task-1' }, data: { status: 'IN_PROGRESS', updatedAt: now } });
    await db.result.create({ data: resultRow('submit-task-rollback', 'task-1', 'project-1', now) });
    await db.resultArtifact.create({ data: { resultId: 'submit-task-rollback', artifactId: 'artifact-1', taskId: 'task-1', projectId: 'project-1' } });
    const failingSubmit = new ResultRepository(wrapPrismaForResultTests(db, {
      beforeTaskUpdate: () => { throw new Error('inject submission Task write failure'); }
    }));
    await expect(failingSubmit.submitForReviewForCreator('submit-task-rollback', 'user-owner', now)).rejects.toThrow('inject submission Task write failure');
    expect(await db.result.findUniqueOrThrow({ where: { id: 'submit-task-rollback' } })).toMatchObject({ status: 'CANDIDATE', submittedByUserId: null, submittedAt: null });
    expect(await db.task.findUniqueOrThrow({ where: { id: 'task-1' } })).toMatchObject({ status: 'IN_PROGRESS' });

    await createHumanReviewFixture(db, now, 'review-task-rollback');
    const failingReview = new ResultRepository(wrapPrismaForResultTests(db, {
      beforeTaskUpdate: () => { throw new Error('inject review Task write failure'); }
    }));
    await expect(failingReview.decideForReviewer({ resultId: 'review-task-rollback', reviewerId: 'reviewer-1', decision: 'ACCEPT', reviewId: 'review-task-failed', now })).rejects.toThrow('inject review Task write failure');
    expect(await db.result.findUniqueOrThrow({ where: { id: 'review-task-rollback' } })).toMatchObject({ status: 'HUMAN_REVIEW' });
    expect(await db.task.findUniqueOrThrow({ where: { id: 'task-1' } })).toMatchObject({ status: 'READY_FOR_REVIEW' });
    expect(await db.review.count({ where: { resultId: 'review-task-rollback' } })).toBe(0);
  });

  it('coordinates real reviewer transactions and rolls back a failed Review creation', async () => {
    const { db, now } = await createProjectFixture();
    await createResultPersistenceFixture(db, now);
    await createHumanReviewFixture(db, now, 'review-race');
    const leftClient = createPrismaClient(connectionString!);
    const rightClient = createPrismaClient(connectionString!);
    const gate = boundedGate(2);
    const left = new ResultRepository(wrapPrismaForResultTests(leftClient, { beforeReviewResultUpdate: () => gate.arriveAndWait() }));
    const right = new ResultRepository(wrapPrismaForResultTests(rightClient, { beforeReviewResultUpdate: () => gate.arriveAndWait() }));
    const accepted = left.decideForReviewer({ resultId: 'review-race', reviewerId: 'reviewer-1', decision: 'ACCEPT', reviewId: 'review-accept', now });
    const reworked = right.decideForReviewer({ resultId: 'review-race', reviewerId: 'reviewer-2', decision: 'REWORK', reviewId: 'review-rework', now });
    try {
      await gate.waitUntilReached();
      expect(gate.arrivals).toBe(2);
      gate.release();
      const decisions = await Promise.all([accepted, reworked]);
      expect(decisions.filter((decision) => decision === 'CONFLICT')).toHaveLength(1);
      const winner = decisions.find((decision): decision is Exclude<typeof decision, string> => typeof decision !== 'string');
      expect(winner?.created).toBe(true);
      const persisted = await db.result.findUniqueOrThrow({ where: { id: 'review-race' } });
      const reviews = await db.review.findMany({ where: { resultId: 'review-race' } });
      expect(reviews).toHaveLength(1);
      expect(persisted.status).toBe(reviews[0].decision === 'ACCEPT' ? 'ACCEPTED' : 'REWORK');
      expect((await db.task.findUniqueOrThrow({ where: { id: 'task-1' } })).status).toBe(reviews[0].decision === 'ACCEPT' ? 'ACCEPTED' : 'IN_PROGRESS');
    } finally {
      gate.cleanup();
      await leftClient.$disconnect();
      await rightClient.$disconnect();
    }

    await createHumanReviewFixture(db, now, 'review-same');
    const sameLeftClient = createPrismaClient(connectionString!);
    const sameRightClient = createPrismaClient(connectionString!);
    const sameGate = boundedGate(2);
    const sameLeft = new ResultRepository(wrapPrismaForResultTests(sameLeftClient, { beforeReviewResultUpdate: () => sameGate.arriveAndWait() }));
    const sameRight = new ResultRepository(wrapPrismaForResultTests(sameRightClient, { beforeReviewResultUpdate: () => sameGate.arriveAndWait() }));
    const input = (reviewId: string) => ({ resultId: 'review-same', reviewerId: 'reviewer-1', decision: 'ACCEPT' as const, reviewId, now });
    const first = sameLeft.decideForReviewer(input('review-same-1'));
    const second = sameRight.decideForReviewer(input('review-same-2'));
    try {
      await sameGate.waitUntilReached();
      sameGate.release();
      const outcomes = await Promise.all([first, second]);
      expect(outcomes.map((outcome) => typeof outcome === 'string' ? outcome : outcome.created).sort()).toEqual([false, true]);
      const reviews = await db.review.findMany({ where: { resultId: 'review-same' } });
      expect(reviews).toHaveLength(1);
      expect(reviews[0]).toMatchObject({ reviewerId: 'reviewer-1', decision: 'ACCEPT', comment: null });
    } finally {
      sameGate.cleanup();
      await sameLeftClient.$disconnect();
      await sameRightClient.$disconnect();
    }

    await createHumanReviewFixture(db, now, 'review-rollback');
    const failing = new ResultRepository(wrapPrismaForResultTests(db, { beforeReviewCreate: () => { throw new Error('inject Review creation failure'); } }));
    await expect(failing.decideForReviewer({ resultId: 'review-rollback', reviewerId: 'reviewer-1', decision: 'ACCEPT', reviewId: 'review-failed', now })).rejects.toThrow('inject Review creation failure');
    expect(await db.result.findUniqueOrThrow({ where: { id: 'review-rollback' } })).toMatchObject({ status: 'HUMAN_REVIEW' });
    expect(await db.task.findUniqueOrThrow({ where: { id: 'task-1' } })).toMatchObject({ status: 'READY_FOR_REVIEW' });
    expect(await db.review.count({ where: { resultId: 'review-rollback' } })).toBe(0);
  });

  it('rejects a deferred write ToolCall creation without its pending confirmation', async () => {
    const { db, now } = await createProjectFixture();
    await createWriteTask(db, now);
    await expect(db.$transaction(async tx => {
      await tx.agentRun.create({ data: writeRun(now) });
      await tx.agentToolCall.create({ data: writeCall(now) });
    })).rejects.toThrow();
    expect(await db.agentRun.findUnique({ where: { id: 'write-run' } })).toBeNull();
    expect(await db.agentToolCall.findUnique({ where: { id: 'write-call' } })).toBeNull();
  });

  it('allows approved write ToolCalls to finish after the insert-only deferred trigger', async () => {
    const { db, now } = await createProjectFixture();
    await createWriteTask(db, now);
    await db.$transaction(async tx => {
      await tx.agentRun.create({ data: writeRun(now) });
      await tx.agentToolCall.create({ data: writeCall(now) });
      await tx.humanConfirmation.create({ data: writeConfirmation(now) });
    });
    await db.$transaction(async tx => {
      await tx.humanConfirmation.update({ where: { id: 'write-confirmation' }, data: { status: 'APPROVED', decidedAt: now } });
      await tx.agentRun.update({ where: { id: 'write-run' }, data: { status: 'RUNNING', startedAt: now } });
      await tx.agentToolCall.update({ where: { id: 'write-call' }, data: { status: 'SUCCEEDED', completedAt: now } });
    });
    expect(await db.agentToolCall.findUniqueOrThrow({ where: { id: 'write-call' } })).toMatchObject({ status: 'SUCCEEDED' });
  });

  it('rolls back all write rows when confirmation creation fails and rejects invalid device provenance', async () => {
    const { db, now } = await createProjectFixture();
    await createWriteTask(db, now);
    await expect(db.$transaction(async tx => {
      await tx.agentRun.create({ data: writeRun(now) });
      await tx.agentToolCall.create({ data: writeCall(now) });
      await tx.humanConfirmation.create({ data: { ...writeConfirmation(now), deviceId: '' } });
    })).rejects.toThrow();
    expect(await db.agentRun.findUnique({ where: { id: 'write-run' } })).toBeNull();
    expect(await db.agentToolCall.findUnique({ where: { id: 'write-call' } })).toBeNull();
    expect(await db.humanConfirmation.findUnique({ where: { id: 'write-confirmation' } })).toBeNull();

    await db.$transaction(async tx => {
      await tx.agentRun.create({ data: writeRun(now) });
      await tx.agentToolCall.create({ data: writeCall(now) });
      await tx.humanConfirmation.create({ data: writeConfirmation(now) });
    });
    await expect(db.humanConfirmation.update({ where: { id: 'write-confirmation' }, data: { deviceId: 'other-device' } })).rejects.toThrow();
    await expect(db.humanConfirmation.update({ where: { id: 'write-confirmation' }, data: { deviceId: '' } })).rejects.toThrow();
    await db.humanConfirmation.delete({ where: { id: 'write-confirmation' } });
    await db.agentToolCall.delete({ where: { id: 'write-call' } });
    await expect(db.agentToolCall.create({ data: { ...writeCall(now), id: 'blank-device-call', deviceId: '' } })).rejects.toThrow();
  });

  it('enforces immutable one-per-Result Human Review provenance', async () => {
    const { db, now } = await createProjectFixture();
    await createResultPersistenceFixture(db, now);
    await db.result.create({ data: { ...resultRow('review-result', 'task-1', 'project-1', now), status: 'HUMAN_REVIEW', submittedByUserId: 'user-owner', submittedAt: now } });
    await db.user.create({ data: { id: 'reviewer-1', name: 'Reviewer', systemRole: 'EMPLOYEE', createdAt: now, updatedAt: now } });
    await db.review.create({ data: { id: 'review-1', resultId: 'review-result', projectId: 'project-1', reviewerId: 'reviewer-1', decision: 'ACCEPT', reviewedAt: now } });
    await expect(db.review.create({ data: { id: 'review-duplicate', resultId: 'review-result', projectId: 'project-1', reviewerId: 'reviewer-1', decision: 'REWORK', reviewedAt: now } })).rejects.toMatchObject({ code: 'P2002' });
    await db.result.create({ data: { ...resultRow('review-result-2', 'task-1', 'project-1', now), status: 'HUMAN_REVIEW', submittedByUserId: 'user-owner', submittedAt: now } });
    await expect(db.review.create({ data: { id: 'review-project-mismatch', resultId: 'review-result-2', projectId: 'missing-project', reviewerId: 'reviewer-1', decision: 'ACCEPT', reviewedAt: now } })).rejects.toMatchObject({ code: 'P2003' });
    await expect(db.review.create({ data: { id: 'review-user-mismatch', resultId: 'review-result-2', projectId: 'project-1', reviewerId: 'missing-user', decision: 'ACCEPT', reviewedAt: now } })).rejects.toMatchObject({ code: 'P2003' });
  });
});

async function createResultPersistenceFixture(db: ReturnType<typeof requireDatabase>, now: Date) {
  await db.task.createMany({ data: [
    { id: 'task-1', projectId: 'project-1', title: 'One', priority: 'P2', status: 'TODO', acceptanceCriteria: [], createdAt: now, updatedAt: now },
    { id: 'task-2', projectId: 'project-1', title: 'Two', priority: 'P2', status: 'TODO', acceptanceCriteria: [], createdAt: now, updatedAt: now }
  ] });
  for (const suffix of ['1', '2']) {
    const taskId = `task-${suffix}`;
    await db.agentRun.create({ data: { id: `result-run-${suffix}`, userId: 'user-owner', projectId: 'project-1', taskId, agentDefinitionKey: 'read-only-work-agent-v1', intent: { name: 'read_file', relativePath: `${suffix}.md` }, status: 'SUCCEEDED', createdAt: now, startedAt: now, finishedAt: now, updatedAt: now } });
    await db.agentToolCall.create({ data: { id: `result-call-${suffix}`, agentRunId: `result-run-${suffix}`, sequence: 1, name: 'read_file', request: { id: `result-call-${suffix}`, runId: `result-run-${suffix}`, userId: 'user-owner', projectId: 'project-1', name: 'read_file', relativePath: `${suffix}.md` }, status: 'SUCCEEDED', receipt: { toolCallId: `result-call-${suffix}`, status: 'SUCCEEDED', metadata: { relativePath: `${suffix}.md`, size: 1, encoding: 'utf-8', sha256: suffix.repeat(64) } }, createdAt: now, completedAt: now } });
    await db.artifact.create({ data: { id: `artifact-${suffix}`, projectId: 'project-1', taskId, agentRunId: `result-run-${suffix}`, sourceToolCallId: `result-call-${suffix}`, type: 'FILE', storageKind: 'LOCAL_WORKSPACE', relativePath: `${suffix}.md`, size: 1, encoding: 'utf-8', sha256: suffix.repeat(64), version: 1, createdByUserId: 'user-owner', createdAt: now } });
  }
  await db.agentRun.create({ data: { id: 'result-run-4', userId: 'user-owner', projectId: 'project-1', taskId: 'task-1', agentDefinitionKey: 'read-only-work-agent-v1', intent: { name: 'read_file', relativePath: '4.md' }, status: 'SUCCEEDED', createdAt: now, startedAt: now, finishedAt: now, updatedAt: now } });
  await db.agentToolCall.create({ data: { id: 'result-call-4', agentRunId: 'result-run-4', sequence: 1, name: 'read_file', request: { id: 'result-call-4', runId: 'result-run-4', userId: 'user-owner', projectId: 'project-1', name: 'read_file', relativePath: '4.md' }, status: 'SUCCEEDED', receipt: { toolCallId: 'result-call-4', status: 'SUCCEEDED', metadata: { relativePath: '4.md', size: 1, encoding: 'utf-8', sha256: '4'.repeat(64) } }, createdAt: now, completedAt: now } });
  await db.artifact.create({ data: { id: 'artifact-4', projectId: 'project-1', taskId: 'task-1', agentRunId: 'result-run-4', sourceToolCallId: 'result-call-4', type: 'FILE', storageKind: 'LOCAL_WORKSPACE', relativePath: '4.md', size: 1, encoding: 'utf-8', sha256: '4'.repeat(64), version: 1, createdByUserId: 'user-owner', createdAt: now } });
}
async function createHumanReviewFixture(db: ReturnType<typeof requireDatabase>, now: Date, id: string) {
  await db.task.update({
    where: { id: 'task-1' },
    data: { status: 'READY_FOR_REVIEW', updatedAt: now }
  });
  for (const reviewerId of ['reviewer-1', 'reviewer-2']) {
    await db.user.upsert({ where: { id: reviewerId }, create: { id: reviewerId, name: reviewerId, systemRole: 'EMPLOYEE', createdAt: now, updatedAt: now }, update: {} });
    await db.projectMember.upsert({ where: { projectId_userId: { projectId: 'project-1', userId: reviewerId } }, create: { id: `member-${reviewerId}`, projectId: 'project-1', userId: reviewerId, role: 'REVIEWER', createdAt: now, updatedAt: now }, update: {} });
  }
  await db.result.create({ data: { ...resultRow(id, 'task-1', 'project-1', now), status: 'HUMAN_REVIEW', submittedByUserId: 'user-owner', submittedAt: now } });
  await db.resultArtifact.create({ data: { resultId: id, artifactId: 'artifact-1', taskId: 'task-1', projectId: 'project-1' } });
}
function resultRow(id: string, taskId: string, projectId: string, now: Date) {
  return { id, taskId, projectId, createdByUserId: 'user-owner', status: 'CANDIDATE' as const, idempotencyKey: `${id}-key`, requestFingerprint: 'a'.repeat(64), createdAt: now, updatedAt: now };
}

async function createWriteTask(db: ReturnType<typeof requireDatabase>, now: Date) {
  await db.task.create({ data: { id: 'write-task', projectId: 'project-1', title: 'Write', priority: 'P2', status: 'TODO', acceptanceCriteria: [], createdAt: now, updatedAt: now } });
}
function writeRun(now: Date) { return { id: 'write-run', userId: 'user-owner', projectId: 'project-1', taskId: 'write-task', agentDefinitionKey: 'confirmed-write-work-agent-v1', intent: { name: 'write_file', relativePath: 'a.md' }, status: 'WAITING_HUMAN' as const, createdAt: now, updatedAt: now }; }
function writeCall(now: Date) { return { id: 'write-call', agentRunId: 'write-run', sequence: 1, name: 'write_file', deviceId: 'device-1', request: { id: 'write-call', runId: 'write-run', userId: 'user-owner', projectId: 'project-1', name: 'write_file', relativePath: 'a.md', deviceId: 'device-1', payloadSize: 0, payloadSha256: 'a'.repeat(64), effect: 'CREATE' }, status: 'PENDING' as const, createdAt: now }; }
function writeConfirmation(now: Date) { return { id: 'write-confirmation', agentRunId: 'write-run', toolCallId: 'write-call', userId: 'user-owner', projectId: 'project-1', taskId: 'write-task', deviceId: 'device-1', status: 'PENDING' as const, createdAt: now }; }

/**
 * Test-only transaction facade. It delegates every write/read to the real
 * Prisma transaction client, while letting a test stop at repository-owned
 * boundaries. This proves the production repository's transaction and
 * isolation configuration rather than recreating its SQL in a test.
 */
function wrapPrismaForResultTests(
  prisma: PrismaClient,
  hooks: {
    beforeResultCreate?: () => Promise<void> | void;
    beforeResultArtifactCreateMany?: () => Promise<void> | void;
    beforeReviewResultUpdate?: () => Promise<void> | void;
    beforeReviewCreate?: () => Promise<void> | void;
    beforeSubmissionResultUpdate?: () => Promise<void> | void;
    beforeTaskUpdate?: () => Promise<void> | void;
    afterResultFindFirst?: () => Promise<void> | void;
    beforeRecoveryResultFindFirst?: () => Promise<void> | void;
    onTransaction?: () => number;
  }
): PrismaClient {
  return {
    $transaction: async (callback: (tx: unknown) => Promise<unknown>, options: unknown) => {
      const transactionNumber = hooks.onTransaction?.();
      return prisma.$transaction(async (transaction) => callback(new Proxy(transaction, {
        get(target, property, receiver) {
          const model = Reflect.get(target, property, receiver);
          if ((property !== 'result' && property !== 'resultArtifact' && property !== 'review' && property !== 'task') || typeof model !== 'object' || model === null) return model;
          return new Proxy(model, {
            get(resultTarget, resultProperty, resultReceiver) {
              const method = Reflect.get(resultTarget, resultProperty, resultReceiver);
              if (property === 'result' && resultProperty === 'create') {
                return async (...argumentsList: unknown[]) => {
                  await hooks.beforeResultCreate?.();
                  return Reflect.apply(method, resultTarget, argumentsList);
                };
              }
              if (property === 'result' && resultProperty === 'updateMany') {
                return async (...argumentsList: unknown[]) => {
                  await hooks.beforeSubmissionResultUpdate?.();
                  await hooks.beforeReviewResultUpdate?.();
                  return Reflect.apply(method, resultTarget, argumentsList);
                };
              }
              if (property === 'result' && resultProperty === 'findFirst') {
                return async (...argumentsList: unknown[]) => {
                  if (transactionNumber === 2) await hooks.beforeRecoveryResultFindFirst?.();
                  const result = await Reflect.apply(method, resultTarget, argumentsList);
                  await hooks.afterResultFindFirst?.();
                  return result;
                };
              }
              if (property === 'resultArtifact' && resultProperty === 'createMany') {
                return async (...argumentsList: unknown[]) => {
                  await hooks.beforeResultArtifactCreateMany?.();
                  return Reflect.apply(method, resultTarget, argumentsList);
                };
              }
              if (property === 'review' && resultProperty === 'create') {
                return async (...argumentsList: unknown[]) => {
                  await hooks.beforeReviewCreate?.();
                  return Reflect.apply(method, resultTarget, argumentsList);
                };
              }
              if (property === 'task' && resultProperty === 'updateMany') {
                return async (...argumentsList: unknown[]) => {
                  await hooks.beforeTaskUpdate?.();
                  return Reflect.apply(method, resultTarget, argumentsList);
                };
              }
              return method;
            }
          });
        }
      }) as unknown), options as never);
    }
  } as PrismaClient;
}

function boundedGate(parties: number, timeoutMs = 5_000) {
  let arrivals = 0;
  let releaseGate!: () => void;
  let failGate!: (error: Error) => void;
  let reached!: () => void;
  const released = new Promise<void>((resolve, reject) => { releaseGate = resolve; failGate = reject; });
  const reachedPromise = new Promise<void>((resolve) => { reached = resolve; });
  const timeout = setTimeout(() => failGate(new Error(`timed out waiting for ${parties} repository transaction boundaries`)), timeoutMs);
  return {
    get arrivals() { return arrivals; },
    async arriveAndWait() {
      arrivals += 1;
      if (arrivals === parties) reached();
      await released;
    },
    waitUntilReached() { return reachedPromise; },
    release() { releaseGate(); },
    cleanup() {
      clearTimeout(timeout);
      // Always unblock parked transaction callbacks if a later assertion fails.
      releaseGate();
    }
  };
}
