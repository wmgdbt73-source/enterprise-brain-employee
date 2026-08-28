import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createPrismaClient } from '../../packages/database/src/index.js';
import { isSourceToolCallUniqueConflict } from '../../packages/database/src/repositories/artifact-repository.js';

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
    await db.humanConfirmation.deleteMany();
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
        data: { taskId: 'task-1', dependsOnTaskId: 'missing-task' }
      })
    ).rejects.toMatchObject({ code: 'P2003' });

    await db.taskDependency.create({
      data: { taskId: 'task-1', dependsOnTaskId: 'task-2' }
    });
    await expect(
      db.taskDependency.create({
        data: { taskId: 'task-1', dependsOnTaskId: 'task-2' }
      })
    ).rejects.toMatchObject({ code: 'P2002' });
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
    await expect(db.resultArtifact.create({ data: { resultId: result.id, artifactId: 'artifact-2', taskId: 'task-2', projectId: 'project-1' } })).rejects.toMatchObject({ code: 'P2003' });
    await db.project.create({ data: { id: 'project-2', name: 'Other', status: 'ACTIVE', createdAt: now, updatedAt: now } });
    await db.projectMember.create({ data: { id: 'member-project-2', projectId: 'project-2', userId: 'user-owner', role: 'OWNER', createdAt: now, updatedAt: now } });
    await db.task.create({ data: { id: 'task-3', projectId: 'project-2', title: 'Three', priority: 'P2', status: 'TODO', acceptanceCriteria: [], createdAt: now, updatedAt: now } });
    await db.agentRun.create({ data: { id: 'result-run-3', userId: 'user-owner', projectId: 'project-2', taskId: 'task-3', agentDefinitionKey: 'read-only-work-agent-v1', intent: { name: 'read_file', relativePath: '3.md' }, status: 'SUCCEEDED', createdAt: now, startedAt: now, finishedAt: now, updatedAt: now } });
    await db.agentToolCall.create({ data: { id: 'result-call-3', agentRunId: 'result-run-3', sequence: 1, name: 'read_file', request: { id: 'result-call-3', runId: 'result-run-3', userId: 'user-owner', projectId: 'project-2', name: 'read_file', relativePath: '3.md' }, status: 'SUCCEEDED', receipt: { toolCallId: 'result-call-3', status: 'SUCCEEDED', metadata: { relativePath: '3.md', size: 1, encoding: 'utf-8', sha256: '3'.repeat(64) } }, createdAt: now, completedAt: now } });
    await db.artifact.create({ data: { id: 'artifact-3', projectId: 'project-2', taskId: 'task-3', agentRunId: 'result-run-3', sourceToolCallId: 'result-call-3', type: 'FILE', storageKind: 'LOCAL_WORKSPACE', relativePath: '3.md', size: 1, encoding: 'utf-8', sha256: '3'.repeat(64), version: 1, createdByUserId: 'user-owner', createdAt: now } });
    await expect(db.resultArtifact.create({ data: { resultId: result.id, artifactId: 'artifact-3', taskId: 'task-3', projectId: 'project-2' } })).rejects.toMatchObject({ code: 'P2003' });
    await expect(db.result.create({ data: resultRow('forged-result', 'task-3', 'project-1', now) })).rejects.toMatchObject({ code: 'P2003' });
    await expect(db.resultArtifact.create({ data: { resultId: result.id, artifactId: 'artifact-1', taskId: 'task-1', projectId: 'project-1' } })).rejects.toMatchObject({ code: 'P2002' });

    await expect(db.$transaction(async tx => {
      await tx.result.create({ data: resultRow('rolled-back-result', 'task-1', 'project-1', now) });
      throw new Error('inject link creation failure');
    })).rejects.toThrow('inject link creation failure');
    expect(await db.result.findUnique({ where: { id: 'rolled-back-result' } })).toBeNull();
    expect(await db.resultArtifact.count({ where: { resultId: 'rolled-back-result' } })).toBe(0);
  });

  it('keeps membership-scoped Result reads on one RepeatableRead snapshot', async () => {
    const { db, now } = await createProjectFixture();
    await createResultPersistenceFixture(db, now);
    await db.result.create({ data: resultRow('snapshot-result', 'task-1', 'project-1', now) });
    let snapshotStarted!: () => void;
    let continueSnapshot!: () => void;
    const started = new Promise<void>((resolve) => { snapshotStarted = resolve; });
    const resume = new Promise<void>((resolve) => { continueSnapshot = resolve; });
    const read = db.$transaction(async tx => {
      const first = await tx.result.findFirst({ where: { id: 'snapshot-result', project: { members: { some: { userId: 'user-owner' } } } } });
      snapshotStarted();
      await resume;
      const second = await tx.result.findFirst({ where: { id: 'snapshot-result', project: { members: { some: { userId: 'user-owner' } } } } });
      return { first, second };
    }, { isolationLevel: 'RepeatableRead' });
    await started;
    await db.projectMember.delete({ where: { projectId_userId: { projectId: 'project-1', userId: 'user-owner' } } });
    continueSnapshot();
    await expect(read).resolves.toMatchObject({ first: { id: 'snapshot-result' }, second: { id: 'snapshot-result' } });
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
