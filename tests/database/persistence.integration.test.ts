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
});
