import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createPrismaClient } from '../../packages/database/src/index.js';

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
});
